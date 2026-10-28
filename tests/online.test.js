import test from "node:test";
import assert from "node:assert/strict";
import { localD1 } from "../src/server/LocalRoomServer.js";
import { D1RoomStore } from "../src/server/RoomStore.js";
import { RoomService } from "../src/server/RoomService.js";
import { RaceSimulation } from "../src/server/RaceSimulation.js";
import { handleRoomRequest } from "../src/server/RoomApi.js";
import { SnapshotBuffer, mixPose } from "../src/online/SnapshotBuffer.js";
import { cleanInput } from "../src/online/Protocol.js";
let simulation;
function harness() {
  simulation ??= new RaceSimulation();
  let time = 1000000;
  const store = new D1RoomStore(localD1()),
    service = new RoomService(store, simulation, { now: () => time });
  const players = Array.from({ length: 5 }, (_, i) => ({
    device: `test-device-${i}-abcdefghijkl`,
    name: `Driver ${i + 1}`,
  }));
  const action = (p, kind, data = {}) =>
    service.request(p.code, kind, { ...p, ...data });
  async function create(count = 2) {
    const host = await service.create(players[0]);
    players[0] = { ...players[0], code: host.code, token: host.token };
    for (let i = 1; i < count; i++) {
      const joined = await service.request(host.code, "join", players[i]);
      players[i] = { ...players[i], code: host.code, token: joined.token };
    }
    return host;
  }
  return {
    store,
    service,
    players,
    action,
    create,
    advance(ms) {
      time += ms;
    },
    now: () => time,
  };
}
test("online room codes admit four distinct devices and never expose session secrets", async () => {
  const h = harness(),
    host = await h.create(4);
  assert.match(host.code, /^[A-HJ-NP-Z2-9]{6}$/);
  const view = await h.action(h.players[0], "poll");
  assert.equal(view.players.length, 4);
  assert.equal(new Set(view.players.map((p) => p.slot)).size, 4);
  assert.ok(
    view.players.every(
      (p) => !("secret" in p) && !("device" in p) && !("token" in p),
    ),
  );
  await assert.rejects(
    h.service.request(host.code, "join", h.players[4]),
    /full/,
  );
  await assert.rejects(
    h.service.request(
      host.code,
      "join",
      h.players[0] && { device: h.players[0].device, name: "Other tab" },
    ),
    /already has/,
  );
});
test("all-ready, host-only start and lobby capacity remain atomic under concurrent joins", async () => {
  const h = harness(),
    host = await h.create(1);
  const joined = await Promise.allSettled(
    h.players.slice(1).map((p) => h.service.request(host.code, "join", p)),
  );
  assert.equal(joined.filter((r) => r.status === "fulfilled").length, 3);
  const row = await h.store.get(host.code);
  assert.equal(row.room.players.length, 4);
  await assert.rejects(h.action(h.players[0], "start"), /ready/);
  const one = harness();
  await one.create(2);
  await assert.rejects(one.action(one.players[1], "start"), /host/);
  await Promise.all(
    one.players.slice(0, 2).map((p) => one.action(p, "ready", { ready: true })),
  );
  const started = await one.action(one.players[0], "start");
  assert.equal(started.snapshot.race.phase, "countdown");
  await assert.rejects(
    one.service.request(started.code, "join", one.players[4]),
    /started/,
  );
});
test("server advances one shared physical race and input can move only its assigned car", async () => {
  const h = harness();
  await h.create(4);
  for (const p of h.players.slice(0, 4))
    await h.action(p, "ready", { ready: true });
  let view = await h.action(h.players[0], "start");
  for (let i = 0; i < 16; i++) {
    h.advance(200);
    for (const p of h.players.slice(0, 4)) view = await h.action(p, "poll");
  }
  assert.equal(view.snapshot.race.phase, "racing");
  const start = view.snapshot.cars.map((c) => ({ ...c.state.position }));
  for (let i = 0; i < 25; i++) {
    h.advance(80);
    for (let j = 0; j < 4; j++)
      view = await h.action(h.players[j], "input", {
        sequence: i,
        input: { throttleAxis: j === 2 ? 1 : 0, steerAxis: 0, brakeAxis: 0 },
      });
  }
  const distances = view.snapshot.cars.map((c, i) =>
    Math.hypot(
      c.state.position.x - start[i].x,
      c.state.position.z - start[i].z,
    ),
  );
  assert.ok(distances[2] > 5, JSON.stringify(distances));
  assert.ok(
    [0, 1, 3].every((i) => distances[i] < 0.1),
    JSON.stringify(distances),
  );
  await h.action(h.players[2], "input", {
    sequence: 0,
    input: { throttleAxis: 0 },
  });
  const row = await h.store.get(view.code);
  assert.equal(
    row.room.players[2].input.throttleAxis,
    1,
    "late inputs cannot replace a newer input",
  );
  const other = await h.action(h.players[1], "poll");
  assert.equal(other.snapshot.race.elapsed, view.snapshot.race.elapsed);
});
test("tokens, expiry and stale controls are enforced server-side", async () => {
  const h = harness();
  const host = await h.create(2);
  await assert.rejects(
    h.service.request(host.code, "poll", {
      device: h.players[0].device,
      token: "wrong",
    }),
    /session/,
  );
  await h.action(h.players[0], "input", {
    sequence: 2,
    input: {
      throttleAxis: 99,
      steerAxis: NaN,
      brakeAxis: -2,
      position: { x: 1000 },
    },
  });
  const row = await h.store.get(host.code);
  assert.deepEqual(row.room.players[0].input, {
    throttleAxis: 1,
    steerAxis: 0,
    brakeAxis: 0,
    handbrake: false,
  });
  h.advance(1800001);
  await assert.rejects(h.action(h.players[0], "poll"), /expired/);
});
test("a member can reconnect with its token, but a stranger cannot steal that seat", async () => {
  const h = harness();
  await h.create(2);
  const before = await h.action(h.players[1], "poll");
  h.advance(2000);
  const rejoined = await h.action(h.players[1], "join");
  assert.equal(rejoined.self, before.self);
  assert.equal(rejoined.players.length, 2);
  await assert.rejects(
    h.service.request(before.code, "poll", {
      device: "attacker-device-abcdefghijkl",
      token: h.players[1].token,
    }),
    /session/,
  );
});
test("owner leaving closes the lobby and invalidates every member session", async () => {
  const h = harness();
  await h.create(2);
  const response = await h.action(h.players[0], "leave");
  assert.equal(response.closed, true);
  assert.equal(await h.store.get(response.code), null);
  await assert.rejects(h.action(h.players[1], "poll"), /expired/);
  await assert.rejects(
    h.action(h.players[0], "input", {
      sequence: 8,
      input: { throttleAxis: 1 },
    }),
    /expired/,
  );
});

