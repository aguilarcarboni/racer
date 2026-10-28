import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { RoomService } from "../src/server/RoomService.js";
import { MemoryRoomStore, D1RoomStore } from "../src/server/RoomStore.js";
import { localD1 } from "../src/server/LocalRoomServer.js";
import { createRealtimeServer } from "../src/server/RealtimeServer.js";
import { OnlineClient } from "../src/online/OnlineClient.js";
import { ONLINE } from "../src/online/Protocol.js";
function storage() {
  const values = new Map();
  return {
    getItem: (k) => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v),
    removeItem: (k) => values.delete(k),
  };
}
function harness(sql = false) {
  let now = 1000000,
    steps = 0;
  const closed = [],
    store = sql ? new D1RoomStore(localD1()) : new MemoryRoomStore();
  const simulation = {
    advance: () => steps++,
    create: () => ({ race: { phase: "racing" } }),
    snapshot: (s) => ({ race: s.race, cars: [] }),
  };
  const service = new RoomService(store, simulation, { now: () => now });
  service.onClose = (code, reason) => closed.push({ code, reason });
  const players = [0, 1].map((i) => ({
    device: crypto.randomUUID(),
    name: "Driver " + i,
  }));
  const api = (i, action, extra = {}) =>
    service.request(players[i].code, action, { ...players[i], ...extra });
  async function create() {
    const room = await service.create(players[0]);
    Object.assign(players[0], { code: room.code, token: room.token });
    const guest = await service.request(room.code, "join", players[1]);
    Object.assign(players[1], { code: room.code, token: guest.token });
    return room.code;
  }
  return {
    service,
    store,
    closed,
    players,
    api,
    create,
    advance: (ms) => (now += ms),
    get steps() {
      return steps;
    },
  };
}
for (const sql of [false, true]) {
  const label = sql ? "SQLite" : "memory";
  test(`${label}: only the owner closes a room; guest leave keeps it alive; deletion cannot resurrect`, async () => {
    const h = harness(sql),
      code = await h.create();
    const before = h.steps;
    await assert.rejects(
      h.service.request(code, "poll", {
        device: h.players[0].device,
        token: "wrong",
      }),
      /session/,
    );
    assert.equal(h.steps, before);
    await assert.rejects(h.api(1, "close"), (e) => e.status === 403);
    assert.ok(await h.store.get(code));
    await h.api(1, "leave");
    const host = await h.api(0, "poll");
    assert.equal(host.players.length, 1);
    const stale = await h.store.get(code);
    const result = await h.api(0, "close");
    assert.equal(result.closed, true);
    assert.equal(await h.store.get(code), null);
    assert.equal(await h.store.count(h.players[0].device), 0);
    assert.equal(
      await h.store.compareAndSwap(code, stale.revision, stale.room),
      false,
    );
    assert.equal(h.closed.length, 1);
    await assert.rejects(h.api(1, "join"), (e) => e.status === 404);
  });
  test(`${label}: host reconnect has a grace period; guests cannot keep an absent owner's room alive`, async () => {
    const h = harness(sql),
      code = await h.create();
    h.advance(29000);
    await h.api(0, "poll");
    h.advance(2000);
    await h.service.cleanup();
    assert.ok(await h.store.get(code));
    h.advance(28001);
    await h.api(1, "poll").catch(() => {});
    await h.service.cleanup();
    assert.equal(await h.store.get(code), null);
    assert.match(h.closed[0].reason, /owner disconnected/i);
  });
  test(`${label}: heartbeats keep connections present but do not reset lobby idle expiry`, async () => {
    const h = harness(sql),
      code = await h.create();
    for (let i = 1; i <= 29; i++) {
      h.advance(10000);
      await h.api(0, "input", { sequence: i, input: {} });
    }
    h.advance(9999);
    await h.api(0, "poll");
    const row = await h.store.get(code);
    assert.equal(row.room.expiresAt, row.room.createdAt + ONLINE.lobbyIdleMs);
    h.advance(2);
    await h.service.cleanup();
    assert.equal(await h.store.get(code), null);
    assert.match(h.closed[0].reason, /inactive/);
  });
  test(`${label}: real activity extends idle time but cannot bypass the absolute room lifetime`, async () => {
    const h = harness(sql),
      code = await h.create();
    for (let i = 1; i < 360; i++) {
      h.advance(20000);
      await h.api(0, "input", {
        sequence: i,
        input: { steerAxis: i % 2 ? 1 : -1 },
      });
    }
    h.advance(19999);
    await h.api(0, "input", { sequence: 360, input: { throttleAxis: 1 } });
    assert.ok(await h.store.get(code));
    h.advance(2);
    await h.service.cleanup();
    assert.equal(await h.store.get(code), null);
    assert.match(h.closed[0].reason, /two-hour/);
  });
}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(fn) {
  for (let i = 0; i < 200; i++) {
    if (fn()) return;
    await wait(10);
  }
  throw new Error("Timed out waiting for lobby cleanup");
}
test(
  "owner exit closes every room socket and stops the pump while a different lobby remains available",
  { timeout: 6000 },
  async () => {
    const { server, hub, store } = createRealtimeServer();
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const clients = Array.from(
      { length: 3 },
      () =>
        new OnlineClient({
          storage: storage(),
          sessionStorage: storage(),
          Socket: WebSocket,
          serverUrl: base,
        }),
    );
    const reasons = [];
    clients[1].onClosed = (reason) => reasons.push(reason);
    try {
      await clients[0].connect("create", "Owner");
      const code = clients[0].session.code;
      await clients[1].connect("join", "Guest", code);
      await clients[2].connect("create", "Other owner");
      await until(() => clients.every((c) => c.streaming));
      assert.ok(hub.timer);
      await clients[0].leave();
      await until(() => reasons.length === 1);
      assert.match(reasons[0], /owner closed/i);
      assert.equal(clients[1].session, null);
      assert.equal(await store.get(code), null);
      assert.equal(hub.peers.size, 1);
      assert.ok(hub.timer);
      assert.equal(clients[2].streaming, true);
      clients[2].disconnectOnExit();
      await until(() => hub.peers.size === 0);
      await wait(600);
      assert.deepEqual(hub.getStats(), {
        rooms: 0,
        connections: 0,
        roomPumpRunning: false,
      });
      assert.equal(hub.lobbySentAt.size, 0);
      assert.equal(hub.frameDueAt.size, 0);
      const health = await (await fetch(base + "/api/online/health")).json();
      assert.equal(health.rooms, 0);
      assert.equal(health.connections, 0);
      assert.equal(health.roomPumpRunning, false);
    } finally {
      clients.forEach((c) => c.clearSession());
      hub.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
test("cancelled lobby creation cleans up its late response instead of reopening an orphaned room", async () => {
  let resolveCreate;
  const paths = [];
  const client = new OnlineClient({
    storage: storage(),
    sessionStorage: storage(),
    Socket: null,
    serverUrl: "",
    fetcher: async (path) => {
      paths.push(path);
      if (paths.length === 1)
        return new Promise((resolve) => (resolveCreate = resolve));
      return Response.json({ closed: true });
    },
  });
  let opened = 0;
  client.onRoom = () => opened++;
  const pending = client.connect("create", "Owner");
  await client.leave();
  resolveCreate(Response.json({ code: "ABCDEF", token: "test-token" }));
  await pending;
  assert.equal(client.session, null);
  assert.equal(opened, 0);
  assert.ok(paths.includes("/api/online/rooms/ABCDEF/leave"));
});

for (const finished of [false, true])
  test(`inactive ${finished ? "results screen" : "race"} uses its own timeout even with heartbeats`, async () => {
    const h = harness(),
      code = await h.create();
    await h.api(0, "ready", { ready: true });
    await h.api(1, "ready", { ready: true });
    await h.api(0, "start");
    if (finished) {
      h.service.simulation.advance = (room) => {
        if (room.sim) room.sim.race.phase = "finished";
      };
      await h.api(0, "poll");
    }
    const limit = finished ? ONLINE.finishedIdleMs : ONLINE.raceIdleMs;
    for (let t = 10000; t < limit; t += 10000) {
      h.advance(10000);
      await h.api(0, "input", { sequence: t, input: {} });
    }
    h.advance(9999);
    await h.api(0, "poll");
    assert.ok(await h.store.get(code));
    h.advance(2);
    await h.service.cleanup();
    assert.equal(await h.store.get(code), null);
    assert.match(h.closed[0].reason, /inactive/);
  });
