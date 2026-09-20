import cors from "cors";
import express from "express";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { createServer } from "node:http";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import multer from "multer";
import { Server } from "socket.io";
import {
  C2S,
  MAX_IMAGE_BYTES,
  S2C,
  VISITORS_PAGE_SIZE,
  type ErrorPayload,
  type JoinPayload,
  type KickPayload,
  type SetAdminPayload,
  type SetSettingsPayload,
  type SetTimerPayload,
  type SubmitPrepPayload,
  type VotePayload,
} from "../../shared/protocol.ts";
import { resolveAdminPassword, resolveAdminUsername } from "./admin-auth.ts";
import {
  ADMIN_TTL_MS,
  clearAdminCookie,
  readAdminTokenFromRequest,
  serializeAdminCookie,
} from "./admin-cookie.ts";
import { GameError } from "./room.ts";
import { RoomManager } from "./rooms.ts";
import { httpClientIp, socketClientIp, trustProxyEnabled } from "./proxy.ts";
import { VisitorStore } from "./visitors.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRUST_PROXY = trustProxyEnabled();
const SECURE_COOKIES = process.env.NODE_ENV === "production";

function sha256(value: string) {
  return createHash("sha256").update(value).digest();
}

function secretEquals(given: string, expected: string) {
  return timingSafeEqual(sha256(given), sha256(expected));
}

function errorPayload(err: unknown): ErrorPayload {
  if (err instanceof GameError) return { code: err.code, message: err.message };
  if (err instanceof Error) return { code: "error", message: err.message };
  return { code: "error", message: "Algo deu errado." };
}

function corsOrigins(): cors.CorsOptions {
  const extra = (process.env.CLIENT_ORIGIN ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  const local =
    process.env.NODE_ENV === "production"
      ? []
      : [
          "http://localhost:5173",
          "http://127.0.0.1:5173",
          "http://localhost:3001",
          "http://127.0.0.1:3001",
        ];
  const allowed = new Set([...extra, ...local]);
  return {
    origin(origin, callback) {
      if (!origin || allowed.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed"));
    },
    credentials: true,
  };
}

function createRateLimiter(max: number, windowMs = 60_000) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((time) => now - time < windowMs);
    if (recent.length >= max) return false;
    recent.push(now);
    hits.set(key, recent);
    return true;
  };
}

function routeParam(value: unknown): string {
  if (Array.isArray(value)) return String(value[0] ?? "");
  return typeof value === "string" ? value : "";
}

