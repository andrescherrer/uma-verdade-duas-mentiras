import assert from "node:assert/strict";
import test from "node:test";
import { io as clientIo, type Socket } from "socket.io-client";
import { C2S, S2C, type JoinedPayload, type PublicState } from "../../shared/protocol.ts";
import { ADMIN_COOKIE } from "./admin-cookie.ts";
import { createApp } from "./app.ts";
import { RoomManager } from "./rooms.ts";
import { VisitorStore } from "./visitors.ts";

function cookieFromResponse(res: Response): string {
  const raw = typeof res.headers.getSetCookie === "function"
    ? res.headers.getSetCookie()
    : [];
  const list = raw.length > 0 ? raw : [res.headers.get("set-cookie") ?? ""];
  for (const entry of list) {
    const match = entry.match(new RegExp(`${ADMIN_COOKIE}=([^;]+)`));
    if (match) return `${ADMIN_COOKIE}=${match[1]}`;
  }
  return "";
}

function adminHeaders(cookie: string): HeadersInit {
  return cookie ? { Cookie: cookie } : {};
}

function waitFor<T>(socket: Socket, event: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting ${event}`)), 4000);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });
}

function waitForPhase(socket: Socket, phase: PublicState["phase"]): Promise<PublicState> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting phase ${phase}`)), 4000);
    const onState = (payload: PublicState) => {
      if (payload.phase !== phase) return;
      clearTimeout(timer);
      socket.off(S2C.STATE, onState);
      resolve(payload);
    };
    socket.on(S2C.STATE, onState);
  });
}

async function connect(url: string, roomId: string, nickname: string) {
  const socket = clientIo(url, { transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });
  const joined = waitFor<JoinedPayload>(socket, S2C.JOINED);
  const state = waitFor<PublicState>(socket, S2C.STATE);
  socket.emit(C2S.JOIN, { roomId, nickname });
  return { socket, joined: await joined, state: await state };
}

test("fluxo socket.io: dois clientes entram, preparam, votam e revelam", async (t) => {
  const { httpServer, io, manager } = createApp(new RoomManager(), VisitorStore.memory());
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const address = httpServer.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  const room = manager.create();
  const clients: Socket[] = [];

  t.after(async () => {
    for (const socket of clients) socket.disconnect();
    room.dispose();
    io.close();
    await new Promise<void>((resolve, reject) => {
      httpServer.close((err) => (err ? reject(err) : resolve()));
    });
  });

  const a = await connect(url, room.id, "Sara");
  const b = await connect(url, room.id, "João");
  clients.push(a.socket, b.socket);
  const aCurrent = room.serialize(a.joined.playerId);
  assert.equal(aCurrent.players.length, 2);

  const prepWait = waitForPhase(a.socket, "preparation");
  a.socket.emit(C2S.START_PREP);
  const prepState = await prepWait;
  assert.equal(prepState.phase, "preparation");

  const payload = (truth: string, lie1: string, lie2: string) => ({
    truth: { text: truth, imageId: null },
    lie1: { text: lie1, imageId: null },
    lie2: { text: lie2, imageId: null },
  });

  const aPrep = waitForPhase(a.socket, "preparation");
  a.socket.emit(C2S.SUBMIT_PREP, payload("Verdade da Sara", "Mentira A da Sara", "Mentira B da Sara"));
  await aPrep;
  const bPrep = waitForPhase(b.socket, "preparation");
  b.socket.emit(C2S.SUBMIT_PREP, payload("Verdade do João", "Mentira A do João", "Mentira B do João"));
  await bPrep;

  const votingWait = waitForPhase(a.socket, "voting");
  a.socket.emit(C2S.START_GAME);
  const votingA = await votingWait;
  const votingB = room.serialize(b.joined.playerId);
  assert.equal(votingA.phase, "voting");
  assert.equal(votingA.options.length, 3);
  assert.equal(JSON.stringify(votingA).includes('"kind"'), false);
  assert.equal(JSON.stringify(votingB).includes("truthId"), false);

  const subjectId = votingA.subject?.id;
  const voter = subjectId === a.joined.playerId ? b : a;
  const truth = [...room.players.values()]
    .find((p) => p.id === subjectId)!
    .statements!.find((s) => s.kind === "truth")!;
  const revealWait = waitForPhase(voter.socket, "reveal");
  voter.socket.emit(C2S.VOTE, { statementId: truth.id });
  const reveal = await revealWait;
  assert.equal(reveal.phase, "reveal");
  assert.equal(reveal.reveal?.truthId, truth.id);
  assert.equal(reveal.reveal?.correctCount, 1);
});

