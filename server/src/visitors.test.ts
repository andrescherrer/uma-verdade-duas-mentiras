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

test("lista visitantes 20 por página", (t) => {
  let now = 1_000_000;
  const store = VisitorStore.memory({
    now: () => now,
    lookup: () => ({ location: "Rede local", country: null, region: null, city: null }),
  });
  t.after(() => store.close());

  for (let i = 1; i <= 21; i += 1) {
    store.record({ ip: `10.0.0.${i}`, nickname: `Jogador ${i}` });
    now += 1;
  }

  const first = store.listPage(1, 20);
  assert.equal(first.page, 1);
  assert.equal(first.pageSize, 20);
  assert.equal(first.total, 21);
  assert.equal(first.totalPages, 2);
  assert.equal(first.visitors.length, 20);
  assert.equal(first.visitors[0].nickname, "Jogador 21");

  const second = store.listPage(2, 20);
  assert.equal(second.page, 2);
  assert.equal(second.visitors.length, 1);
  assert.equal(second.visitors[0].nickname, "Jogador 1");

  const clamped = store.listPage(99, 20);
  assert.equal(clamped.page, 2);
  assert.equal(clamped.visitors.length, 1);
});
