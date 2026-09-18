export const PHASES = [
  "lobby",
  "preparation",
  "voting",
  "reveal",
  "finished",
] as const;

export type Phase = (typeof PHASES)[number];

export const VOTE_SECONDS_OPTIONS = [15, 30, 45, 60] as const;
export type VoteSeconds = (typeof VOTE_SECONDS_OPTIONS)[number];

export const C2S = {
  JOIN: "room:join",
  LEAVE: "room:leave",
  KICK: "room:kick",
  SET_ADMIN: "room:admin-change",
  SET_TIMER: "room:set-timer",
  SET_SETTINGS: "room:set-settings",
  START_PREP: "game:start-preparation",
  SUBMIT_PREP: "prep:submit",
  START_GAME: "game:start",
  VOTE: "round:vote",
  ADVANCE: "round:advance",
  RESET: "game:reset",
} as const;

export const S2C = {
  STATE: "state:sync",
  JOINED: "room:joined",
  ERROR: "room:error",
  KICKED: "room:kicked",
} as const;

export interface JoinPayload {
  roomId: string;
  nickname: string;
  sessionToken?: string;
}

export interface KickPayload {
  playerId: string;
}

export interface SetAdminPayload {
  playerId: string;
}

export interface SetTimerPayload {
  seconds: VoteSeconds;
}

export interface SetSettingsPayload {
  seconds: VoteSeconds;
  allowJoinDuringGame: boolean;
  autoEndRound: boolean;
  showRanking: boolean;
}

export interface StatementInput {
  text: string;
  imageId: string | null;
}

export interface SubmitPrepPayload {
  truth: StatementInput;
  lie1: StatementInput;
  lie2: StatementInput;
}

export interface VotePayload {
  statementId: string;
}

export interface PublicPlayer {
  id: string;
  nickname: string;
  score: number;
  connected: boolean;
  isAdmin: boolean;
  prepared: boolean;
  isYou: boolean;
}

export interface PublicOption {
  id: string;
  text: string;
  kind?: "truth" | "lie";
  imageId?: string | null;
}

export interface PublicVote {
  playerId: string;
  nickname: string;
  statementId: string;
  correct: boolean;
  connected: boolean;
}

export interface RankingEntry {
  playerId: string;
  nickname: string;
  score: number;
  rank: number;
}

export interface PublicState {
  roomId: string;
  phase: Phase;
  voteSeconds: VoteSeconds;
  allowJoinDuringGame: boolean;
  autoEndRound: boolean;
  showRanking: boolean;
  roundNumber: number;
  roundTotal: number;
  serverNow: number;
  players: PublicPlayer[];
  you: {
    id: string;
    nickname: string;
    prepared: boolean;
    statements: Array<{
      id: string;
      text: string;
      imageId: string | null;
      kind: "truth" | "lie";
    }> | null;
  } | null;
  subject: {
    id: string;
    nickname: string;
  } | null;
  options: PublicOption[];
  myVote: string | null;
  votedCount: number;
  eligibleCount: number;
  voteEndsAt: number | null;
  revealEndsAt: number | null;
  reveal: {
    truthId: string;
    votes: PublicVote[];
    correctCount: number;
    wrongCount: number;
    totalVotes: number;
    myResult: { correct: boolean; points: number } | null;
  } | null;
  ranking: RankingEntry[];
  pendingNicknames: string[];
}

export interface JoinedPayload {
  playerId: string;
  sessionToken: string;
  roomId: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface KickedPayload {
  reason: string;
}

export interface OverviewPlayer {
  id: string;
  nickname: string;
  connected: boolean;
  isAdmin: boolean;
}

export interface OverviewRoom {
  roomId: string;
  phase: Phase;
  createdAt: number;
  playerCount: number;
  connectedCount: number;
  players: OverviewPlayer[];
}

export interface OverviewUser {
  id: string;
  nickname: string;
  roomId: string;
  isAdmin: boolean;
}

export interface OverviewPayload {
  rooms: OverviewRoom[];
  connectedUsers: OverviewUser[];
}

export const NICKNAME_MAX = 24;
export const STATEMENT_MAX = 220;
export const STATEMENT_MIN = 3;
export const REVEAL_SECONDS = 10;
export const DISCONNECT_GRACE_MS = 90_000;
export const MAX_IMAGE_BYTES = 1_500_000;
export const MAX_PLAYERS_PER_ROOM = 20;
export const MAX_ROOMS = 200;
export const MAX_IMAGES_PER_ROOM = 80;
