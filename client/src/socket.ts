import { io, type Socket } from "socket.io-client";
import { C2S, S2C, type JoinedPayload } from "../../shared/protocol.ts";

let socket: Socket | null = null;

export function sessionKey(roomId: string): string {
  return `vm.session.${roomId.toUpperCase()}`;
}

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ transports: ["websocket"] });
    socket.on(S2C.JOINED, (payload: JoinedPayload) => {
      localStorage.setItem(sessionKey(payload.roomId), payload.sessionToken);
    });
  }
  return socket;
}

export function joinRoom(roomId: string, nickname: string): void {
  const token = localStorage.getItem(sessionKey(roomId));
  getSocket().emit(C2S.JOIN, {
    roomId,
    nickname,
    sessionToken: token ?? undefined,
  });
}
