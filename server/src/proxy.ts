import { normalizeIp, forwardedIp } from "./geo.ts";

/** Só confia em X-Forwarded-For se TRUST_PROXY=1|true (atrás de proxy real). */
export function trustProxyEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const value = String(env.TRUST_PROXY ?? "").trim().toLowerCase();
  return value === "1" || value === "true" || value === "yes";
}

export function httpClientIp(
  req: { ip?: string; socket?: { remoteAddress?: string } },
  trustProxy = trustProxyEnabled(),
): string {
  if (trustProxy) {
    return normalizeIp(req.ip ?? req.socket?.remoteAddress ?? "unknown");
  }
  return normalizeIp(req.socket?.remoteAddress ?? req.ip ?? "unknown");
}

export function socketClientIp(
  socket: {
    handshake: {
      address: string;
      headers: { [key: string]: string | string[] | undefined };
    };
  },
  trustProxy = trustProxyEnabled(),
): string {
  if (trustProxy) {
    return forwardedIp(socket.handshake.headers["x-forwarded-for"], socket.handshake.address || "unknown");
  }
  return normalizeIp(socket.handshake.address || "unknown");
}
