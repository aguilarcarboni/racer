import * as THREE from "three";
import { VEHICLE, clamp } from "../physics/VehicleConfig.js";

const wheelNames = /^wheel(Front|Back)(Left|Right)$/;

export class WheelRig {
  constructor(model, scale) {
    this.scale = scale;
    this.spin = 0;
    this.wheels = [];
    const nodes = [];
    model.traverse((node) => {
      if (wheelNames.test(node.name)) nodes.push(node);
    });
    model.updateMatrixWorld(true);
    for (const node of nodes) {
      // This asset places each wheel origin at its inner face. Move the pivot
      // to the hub without moving the original mesh in its resting pose.
      const center = node.worldToLocal(
        new THREE.Box3().setFromObject(node).getCenter(new THREE.Vector3()),
      );
      const hub = new THREE.Group(),
        steering = new THREE.Group(),
        spin = new THREE.Group();
      hub.position
        .copy(center)
        .multiply(node.scale)
        .applyQuaternion(node.quaternion)
        .add(node.position);
      hub.quaternion.copy(node.quaternion);
      hub.scale.copy(node.scale);
      node.parent.add(hub);
      hub.add(steering);
      steering.add(spin);
      spin.add(node);
      node.position.copy(center).negate();
      node.quaternion.identity();
      node.scale.setScalar(1);
      const front = node.name.includes("Front"),
        left = node.name.includes("Left");
      this.wheels.push({
        hub,
        steering,
        spin,
        front,
        basePosition: hub.position.clone(),
        index: front ? (left ? 1 : 0) : left ? 3 : 2,
      });
    }
  }
  sync(vehicle, steering, speed, dt) {
    this.spin =
      (this.spin + (speed * dt) / VEHICLE.wheelRadius) % (Math.PI * 2);
    const neutralLength = VEHICLE.restLength - 9.81 / (4 * VEHICLE.stiffness);
    for (const wheel of this.wheels) {
      const suspension = clamp(
        vehicle.wheelInfos[wheel.index].suspensionLength,
        VEHICLE.restLength - VEHICLE.travel,
        VEHICLE.restLength + VEHICLE.travel,
      );
      wheel.hub.position.copy(wheel.basePosition);
      wheel.hub.position.y += (neutralLength - suspension) / this.scale;
      // Steering is the parent transform; spin always stays on the steered axle.
      wheel.steering.rotation.y = wheel.front ? steering : 0;
      wheel.spin.rotation.x = this.spin;
    }
  }
}
