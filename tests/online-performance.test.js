import test from "node:test";
import assert from "node:assert/strict";
import { World, Body, Box, Vec3, AABB, Material } from "cannon-es";
import { TrackBroadphase } from "../src/physics/TrackBroadphase.js";
import { RaceSimulation } from "../src/server/RaceSimulation.js";
import { PhysicsCar } from "../src/physics/PhysicsCar.js";
import { packRoom, unpackRoom } from "../src/online/SnapshotCodec.js";
import { PredictionHistory } from "../src/online/PredictionHistory.js";
test("indexed wheel queries match exact body bounds, including cell seams, moving bodies and removal", () => {
  const world = new World();
  const broad = (world.broadphase = new TrackBroadphase(world));
  for (let i = 0; i < 120; i++) {
    const body = new Body({
      mass: i === 119 ? 1 : 0,
      shape: new Box(new Vec3(1 + (i % 7), 0.5, 3)),
    });
    body.position.set((i % 12) * 17 - 90, 0, Math.floor(i / 12) * 19 - 90);
    world.addBody(body);
  }
  const terrain = new Body({ shape: new Box(new Vec3(350, 0.5, 350)) });
  world.addBody(terrain);
  let seed = 2026;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = 0; i < 600; i++) {
    const moving = world.bodies[119];
    moving.position.set(random() * 200 - 100, 0, random() * 200 - 100);
    moving.aabbNeedsUpdate = true;
    const x =
        i % 5 === 0
          ? 20 * Math.floor(random() * 10) - 100
          : random() * 260 - 130,
      z = random() * 260 - 130;
    const query = new AABB({
      lowerBound: new Vec3(x, -1, z),
      upperBound: new Vec3(x + 0.8, 1, z + 0.8),
    });
    const expected = world.bodies
      .filter((b) => {
        if (b.aabbNeedsUpdate) b.updateAABB();
        return b.aabb.overlaps(query);
      })
      .map((b) => b.id)
      .sort((a, b) => a - b);
    assert.deepEqual(
      broad
        .aabbQuery(world, query)
        .map((b) => b.id)
        .sort((a, b) => a - b),
      expected,
    );
  }
  world.removeBody(terrain);
  assert.ok(
    !broad
      .aabbQuery(
        world,
        new AABB({
          lowerBound: new Vec3(-1, -1, -1),
          upperBound: new Vec3(1, 1, 1),
        }),
      )
      .includes(terrain),
  );
});
test("compact race frames cut bytes while preserving car pose, drivetrain and wheel contacts", () => {
  const simulation = new RaceSimulation();
  const sim = simulation.create(
    [0, 1, 2, 3].map((slot) => ({
      id: "p" + slot,
      name: "Player " + slot,
      slot,
    })),
  );
  const room = {
    code: "ABCDEF",
    self: "p0",
    snapshot: simulation.snapshot(sim),
  };
  const packed = packRoom(room),
    decoded = unpackRoom(packed);
  assert.ok(JSON.stringify(packed).length < JSON.stringify(room).length * 0.3);
  decoded.snapshot.cars.forEach((car, i) => {
    const source = room.snapshot.cars[i];
    for (const key of ["x", "y", "z"])
      assert.ok(
        Math.abs(car.physics.pose[key] - source.physics.pose[key]) <= 0.00051,
      );
    assert.equal(
      car.physics.dynamics.engine.gear,
      source.physics.dynamics.engine.gear,
    );
    assert.deepEqual(
      car.physics.wheels.map((w) => w.contact),
      source.physics.wheels.map((w) => w.contact),
    );
    assert.deepEqual(car.lap, source.lap);
    const target = simulation.entries[i].car;
    target.restoreState(car.physics);
    assert.ok(Number.isFinite(target.getDebugState().engine.rpm));
  });
});
test("prediction replays the original changing controls and bounds catch-up work after a stall", () => {
  const history = new PredictionHistory(),
    input = { steerAxis: -1 };
  for (let i = 0; i < 80; i++) {
    input.steerAxis = i < 70 ? -1 : 1;
    history.record(i * 8, 1 / 120, input);
  }
  input.steerAxis = 0;
  const replayed = [];
  const count = history.replay(400, 632, (input) =>
    replayed.push(input.steerAxis),
  );
  assert.ok(count <= 18);
  assert.ok(replayed.includes(-1));
  assert.ok(replayed.includes(1));
  assert.ok(!replayed.includes(0));
  assert.equal(
    history.replay(700, 632, () => assert.fail("future frames")),
    0,
  );
});
test("remote prediction hulls avoid redundant suspension and return to full offline physics", () => {
  const world = new World({ gravity: new Vec3(0, -9.81, 0) }),
    car = new PhysicsCar(world, new Material());
  car.create({ x: 0, y: 10, z: 0, yaw: 0 });
  car.setPredictionProxy(true);
  for (let i = 0; i < 20; i++) world.step(1 / 120);
  assert.equal(car.getPosition().y, 10);
  car.setPredictionProxy(false);
  for (let i = 0; i < 20; i++) world.step(1 / 120);
  assert.ok(car.getPosition().y < 9.9);
  assert.equal(car.body.type, Body.DYNAMIC);
});
