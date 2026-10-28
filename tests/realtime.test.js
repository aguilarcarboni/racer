import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { WebSocket } from "ws";
import { createRealtimeServer } from "../src/server/RealtimeServer.js";

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function until(predicate, timeout = 5000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout)
      throw new Error("Timed out waiting for race state");
    await pause(20);
  }
}
test(
  "four WebSocket racers share real-time physics; reconnect, auth, capacity and input isolation hold",
  { timeout: 15000 },
  async () => {
    const { server, hub } = createRealtimeServer({
      allowedOrigins: ["https://game.example"],
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}`;
    const sockets = [],
      intervals = [];
    async function api(path, body, origin = "https://game.example") {
      const response = await fetch(base + "/api/online/rooms" + path, {
        method: "POST",
        headers: { "content-type": "application/json", origin },
        body: JSON.stringify(body),
      });
      return { status: response.status, data: await response.json() };
    }
    async function stream(player) {
      const socket = new WebSocket(
        base.replace("http:", "ws:") + "/api/online/socket",
        { origin: "https://game.example" },
      );
      sockets.push(socket);
      await once(socket, "open");
      const view = { socket, room: null, frames: 0 };
      socket.on("message", (raw) => {
        const msg = JSON.parse(raw);
        if (msg.type === "state") {
          view.room = msg.room;
          view.frames++;
        }
      });
      socket.send(
        JSON.stringify({
          type: "auth",
          code,
          token: player.token,
          device: player.device,
        }),
      );
      await until(() => view.room);
      return view;
    }
    let code;
    try {
      const players = Array.from({ length: 4 }, (_, i) => ({
        device: crypto.randomUUID(),
        name: `Driver ${i + 1}`,
      }));
      const created = await api("", players[0]);
      assert.equal(created.status, 200);
      code = created.data.code;
      players[0].token = created.data.token;
      for (let i = 1; i < 4; i++) {
        const joined = await api(`/${code}/join`, players[i]);
        assert.equal(joined.status, 200);
        players[i].token = joined.data.token;
      }
      assert.equal(
        (
          await api(`/${code}/join`, {
            device: crypto.randomUUID(),
            name: "Fifth",
          })
        ).status,
        409,
      );
      assert.equal((await api(`/${code}/start`, players[1])).status, 403);
      assert.equal(
        (await api(`/${code}/poll`, players[0], "https://wrong.example"))
          .status,
        403,
      );
      const cors = await fetch(base + "/api/online/rooms", {
        method: "OPTIONS",
        headers: { origin: "https://game.example" },
      });
      assert.equal(cors.status, 204);
      assert.equal(
        cors.headers.get("access-control-allow-origin"),
        "https://game.example",
      );
      const bad = new WebSocket(
        base.replace("http:", "ws:") + "/api/online/socket",
        { origin: "https://game.example" },
      );
      sockets.push(bad);
      await once(bad, "open");
      bad.send(
        JSON.stringify({
          type: "auth",
          code,
          device: players[0].device,
          token: "wrong",
        }),
      );
      assert.equal((await once(bad, "close"))[0], 1008);
      const views = [];
      for (const player of players) views.push(await stream(player));
      const sequences = players.map(() => 0);
      const send = (i) =>
        views[i].socket.send(
          JSON.stringify({
            type: "input",
            sequence: ++sequences[i],
            input:
              i === 2 ? { throttleAxis: 1 } : { brakeAxis: 1, parked: true },
          }),
        );
      for (let i = 0; i < 4; i++) {
        intervals.push(setInterval(() => send(i), 50));
        await api(`/${code}/ready`, { ...players[i], ready: true });
      }
      const start = await api(`/${code}/start`, players[0]);
      assert.equal(start.status, 200);
      await until(() =>
        views.every((v) => v.room?.snapshot?.race.phase === "racing"),
      );
      const startWall = Date.now(),
        startElapsed = views[0].room.snapshot.race.elapsed;
      await pause(2300);
      const elapsed = views[0].room.snapshot.race.elapsed - startElapsed;
      assert.ok(
        Math.abs(elapsed - (Date.now() - startWall) / 1000) < 0.3,
        `Shared clock drift ${elapsed}`,
      );
      assert.ok(views.every((v) => v.frames > 60));
      const cars = views[0].room.snapshot.cars;
      assert.ok(
        cars[2].state.speedMps * 3.6 > 30,
        `Driver 3 speed: ${cars[2].state.speedMps * 3.6}`,
      );
      assert.ok(Math.abs(cars[0].state.speedMps) < 1);
      const elapsedValues = views.map((v) => v.room.snapshot.race.elapsed);
      assert.ok(Math.max(...elapsedValues) - Math.min(...elapsedValues) < 0.2);
      assert.ok(!JSON.stringify(views[1].room).includes(players[0].token));
      clearInterval(intervals[2]);
      views[2].socket.close();
      await once(views[2].socket, "close");
      await pause(80);
      const rejoined = await api(`/${code}/join`, players[2]);
      assert.equal(rejoined.status, 200);
      assert.equal(rejoined.data.players.length, 4);
      const resumed = await stream(players[2]);
      assert.equal(resumed.room.self, views[2].room.self);
      const old = players[2].token;
      resumed.socket.send(
        JSON.stringify({
          type: "input",
          sequence: 0,
          input: { throttleAxis: 1 },
        }),
      );
      await pause(80);
      const checked = await api(`/${code}/poll`, players[2]);
      assert.equal(
        checked.data.players.find((p) => p.id === checked.data.self).sequence,
        sequences[2],
      );
      assert.equal(old, players[2].token);
    } finally {
      intervals.forEach(clearInterval);
      sockets.forEach((s) => s.terminate());
      hub.close();
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
