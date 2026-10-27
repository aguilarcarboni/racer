import * as THREE from "three";
import { HoodCamera } from "./HoodCamera.js";

export class PlayerCamera {
  constructor() {
    this.camera = new THREE.PerspectiveCamera(57, 1, 0.8, 2500);
    this.hood = new HoodCamera();
    this.mode = 0;
    this.ready = false;
  }
  reset() {
    this.ready = false;
    this.hood.reset();
  }
  cycle() {
    this.mode = (this.mode + 1) % 3;
    this.reset();
    return this.mode;
  }
  resize(width, height) {
    this.camera.aspect = width / Math.max(1, height);
    this.camera.updateProjectionMatrix();
  }
  update(dt, car, track, state) {
    const pose = car.getPose(),
      q = new THREE.Quaternion(
        pose.quaternion.x,
        pose.quaternion.y,
        pose.quaternion.z,
        pose.quaternion.w,
      ),
      p = new THREE.Vector3(pose.x, pose.y, pose.z);
    if (this.mode === 1) {
      this.hood.update(this.camera, pose, dt, !this.ready);
      this.ready = true;
      return;
    }
    let desired, look;
    if (this.mode === 2) {
      desired = new THREE.Vector3(305, 280, -325);
      look = new THREE.Vector3(85, 0, -35);
    } else {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      forward.y = 0;
      forward.normalize();
      desired = p
        .clone()
        .addScaledVector(forward, -10 - state.speedMps * 0.035)
        .add(new THREE.Vector3(0, 5.4, 0));
      look = p
        .clone()
        .addScaledVector(forward, 3 + state.speedMps * 0.08)
        .add(new THREE.Vector3(0, 0.8, 0));
      desired.y = Math.max(
        desired.y,
        track.terrain.getHeight(desired.x, desired.z) + 2.2,
      );
    }
    this.camera.position.lerp(desired, this.ready ? 1 - Math.exp(-dt * 5) : 1);
    this.camera.lookAt(look);
    this.ready = true;
  }
}
