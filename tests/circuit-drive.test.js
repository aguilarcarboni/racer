import * as C from "cannon-es";
import test from "node:test";
import assert from "node:assert/strict";
import { Terrain } from "../src/physics/Terrain.js";
import { TrackLayout } from "../src/models/TrackLayout.js";
import { createChassis, applyDrive } from "../src/physics/Chassis.js";
import { VehicleDynamics } from "../src/physics/VehicleDynamics.js";
test("a conservative driver can complete the undulating circuit on the asphalt", () => {
  const world = new C.World({ gravity: new C.Vec3(0, -9.81, 0) });
  world.broadphase = new C.SAPBroadphase(world);
  const terrain = new Terrain();
  terrain.createBody(world, new C.Material());
  const track = new TrackLayout(),
    start = track.sample(0.005),
    { body, vehicle } = createChassis(world, new C.Material(), {
      ...start,
      y: terrain.getHeight(start.x, start.z) + 0.85,
      yaw: Math.atan2(start.tx, start.tz),
    }),
    model = new VehicleDynamics();
  let maxDistance = 0,
    lastProgress = 0.005,
    distance = 0,
    maxSpeed = 0,
    minSusp = Infinity,
    maxSusp = 0,
    complete = false;
  for (let i = 0; i < 120 * 110; i++) {
    const near = track.nearest(body.position),
      local = body.vectorToLocalFrame(body.velocity),
      speed = Math.abs(local.z),
      ahead = track.sample(near.progress + (8 + speed * 0.65) / track.length),
      forward = body.vectorToWorldFrame(new C.Vec3(0, 0, 1)),
      right = body.vectorToWorldFrame(new C.Vec3(1, 0, 0)),
      dx = ahead.x - body.position.x,
      dz = ahead.z - body.position.z;
    const heading = Math.atan2(
        dx * forward.z - dz * forward.x,
        dx * forward.x + dz * forward.z,
      ),
      delta = Math.atan2(2 * 2.42 * Math.sin(heading), Math.hypot(dx, dz)),
      limit = Math.min(0.52, Math.atan((11.5 * 2.42) / (speed * speed + 25))),
      steer = Math.max(-1, Math.min(1, delta / limit));
    const target = 16,
      throttle = i < 240 ? 0 : Math.max(0, Math.min(1, (target - speed) * 0.5)),
      brake = speed > target + 1 ? Math.min(1, (speed - target) * 0.25) : 0;
    const f = model.compute(
      {
        forward: local.z,
        lateral: local.x,
        yawRate: body.angularVelocity.y,
        grounded: vehicle.wheelInfos.some((w) => w.isInContact),
      },
      { steerAxis: steer, throttleAxis: throttle, brakeAxis: brake },
      1 / 120,
      track.getSurface(body.position),
    );
    applyDrive(body, f, model.tuning);
    world.step(1 / 120);
    if (i > 240) {
      maxDistance = Math.max(maxDistance, near.distance);
      maxSpeed = Math.max(maxSpeed, speed);
      let d = near.progress - lastProgress;
      if (d < -0.5) d++;
      if (d > 0.5) d--;
      distance += d;
      lastProgress = near.progress;
      for (const w of vehicle.wheelInfos) {
        minSusp = Math.min(minSusp, w.suspensionLength);
        maxSusp = Math.max(maxSusp, w.suspensionLength);
      }
    }
    if (distance > 1.01) {
      complete = true;
      break;
    }
  }

  assert.equal(complete, true);
  assert.ok(maxDistance < 5.5);
  assert.ok(maxSusp - minSusp > 0.04);
});
