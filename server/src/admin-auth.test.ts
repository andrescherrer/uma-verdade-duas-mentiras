import assert from "node:assert/strict";
import test from "node:test";
import {
  adminDateStamp,
  productionAdminPassword,
  resolveAdminPassword,
  resolveAdminUsername,
} from "./admin-auth.ts";

test("senha de produção usa !@# + data America/Sao_Paulo", () => {
  const noonSp = new Date("2026-09-20T15:00:00.000Z"); // 12:00 em São Paulo
  assert.equal(adminDateStamp(noonSp), "20260920");
  assert.equal(productionAdminPassword(noonSp), "!@#20260920");
});

test("resolveAdminPassword: env manda; produção usa data; dev usa default", () => {
  assert.equal(resolveAdminPassword({ ADMIN_PASSWORD: "  secreto  " }), "secreto");
  assert.equal(
    resolveAdminPassword({ NODE_ENV: "production" }, new Date("2026-09-20T15:00:00.000Z")),
    "!@#20260920",
  );
  assert.equal(resolveAdminPassword({ NODE_ENV: "development" }), "!@#987654321");
  assert.equal(resolveAdminPassword({}), "!@#987654321");
});

test("resolveAdminUsername usa env ou default", () => {
  assert.equal(resolveAdminUsername({ ADMIN_USERNAME: "chefe" }), "chefe");
  assert.equal(resolveAdminUsername({}), "admin-master-blaster");
});