test("API rejects foreign origins, oversize requests and malformed codes", async () => {
  const h = harness();
  const request = (path, body, origin = "https://racer.test") =>
    new Request(`https://racer.test/api/online/${path}`, {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await handleRoomRequest(
        request("rooms", h.players[0], "https://evil.test"),
        h.service,
      )
    ).status,
    403,
  );
  assert.equal(
    (
      await handleRoomRequest(
        request("rooms", { name: "x".repeat(5000) }),
        h.service,
      )
    ).status,
    413,
  );
  assert.equal(
    (await handleRoomRequest(request("rooms/BAD/poll", {}), h.service)).status,
    404,
  );
  const response = await handleRoomRequest(
    request("rooms", h.players[0]),
    h.service,
  );
  assert.equal(response.status, 200);
  assert.match((await response.json()).code, /^[A-Z2-9]{6}$/);
});
test("snapshot restoration preserves the next physics step", () => {
  const h = harness(),
    players = [
      {
        name: "One",
        slot: 0,
        input: cleanInput({ throttleAxis: 1 }),
        lastSeen: h.now(),
      },
    ];
  const state = simulation.create(players);
  simulation.restore(state);
  simulation.step(players, h.now());
  const a = simulation.save();
  simulation.restore(state);
  simulation.step(players, h.now());
  const b = simulation.save();
  for (let i = 0; i < 4; i++) {
    assert.ok(Math.abs(a.cars[i].pose.z - b.cars[i].pose.z) < 0.0001);
    assert.ok(Math.abs(a.cars[i].pose.y - b.cars[i].pose.y) < 0.0001);
  }
});
test("remote snapshots interpolate and extrapolate only for a bounded interval", () => {
  const pose = (x) => ({
    x,
    y: 0,
    z: 0,
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
  });
  assert.equal(mixPose(pose(0), pose(10), 0.5).x, 5);
  const b = new SnapshotBuffer();
  b.push([{ id: "you", physics: { pose: pose(0), velocity: [10, 0, 0] } }], 0);
  b.push(
    [{ id: "you", physics: { pose: pose(10), velocity: [10, 0, 0] } }],
    1000,
  );
  assert.equal(b.pose("you", 620).x, 5);
  assert.ok(b.pose("you", 5000).x <= 11.21);
  b.clear();
  assert.equal(b.pose("you", 0), null);
});

test("paused and disconnected parking input cannot engage reverse", () => {
  const h = harness(),
    players = [
      {
        name: "One",
        slot: 0,
        input: { ...cleanInput({}), parked: true },
        lastSeen: h.now(),
      },
    ];
  simulation.create(players);
  for (let i = 0; i < 600; i++) simulation.step(players, h.now());
  const state = simulation.save().cars[0];
  assert.equal(state.dynamics.engine.gear, 1);
  assert.ok(Math.hypot(...state.velocity) < 0.05);
});
