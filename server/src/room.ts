import { randomUUID } from "node:crypto";
import type {
  Phase,
  PublicState,
  RankingEntry,
  StatementInput,
  VoteSeconds,
} from "../../shared/protocol.ts";
import {
  DISCONNECT_GRACE_MS,
  MAX_PLAYERS_PER_ROOM,
  NICKNAME_MAX,
  REVEAL_SECONDS,
  STATEMENT_MAX,
  STATEMENT_MIN,
  VOTE_SECONDS_OPTIONS,
} from "../../shared/protocol.ts";

export interface Statement {
  id: string;
  text: string;
  imageId: string | null;
  kind: "truth" | "lie";
}

export interface Player {
  id: string;
  sessionToken: string;
  socketId: string | null;
  nickname: string;
  score: number;
  connected: boolean;
  disconnectedAt: number | null;
  joinedAt: number;
  prepared: boolean;
  statements: Statement[] | null;
}

interface Round {
  subjectId: string;
  options: string[];
  votes: Map<string, string>;
  startedAt: number;
  endsAt: number;
  durationMs: number;
}

interface RevealSnapshot {
  subjectId: string;
  truthId: string;
  options: Statement[];
  votes: Array<{
    playerId: string;
    nickname: string;
    statementId: string;
    correct: boolean;
    connected: boolean;
  }>;
  correctCount: number;
  wrongCount: number;
  totalVotes: number;
  pointsAwarded: Map<string, number>;
}

export type RoomEvent =
  | { type: "kick"; playerId: string; reason: string }
  | { type: "destroyed" };

export interface Clock {
  now: () => number;
  schedule: (fn: () => void, ms: number) => { clear: () => void };
}

const defaultClock: Clock = {
  now: () => Date.now(),
  schedule: (fn, ms) => {
    const t = setTimeout(fn, ms);
    return { clear: () => clearTimeout(t) };
  },
};

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function cleanNickname(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, NICKNAME_MAX);
}

function cleanStatement(raw: string): string {
  return raw.trim().replace(/\s+/g, " ").slice(0, STATEMENT_MAX);
}

function uniqueNickname(desired: string, taken: Set<string>, selfId?: string): string {
  const base = desired || "Jogador";
  const lowerTaken = new Set(
    [...taken].map((n) => n.toLowerCase()),
  );
  if (!lowerTaken.has(base.toLowerCase())) return base;
  let i = 2;
  while (lowerTaken.has(`${base} ${i}`.toLowerCase())) i += 1;
  return `${base} ${i}`;
}

export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "GameError";
  }
}

export class GameRoom {
  readonly id: string;
  adminId = "";
  phase: Phase = "lobby";
  voteSeconds: VoteSeconds = 30;
  allowJoinDuringGame = false;
  autoEndRound = true;
  showRanking = true;
  players = new Map<string, Player>();
  queue: string[] = [];
  queueIndex = 0;
  round: Round | null = null;
  reveal: RevealSnapshot | null = null;
  revealEndsAt: number | null = null;
  readonly createdAt: number;
  private timer: { clear: () => void } | null = null;
  private readonly clock: Clock;
  private readonly onChange: () => void;
  private readonly onEvent: (event: RoomEvent) => void;
  private readonly deleteImages: (ids: string[]) => void;

  constructor(
    id: string,
    options: {
      clock?: Clock;
      onChange?: () => void;
      onEvent?: (event: RoomEvent) => void;
      deleteImages?: (ids: string[]) => void;
    } = {},
  ) {
    this.id = id;
    this.clock = options.clock ?? defaultClock;
    this.createdAt = this.clock.now();
    this.onChange = options.onChange ?? (() => undefined);
    this.onEvent = options.onEvent ?? (() => undefined);
    this.deleteImages = options.deleteImages ?? (() => undefined);
  }

  private emit(): void {
    this.onChange();
  }

  private clearTimer(): void {
    this.timer?.clear();
    this.timer = null;
  }

