import assert from "node:assert/strict";
import test from "node:test";
import { forwardedIp, isPrivateIp, lookupGeo, normalizeIp } from "./geo.ts";

test("normaliza IPv4 mapeado em IPv6 e loopback", () => {
  assert.equal(normalizeIp("::ffff:192.168.0.10"), "192.168.0.10");
  assert.equal(normalizeIp("::1"), "127.0.0.1");
  assert.equal(normalizeIp("  8.8.8.8  "), "8.8.8.8");
});

test("reconhece IPs privados e de link-local", () => {
  assert.equal(isPrivateIp("127.0.0.1"), true);
  assert.equal(isPrivateIp("10.1.2.3"), true);
  assert.equal(isPrivateIp("192.168.1.20"), true);
  assert.equal(isPrivateIp("172.16.0.1"), true);
  assert.equal(isPrivateIp("172.31.255.1"), true);
  assert.equal(isPrivateIp("172.32.0.1"), false);
  assert.equal(isPrivateIp("8.8.8.8"), false);
});

test("IP privado vira Rede local", () => {
  assert.equal(lookupGeo("127.0.0.1").location, "Rede local");
  assert.equal(lookupGeo("192.168.0.5").location, "Rede local");
});

test("usa o primeiro IP de X-Forwarded-For", () => {
  assert.equal(forwardedIp("203.0.113.10, 10.0.0.1", "127.0.0.1"), "203.0.113.10");
  assert.equal(forwardedIp(undefined, "::ffff:10.0.0.9"), "10.0.0.9");
});
