const DEV_DEFAULT_PASSWORD = "!@#987654321";
const DATE_TZ = "America/Sao_Paulo";

export function adminDateStamp(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DATE_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const year = parts.find((part) => part.type === "year")?.value ?? "0000";
  const month = parts.find((part) => part.type === "month")?.value ?? "00";
  const day = parts.find((part) => part.type === "day")?.value ?? "00";
  return `${year}${month}${day}`;
}

/** Senha diária em produção: !@#YYYYMMDD (fuso America/Sao_Paulo). Ex.: !@#20260920 */
export function productionAdminPassword(now = new Date()): string {
  return `!@#${adminDateStamp(now)}`;
}

export function resolveAdminPassword(
  env: NodeJS.ProcessEnv = process.env,
  now = new Date(),
): string {
  const fromEnv = env.ADMIN_PASSWORD?.trim();
  if (fromEnv) return fromEnv;
  if (env.NODE_ENV === "production") return productionAdminPassword(now);
  return DEV_DEFAULT_PASSWORD;
}

export function resolveAdminUsername(env: NodeJS.ProcessEnv = process.env): string {
  return env.ADMIN_USERNAME?.trim() || "admin-master-blaster";
}