  private playerList(): Player[] {
    return [...this.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
  }

  private requirePlayer(playerId: string): Player {
    const player = this.players.get(playerId);
    if (!player) throw new GameError("not-in-room", "Você não está nesta sala.");
    return player;
  }

  private requireAdmin(actorId: string): Player {
    const actor = this.requirePlayer(actorId);
    if (actor.id !== this.adminId) {
      throw new GameError("not-admin", "Somente o administrador pode fazer isso.");
    }
    return actor;
  }

  findByToken(token: string): Player | undefined {
    return this.playerList().find((p) => p.sessionToken === token);
  }

  findBySocket(socketId: string): Player | undefined {
    return this.playerList().find((p) => p.socketId === socketId);
  }

  canAcceptNewPlayer(): boolean {
    if (this.phase === "lobby" || this.phase === "preparation" || this.phase === "finished") return true;
    return this.allowJoinDuringGame && (this.phase === "voting" || this.phase === "reveal");
  }

  join(nickname: string, socketId: string, sessionToken?: string): Player {
    if (sessionToken) {
      const existing = this.findByToken(sessionToken);
      if (existing) {
        this.attachSocket(existing, socketId);
        this.restoreCreatorAdmin(existing);
        this.emit();
        return existing;
      }
    }

    const already = this.findBySocket(socketId);
    if (already) {
      already.connected = true;
      already.disconnectedAt = null;
      this.emit();
      return already;
    }

    if (!this.canAcceptNewPlayer()) {
      throw new GameError(
        "game-in-progress",
        "A partida já começou. Peça o link novamente na próxima rodada ou reconecte com a mesma sessão.",
      );
    }

    if (this.players.size >= MAX_PLAYERS_PER_ROOM) {
      throw new GameError("room-full", "A sala está cheia.");
    }

    const cleaned = cleanNickname(nickname);
    const name = uniqueNickname(cleaned, new Set(this.playerList().map((p) => p.nickname)));
    if (!name) throw new GameError("invalid-nickname", "Informe um nome.");

    const player: Player = {
      id: randomUUID(),
      sessionToken: randomUUID(),
      socketId,
      nickname: name,
      score: 0,
      connected: true,
      disconnectedAt: null,
      joinedAt: this.clock.now(),
      prepared: false,
      statements: null,
    };
    this.players.set(player.id, player);
    if (!this.adminId) this.adminId = player.id;
    this.ensureConnectedAdmin();
    this.emit();
    return player;
  }

  private attachSocket(player: Player, socketId: string): void {
    const leftovers: string[] = [];
    for (const other of this.players.values()) {
      if (other.id !== player.id && other.socketId === socketId) leftovers.push(other.id);
    }
    player.socketId = socketId;
    player.connected = true;
    player.disconnectedAt = null;
    for (const id of leftovers) {
      if (this.phase === "lobby") this.removePlayer(id, "left");
      else {
        const leftover = this.players.get(id);
        if (!leftover) continue;
        leftover.connected = false;
        leftover.socketId = null;
        leftover.disconnectedAt = this.clock.now();
      }
    }
    this.ensureConnectedAdmin();
  }

  private ensureConnectedAdmin(): void {
    const admin = this.players.get(this.adminId);
    if (admin?.connected) return;
    const next = this.connectedPlayers()[0];
    if (next) this.adminId = next.id;
  }

  private restoreCreatorAdmin(player: Player): void {
    if (this.phase !== "lobby" && this.phase !== "preparation") return;
    const oldest = this.playerList()[0];
    if (oldest?.id === player.id) this.adminId = player.id;
  }

  disconnect(playerId: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    player.connected = false;
    player.socketId = null;
    player.disconnectedAt = this.clock.now();
    this.ensureConnectedAdmin();
    this.emit();
    if (this.phase === "voting") this.maybeEndVotingEarly();
  }

  sweepDisconnected(now = this.clock.now()): void {
    for (const player of this.playerList()) {
      if (
        !player.connected &&
        player.disconnectedAt &&
        now - player.disconnectedAt > DISCONNECT_GRACE_MS &&
        this.phase === "lobby"
      ) {
        this.removePlayer(player.id, "disconnect-timeout");
      }
    }
    if (this.players.size === 0) this.onEvent({ type: "destroyed" });
  }

  leave(playerId: string): void {
    this.removePlayer(playerId, "left");
  }

  kick(actorId: string, targetId: string): void {
    this.requireAdmin(actorId);
    if (actorId === targetId) {
      throw new GameError("invalid-target", "Você não pode se remover da sala.");
    }
    const target = this.requirePlayer(targetId);
    this.removePlayer(target.id, "kicked");
  }

  setAdmin(actorId: string, targetId: string): void {
    this.requireAdmin(actorId);
    const target = this.requirePlayer(targetId);
    this.adminId = target.id;
    this.emit();
  }

  setTimer(actorId: string, seconds: number): void {
    this.requireAdmin(actorId);
    if (this.phase !== "lobby" && this.phase !== "preparation") {
      throw new GameError("locked", "O tempo só pode ser alterado antes da partida.");
    }
    if (!(VOTE_SECONDS_OPTIONS as readonly number[]).includes(seconds)) {
      throw new GameError("invalid-timer", "Tempo inválido.");
    }
    this.voteSeconds = seconds as VoteSeconds;
    this.emit();
  }

  setSettings(
    actorId: string,
    payload: {
      seconds: VoteSeconds;
      allowJoinDuringGame: boolean;
      autoEndRound: boolean;
      showRanking: boolean;
    },
  ): void {
    this.requireAdmin(actorId);
    if (this.phase !== "lobby" && this.phase !== "preparation") {
      throw new GameError("locked", "As configurações só podem ser alteradas antes da partida.");
    }
    if (!(VOTE_SECONDS_OPTIONS as readonly number[]).includes(payload.seconds)) {
      throw new GameError("invalid-timer", "Tempo inválido.");
    }
    this.voteSeconds = payload.seconds;
    this.allowJoinDuringGame = Boolean(payload.allowJoinDuringGame);
    this.autoEndRound = Boolean(payload.autoEndRound);
    this.showRanking = Boolean(payload.showRanking);
    this.emit();
  }

  startPreparation(actorId: string): void {
    this.requireAdmin(actorId);
    if (this.phase !== "lobby" && this.phase !== "finished") {
      throw new GameError("bad-phase", "A preparação só pode começar na sala de espera.");
    }
    if (this.connectedPlayers().length < 2) {
      throw new GameError("min-players", "É preciso pelo menos 2 pessoas conectadas.");
    }
    this.phase = "preparation";
    for (const player of this.players.values()) {
      player.prepared = false;
      player.statements = null;
      player.score = 0;
    }
    this.queue = [];
    this.queueIndex = 0;
    this.round = null;
    this.reveal = null;
    this.revealEndsAt = null;
    this.emit();
  }

  submitPrep(playerId: string, payload: { truth: StatementInput; lie1: StatementInput; lie2: StatementInput }): void {
    const player = this.requirePlayer(playerId);
    if (this.phase !== "preparation") {
      throw new GameError("bad-phase", "A preparação não está aberta.");
    }
    const truth = this.buildStatement(payload.truth, "truth");
    const lie1 = this.buildStatement(payload.lie1, "lie");
    const lie2 = this.buildStatement(payload.lie2, "lie");
    const oldIds = (player.statements ?? []).map((s) => s.imageId).filter((id): id is string => Boolean(id));
    const newIds = [truth.imageId, lie1.imageId, lie2.imageId].filter((id): id is string => Boolean(id));
    const discarded = oldIds.filter((id) => !newIds.includes(id));
    if (discarded.length) this.deleteImages(discarded);
    player.statements = [truth, lie1, lie2];
    player.prepared = true;
    this.emit();
  }

  startGame(actorId: string): void {
    this.requireAdmin(actorId);
    if (this.phase !== "preparation") {
      throw new GameError("bad-phase", "O jogo só começa depois da preparação.");
    }
    const pending = this.playerList().filter((p) => !p.prepared);
    if (pending.length) {
      throw new GameError(
        "not-ready",
        `Ainda faltam: ${pending.map((p) => p.nickname).join(", ")}.`,
      );
    }
    if (this.players.size < 2) {
      throw new GameError("min-players", "É preciso pelo menos 2 participantes.");
    }
    this.queue = this.playerList()
      .filter((p) => p.prepared && p.statements?.length === 3)
      .map((p) => p.id);
    this.queueIndex = 0;
    this.beginRound();
  }

  vote(playerId: string, statementId: string): void {
    const player = this.requirePlayer(playerId);
    if (this.phase !== "voting" || !this.round) {
      throw new GameError("bad-phase", "Não há votação aberta.");
    }
    if (player.id === this.round.subjectId) {
      throw new GameError("subject-cannot-vote", "Quem está na vez não vota nesta rodada.");
    }
    if (this.round.votes.has(player.id)) {
      throw new GameError("already-voted", "Seu voto já foi enviado.");
    }
    if (!this.round.options.includes(statementId)) {
      throw new GameError("invalid-vote", "Opção inválida.");
    }
    this.round.votes.set(player.id, statementId);
    this.emit();
    this.maybeEndVotingEarly();
  }

  advance(actorId: string): void {
    this.requireAdmin(actorId);
    if (this.phase !== "reveal") {
      throw new GameError("bad-phase", "Não há revelação para avançar.");
    }
    this.goNext();
  }

  reset(actorId: string): void {
    this.requireAdmin(actorId);
    this.clearTimer();
    this.phase = "lobby";
    this.queue = [];
    this.queueIndex = 0;
    this.round = null;
    this.reveal = null;
    this.revealEndsAt = null;
    for (const player of this.players.values()) {
      player.score = 0;
      player.prepared = false;
      const imageIds = (player.statements ?? []).map((s) => s.imageId).filter((id): id is string => Boolean(id));
      if (imageIds.length) this.deleteImages(imageIds);
      player.statements = null;
    }
    this.emit();
  }

  expireVoting(): void {
    if (this.phase !== "voting" || !this.round) return;
    this.finishRound();
  }

  dispose(): void {
    this.clearTimer();
  }

  private connectedPlayers(): Player[] {
    return this.playerList().filter((p) => p.connected);
  }

  private eligibleVoters(): Player[] {
    if (!this.round) return [];
    return this.playerList().filter((p) => p.id !== this.round!.subjectId);
  }

  private connectedEligibleVoters(): Player[] {
    return this.eligibleVoters().filter((p) => p.connected);
  }

  private maybeEndVotingEarly(): void {
    if (this.phase !== "voting" || !this.round) return;
    const connected = this.connectedEligibleVoters();
    if (connected.length === 0) {
      this.finishRound();
      return;
    }
    if (!this.autoEndRound) return;
    const allVoted = connected.every((p) => this.round!.votes.has(p.id));
    if (allVoted) this.finishRound();
  }

  private buildStatement(input: StatementInput, kind: "truth" | "lie"): Statement {
    const text = cleanStatement(input.text);
    if (text.length < STATEMENT_MIN) {
      throw new GameError("invalid-statement", "Cada afirmação precisa ter pelo menos 3 caracteres.");
    }
    return {
      id: randomUUID(),
      text,
      imageId: input.imageId,
      kind,
    };
  }

  private transferAdminIfNeeded(removedId: string): void {
    if (this.adminId !== removedId && this.players.has(this.adminId)) return;
    const next =
      this.connectedPlayers()[0] ??
      this.playerList()[0];
    this.adminId = next?.id ?? "";
  }

  private removePlayer(playerId: string, reason: string): void {
    const player = this.players.get(playerId);
    if (!player) return;
    const imageIds = (player.statements ?? []).map((s) => s.imageId).filter((id): id is string => Boolean(id));
    if (imageIds.length) this.deleteImages(imageIds);

    const wasSubject =
      this.round?.subjectId === playerId || this.reveal?.subjectId === playerId;
    const queuePos = this.queue.indexOf(playerId);

    this.players.delete(playerId);
    this.queue = this.queue.filter((id) => id !== playerId);
    if (queuePos >= 0 && queuePos < this.queueIndex) this.queueIndex -= 1;
    this.onEvent({ type: "kick", playerId, reason });
    this.transferAdminIfNeeded(playerId);

    if (this.players.size === 0) {
      this.clearTimer();
      this.onEvent({ type: "destroyed" });
      return;
    }

    if (this.players.size < 2 && this.phase === "preparation") {
      this.phase = "lobby";
      this.emit();
      return;
    }

    if (this.players.size < 2 && (this.phase === "voting" || this.phase === "reveal")) {
      this.finishGame();
      return;
    }

    if (wasSubject && (this.phase === "voting" || this.phase === "reveal")) {
      this.clearTimer();
      this.round = null;
      this.reveal = null;
      this.revealEndsAt = null;
      this.beginRound();
      return;
    }

    if (this.phase === "voting" && this.round) {
      this.round.votes.delete(playerId);
      this.emit();
      this.maybeEndVotingEarly();
      return;
    }

    this.emit();
  }

  private skipCurrentRound(): void {
    this.clearTimer();
    this.round = null;
    this.reveal = null;
    this.goNext();
  }

  private beginRound(): void {
    this.clearTimer();
    this.reveal = null;
    this.revealEndsAt = null;

    while (this.queueIndex < this.queue.length) {
      const subjectId = this.queue[this.queueIndex];
      const subject = this.players.get(subjectId);
      if (subject?.statements?.length === 3) {
        const options = shuffle(subject.statements.map((s) => s.id));
        const now = this.clock.now();
        this.round = {
          subjectId,
          options,
          votes: new Map(),
          startedAt: now,
          endsAt: now + this.voteSeconds * 1000,
          durationMs: this.voteSeconds * 1000,
        };
        this.phase = "voting";
        this.timer = this.clock.schedule(() => this.expireVoting(), this.voteSeconds * 1000);
        this.emit();
        this.maybeEndVotingEarly();
        return;
      }
      this.queueIndex += 1;
    }

    this.finishGame();
  }

  private finishRound(): void {
    if (!this.round) return;
    this.clearTimer();
    const subject = this.players.get(this.round.subjectId);
    const statements = subject?.statements ?? [];
    const truth = statements.find((s) => s.kind === "truth");
    if (!truth) {
      this.skipCurrentRound();
      return;
    }

    const pointsAwarded = new Map<string, number>();
    const votes = [];
    for (const voter of this.eligibleVoters()) {
      const statementId = this.round.votes.get(voter.id);
      if (!statementId) continue;
      const correct = statementId === truth.id;
      const points = correct ? 1 : 0;
      voter.score += points;
      pointsAwarded.set(voter.id, points);
      votes.push({
        playerId: voter.id,
        nickname: voter.nickname,
        statementId,
        correct,
        connected: voter.connected,
      });
    }

    const ordered = this.round.options
      .map((id) => statements.find((s) => s.id === id))
      .filter((s): s is Statement => Boolean(s));

    this.reveal = {
      subjectId: this.round.subjectId,
      truthId: truth.id,
      options: ordered,
      votes,
      correctCount: votes.filter((v) => v.correct).length,
      wrongCount: votes.filter((v) => !v.correct).length,
      totalVotes: votes.length,
      pointsAwarded,
    };
    this.round = { ...this.round, votes: this.round.votes };
    this.phase = "reveal";
    this.revealEndsAt = this.clock.now() + REVEAL_SECONDS * 1000;
    this.timer = this.clock.schedule(() => this.goNext(), REVEAL_SECONDS * 1000);
    this.emit();
  }

  private goNext(): void {
    this.clearTimer();
    this.queueIndex += 1;
    this.round = null;
    this.reveal = null;
    this.revealEndsAt = null;
    this.beginRound();
  }

  private finishGame(): void {
    this.clearTimer();
    this.phase = "finished";
    this.round = null;
    this.reveal = null;
    this.revealEndsAt = null;
    this.emit();
  }

  ranking(): RankingEntry[] {
    const sorted = this.playerList().sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return a.nickname.localeCompare(b.nickname, "pt-BR");
    });
    let lastScore: number | null = null;
    let lastRank = 0;
    let placed = 0;
    return sorted.map((player) => {
      if (player.score <= 0) {
        return {
          playerId: player.id,
          nickname: player.nickname,
          score: player.score,
          rank: 0,
        };
      }
      placed += 1;
      const rank = player.score === lastScore ? lastRank : placed;
      lastScore = player.score;
      lastRank = rank;
      return {
        playerId: player.id,
        nickname: player.nickname,
        score: player.score,
        rank,
      };
    });
  }

  pendingNicknames(): string[] {
    if (this.phase !== "preparation") return [];
    return this.playerList().filter((p) => !p.prepared).map((p) => p.nickname);
  }

  serialize(viewerId: string | null): PublicState {
    const viewer = viewerId ? this.players.get(viewerId) : undefined;
    const hideSecrets = this.phase === "voting";
    const subjectId = this.round?.subjectId ?? this.reveal?.subjectId ?? null;
    const subject = subjectId ? this.players.get(subjectId) ?? null : null;

    const options = hideSecrets
      ? (this.round?.options ?? []).map((id) => {
          const statement = subject?.statements?.find((s) => s.id === id);
          return statement
            ? { id: statement.id, text: statement.text }
            : { id, text: "" };
        })
      : this.phase === "reveal" && this.reveal
        ? this.reveal.options.map((s) => ({
            id: s.id,
            text: s.text,
            kind: s.kind,
            imageId: s.imageId,
          }))
        : [];

    return {
      roomId: this.id,
      phase: this.phase,
      voteSeconds: this.voteSeconds,
      allowJoinDuringGame: this.allowJoinDuringGame,
      autoEndRound: this.autoEndRound,
      showRanking: this.showRanking,
      roundNumber: this.phase === "voting" || this.phase === "reveal" ? this.queueIndex + 1 : 0,
      roundTotal: this.queue.length,
      serverNow: this.clock.now(),
      players: this.playerList().map((p) => ({
        id: p.id,
        nickname: p.nickname,
        score: p.score,
        connected: p.connected,
        isAdmin: p.id === this.adminId,
        prepared: p.prepared,
        isYou: p.id === viewerId,
      })),
      you: viewer
        ? {
            id: viewer.id,
            nickname: viewer.nickname,
            prepared: viewer.prepared,
            statements: this.phase === "preparation" ? viewer.statements : null,
          }
        : null,
      subject: subject ? { id: subject.id, nickname: subject.nickname } : null,
      options,
      myVote:
        viewer && this.round
          ? this.round.votes.get(viewer.id) ?? null
          : viewer && this.reveal
            ? this.reveal.votes.find((v) => v.playerId === viewer.id)?.statementId ?? null
            : null,
      votedCount: this.round ? this.round.votes.size : this.reveal?.totalVotes ?? 0,
      eligibleCount:
        this.phase === "voting" ? this.connectedEligibleVoters().length : this.eligibleVoters().length,
      voteEndsAt: this.phase === "voting" ? this.round?.endsAt ?? null : null,
      revealEndsAt: this.phase === "reveal" ? this.revealEndsAt : null,
      reveal:
        this.phase === "reveal" && this.reveal
          ? {
              truthId: this.reveal.truthId,
              votes: this.reveal.votes,
              correctCount: this.reveal.correctCount,
              wrongCount: this.reveal.wrongCount,
              totalVotes: this.reveal.totalVotes,
              myResult: viewer
                ? viewer.id === subject?.id
                  ? null
                  : {
                      correct: this.reveal.pointsAwarded.get(viewer.id) === 1,
                      points: this.reveal.pointsAwarded.get(viewer.id) ?? 0,
                    }
                : null,
            }
          : null,
      ranking: this.ranking(),
      pendingNicknames: this.pendingNicknames(),
    };
  }
}