async function listen() {
  const app = createApp(new RoomManager(), VisitorStore.memory());
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const address = app.httpServer.address();
  assert.ok(address && typeof address === "object");
  return { ...app, url: `http://127.0.0.1:${address.port}` };
}

async function closeApp(app: Awaited<ReturnType<typeof listen>>) {
  app.io.close();
  await new Promise<void>((resolve, reject) => {
    app.httpServer.close((err) => (err ? reject(err) : resolve()));
  });
}

test("join em código inventado não cria sala", async (t) => {
  const app = await listen();
  t.after(() => closeApp(app));
  const socket = clientIo(app.url, { transports: ["websocket"] });
  t.after(() => socket.disconnect());
  await new Promise<void>((resolve, reject) => {
    socket.on("connect", () => resolve());
    socket.on("connect_error", reject);
  });
  const error = waitFor<{ code: string }>(socket, S2C.ERROR);
  socket.emit(C2S.JOIN, { roomId: "XXXXXX", nickname: "Sara" });
  const payload = await error;
  assert.equal(payload.code, "invalid-room");
  assert.equal(app.manager.rooms.size, 0);
});

async function adminLogin(url: string, username = "admin-master-blaster", password = "!@#987654321") {
  const res = await fetch(`${url}/api/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  return { res, cookie: cookieFromResponse(res), body: await res.json().catch(() => ({})) };
}

test("em produção o login admin aceita a senha do dia !@#YYYYMMDD", async (t) => {
  const previous = process.env.NODE_ENV;
  const previousPass = process.env.ADMIN_PASSWORD;
  process.env.NODE_ENV = "production";
  delete process.env.ADMIN_PASSWORD;
  t.after(() => {
    if (previous === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previous;
    if (previousPass === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousPass;
  });

  const { productionAdminPassword } = await import("./admin-auth.ts");
  const app = await listen();
  t.after(() => closeApp(app));

  const wrong = await adminLogin(app.url, "admin-master-blaster", "!@#987654321");
  assert.equal(wrong.res.status, 401);

  const login = await adminLogin(app.url, "admin-master-blaster", productionAdminPassword());
  assert.equal(login.res.status, 200);
  assert.equal(login.body.ok, true);
  assert.ok(login.cookie.includes(ADMIN_COOKIE));
});

test("GET /api/rooms exige login do admin-master-blaster", async (t) => {
  const app = await listen();
  t.after(() => closeApp(app));

  const blocked = await fetch(`${app.url}/api/rooms`);
  assert.equal(blocked.status, 401);

  const wrong = await adminLogin(app.url, "admin-master-blaster", "senha-errada");
  assert.equal(wrong.res.status, 401);

  const login = await adminLogin(app.url);
  assert.equal(login.res.status, 200);
  assert.equal(login.body.ok, true);
  assert.ok(login.cookie);

  const empty = await fetch(`${app.url}/api/rooms`, {
    headers: adminHeaders(login.cookie),
  });
  assert.equal(empty.status, 200);
  assert.deepEqual(await empty.json(), { rooms: [], connectedUsers: [], visitors: [] });

  const room = app.manager.create();
  const sara = room.join("Sara", "sock-1");
  const joao = room.join("João", "sock-2");
  room.disconnect(joao.id);

  const listed = await fetch(`${app.url}/api/rooms`, {
    headers: adminHeaders(login.cookie),
  });
  assert.equal(listed.status, 200);
  const payload = await listed.json();
  assert.equal(payload.rooms.length, 1);
  assert.equal(payload.rooms[0].roomId, room.id);
  assert.equal(payload.rooms[0].phase, "lobby");
  assert.equal(payload.rooms[0].playerCount, 2);
  assert.equal(payload.rooms[0].connectedCount, 1);
  assert.deepEqual(
    payload.connectedUsers.map((user: { nickname: string; roomId: string }) => ({
      nickname: user.nickname,
      roomId: user.roomId,
    })),
    [{ nickname: "Sara", roomId: room.id }],
  );
  assert.equal(sara.connected, true);
});

test("imagem só é servida com header x-session-token da sala", async (t) => {
  const app = await listen();
  t.after(() => closeApp(app));
  const room = app.manager.create();
  const player = room.join("Sara", "sock-1");
  const otherRoom = app.manager.create();
  const stranger = otherRoom.join("Léo", "sock-2");
  const image = app.manager.images.save(room.id, player.id, "image/png", Buffer.from("png"));

  const missing = await fetch(`${app.url}/api/images/${image.id}`);
  assert.equal(missing.status, 404);

  const queryIgnored = await fetch(
    `${app.url}/api/images/${image.id}?token=${encodeURIComponent(player.sessionToken)}`,
  );
  assert.equal(queryIgnored.status, 404);

  const wrong = await fetch(`${app.url}/api/images/${image.id}`, {
    headers: { "x-session-token": "nope" },
  });
  assert.equal(wrong.status, 404);

  const otherMember = await fetch(`${app.url}/api/images/${image.id}`, {
    headers: { "x-session-token": stranger.sessionToken },
  });
  assert.equal(otherMember.status, 404);

  const ok = await fetch(`${app.url}/api/images/${image.id}`, {
    headers: { "x-session-token": player.sessionToken },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
});

test("GET /api/rooms/:id exige sessão da sala e não vaza fase/contagem", async (t) => {
  const app = await listen();
  t.after(() => closeApp(app));
  const room = app.manager.create();
  const player = room.join("Sara", "sock-1");

  const publicProbe = await fetch(`${app.url}/api/rooms/${room.id}`);
  assert.equal(publicProbe.status, 404);

  const wrongToken = await fetch(`${app.url}/api/rooms/${room.id}`, {
    headers: { "x-session-token": "nope" },
  });
  assert.equal(wrongToken.status, 404);

  const ok = await fetch(`${app.url}/api/rooms/${room.id}`, {
    headers: { "x-session-token": player.sessionToken },
  });
  assert.equal(ok.status, 200);
  assert.deepEqual(await ok.json(), { roomId: room.id });
});

test("entrar na sala grava IP, nome e local do visitante por 30 dias", async (t) => {
  const app = await listen();
  t.after(() => closeApp(app));
  const room = app.manager.create();
  const client = await connect(app.url, room.id, "Sara");
  t.after(() => client.socket.disconnect());

  const login = await adminLogin(app.url);
  const listed = await fetch(`${app.url}/api/rooms`, {
    headers: adminHeaders(login.cookie),
  });
  const payload = await listed.json();
  assert.equal(payload.visitors.length, 1);
  assert.equal(payload.visitors[0].nickname, "Sara");
  assert.equal(payload.visitors[0].roomId, room.id);
  assert.ok(payload.visitors[0].ip);
  assert.equal(payload.visitors[0].location, "Rede local");
});

test("GET /api/admin/visitors pagina 20 registros e exige admin", async (t) => {
  let now = 1_000_000;
  const visitors = VisitorStore.memory({
    now: () => now,
    lookup: () => ({ location: "Rede local", country: null, region: null, city: null }),
  });
  const app = createApp(new RoomManager(), visitors);
  await new Promise<void>((resolve) => app.httpServer.listen(0, resolve));
  const address = app.httpServer.address();
  assert.ok(address && typeof address === "object");
  const url = `http://127.0.0.1:${address.port}`;
  t.after(() => closeApp({ ...app, url }));

  const blocked = await fetch(`${url}/api/admin/visitors`);
  assert.equal(blocked.status, 401);

  for (let i = 1; i <= 21; i += 1) {
    visitors.record({ ip: `10.0.0.${i}`, nickname: `Jogador ${i}` });
    now += 1;
  }

  const login = await adminLogin(url);
  const first = await fetch(`${url}/api/admin/visitors?page=1`, {
    headers: adminHeaders(login.cookie),
  });
  assert.equal(first.status, 200);
  const page1 = await first.json();
  assert.equal(page1.page, 1);
  assert.equal(page1.pageSize, 20);
  assert.equal(page1.total, 21);
  assert.equal(page1.totalPages, 2);
  assert.equal(page1.visitors.length, 20);
  assert.equal(page1.visitors[0].nickname, "Jogador 21");

  const second = await fetch(`${url}/api/admin/visitors?page=2`, {
    headers: adminHeaders(login.cookie),
  });
  const page2 = await second.json();
  assert.equal(page2.page, 2);
  assert.equal(page2.visitors.length, 1);
  assert.equal(page2.visitors[0].nickname, "Jogador 1");
});
