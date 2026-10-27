import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WheelRig } from "../src/view/WheelRig.js";
import { HoodCamera } from "../src/view/HoodCamera.js";
import { VEHICLE } from "../src/physics/VehicleConfig.js";

async function assetRig() {
  const file = await readFile(
    new URL("../models/raceCarRed.glb", import.meta.url),
  );
  const { scene } = await new GLTFLoader().parseAsync(
    file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength),
    "",
  );
  const scale =
    3.8 / new THREE.Box3().setFromObject(scene).getSize(new THREE.Vector3()).z;
  scene.scale.setScalar(scale);
  const before = new THREE.Box3().setFromObject(scene);
  const rig = new WheelRig(scene, scale);
  scene.updateMatrixWorld(true);
  return { scene, rig, before };
}
const neutralLength = VEHICLE.restLength - 9.81 / (4 * VEHICLE.stiffness);
const vehicleAt = (length) => ({
  wheelInfos: Array.from({ length: 4 }, () => ({ suspensionLength: length })),
});

test("rigging the original car retains all four wheel resting positions", async () => {
  const { scene, rig, before } = await assetRig();
  rig.sync(vehicleAt(neutralLength), 0, 0, 0);
  const after = new THREE.Box3().setFromObject(scene);
  assert.equal(rig.wheels.length, 4);
  assert.ok(before.min.distanceTo(after.min) < 1e-8);
  assert.ok(before.max.distanceTo(after.max) < 1e-8);
});
test("full-lock wheel rotation stays centered on the hubs and keeps the steered axles stable", async () => {
  const { scene, rig } = await assetRig(),
    vehicle = vehicleAt(neutralLength);
  rig.sync(vehicle, 0.52, 0, 0);
  scene.updateMatrixWorld(true);
  const starts = rig.wheels.map((w) =>
    new THREE.Box3().setFromObject(w.spin).getCenter(new THREE.Vector3()),
  );
  for (let i = 0; i < 240; i++) {
    rig.sync(vehicle, 0.52, 3, 1 / 120);
    scene.updateMatrixWorld(true);
    for (let j = 0; j < rig.wheels.length; j++) {
      const w = rig.wheels[j],
        center = new THREE.Box3()
          .setFromObject(w.spin)
          .getCenter(new THREE.Vector3());
      assert.ok(
        center.distanceTo(starts[j]) < 1e-6,
        "wheel geometry must not orbit the hub",
      );
      const axle = new THREE.Vector3(1, 0, 0).applyQuaternion(
          w.spin.getWorldQuaternion(new THREE.Quaternion()),
        ),
        expected = new THREE.Vector3(1, 0, 0).applyAxisAngle(
          new THREE.Vector3(0, 1, 0),
          w.front ? 0.52 : 0,
        );
      assert.ok(
        axle.distanceTo(expected) < 1e-6,
        "spinning must not rotate the steering axis",
      );
    }
  }
});
test("rendered wheel travel follows suspension in meters at both compression and extension", async () => {
  const { scene, rig } = await assetRig(),
    w = rig.wheels[0];
  rig.sync(vehicleAt(neutralLength), 0, 0, 0);
  scene.updateMatrixWorld(true);
  const start = w.hub.getWorldPosition(new THREE.Vector3());
  for (const travel of [-0.1, 0.1]) {
    rig.sync(vehicleAt(neutralLength - travel), 0, 0, 0);
    scene.updateMatrixWorld(true);
    const p = w.hub.getWorldPosition(new THREE.Vector3());
    assert.ok(Math.abs(p.y - start.y - travel) < 1e-6);
    assert.ok(Math.hypot(p.x - start.x, p.z - start.z) < 1e-6);
  }
});
function pose(x = 0, y = 0.62, z = 0, pitch = 0, yaw = 0) {
  const q = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(pitch, yaw, 0, "YXZ"),
  );
  return { x, y, z, quaternion: q };
}
test("hood camera damps chassis vibration while preserving immediate steering", () => {
  const rig = new HoodCamera(),
    camera = new THREE.PerspectiveCamera();
  rig.update(camera, pose(), 1 / 120);
  let minEye = Infinity,
    maxEye = -Infinity,
    minPitch = Infinity,
    maxPitch = -Infinity;
  for (let i = 0; i < 240; i++) {
    const wave = Math.sin((i / 120) * 2 * Math.PI * 12);
    rig.update(camera, pose(0, 0.62 + wave * 0.025, 0, wave * 0.035), 1 / 120);
    if (i > 120) {
      minEye = Math.min(minEye, camera.position.y);
      maxEye = Math.max(maxEye, camera.position.y);
      minPitch = Math.min(minPitch, rig.pitch);
      maxPitch = Math.max(maxPitch, rig.pitch);
    }
  }
  assert.ok(
    maxEye - minEye < 0.01,
    "suspension heave should be damped at the eye",
  );
  assert.ok(
    maxPitch - minPitch < 0.002,
    "chassis pitch must not shake the horizon",
  );
  rig.update(camera, pose(0, 0.62, 0, 0, Math.PI / 2), 1 / 120);
  const direction = camera.getWorldDirection(new THREE.Vector3());
  assert.ok(direction.x > 0.999);
  assert.ok(Math.abs(direction.z) < 1e-6);
});
test("hood camera snaps cleanly after a reset or a camera switch", () => {
  const rig = new HoodCamera(),
    camera = new THREE.PerspectiveCamera();
  rig.update(camera, pose(), 1 / 120);
  rig.update(camera, pose(20, 10, 30), 1 / 120, true);
  assert.equal(camera.position.x, 20);
  assert.equal(camera.position.y, 10.8);
  assert.equal(camera.position.z, 30.5);
});
