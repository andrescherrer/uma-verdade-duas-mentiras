export const ADMIN_COOKIE = "vm_admin";
export const ADMIN_TTL_MS = 8 * 60 * 60 * 1000;

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx <= 0) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function readAdminTokenFromRequest(req: {
  header(name: string): string | undefined;
}): string {
  const cookies = parseCookies(req.header("cookie"));
  const fromCookie = cookies[ADMIN_COOKIE]?.trim();
  if (fromCookie) return fromCookie;
  const auth = String(req.header("authorization") ?? "");
  if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
  return String(req.header("x-admin-token") ?? "").trim();
}

export function adminCookieOptions(secure: boolean): {
  httpOnly: true;
  sameSite: "lax";
  path: string;
  maxAge: number;
  secure: boolean;
} {
  return {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(ADMIN_TTL_MS / 1000),
    secure,
  };
}

export function serializeAdminCookie(token: string, secure: boolean): string {
  const opts = adminCookieOptions(secure);
  const parts = [
    `${ADMIN_COOKIE}=${encodeURIComponent(token)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (opts.secure) parts.push("Secure");
  return parts.join("; ");
}

export function clearAdminCookie(secure: boolean): string {
  const parts = [`${ADMIN_COOKIE}=`, "Path=/", "Max-Age=0", "HttpOnly", "SameSite=Lax"];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}
