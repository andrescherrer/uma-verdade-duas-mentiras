import assert from "node:assert/strict";
import test from "node:test";
import { RETENTION_MS, VisitorStore } from "./visitors.ts";

test("grava IP, nome e local e atualiza a última visita do mesmo usuário", (t) => {
  let now = 1_000_000;
  const store = VisitorStore.memory({
    now: () => now,
    lookup: () => ({
      location: "São Paulo, SP, BR",
      country: "BR",
      region: "SP",
      city: "São Paulo",
    }),
  });
  t.after(() => store.close());

  const first = store.record({ ip: "203.0.113.10", nickname: "Sara", roomId: "ABC123" });
  assert.equal(first.ip, "203.0.113.10");
  assert.equal(first.nickname, "Sara");
  assert.equal(first.location, "São Paulo, SP, BR");
  assert.equal(first.roomId, "ABC123");
  assert.equal(first.firstSeenAt, now);
  assert.equal(first.lastSeenAt, now);

  now += 60_000;
  const again = store.record({ ip: "203.0.113.10", nickname: "Sara", roomId: "XYZ999" });
  assert.equal(again.firstSeenAt, 1_000_000);
  assert.equal(again.lastSeenAt, now);
  assert.equal(again.roomId, "XYZ999");
  assert.equal(store.list().length, 1);

  store.record({ ip: "203.0.113.10", nickname: "João", roomId: "XYZ999" });
  assert.equal(store.list().length, 2);
});

test("apaga registros com mais de 1 mês", (t) => {
  let now = 10_000_000;
  const store = VisitorStore.memory({
    now: () => now,
    lookup: () => ({ location: "Rede local", country: null, region: null, city: null }),
  });
  t.after(() => store.close());

  store.record({ ip: "10.0.0.2", nickname: "Antigo" });
  now += RETENTION_MS + 1;
  store.record({ ip: "10.0.0.3", nickname: "Novo" });

  const listed = store.list();
  assert.equal(listed.length, 1);
  assert.equal(listed[0].nickname, "Novo");
});
