import { MAX_ROOMS, type OverviewPayload } from "../../shared/protocol.ts";
import { GameError, GameRoom, type RoomEvent } from "./room.ts";
import { ImageStore } from "./images.ts";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function createRoomId(): string {
  let id = "";
  for (let i = 0; i < 6; i += 1) {
    id += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return id;
}

export class RoomManager {
  rooms = new Map<string, GameRoom>();
  images = new ImageStore();
  private listeners = new Map<string, Set<() => void>>();
  private kickListeners = new Set<(roomId: string, playerId: string, reason: string) => void>();
  private changeListeners = new Set<(roomId: string) => void>();

  onChange(fn: (roomId: string) => void): void {
    this.changeListeners.add(fn);
  }

  onRoomChange(roomId: string, fn: () => void): () => void {
    const set = this.listeners.get(roomId) ?? new Set();
    set.add(fn);
    this.listeners.set(roomId, set);
    return () => set.delete(fn);
  }

  onKick(fn: (roomId: string, playerId: string, reason: string) => void): void {
    this.kickListeners.add(fn);
  }

  get(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId.toUpperCase());
  }

  getOrCreate(roomId: string): GameRoom {
    const id = roomId.toUpperCase();
    const existing = this.rooms.get(id);
    if (existing) return existing;
    const room = new GameRoom(id, {
      onChange: () => this.notify(id),
      onEvent: (event) => this.handleEvent(id, event),
      deleteImages: (ids) => this.images.deleteMany(ids),
    });
    this.rooms.set(id, room);
    return room;
  }

  create(): GameRoom {
    if (this.rooms.size >= MAX_ROOMS) {
      throw new GameError("too-many-rooms", "Muitas salas abertas. Tente novamente em instantes.");
    }
    let id = createRoomId();
    while (this.rooms.has(id)) id = createRoomId();
    return this.getOrCreate(id);
  }

  listOverview(): Omit<OverviewPayload, "visitors"> {
    const rooms = [...this.rooms.values()]
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((room) => {
        const players = [...room.players.values()].map((player) => ({
          id: player.id,
          nickname: player.nickname,
          connected: player.connected,
          isAdmin: player.id === room.adminId,
        }));
        return {
          roomId: room.id,
          phase: room.phase,
          createdAt: room.createdAt,
          playerCount: players.length,
          connectedCount: players.filter((player) => player.connected).length,
          players,
        };
      });
    const connectedUsers = rooms.flatMap((room) =>
      room.players
        .filter((player) => player.connected)
        .map((player) => ({
          id: player.id,
          nickname: player.nickname,
          roomId: room.roomId,
          isAdmin: player.isAdmin,
        })),
    );
    return { rooms, connectedUsers } satisfies Omit<OverviewPayload, "visitors">;
  }

  private handleEvent(roomId: string, event: RoomEvent): void {
    if (event.type === "kick") {
      for (const fn of this.kickListeners) fn(roomId, event.playerId, event.reason);
    }
    if (event.type === "destroyed") {
      this.images.deleteRoom(roomId);
      this.rooms.delete(roomId);
      this.listeners.delete(roomId);
    }
  }

  private notify(roomId: string): void {
    for (const fn of this.changeListeners) fn(roomId);
    const set = this.listeners.get(roomId);
    if (!set) return;
    for (const fn of set) fn();
  }
}
