import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { MAX_PLAYERS_PER_ROOM } from "../../shared/protocol.ts";
import { GameRoom, type Clock } from "./room.ts";

function mockClock() {
  let now = 1_000_000;
  const timers: Array<{ at: number; fn: () => void; cleared: boolean }> = [];
  const clock: Clock = {
    now: () => now,
    schedule: (fn, ms) => {
      const timer = { at: now + ms, fn, cleared: false };
      timers.push(timer);
      return {
        clear: () => {
          timer.cleared = true;
        },
      };
    },
  };
  return {
    clock,
    advance(ms: number) {
      now += ms;
      for (const timer of [...timers]) {
        if (!timer.cleared && timer.at <= now) {
          timer.cleared = true;
          timer.fn();
        }
      }
    },
  };
}

function room() {
  return new GameRoom("SALA01", { clock: mockClock().clock });
}

function join(game: GameRoom, name: string) {
  return game.join(name, randomUUID());
}

function prep(game: GameRoom, playerId: string, truth: string, lie1: string, lie2: string) {
  game.submitPrep(playerId, {
    truth: { text: truth, imageId: null },
    lie1: { text: lie1, imageId: null },
    lie2: { text: lie2, imageId: null },
  });
}

function secretsIn(value: unknown): string[] {
  const json = JSON.stringify(value);
  const hits: string[] = [];
  if (json.includes('"kind"')) hits.push("kind");
  if (json.includes("truthId")) hits.push("truthId");
  if (json.includes('"isTruth"')) hits.push("isTruth");
  if (json.includes("imageId")) hits.push("imageId");
  return hits;
}

test("dois joins no mesmo socket não duplicam jogador e mantêm o admin", () => {
  const game = room();
  const first = game.join("André", "sock-1");
  const second = game.join("André", "sock-1");
  assert.equal(second.id, first.id);
  assert.equal(game.players.size, 1);
  assert.equal(game.adminId, first.id);
});

test("se o admin desconecta, a administração passa a quem está conectado", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  game.disconnect(sara.id);
  assert.equal(game.adminId, joao.id);
});

test("reconecta com o mesmo token sem duplicar jogador", () => {
  const game = room();
  const sara = join(game, "Sara");
  game.disconnect(sara.id);
  const again = game.join("Outro Nome", randomUUID(), sara.sessionToken);
  assert.equal(again.id, sara.id);
  assert.equal(again.nickname, "Sara");
  assert.equal(game.players.size, 1);
  assert.equal(again.connected, true);
});

test("o mesmo apelido não assume a sessão de quem desconectou", () => {
  const game = room();
  const sara = join(game, "Sara");
  const token = sara.sessionToken;
  game.disconnect(sara.id);
  const impostor = join(game, "Sara");
  assert.notEqual(impostor.id, sara.id);
  assert.notEqual(impostor.sessionToken, token);
  assert.equal(game.players.size, 2);
});

test("sala cheia recusa novos jogadores", () => {
  const game = room();
  for (let i = 0; i < MAX_PLAYERS_PER_ROOM; i += 1) join(game, `P${i}`);
  assert.throws(() => join(game, "Extra"), /cheia/);
});

test("entrada tardia durante a votação é recusada sem token", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  game.startPreparation(sara.id);
  prep(game, sara.id, "Verdade da Sara", "Mentira A", "Mentira B");
  prep(game, joao.id, "Verdade do João", "Mentira C", "Mentira D");
  game.startGame(sara.id);
  assert.equal(game.phase, "voting");
  assert.throws(() => join(game, "Maria"), /já começou/);
});

test("estado de votação não vaza a verdade, imagens nem votos alheios", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  const maria = join(game, "Maria");
  game.startPreparation(sara.id);
  prep(game, sara.id, "Já pulei de paraquedas", "Tenho medo de borboletas", "Já morei fora");
  prep(game, joao.id, "Toco piano", "Nunca comi pizza", "Durmo 4 horas");
  prep(game, maria.id, "Tenho gato", "Nado no mar todo dia", "Falo japonês");
  game.startGame(sara.id);

  const subjectId = game.round?.subjectId;
  const voter = [sara, joao, maria].find((p) => p.id !== subjectId)!;
  const other = [sara, joao, maria].find((p) => p.id !== subjectId && p.id !== voter.id)!;
  const truth = game.players.get(subjectId!)!.statements!.find((s) => s.kind === "truth")!;
  game.vote(voter.id, truth.id);

  const state = game.serialize(other.id);
  assert.equal(state.phase, "voting");
  assert.equal(state.options.length, 3);
  assert.equal(state.myVote, null);
  assert.equal(state.votedCount, 1);
  assert.deepEqual(secretsIn(state), []);
  for (const option of state.options) {
    assert.equal(option.kind, undefined);
    assert.equal(option.imageId, undefined);
  }
  assert.equal(state.you?.statements, null);
  assert.equal(state.reveal, null);
});

test("voto não pode ser alterado e quem está na vez não vota", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  const maria = join(game, "Maria");
  game.startPreparation(sara.id);
  prep(game, sara.id, "Verdade Sara", "Mentira 1", "Mentira 2");
  prep(game, joao.id, "Verdade João", "Mentira 3", "Mentira 4");
  prep(game, maria.id, "Verdade Maria", "Mentira 5", "Mentira 6");
  game.startGame(sara.id);
  const subjectId = game.round!.subjectId;
  const voter = [sara, joao, maria].find((p) => p.id !== subjectId)!;
  const option = game.round!.options[0];
  game.vote(voter.id, option);
  assert.equal(game.phase, "voting");
  assert.throws(() => game.vote(voter.id, game.round!.options[1]), /já foi enviado/);
  assert.throws(() => game.vote(subjectId, option), /não vota/);
});

