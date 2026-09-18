import assert from "node:assert/strict";
import test from "node:test";
import { io as clientIo, type Socket } from "socket.io-client";
import { C2S, S2C, type JoinedPayload, type PublicState } from "../../shared/protocol.ts";
import { createApp } from "./app.ts";

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
  const { httpServer, io, manager } = createApp();
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
  const app = createApp();
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

test("imagem só é servida com token de quem está na sala", async (t) => {
  const app = await listen();
  t.after(() => closeApp(app));
  const room = app.manager.create();
  const player = room.join("Sara", "sock-1");
  const otherRoom = app.manager.create();
  const stranger = otherRoom.join("Léo", "sock-2");
  const image = app.manager.images.save(room.id, player.id, "image/png", Buffer.from("png"));

  const missing = await fetch(`${app.url}/api/images/${image.id}`);
  assert.equal(missing.status, 404);

  const wrong = await fetch(`${app.url}/api/images/${image.id}?token=nope`);
  assert.equal(wrong.status, 404);

  const otherMember = await fetch(
    `${app.url}/api/images/${image.id}?token=${encodeURIComponent(stranger.sessionToken)}`,
  );
  assert.equal(otherMember.status, 404);

  const ok = await fetch(
    `${app.url}/api/images/${image.id}?token=${encodeURIComponent(player.sessionToken)}`,
  );
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("content-type"), "image/png");
});
