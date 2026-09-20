import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { VISITORS_PAGE_SIZE, type VisitorRecord, type VisitorsPagePayload } from "../../shared/protocol.ts";
import { lookupGeo, type GeoInfo } from "./geo.ts";

export const RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

export interface RecordVisitorInput {
  ip: string;
  nickname: string;
  roomId?: string | null;
}

export class VisitorStore {
  private readonly lookup: (ip: string) => GeoInfo;
  private readonly now: () => number;
  private readonly retentionMs: number;

  constructor(
    private readonly db: DatabaseSync,
    options: {
      lookup?: (ip: string) => GeoInfo;
      now?: () => number;
      retentionMs?: number;
    } = {},
  ) {
    this.lookup = options.lookup ?? lookupGeo;
    this.now = options.now ?? Date.now;
    this.retentionMs = options.retentionMs ?? RETENTION_MS;
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS visitors (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ip TEXT NOT NULL,
        nickname TEXT NOT NULL,
        location TEXT NOT NULL,
        country TEXT,
        region TEXT,
        city TEXT,
        room_id TEXT,
        first_seen_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        UNIQUE (ip, nickname)
      );
      CREATE INDEX IF NOT EXISTS visitors_last_seen ON visitors (last_seen_at);
    `);
  }

  static open(path: string, options?: ConstructorParameters<typeof VisitorStore>[1]): VisitorStore {
    if (path !== ":memory:") {
      mkdirSync(dirname(path), { recursive: true });
    }
    const db = new DatabaseSync(path);
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA busy_timeout = 5000;");
    return new VisitorStore(db, options);
  }

  static memory(options?: ConstructorParameters<typeof VisitorStore>[1]): VisitorStore {
    return VisitorStore.open(":memory:", options);
  }

  static openDefault(options?: ConstructorParameters<typeof VisitorStore>[1]): VisitorStore {
    if (process.env.NODE_TEST_CONTEXT) return VisitorStore.memory(options);
    const path =
      process.env.SQLITE_PATH ??
      join(dirname(fileURLToPath(import.meta.url)), "../data/visitors.sqlite");
    return VisitorStore.open(path, options);
  }

  record(input: RecordVisitorInput): VisitorRecord {
    const nickname = input.nickname.trim();
    const ip = input.ip.trim() || "unknown";
    if (!nickname) {
      throw new Error("Informe um nome.");
    }
    const geo = this.lookup(ip);
    const now = this.now();
    this.db
      .prepare(
        `INSERT INTO visitors (ip, nickname, location, country, region, city, room_id, first_seen_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(ip, nickname) DO UPDATE SET
           location = excluded.location,
           country = excluded.country,
           region = excluded.region,
           city = excluded.city,
           room_id = excluded.room_id,
           last_seen_at = excluded.last_seen_at`,
      )
      .run(
        ip,
        nickname,
        geo.location,
        geo.country,
        geo.region,
        geo.city,
        input.roomId ?? null,
        now,
        now,
      );
    this.purgeExpired();
    const row = this.db
      .prepare(
        `SELECT ip, nickname, location, country, region, city, room_id, first_seen_at, last_seen_at
         FROM visitors WHERE ip = ? AND nickname = ?`,
      )
      .get(ip, nickname);
    if (!row) throw new Error("Falha ao gravar visitante.");
    return toRecord(row);
  }

  list(): VisitorRecord[] {
    const cutoff = this.now() - this.retentionMs;
    const rows = this.db
      .prepare(
        `SELECT ip, nickname, location, country, region, city, room_id, first_seen_at, last_seen_at
         FROM visitors
         WHERE last_seen_at >= ?
         ORDER BY last_seen_at DESC, id DESC`,
      )
      .all(cutoff);
    return rows.map(toRecord);
  }

  listPage(page = 1, pageSize = VISITORS_PAGE_SIZE): VisitorsPagePayload {
    const safeSize = Math.min(100, Math.max(1, Math.trunc(pageSize) || VISITORS_PAGE_SIZE));
    const cutoff = this.now() - this.retentionMs;
    const total = asNumber(
      this.db.prepare("SELECT COUNT(*) AS total FROM visitors WHERE last_seen_at >= ?").get(cutoff)?.total,
    );
    const totalPages = Math.ceil(total / safeSize);
    const requested = Math.trunc(page);
    const safePage =
      total === 0 || !Number.isFinite(requested) || requested < 1
        ? 1
        : Math.min(totalPages, requested);
    const offset = (safePage - 1) * safeSize;
    const rows = this.db
      .prepare(
        `SELECT ip, nickname, location, country, region, city, room_id, first_seen_at, last_seen_at
         FROM visitors
         WHERE last_seen_at >= ?
         ORDER BY last_seen_at DESC, id DESC
         LIMIT ? OFFSET ?`,
      )
      .all(cutoff, safeSize, offset);
    return {
      visitors: rows.map(toRecord),
      page: safePage,
      pageSize: safeSize,
      total,
      totalPages,
    };
  }

  purgeExpired(): number {
    const cutoff = this.now() - this.retentionMs;
    return Number(this.db.prepare("DELETE FROM visitors WHERE last_seen_at < ?").run(cutoff).changes);
  }

  close(): void {
    this.db.close();
  }
}

function asNumber(value: unknown): number {
  if (typeof value === "bigint") return Number(value);
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toRecord(row: Record<string, unknown>): VisitorRecord {
  return {
    ip: String(row.ip),
    nickname: String(row.nickname),
    location: String(row.location),
    roomId: row.room_id == null ? null : String(row.room_id),
    firstSeenAt: Number(row.first_seen_at),
    lastSeenAt: Number(row.last_seen_at),
  };
}
