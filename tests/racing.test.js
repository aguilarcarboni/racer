import test from "node:test";
import assert from "node:assert/strict";
import * as C from "cannon-es";
import { TrackLayout } from "../src/models/TrackLayout.js";
import { RacingLineProfile } from "../src/racing/RacingLineProfile.js";
import { AiDriver } from "../src/racing/AiDriver.js";
import { RaceSession } from "../src/racing/RaceSession.js";
import { DEFAULT_TUNE } from "../src/physics/VehicleConfig.js";
import { LINE, OPPONENTS, RACE } from "../src/racing/RaceConfig.js";
import { Terrain } from "../src/physics/Terrain.js";
import { createChassis, applyDrive } from "../src/physics/Chassis.js";
import { VehicleDynamics } from "../src/physics/VehicleDynamics.js";
const layout = new TrackLayout(),
  profile = new RacingLineProfile(layout);
const participants = [
  { id: "sol", slot: 0 },
  { id: "rio", slot: 1 },
  { id: "you", slot: 2, isPlayer: true },
  { id: "nova", slot: 3 },
];
function start(session) {
  session.step(1 / 120, true);
  for (let i = 0; i < 360; i++) session.step(1 / 120, false);
}
test("race waits for throttle and a full countdown before lights out", () => {
  const r = new RaceSession(participants);
  r.step(100, false);
  assert.equal(r.phase, "ready");
  r.step(0.01, true);
  r.step(2.8, false);
  assert.equal(r.phase, "countdown");
  r.step(0.2, false);
  assert.equal(r.phase, "racing");
});
test("standings track lap distance across the timing-line seam", () => {
  const r = new RaceSession(participants);
  start(r);
  r.update("you", 0.99, { started: true, laps: 0 });
  r.update("sol", 0.01, { started: true, laps: 1 });
  assert.equal(r.getSnapshot().entries[0].id, "sol");
  r.update("you", 0.02, { started: true, laps: 1 });
  assert.equal(r.getSnapshot().entries[0].id, "you");
});
test("race finishes the player only after three complete laps and retains finish order", () => {
  const r = new RaceSession(participants);
  start(r);
  r.update("you", 0.9, { started: true, laps: 2 });
  assert.equal(r.phase, "racing");
  r.step(20, false);
  r.update("sol", 0, { started: true, laps: 3 });
  r.step(2, false);
  r.update("you", 0, { started: true, laps: 3 });
  assert.equal(r.phase, "finished");
  assert.equal(r.getSnapshot().position, 2);
  r.update("sol", 0.1, { started: true, laps: 4 });
  assert.equal(r.getSnapshot().entries[0].id, "sol");
});
test("reset restores countdown, classification and elapsed time", () => {
  const r = new RaceSession(participants);
  start(r);
  r.step(10, false);
  r.reset();
  const s = r.getSnapshot();
  assert.equal(s.phase, "ready");
  assert.equal(s.elapsed, 0);
  assert.equal(s.position, 3);
  assert.ok(s.entries.every((e) => e.finishedAt === null));
});
test("braking envelope is continuous around the circuit and respects stopping distance", () => {
  const ds = layout.length / profile.limits.length;
  for (let i = 0; i < profile.limits.length; i++) {
    const v = profile.limits[i],
      next = profile.limits[(i + 1) % profile.limits.length];
    assert.ok(Number.isFinite(v) && v >= LINE.minSpeed && v <= LINE.maxSpeed);
    assert.ok(v * v <= next * next + 2 * LINE.brakingDeceleration * ds + 1e-6);
  }
  assert.ok(Math.abs(profile.getSpeed(0) - profile.getSpeed(1)) < 1e-7);
});
test("line turns red above the recommended speed and green after actual slowing", () => {
  const corner =
      profile.limits.indexOf(Math.min(...profile.limits)) /
      profile.limits.length,
    target = profile.getSpeed(corner);
  assert.equal(profile.getAdvice(corner, target * 1.2).level, "brake");
  assert.equal(profile.getAdvice(corner, target * 0.99).level, "caution");
  assert.equal(profile.getAdvice(corner, target * 0.8).level, "safe");
});
test("straight speed recommendation exceeds the tight-corner recommendation", () => {
  assert.ok(profile.getSpeed(0.08) > Math.min(...profile.limits) + 5);
});
test("guide accounts for front grip without claiming unlimited cornering capacity", () => {
  assert.ok(
    profile.getSpeed(0.2, 0.85) < profile.getSpeed(0.2, DEFAULT_TUNE.frontGrip),
  );
  assert.ok(
    profile.getSpeed(0.2, 1.45) <=
      profile.getSpeed(0.2, DEFAULT_TUNE.frontGrip) * 1.05,
  );
});
function stateAt(p, offset = 0, speed = 15) {
  const point = layout.sample(p);
  return {
    position: {
      x: point.x + point.nx * offset,
      z: point.z + point.nz * offset,
    },
    quaternion: { x: 0, y: 0, z: 0, w: 1 },
    speedMps: speed,
    speedForward: speed,
  };
}
test("AI steers back toward the circuit without inheriting human control inversion", () => {
  const d = new AiDriver(layout, profile);
  const input = d.getInput(stateAt(0.08, 3), [], 1 / 120);
  assert.ok(input.steerAxis < 0);
});
test("AI brakes for a nearby slower car instead of accelerating into it", () => {
  const d = new AiDriver(layout, profile),
    state = stateAt(0.08),
    other = {
      position: { x: state.position.x, z: state.position.z + 3 },
      speedMps: 4,
    };
  const input = d.getInput(state, [other], 1 / 120);
  assert.equal(input.brakeAxis, 1);
  assert.equal(input.throttleAxis, 0);
});
test("physical AI driver completes a lap on the bumpy circuit", () => {
  const world = new C.World({ gravity: new C.Vec3(0, -9.81, 0) });
  world.broadphase = new C.SAPBroadphase(world);
  const terrain = new Terrain();
  terrain.createBody(world, new C.Material());
  const point = layout.sample(0.005),
    { body, vehicle } = createChassis(world, new C.Material(), {
      ...point,
      y: terrain.getHeight(point.x, point.z) + 0.85,
      yaw: Math.atan2(point.tx, point.tz),
    }),
    model = new VehicleDynamics(),
    driver = new AiDriver(layout, profile, { pace: 0.96, lane: 0.7 });
  let traveled = 0,
    previous = 0.005,
    maxDistance = 0,
    worst = null,
    firstOff = null;
  for (let i = 0; i < 120 * 120; i++) {
    const near = layout.nearest(body.position),
      local = body.vectorToLocalFrame(body.velocity),
      state = {
        position: body.position,
        quaternion: body.quaternion,
        speedMps: Math.hypot(body.velocity.x, body.velocity.z),
        speedForward: local.z,
      };
    const input =
      i < 240
        ? { steerAxis: 0, throttleAxis: 0, brakeAxis: 0 }
        : driver.getInput(state, [], 1 / 120);
    const forces = model.compute(
      {
        forward: local.z,
        lateral: local.x,
        yawRate: body.angularVelocity.y,
        grounded: vehicle.wheelInfos.some((w) => w.isInContact),
      },
      input,
      1 / 120,
      layout.getSurface(body.position),
    );
    applyDrive(body, forces, model.tuning);
    world.step(1 / 120);
    let delta = near.progress - previous;
    if (delta < -0.5) delta++;
    if (delta > 0.5) delta--;
    traveled += delta;
    previous = near.progress;
    if (i > 240 && near.distance > 6 && !firstOff)
      firstOff = {
        progress: near.progress,
        speed: state.speedMps,
        local: { forward: local.z, lateral: local.x },
        target: driver.debug.targetSpeed,
        input,
        time: i / 120,
      };
    if (i > 240 && near.distance > maxDistance) {
      maxDistance = near.distance;
      worst = {
        progress: near.progress,
        speed: state.speedMps,
        heading: model.debug,
        target: driver.debug.targetSpeed,
        time: i / 120,
      };
    }
    if (traveled > 1.01) break;
  }
  assert.ok(traveled > 1, "AI should complete the circuit");
  assert.ok(maxDistance < 6, JSON.stringify({ maxDistance, worst, firstOff }));
});

