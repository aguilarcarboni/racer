import test from "node:test";
import assert from "node:assert/strict";
import * as C from "cannon-es";
import {
  createChassis,
  applyDrive,
  installVehicleContacts,
} from "../src/physics/Chassis.js";
import { VehicleDynamics } from "../src/physics/VehicleDynamics.js";
import { StabilityAssist } from "../src/physics/StabilityAssist.js";
const dt = 1 / 120;
const idle = { steerAxis: 0, throttleAxis: 0, brakeAxis: 0 };
const throttle = { ...idle, throttleAxis: 1 };
const degrees = (r) => (r * 180) / Math.PI;
function field(count = 1) {
  const world = new C.World({ gravity: new C.Vec3(0, -9.81, 0) });
  world.solver.iterations = 12;
  const ground = new C.Material(),
    material = new C.Material();
  installVehicleContacts(world, ground, material);
  const road = new C.Body({ mass: 0, material: ground, shape: new C.Plane() });
  road.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  road.updateAABB();
  world.addBody(road);
  const cars = Array.from({ length: count }, (_, i) => ({
    ...createChassis(world, material, { x: i * 8, y: 0.85, z: 0 }),
    model: new VehicleDynamics(),
    contacts: 0,
  }));
  cars.forEach((c) => c.body.addEventListener("collide", () => c.contacts++));
  const step = (inputs = cars.map(() => idle)) => {
    cars.forEach((c, i) => {
      const v = c.body.vectorToLocalFrame(c.body.velocity);
      const forces = c.model.compute(
        {
          forward: v.z,
          lateral: v.x,
          yawRate: c.body.angularVelocity.y,
          grounded: c.vehicle.wheelInfos.some((w) => w.isInContact),
        },
        inputs[i],
        dt,
      );
      applyDrive(c.body, forces, c.model.tuning);
    });
    world.step(dt);
  };
  for (let i = 0; i < 240; i++) step();
  return { cars, step };
}
function measure(car) {
  const local = car.body.vectorToLocalFrame(car.body.velocity);
  const up = car.body.vectorToWorldFrame(new C.Vec3(0, 1, 0));
  return {
    slip: degrees(Math.abs(Math.atan2(local.x, local.z))),
    tilt: degrees(Math.acos(Math.min(1, up.y))),
    speed: car.body.velocity.length() * 3.6,
  };
}
test("arcade acceleration reaches 100 km/h promptly with automatic gears", () => {
  const f = field(),
    car = f.cars[0];
  let reached = null;
  for (let i = 0; i < 600; i++) {
    f.step([throttle]);
    if (measure(car).speed >= 100) {
      reached = (i + 1) * dt;
      break;
    }
  }
  assert.ok(reached > 4 && reached < 4.8, `0-100 km/h: ${reached}s`);
  assert.ok(car.model.powertrain.automatic);
  assert.ok(car.vehicle.wheelInfos.every((w) => w.isInContact));
});
test("large left and right yaw disturbances recover under power without a spin", () => {
  for (const yaw of [-2.5, -1.8, 1.8, 2.5]) {
    const f = field(),
      car = f.cars[0];
    car.body.velocity.z = 28;
    car.body.angularVelocity.y = yaw;
    let maxSlip = 0,
      help = 0;
    for (let i = 0; i < 360; i++) {
      f.step([throttle]);
      maxSlip = Math.max(maxSlip, measure(car).slip);
      help = Math.max(help, Math.abs(car.model.debug.recoveryTorque));
    }
    assert.ok(maxSlip < 24, `yaw ${yaw}: ${maxSlip} degrees`);
    assert.ok(help > 100);
    assert.ok(measure(car).slip < 1);
    assert.ok(Math.abs(car.body.angularVelocity.y) < 0.05);
    assert.ok(measure(car).speed > 100);
  }
});
test("recovery stays out of normal turns, handbrake slides, reverse and airborne motion", () => {
  const state = { forward: 25, lateral: 7, yawRate: -1.5, grounded: true };
  const help = StabilityAssist.slide(state, false, 0.85, 1.55);
  assert.ok(help.torque > 0 && help.drag > 0);
  for (const [s, handbrake, strength] of [
    [{ ...state, lateral: 0.5 }, false, 0.85],
    [state, true, 0.85],
    [state, false, 0],
    [{ ...state, grounded: false }, false, 0.85],
    [{ ...state, forward: -10 }, false, 0.85],
    [{ ...state, yawRate: 1.5 }, false, 0.85],
  ])
    assert.equal(StabilityAssist.slide(s, handbrake, strength, 1.55).torque, 0);
  assert.deepEqual(
    StabilityAssist.balance(
      { x: 0.3, y: 0.9, z: 0 },
      { x: 3, z: 3 },
      false,
      0.85,
    ),
    { x: 0, z: 0 },
  );
  const model = new VehicleDynamics();
  model.setTuning({ stabilityAssist: 99 });
  assert.equal(model.tuning.stabilityAssist, 1);
  model.setTuning({ stabilityAssist: -1 });
  assert.equal(model.tuning.stabilityAssist, 0);
});
test("rear-quarter contacts recover on either side and both cars keep driving", () => {
  for (const side of [-1, 1]) {
    const f = field(2),
      [a, b] = f.cars;
    b.body.position.set(side * 0.95, b.body.position.y, 4);
    a.body.velocity.z = 38;
    b.body.velocity.z = 8;
    let maxSlip = 0,
      maxTilt = 0;
    for (let i = 0; i < 600; i++) {
      f.step([throttle, throttle]);
      for (const c of f.cars) {
        const m = measure(c);
        maxSlip = Math.max(maxSlip, m.slip);
        maxTilt = Math.max(maxTilt, m.tilt);
      }
    }
    assert.ok(
      a.contacts + b.contacts > 0,
      "must exercise a real body collision",
    );
    assert.ok(maxSlip < 38, `contact slide: ${maxSlip}`);
    assert.ok(maxTilt < 10);
    assert.ok(
      f.cars.every((c) => measure(c).speed > 100 && measure(c).slip < 2),
    );
  }
});
test("a crossing impact leaves both chassis upright and recoverable", () => {
  const f = field(2),
    [a, b] = f.cars;
  a.body.velocity.z = 28;
  b.body.position.set(-7, b.body.position.y + 0.2, 9);
  b.body.quaternion.setFromEuler(0, Math.PI / 2, 0);
  b.body.velocity.set(22, 0, 0);
  let maxTilt = 0;
  for (let i = 0; i < 600; i++) {
    f.step([throttle, throttle]);
    maxTilt = Math.max(maxTilt, ...f.cars.map((c) => measure(c).tilt));
  }
  assert.ok(a.contacts + b.contacts > 0);
  assert.ok(maxTilt < 12);
  assert.ok(f.cars.every((c) => measure(c).speed > 90 && measure(c).slip < 3));
});
test("a high contact impulse retains physical roll and settles back onto the tires", () => {
  for (const side of [-1, 1]) {
    const f = field(),
      car = f.cars[0];
    car.body.velocity.z = 20;
    car.body.applyImpulse(
      new C.Vec3(side * 5000, 0, 0),
      new C.Vec3(0, 0.65, 0),
    );
    let maxTilt = 0;
    for (let i = 0; i < 480; i++) {
      f.step([throttle]);
      maxTilt = Math.max(maxTilt, measure(car).tilt);
    }
    assert.ok(maxTilt > 4 && maxTilt < 25, `physical tilt: ${maxTilt}`);
    assert.ok(measure(car).tilt < 1);
    assert.equal(car.vehicle.wheelInfos.filter((w) => w.isInContact).length, 4);
  }
});
test("full-lock braking from 145 and 180 km/h stays controllable", () => {
  for (const speed of [40, 50])
    for (const direction of [-1, 1]) {
      const f = field(),
        car = f.cars[0];
      car.body.velocity.z = speed;
      let maxSlip = 0;
      for (let i = 0; i < 480; i++) {
        f.step([{ ...idle, steerAxis: direction, brakeAxis: 1 }]);
        if (measure(car).speed > 18)
          maxSlip = Math.max(maxSlip, measure(car).slip);
      }
      assert.ok(maxSlip < 15, `high-speed braking slip: ${maxSlip}`);
      assert.ok(measure(car).speed < 10);
    }
});
