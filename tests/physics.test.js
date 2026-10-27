import test from "node:test";
import assert from "node:assert/strict";
import * as CANNON from "cannon-es";
import { VehicleDynamics } from "../src/physics/VehicleDynamics.js";
import { createChassis, applyDrive } from "../src/physics/Chassis.js";
import { VEHICLE } from "../src/physics/VehicleConfig.js";
import { axleForce } from "../src/physics/TireModel.js";
import { mergeInputState } from "../src/core/InputState.js";
import { LapTracker } from "../src/models/LapTracker.js";
import { TrackLayout } from "../src/models/TrackLayout.js";
const idle = { steerAxis: 0, throttleAxis: 0, brakeAxis: 0 };
function rig() {
  const world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) }),
    ground = new CANNON.Material(),
    bodyMat = new CANNON.Material();
  world.addContactMaterial(
    new CANNON.ContactMaterial(ground, bodyMat, {
      friction: 0,
      restitution: 0,
    }),
  );
  const plane = new CANNON.Body({
    mass: 0,
    material: ground,
    shape: new CANNON.Plane(),
  });
  plane.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  plane.updateAABB();
  world.addBody(plane);
  const { body, vehicle } = createChassis(world, bodyMat, {
      x: 0,
      y: 0.85,
      z: 0,
    }),
    dynamics = new VehicleDynamics();
  const run = (seconds, input = idle, surface = "asphalt") => {
    for (let i = 0; i < Math.round(seconds / VEHICLE.fixedStep); i++) {
      const v = body.vectorToLocalFrame(body.velocity),
        f = dynamics.compute(
          {
            forward: v.z,
            lateral: v.x,
            yawRate: body.angularVelocity.y,
            grounded: vehicle.wheelInfos.some((w) => w.isInContact),
          },
          input,
          VEHICLE.fixedStep,
          surface,
        );
      applyDrive(body, f, dynamics.tuning);
      vehicle.setSteeringValue(f.steerAngle, 0);
      vehicle.setSteeringValue(f.steerAngle, 1);
      world.step(VEHICLE.fixedStep);
    }
  };
  run(2);
  return { world, body, vehicle, dynamics, run };
}
const throttle = { ...idle, throttleAxis: 1 };
test("suspension settles on four wheels above the road", () => {
  const r = rig();
  assert.equal(r.vehicle.wheelInfos.filter((w) => w.isInContact).length, 4);
  assert.ok(r.body.position.y > 0.5 && r.body.position.y < 0.75);
  assert.ok(Math.abs(r.body.velocity.y) < 0.03);
});
test("D and controller-right both request positive steering", () => {
  assert.equal(mergeInputState({ right: true }, {}).steerAxis, 1);
  assert.equal(mergeInputState({}, { steerAxis: 0.7 }).steerAxis, 0.7);
  assert.equal(mergeInputState({ left: true }, {}).steerAxis, -1);
});
test("right steering produces a right turn, left produces a left turn", () => {
  const a = rig(),
    b = rig();
  a.run(3, throttle);
  b.run(3, throttle);
  a.run(1, { ...throttle, steerAxis: 1 });
  b.run(1, { ...throttle, steerAxis: -1 });
  assert.ok(a.body.position.x > 1);
  assert.ok(b.body.position.x < -1);
  assert.ok(a.body.angularVelocity.y > 0);
  assert.ok(b.body.angularVelocity.y < 0);
  assert.ok(Math.abs(a.body.position.x + b.body.position.x) < 0.1);
});
test("automatic shifting accelerates beyond first gear", () => {
  const r = rig();
  r.run(6, throttle);
  assert.ok(r.dynamics.powertrain.gear > 1);
  assert.ok(r.body.velocity.length() * 3.6 > 90);
});
test("braking overrides held throttle and stops the car", () => {
  const r = rig();
  r.run(4, throttle);
  const before = r.body.velocity.length();
  r.run(3, { ...throttle, brakeAxis: 1 });
  assert.ok(before > 15);
  assert.ok(r.body.velocity.length() < 1);
});
test("stationary steering cannot spin the car in place", () => {
  const r = rig();
  r.run(2, { ...idle, steerAxis: 1 });
  assert.ok(Math.abs(r.body.angularVelocity.y) < 0.005);
  assert.ok(Math.abs(r.body.position.x) < 0.02);
});
test("grass scrubs more speed than asphalt", () => {
  const a = rig(),
    b = rig();
  a.run(3, throttle);
  b.run(3, throttle);
  a.run(1, idle, "asphalt");
  b.run(1, idle, "grass");
  assert.ok(b.body.velocity.length() < a.body.velocity.length() - 1);
});
test("tire forces stay within the combined friction circle", () => {
  const f = axleForce(0.5, 70000, 5500, 1.1, 4000);
  assert.ok(Math.hypot(f.longitudinal, f.lateral) <= 6050.0001);
  assert.ok(f.lateral < 0);
});
test("an airborne car gets no engine traction or yaw steering", () => {
  const d = new VehicleDynamics(),
    f = d.compute(
      { forward: 15, lateral: 2, yawRate: 0.1, grounded: false },
      { ...throttle, steerAxis: 1 },
      1 / 120,
    );
  assert.equal(f.lateral, 0);
  assert.equal(f.torque, 0);
  assert.ok(f.longitudinal < 0);
});
test("holding the brake at rest engages a controllable reverse", () => {
  const r = rig();
  r.run(2, { ...idle, brakeAxis: 1 });
  assert.equal(r.dynamics.powertrain.gear, -1);
  assert.ok(r.body.velocity.z < -1);
});
test("a raised curb causes real suspension travel and chassis movement", () => {
  const r = rig();
  const bump = new CANNON.Body({
    mass: 0,
    shape: new CANNON.Box(new CANNON.Vec3(3, 0.06, 2.2)),
  });
  bump.position.set(0, 0.06, 16);
  bump.updateAABB();
  r.world.addBody(bump);
  let min = Infinity,
    max = -Infinity,
    minLength = Infinity,
    maxLength = -Infinity;
  for (let i = 0; i < 480; i++) {
    r.run(1 / 120, throttle);
    if (r.body.position.z > 10 && r.body.position.z < 24) {
      min = Math.min(min, r.body.position.y);
      max = Math.max(max, r.body.position.y);
      for (const w of r.vehicle.wheelInfos) {
        minLength = Math.min(minLength, w.suspensionLength);
        maxLength = Math.max(maxLength, w.suspensionLength);
      }
    }
  }
  assert.ok(max - min > 0.04);
  assert.ok(maxLength - minLength > 0.04);
  assert.ok(Number.isFinite(r.body.position.y));
});
test("checkpoint gates prevent a lap from a start-line shortcut", () => {
  const t = new LapTracker();
  t.update(0.995, 0, 1);
  t.update(0.005, 0, 1);
  t.update(0.98, 0, 1);
  t.update(0.005, 0, 1);
  assert.equal(t.getState().laps, 0);
});
test("a complete forward lap records a best time; cutting the grass invalidates the next", () => {
  const t = new LapTracker();
  for (let i = 0; i < 220; i++) t.update((0.985 + i * 0.01) % 1, 0, 0.1);
  assert.ok(t.getState().laps >= 1);
  assert.ok(t.getState().best > 0);
  const best = t.getState().best;
  for (let i = 0; i < 110; i++) t.update((0.185 + i * 0.01) % 1, 20, 0.1);
  assert.equal(t.getState().best, best);
});
test("circuit is closed, non-degenerate and has meaningful width/length", () => {
  const l = new TrackLayout();
  assert.ok(l.length > 700);
  const a = l.sample(0),
    b = l.sample(1);
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.001);
  for (const s of l.samples)
    assert.ok(Math.abs(Math.hypot(s.tx, s.tz) - 1) < 0.01);
  assert.equal(l.getSurface({ x: a.x, z: a.z }), "asphalt");
});
test("repeated fixed-step drives produce the same state", () => {
  const a = rig(),
    b = rig();
  a.run(2, throttle);
  b.run(2, throttle);
  assert.deepEqual(a.body.position, b.body.position);
  assert.deepEqual(a.body.velocity, b.body.velocity);
});
test("traction control recovers from a small yaw disturbance under full throttle", () => {
  const r = rig();
  r.body.velocity.z = 15;
  r.body.angularVelocity.y = 0.03;
  r.run(3, throttle);
  assert.ok(Math.abs(r.body.angularVelocity.y) < 0.1);
  assert.ok(Math.abs(r.body.vectorToLocalFrame(r.body.velocity).x) < 1);
});

test("initial instrument state is complete before the first physics step", () => {
  const s = new VehicleDynamics().getState(0);
  assert.equal(s.surface, "asphalt");
  assert.ok(Number.isFinite(s.driveForce));
  assert.ok(Number.isFinite(s.engine.rpm));
});