test("todos votando encerram a rodada antes do tempo e pontuam acerto", () => {
  const { clock } = mockClock();
  const game = new GameRoom("SALA01", { clock });
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  game.startPreparation(sara.id);
  prep(game, sara.id, "Verdade Sara", "Mentira 1", "Mentira 2");
  prep(game, joao.id, "Verdade João", "Mentira 3", "Mentira 4");
  game.startGame(sara.id);
  const subject = game.players.get(game.round!.subjectId)!;
  const voter = subject.id === sara.id ? joao : sara;
  const truth = subject.statements!.find((s) => s.kind === "truth")!;
  game.vote(voter.id, truth.id);
  assert.equal(game.phase, "reveal");
  const revealed = game.serialize(voter.id);
  assert.equal(revealed.reveal?.truthId, truth.id);
  assert.equal(revealed.reveal?.myResult?.correct, true);
  assert.equal(revealed.reveal?.myResult?.points, 1);
  assert.equal(voter.score, 1);
  assert.ok(revealed.options.some((o) => o.kind === "truth" && o.id === truth.id));
  assert.equal(revealed.options.filter((o) => o.kind === "lie").length, 2);
});

test("tempo esgotado zera quem não votou e revela a resposta", () => {
  const { clock, advance } = mockClock();
  const game = new GameRoom("SALA01", { clock });
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  game.setTimer(sara.id, 15);
  game.startPreparation(sara.id);
  prep(game, sara.id, "Verdade Sara", "Mentira 1", "Mentira 2");
  prep(game, joao.id, "Verdade João", "Mentira 3", "Mentira 4");
  game.startGame(sara.id);
  assert.equal(game.phase, "voting");
  advance(15_000);
  assert.equal(game.phase, "reveal");
  assert.equal(sara.score + joao.score, 0);
  assert.equal(game.serialize(joao.id).reveal?.totalVotes, 0);
});

test("admin não inicia enquanto alguém não terminou a preparação", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  game.startPreparation(sara.id);
  prep(game, sara.id, "Verdade Sara", "Mentira 1", "Mentira 2");
  assert.throws(() => game.startGame(sara.id), /João/);
  assert.deepEqual(game.pendingNicknames(), ["João"]);
});

test("remoção tira a pessoa da fila e transfere o administrador", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  const maria = join(game, "Maria");
  game.startPreparation(sara.id);
  prep(game, sara.id, "Verdade Sara", "Mentira 1", "Mentira 2");
  prep(game, joao.id, "Verdade João", "Mentira 3", "Mentira 4");
  prep(game, maria.id, "Verdade Maria", "Mentira 5", "Mentira 6");
  game.startGame(sara.id);
  const firstSubject = game.round!.subjectId;
  const toKick = [sara, joao, maria].find((p) => p.id !== firstSubject)!;
  assert.throws(() => game.kick(toKick.id, firstSubject), /administrador/);
  game.kick(sara.id, toKick.id);
  assert.equal(game.players.has(toKick.id), false);
  assert.equal(game.queue.includes(toKick.id), false);
  assert.ok(game.adminId);
});

test("se o sujeito da rodada for removido, a partida segue sem pular o próximo", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  const maria = join(game, "Maria");
  game.startPreparation(sara.id);
  prep(game, sara.id, "Verdade Sara", "Mentira 1", "Mentira 2");
  prep(game, joao.id, "Verdade João", "Mentira 3", "Mentira 4");
  prep(game, maria.id, "Verdade Maria", "Mentira 5", "Mentira 6");
  game.startGame(sara.id);
  assert.equal(game.round?.subjectId, sara.id);
  assert.throws(() => game.kick(sara.id, sara.id), /não pode se remover/);
  game.setAdmin(sara.id, joao.id);
  game.kick(joao.id, sara.id);
  assert.equal(game.players.has(sara.id), false);
  assert.equal(game.phase, "voting");
  assert.equal(game.round?.subjectId, joao.id);
});

test("ranking de empate usa a mesma colocação e desempata só na exibição", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  const maria = join(game, "Maria");
  sara.score = 4;
  joao.score = 4;
  maria.score = 2;
  const ranking = game.ranking();
  const tied = ranking.filter((r) => r.score === 4);
  assert.equal(tied.length, 2);
  assert.equal(tied[0].rank, 1);
  assert.equal(tied[1].rank, 1);
  assert.equal(ranking.find((r) => r.nickname === "Maria")?.rank, 3);
});

test("se ninguém pontuou, ninguém vence", () => {
  const game = room();
  join(game, "Sara");
  join(game, "João");
  const ranking = game.ranking();
  assert.ok(ranking.every((r) => r.score === 0 && r.rank === 0));
});

test("quem ficou com zero não ocupa pódio", () => {
  const game = room();
  const sara = join(game, "Sara");
  const joao = join(game, "João");
  sara.score = 1;
  joao.score = 0;
  const ranking = game.ranking();
  assert.equal(ranking.find((r) => r.nickname === "Sara")?.rank, 1);
  assert.equal(ranking.find((r) => r.nickname === "João")?.rank, 0);
});
