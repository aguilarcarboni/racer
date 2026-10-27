import * as CANNON from "cannon-es";
import { VEHICLE } from "../physics/VehicleConfig.js";
import { VehicleDynamics } from "../physics/VehicleDynamics.js";
import { createChassis, applyDrive } from "../physics/Chassis.js";
import { CarView } from "../view/CarView.js";
export class Car {
  constructor(scene, world, material) {
    this.scene = scene;
    this.world = world;
    this.material = material;
    this.dynamics = new VehicleDynamics();
    this.startPosition = new CANNON.Vec3();
    this.spawnYaw = 0;
    this.surface = "asphalt";
    this.contacts = 0;
    this.lastContactAt = 0;
  }
  create(spawn) {
    this.setSpawn(spawn);
    const chassis = createChassis(this.world, this.material, spawn);
    this.body = chassis.body;
    this.vehicle = chassis.vehicle;
    this.view = new CarView(this.scene);
    this.mesh = this.view.root;
    this.body.addEventListener("collide", () => {
      this.contacts++;
    });
    this.syncVisuals();
  }
  setSpawn(spawn) {
    this.startPosition.set(spawn.x, spawn.y, spawn.z);
    this.spawnYaw = spawn.yaw || 0;
  }
  updatePhysics(input, dt, surface = "asphalt", groundHeight = 0) {
    this.groundHeight = groundHeight;
    this.surface = surface;
    const forward = this.body.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1)),
      right = this.body.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0));
    forward.y = 0;
    right.y = 0;
    forward.normalize();
    right.normalize();
    const grounded = this.vehicle.wheelInfos.some((w) => w.isInContact);
    if (grounded) this.lastContactAt = performance.now();
    const state = {
      forward: this.body.velocity.dot(forward),
      lateral: this.body.velocity.dot(right),
      yawRate: this.body.angularVelocity.y,
      grounded,
    };
    const forces = this.dynamics.compute(state, input, dt, surface);
    applyDrive(this.body, forces, this.dynamics.tuning);
    for (let i = 0; i < 2; i++)
      this.vehicle.setSteeringValue(forces.steerAngle, i);
  }
  syncVisuals(dt = 0) {
    this.view.sync(this.body, this.vehicle, this.dynamics.debug.steerAngle, dt);
  }
  reset() {
    this.body.position.copy(this.startPosition);
    this.body.quaternion.setFromEuler(0, this.spawnYaw, 0);
    for (const key of ["velocity", "angularVelocity", "force", "torque"])
      this.body[key].set(0, 0, 0);
    this.body.aabbNeedsUpdate = true;
    this.body.wakeUp();
    this.dynamics.reset();
    this.vehicle.wheelInfos.forEach((w) => {
      w.suspensionLength = VEHICLE.restLength;
      w.isInContact = false;
      w.suspensionForce = 0;
    });
    this.syncVisuals();
  }
  shiftUp() {
    this.dynamics.powertrain.shift(1);
    console.info("[Input:shift]", this.getEngineState());
  }
  shiftDown() {
    this.dynamics.powertrain.shift(-1);
    console.info("[Input:shift]", this.getEngineState());
  }
  toggleAutomatic() {
    this.dynamics.powertrain.toggleAutomatic();
    console.info("[Tune:transmission]", this.getEngineState());
  }
  setTuning(values) {
    this.dynamics.setTuning(values);
    this.vehicle.wheelInfos.forEach((w) => {
      w.suspensionStiffness = this.dynamics.tuning.suspensionStiffness;
    });
  }
  getEngineState() {
    const v = this.body.vectorToLocalFrame(this.body.velocity);
    return this.dynamics.powertrain.getState(v.z);
  }
  getGearLabel() {
    const gear = this.dynamics.powertrain.gear;
    return gear < 0 ? "R" : gear === 0 ? "N" : String(gear);
  }
  getPose() {
    const p = this.body.position,
      q = this.body.quaternion;
    return {
      x: p.x,
      y: p.y,
      z: p.z,
      quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
    };
  }
  getPosition() {
    return {
      x: this.body.position.x,
      y: this.body.position.y,
      z: this.body.position.z,
    };
  }
  setVisible(visible) {
    this.mesh.visible = visible;
  }
  getDebugState() {
    const p = this.body.position,
      v = this.body.velocity,
      av = this.body.angularVelocity,
      local = this.body.vectorToLocalFrame(v),
      state = this.dynamics.getState(local.z),
      contacts = this.vehicle.wheelInfos.filter((w) => w.isInContact).length;
    return {
      ...state,
      position: { x: p.x, y: p.y, z: p.z },
      velocity: { x: v.x, y: v.y, z: v.z },
      angularVelocity: { x: av.x, y: av.y, z: av.z },
      speedMps: Math.hypot(v.x, v.z),
      speedForward: local.z,
      gear: this.dynamics.powertrain.gear,
      contactCount: this.contacts,
      wheelContacts: contacts,
      grounded: contacts > 0,
      msSinceContact: performance.now() - this.lastContactAt,
      groundClearance: p.y - (this.groundHeight || 0) - 0.1,
      bodyHalfHeight: 0.18,
      visualWheelBottomOffset: -0.62,
      suspension: this.vehicle.wheelInfos.map((w) => ({
        length: w.suspensionLength,
        force: w.suspensionForce,
        contact: w.isInContact,
      })),
    };
  }
}
