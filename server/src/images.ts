import { randomUUID } from "node:crypto";
import { MAX_IMAGE_BYTES, MAX_IMAGES_PER_ROOM } from "../../shared/protocol.ts";

export interface StoredImage {
  id: string;
  roomId: string;
  playerId: string;
  mime: string;
  buffer: Buffer;
}

const ALLOWED = new Map<string, string>([
  ["image/jpeg", "jpeg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
  ["image/gif", "gif"],
]);

export class ImageStore {
  private images = new Map<string, StoredImage>();

  save(roomId: string, playerId: string, mime: string, buffer: Buffer): StoredImage {
    if (buffer.length > MAX_IMAGE_BYTES) {
      throw new Error("A imagem precisa ter no máximo 1,5 MB.");
    }
    if (!ALLOWED.has(mime)) {
      throw new Error("Use JPEG, PNG, WEBP ou GIF.");
    }
    if (this.countInRoom(roomId) >= MAX_IMAGES_PER_ROOM) {
      throw new Error("Limite de imagens desta sala atingido.");
    }
    const image: StoredImage = {
      id: randomUUID(),
      roomId,
      playerId,
      mime,
      buffer,
    };
    this.images.set(image.id, image);
    return image;
  }

  get(id: string): StoredImage | undefined {
    return this.images.get(id);
  }

  belongsTo(id: string, roomId: string, playerId: string): boolean {
    const image = this.images.get(id);
    return Boolean(image && image.roomId === roomId && image.playerId === playerId);
  }

  countInRoom(roomId: string): number {
    let count = 0;
    for (const image of this.images.values()) {
      if (image.roomId === roomId) count += 1;
    }
    return count;
  }

  deleteMany(ids: string[]): void {
    for (const id of ids) this.images.delete(id);
  }

  deleteRoom(roomId: string): void {
    for (const [id, image] of this.images) {
      if (image.roomId === roomId) this.images.delete(id);
    }
  }
}