export function createApp(manager = new RoomManager(), visitors = VisitorStore.openDefault()) {
  const app = express();
  const corsOptions = corsOrigins();
  if (TRUST_PROXY) app.set("trust proxy", 1);
  app.use(cors(corsOptions));
  app.use(express.json());
  visitors.purgeExpired();
  const purgeTimer = setInterval(() => visitors.purgeExpired(), 60 * 60 * 1000);
  purgeTimer.unref();

  const createRoomLimit = createRateLimiter(8);
  const uploadLimit = createRateLimiter(20);
  const joinLimit = createRateLimiter(30);
  const adminLoginLimit = createRateLimiter(10);
  const adminSessions = new Map<string, number>();

  function adminAuthorized(req: { header(name: string): string | undefined }) {
    const token = readAdminTokenFromRequest(req);
    const expiresAt = adminSessions.get(token);
    if (!expiresAt) return false;
    if (Date.now() > expiresAt) {
      adminSessions.delete(token);
      return false;
    }
    return true;
  }

  app.get("/api/admin/session", (req, res) => {
    res.json({ authenticated: adminAuthorized(req) });
  });

  app.post("/api/admin/login", (req, res) => {
    if (!adminLoginLimit(httpClientIp(req, TRUST_PROXY))) {
      res.status(429).json({ message: "Muitas tentativas. Espere um pouco." });
      return;
    }
    const username = String(req.body?.username ?? "");
    const password = String(req.body?.password ?? "");
    const expectedUser = resolveAdminUsername();
    const expectedPass = resolveAdminPassword();
    if (!secretEquals(username, expectedUser) || !secretEquals(password, expectedPass)) {
      res.status(401).json({ message: "Usuário ou senha inválidos." });
      return;
    }
    const token = randomUUID();
    adminSessions.set(token, Date.now() + ADMIN_TTL_MS);
    res.setHeader("Set-Cookie", serializeAdminCookie(token, SECURE_COOKIES));
    res.json({ ok: true });
  });

  app.post("/api/admin/logout", (req, res) => {
    const token = readAdminTokenFromRequest(req);
    if (token) adminSessions.delete(token);
    res.setHeader("Set-Cookie", clearAdminCookie(SECURE_COOKIES));
    res.json({ ok: true });
  });

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_IMAGE_BYTES },
  });

  app.post("/api/rooms", (req, res) => {
    if (!createRoomLimit(httpClientIp(req, TRUST_PROXY))) {
      res.status(429).json({ message: "Muitas salas criadas. Espere um pouco." });
      return;
    }
    try {
      const room = manager.create();
      res.json({ roomId: room.id });
    } catch (err) {
      const payload = errorPayload(err);
      const status = err instanceof GameError && err.code === "too-many-rooms" ? 503 : 400;
      res.status(status).json(payload);
    }
  });

  app.get("/api/rooms", (req, res) => {
    if (!adminAuthorized(req)) {
      res.status(401).json({ message: "Acesso restrito." });
      return;
    }
    res.json({
      ...manager.listOverview(),
      visitors: visitors.list(),
    });
  });

  app.get("/api/admin/visitors", (req, res) => {
    if (!adminAuthorized(req)) {
      res.status(401).json({ message: "Acesso restrito." });
      return;
    }
    const page = Number(req.query.page ?? 1);
    res.json(visitors.listPage(page, VISITORS_PAGE_SIZE));
  });

  app.get("/api/rooms/:roomId", (req, res) => {
    const roomId = routeParam(req.params.roomId);
    const room = manager.get(roomId);
    const token = String(req.header("x-session-token") ?? "");
    const member = token ? room?.findByToken(token) : undefined;
    if (!room || !member) {
      res.status(404).json({ message: "Sala não encontrada." });
      return;
    }
    res.json({ roomId: room.id });
  });

  app.post("/api/rooms/:roomId/images", upload.single("image"), (req, res) => {
    if (!uploadLimit(httpClientIp(req, TRUST_PROXY))) {
      res.status(429).json({ message: "Muitos envios. Espere um pouco." });
      return;
    }
    const room = manager.get(routeParam(req.params.roomId));
    const token = String(req.header("x-session-token") ?? "");
    if (!room) {
      res.status(404).json({ message: "Sala não encontrada." });
      return;
    }
    const player = room.findByToken(token);
    if (!player) {
      res.status(401).json({ message: "Sessão inválida." });
      return;
    }
    if (!req.file) {
      res.status(400).json({ message: "Envie uma imagem." });
      return;
    }
    try {
      const image = manager.images.save(room.id, player.id, req.file.mimetype, req.file.buffer);
      res.json({ imageId: image.id });
    } catch (err) {
      res.status(400).json({ message: err instanceof Error ? err.message : "Falha no upload." });
    }
  });

  app.get("/api/images/:imageId", (req, res) => {
    const image = manager.images.get(routeParam(req.params.imageId));
    const token = String(req.header("x-session-token") ?? "");
    const room = image ? manager.get(image.roomId) : undefined;
    const member = token && room?.findByToken(token);
    if (!image || !member) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", image.mime);
    res.setHeader("Cache-Control", "private, no-store");
    res.send(image.buffer);
  });

  const clientDist = join(__dirname, "../../client/dist");
  app.use(express.static(clientDist));
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api") || req.path.startsWith("/socket.io")) {
      next();
      return;
    }
    res.sendFile(join(clientDist, "index.html"), (err) => {
      if (err) next();
    });
  });

  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: corsOptions,
  });

  const socketsByPlayer = new Map<string, Set<string>>();

  function trackSocket(playerId: string, socketId: string): void {
    const set = socketsByPlayer.get(playerId) ?? new Set();
    set.add(socketId);
    socketsByPlayer.set(playerId, set);
  }

  function untrackSocket(playerId: string, socketId: string): void {
    const set = socketsByPlayer.get(playerId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) socketsByPlayer.delete(playerId);
  }

  function broadcast(roomId: string): void {
    const room = manager.get(roomId);
    if (!room) return;
    for (const player of room.players.values()) {
      const sockets = socketsByPlayer.get(player.id);
      if (!sockets) continue;
      const state = room.serialize(player.id);
      for (const socketId of sockets) {
        io.to(socketId).emit(S2C.STATE, state);
      }
    }
  }

  manager.onKick((roomId, playerId, reason) => {
    if (reason === "kicked") {
      const sockets = socketsByPlayer.get(playerId);
      if (sockets) {
        for (const socketId of sockets) {
          io.to(socketId).emit(S2C.KICKED, { reason });
        }
      }
    }
    socketsByPlayer.delete(playerId);
  });

  manager.onChange((roomId) => broadcast(roomId));

  io.on("connection", (socket) => {
    let joinedRoomId: string | null = null;
    let playerId: string | null = null;

    const sendError = (err: unknown) => {
      socket.emit(S2C.ERROR, errorPayload(err));
    };

    socket.on(C2S.JOIN, (payload: JoinPayload) => {
      try {
        if (!joinLimit(socketClientIp(socket, TRUST_PROXY))) {
          throw new GameError("rate-limited", "Muitas tentativas. Espere um pouco.");
        }
        const roomId = String(payload?.roomId ?? "").trim().toUpperCase();
        if (!/^[A-Z0-9]{4,12}$/.test(roomId)) {
          throw new GameError("invalid-room", "Código de sala inválido.");
        }
        const room = manager.get(roomId);
        if (!room) {
          throw new GameError("invalid-room", "Sala não encontrada.");
        }
        const existingToken =
          payload.sessionToken ??
          (playerId ? room.players.get(playerId)?.sessionToken : undefined);
        const player = room.join(payload.nickname, socket.id, existingToken);
        if (playerId && playerId !== player.id) untrackSocket(playerId, socket.id);
        joinedRoomId = room.id;
        playerId = player.id;
        socket.join(room.id);
        trackSocket(player.id, socket.id);
        try {
          visitors.record({
            ip: socketClientIp(socket, TRUST_PROXY),
            nickname: player.nickname,
            roomId: room.id,
          });
        } catch (err) {
          console.error("Falha ao registrar visitante", err);
        }
        socket.emit(S2C.JOINED, {
          playerId: player.id,
          sessionToken: player.sessionToken,
          roomId: room.id,
        });
        broadcast(room.id);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.LEAVE, () => {
      if (!joinedRoomId || !playerId) return;
      const room = manager.get(joinedRoomId);
      try {
        room?.leave(playerId);
      } catch (err) {
        sendError(err);
      }
      untrackSocket(playerId, socket.id);
      playerId = null;
    });

    socket.on(C2S.KICK, (payload: KickPayload) => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.kick(playerId, payload.playerId);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.SET_ADMIN, (payload: SetAdminPayload) => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.setAdmin(playerId, payload.playerId);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.SET_TIMER, (payload: SetTimerPayload) => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.setTimer(playerId, payload.seconds);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.SET_SETTINGS, (payload: SetSettingsPayload) => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.setSettings(playerId, payload);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.START_PREP, () => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.startPreparation(playerId);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.SUBMIT_PREP, (payload: SubmitPrepPayload) => {
      if (!joinedRoomId || !playerId) return;
      try {
        const room = manager.get(joinedRoomId);
        if (!room) return;
        for (const part of [payload.truth, payload.lie1, payload.lie2]) {
          if (part.imageId && !manager.images.belongsTo(part.imageId, room.id, playerId)) {
            throw new GameError("invalid-image", "Imagem inválida.");
          }
        }
        room.submitPrep(playerId, payload);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.START_GAME, () => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.startGame(playerId);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.VOTE, (payload: VotePayload) => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.vote(playerId, payload.statementId);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.ADVANCE, () => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.advance(playerId);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on(C2S.RESET, () => {
      if (!joinedRoomId || !playerId) return;
      try {
        manager.get(joinedRoomId)?.reset(playerId);
      } catch (err) {
        sendError(err);
      }
    });

    socket.on("disconnect", () => {
      if (!playerId) return;
      untrackSocket(playerId, socket.id);
      const stillConnected = socketsByPlayer.get(playerId)?.size;
      if (!stillConnected && joinedRoomId) {
        manager.get(joinedRoomId)?.disconnect(playerId);
      }
    });
  });

  httpServer.on("close", () => clearInterval(purgeTimer));

  return { app, httpServer, io, manager, visitors };
}
