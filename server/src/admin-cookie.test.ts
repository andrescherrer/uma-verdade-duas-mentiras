import assert from "node:assert/strict";
import test from "node:test";
import {
  ADMIN_COOKIE,
  clearAdminCookie,
  parseCookies,
  readAdminTokenFromRequest,
  serializeAdminCookie,
} from "./admin-cookie.ts";

test("parseCookies lê cookie admin", () => {
  assert.deepEqual(parseCookies(`${ADMIN_COOKIE}=abc%20123; other=1`), {
    [ADMIN_COOKIE]: "abc 123",
    other: "1",
  });
});

test("readAdminTokenFromRequest prioriza cookie HttpOnly", () => {
  assert.equal(
    readAdminTokenFromRequest({
      header(name) {
        if (name === "cookie") return `${ADMIN_COOKIE}=cookie-token`;
        if (name === "authorization") return "Bearer bearer-token";
        return undefined;
      },
    }),
    "cookie-token",
  );
  assert.equal(
    readAdminTokenFromRequest({
      header(name) {
        if (name === "authorization") return "Bearer bearer-token";
        return undefined;
      },
    }),
    "bearer-token",
  );
});

test("serializeAdminCookie marca HttpOnly e Secure em produção", () => {
  const cookie = serializeAdminCookie("tok", true);
  assert.match(cookie, new RegExp(`^${ADMIN_COOKIE}=tok;`));
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /Secure/);
  assert.match(cookie, /SameSite=Lax/);
  assert.match(clearAdminCookie(true), /Max-Age=0/);
});