test("physical opponents clear a stationary grid car and complete three racing laps", () => {
  const world = new C.World({ gravity: new C.Vec3(0, -9.81, 0) });
  world.broadphase = new C.SAPBroadphase(world);
  world.solver.iterations = 12;
  const terrain = new Terrain(),
    ground = new C.Material(),
    carMaterial = new C.Material();
  terrain.createBody(world, ground);
  world.addContactMaterial(
    new C.ContactMaterial(ground, carMaterial, {
      friction: 0.05,
      restitution: 0.08,
    }),
  );
  const field = [...OPPONENTS, { id: "you", slot: 2 }].map((config) => {
    const p = layout.sample(
        0.02 - 0.003 - (config.slot * RACE.spacing) / layout.length,
      ),
      lane = config.slot % 2 ? 2 : -2,
      x = p.x + p.nx * lane,
      z = p.z + p.nz * lane;
    const chassis = createChassis(world, carMaterial, {
      x,
      z,
      y: terrain.getHeight(x, z) + 0.85,
      yaw: Math.atan2(p.tx, p.tz),
    });
    return {
      ...config,
      ...chassis,
      model: new VehicleDynamics(),
      driver:
        config.id === "you" ? null : new AiDriver(layout, profile, config),
      previous: p.progress,
      travel: 0,
      maxDistance: 0,
      firstOff: null,
    };
  });
  for (let i = 0; i < 120 * 270; i++) {
    const states = field.map((e) => {
      const local = e.body.vectorToLocalFrame(e.body.velocity);
      return {
        id: e.id,
        position: e.body.position,
        quaternion: e.body.quaternion,
        speedMps: Math.hypot(e.body.velocity.x, e.body.velocity.z),
        speedForward: local.z,
        lateral: local.x,
      };
    });
    for (let j = 0; j < field.length; j++) {
      const e = field[j],
        s = states[j],
        near = layout.nearest(s.position),
        input =
          i < 360 || !e.driver
            ? { steerAxis: 0, throttleAxis: 0, brakeAxis: 0 }
            : e.driver.getInput(
                s,
                states.filter((x) => x.id !== e.id),
                1 / 120,
              );
      const forces = e.model.compute(
        {
          forward: s.speedForward,
          lateral: s.lateral,
          yawRate: e.body.angularVelocity.y,
          grounded: e.vehicle.wheelInfos.some((w) => w.isInContact),
        },
        input,
        1 / 120,
        layout.getSurface(s.position),
      );
      applyDrive(e.body, forces, e.model.tuning);
      let delta = near.progress - e.previous;
      if (delta < -0.5) delta++;
      if (delta > 0.5) delta--;
      e.travel += delta;
      e.previous = near.progress;
      if (i > 360) e.maxDistance = Math.max(e.maxDistance, near.distance);
      if (near.distance > 6 && !e.firstOff)
        e.firstOff = {
          t: i / 120,
          progress: near.progress,
          speed: s.speedMps,
          lateral: s.lateral,
          debug: e.driver?.debug,
        };
    }
    world.step(1 / 120);
    if (field.filter((e) => e.driver).every((e) => e.travel > 3.02)) break;
  }
  const result = field
    .filter((e) => e.driver)
    .map((e) => ({
      id: e.id,
      laps: e.travel,
      maxDistance: e.maxDistance,
      firstOff: e.firstOff,
      debug: e.driver.debug,
      position: e.body.position,
      near: layout.nearest(e.body.position),
    }));
  assert.ok(
    result.every((e) => e.laps > 3),
    JSON.stringify(result),
  );
  assert.ok(
    result.every((e) => e.maxDistance < 6),
    JSON.stringify(result),
  );
});
