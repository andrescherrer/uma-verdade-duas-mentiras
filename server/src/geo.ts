import { createRequire } from "node:module";

export interface GeoInfo {
  location: string;
  country: string | null;
  region: string | null;
  city: string | null;
}

type PublicGeo = {
  country?: string;
  region?: string;
  city?: string;
};

type GeoipLite = {
  lookup: (ip: string) => PublicGeo | null;
};

const LOCAL: GeoInfo = {
  location: "Rede local",
  country: null,
  region: null,
  city: null,
};

const UNKNOWN: GeoInfo = {
  location: "Localização desconhecida",
  country: null,
  region: null,
  city: null,
};

let geoip: GeoipLite | null | undefined;

function loadGeoip(): GeoipLite | null {
  if (geoip !== undefined) return geoip;
  try {
    const require = createRequire(import.meta.url);
    geoip = require("geoip-lite") as GeoipLite;
  } catch {
    geoip = null;
  }
  return geoip;
}

export function normalizeIp(raw: string): string {
  let ip = raw.trim();
  if (!ip) return "unknown";
  if (ip.startsWith("::ffff:")) ip = ip.slice(7);
  if (ip === "::1") return "127.0.0.1";
  return ip;
}

export function isPrivateIp(ip: string): boolean {
  const value = normalizeIp(ip).toLowerCase();
  if (value === "unknown" || value === "127.0.0.1" || value === "0.0.0.0" || value === "localhost") {
    return true;
  }
  if (value.startsWith("10.") || value.startsWith("192.168.") || value.startsWith("169.254.")) {
    return true;
  }
  const match = value.match(/^172\.(\d+)\./);
  if (match) {
    const octet = Number(match[1]);
    if (octet >= 16 && octet <= 31) return true;
  }
  if (value.startsWith("fc") || value.startsWith("fd") || value.startsWith("fe80:")) return true;
  return false;
}

export function lookupGeo(ip: string): GeoInfo {
  const normalized = normalizeIp(ip);
  if (isPrivateIp(normalized)) return LOCAL;
  try {
    const geo = loadGeoip()?.lookup(normalized);
    if (!geo) return UNKNOWN;
    const parts = [geo.city, geo.region, geo.country].map((part) => part?.trim()).filter(Boolean);
    return {
      location: parts.join(", ") || UNKNOWN.location,
      country: geo.country?.trim() || null,
      region: geo.region?.trim() || null,
      city: geo.city?.trim() || null,
    };
  } catch {
    return UNKNOWN;
  }
}

export function forwardedIp(value: string | string[] | undefined, fallback: string): string {
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw?.split(",")[0]?.trim();
  return normalizeIp(first || fallback);
}
