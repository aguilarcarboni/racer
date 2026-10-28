import { OnlineClient } from "../src/online/OnlineClient.js";
import test from "node:test";
import assert from "node:assert/strict";
import { InputSender } from "../src/online/InputSender.js";
import { SnapshotBuffer } from "../src/online/SnapshotBuffer.js";
function harness() {
  let now = 0,
    nextId = 0;
  const timers = new Map(),
    sent = [];
  const sender = new InputSender(
    (input) => sent.push({ at: now, input: { ...input } }),
    {
      now: () => now,
      setTimer: (fn, ms) => {
        timers.set(++nextId, { fn, at: now + ms });
        return nextId;
      },
      clearTimer: (id) => timers.delete(id),
    },
  );
  const advance = (target) => {
    while (true) {
      const next = [...timers].sort((a, b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > target) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
    }
    now = target;
  };
  return { sender, sent, advance };
}
test("changed controls send immediately instead of waiting for the periodic heartbeat", () => {
  const { sender, sent, advance } = harness();
  sender.update({});
  advance(75);
  sender.update({ steerAxis: 1 });
  assert.equal(sent.at(-1).at, 75);
  assert.equal(sent.at(-1).input.steerAxis, 1);
  advance(80);
  sender.update({ steerAxis: 0.5 });
  advance(85);
  sender.update({ steerAxis: -0.5 });
  assert.equal(sent.length, 2);
  advance(95);
  assert.equal(sent.at(-1).input.steerAxis, -0.5);
  assert.equal(sent.length, 3);
});
test("continuous analog input is coalesced below the server rate limit and retains the latest value", () => {
  const { sender, sent, advance } = harness();
  for (let t = 0; t < 1000; t++) {
    advance(t);
    sender.update({ steerAxis: Math.sin(t / 80) });
    if (t % 50 === 0) sender.heartbeat();
  }
  advance(1020);
  assert.ok(sent.length <= 52);
  assert.ok(Math.abs(sent.at(-1).input.steerAxis - Math.sin(999 / 80)) < 1e-9);
});
test("heartbeat preserves held inputs and stopping cancels delayed sends", () => {
  const { sender, sent, advance } = harness();
  sender.update({ throttleAxis: 1 });
  advance(51);
  sender.heartbeat();
  assert.equal(sent.length, 2);
  advance(55);
  sender.update({ brakeAxis: 1 });
  sender.stop();
  advance(200);
  sender.heartbeat();
  assert.equal(sent.length, 2);
});
test("remote presentation uses a short buffer and extrapolates across a missed frame", () => {
  const buffer = new SnapshotBuffer({ delay: 60 });
  const car = (x) => [
    {
      id: "car",
      physics: {
        pose: { x, y: 0, z: 0, quaternion: { x: 0, y: 0, z: 0, w: 1 } },
        velocity: [30, 0, 0],
      },
    },
  ];
  buffer.push(car(1), 100);
  buffer.push(car(2), 133);
  assert.ok(Math.abs(buffer.pose("car", 220).x - 2.81) < 1e-6);
  assert.ok(buffer.pose("car", 1000).x <= 5.61);
  buffer.push(car(1.8), 120);
  assert.ok(Number.isFinite(buffer.pose("car", 190).x));
  assert.ok(
    buffer.frames.every(
      (f, i) => i === 0 || buffer.frames[i - 1].time < f.time,
    ),
  );
});

test("lobby HTTP requests do not distort the displayed live WebSocket ping", async () => {
  const values = new Map(),
    storage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
      removeItem: (key) => values.delete(key),
    };
  const client = new OnlineClient({
    storage,
    sessionStorage: storage,
    Socket: null,
    serverUrl: "",
    fetcher: async () => Response.json({ ok: true }),
  });
  client.streaming = true;
  client.streamLatency = 90;
  client.latency = 90;
  await client.api("/ABCDEF/ready");
  assert.equal(client.latency, 90);
});
