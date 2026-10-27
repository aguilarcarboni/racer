import * as THREE from "three";

export class HoodCamera {
  constructor() {
    this.forward = new THREE.Vector3();
    this.rotation = new THREE.Quaternion();
    this.look = new THREE.Vector3();
    this.reset();
  }
  reset() {
    this.ready = false;
    this.height = 0;
    this.pitch = 0;
    this.rawPitch = 0;
  }
  update(camera, pose, dt, snap = false) {
    const q = pose.quaternion;
    this.rotation.set(q.x, q.y, q.z, q.w);
    this.forward.set(0, 0, 1).applyQuaternion(this.rotation);
    this.rawPitch = Math.asin(THREE.MathUtils.clamp(this.forward.y, -1, 1));
    const height = pose.y + 0.8,
      pitch = this.rawPitch * 0.2;
    if (!this.ready || snap) {
      this.height = height;
      this.pitch = pitch;
    } else {
      this.height += (height - this.height) * (1 - Math.exp(-10 * dt));
      this.pitch += (pitch - this.pitch) * (1 - Math.exp(-6 * dt));
    }
    // Follow steering immediately, but stabilize the horizon and damp suspension
    // heave instead of strapping the viewer directly to every chassis impulse.
    this.forward.y = 0;
    this.forward.normalize();
    camera.position.set(
      pose.x + this.forward.x * 0.5,
      this.height,
      pose.z + this.forward.z * 0.5,
    );
    this.look.copy(camera.position).addScaledVector(this.forward, 30);
    this.look.y += Math.tan(this.pitch) * 30;
    camera.up.set(0, 1, 0);
    camera.lookAt(this.look);
    this.ready = true;
  }
  getState() {
    return {
      eyeHeight: +this.height.toFixed(3),
      rawPitchDegrees: +((this.rawPitch * 180) / Math.PI).toFixed(2),
      viewPitchDegrees: +((this.pitch * 180) / Math.PI).toFixed(2),
    };
  }
}
