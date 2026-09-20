import assert from "node:assert/strict";
import test from "node:test";
import { httpClientIp, socketClientIp, trustProxyEnabled } from "./proxy.ts";

test("TRUST_PROXY só liga com 1/true/yes", () => {
  assert.equal(trustProxyEnabled({}), false);
  assert.equal(trustProxyEnabled({ TRUST_PROXY: "1" }), true);
  assert.equal(trustProxyEnabled({ TRUST_PROXY: "true" }), true);
  assert.equal(trustProxyEnabled({ TRUST_PROXY: "yes" }), true);
  assert.equal(trustProxyEnabled({ TRUST_PROXY: "0" }), false);
});

test("sem TRUST_PROXY ignora X-Forwarded-For no socket", () => {
  const socket = {
    handshake: {
      address: "10.0.0.5",
      headers: { "x-forwarded-for": "203.0.113.9" },
    },
  };
  assert.equal(socketClientIp(socket, false), "10.0.0.5");
  assert.equal(socketClientIp(socket, true), "203.0.113.9");
});

test("httpClientIp usa socket remoto sem proxy", () => {
  assert.equal(
    httpClientIp({ ip: "203.0.113.1", socket: { remoteAddress: "10.0.0.8" } }, false),
    "10.0.0.8",
  );
});
