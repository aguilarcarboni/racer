import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class Car {
  constructor(scene, world, material) {
    this.scene = scene;
    this.world = world;
    this.material = material;

    this.mesh = null;
    this.body = null;

    this.engineForce = 8200;
    this.brakeForce = 11000;
    this.reverseForce = 4200;
    this.maxSteerLowSpeed = 0.65;
    this.maxSteerHighSpeed = 0.14;
    this.steerSpeed = 4.6;
    this.steerResponseLowSpeed = 9.5;
    this.steerResponseHighSpeed = 5.5;
    this.topSpeedMps = 56;
    this.longitudinalDrag = 7;
    this.frontGrip = 1.0;
    this.rearGrip = 0.92;
    this.frontCorneringStiffness = 4.8;
    this.rearCorneringStiffness = 5.2;
    this.baseFrontGrip = this.frontGrip;
    this.baseRearGrip = this.rearGrip;
    this.brakeBiasFront = 0.62;
    this.weightTransferLong = 0.25;
    this.weightTransferLat = 0.30;
    this.rearGripDrop = 0.18;
    this.slipPeak = 0.12;
    this.slipFalloff = 0.34;
    this.yawInertiaScale = 0.72;
    this.yawControl = 4200;
    this.yawDamping = 950;
    this.accelRate = 4.0;
    this.brakeRate = 26;
    this.reverseAccelRate = 2.0;
    this.coastDecelRate = 0.18;
    this.maxReverseSpeedMps = 16;
    this.gear = 1;
    this.maxForwardGear = 5;
    this.idleRpm = 900;
    this.redlineRpm = 7600;
    this.shiftSuggestRpm = 6600;
    this.gearRatios = {
      '-1': 0.45,
      '0': 0,
      '1': 1.0,
      '2': 0.8,
      '3': 0.64,
      '4': 0.5,
      '5': 0.38,
    };
    this.gearSpeedCaps = {
      '-1': 12,
      '0': 56,
      '1': 12,
      '2': 22,
      '3': 32,
      '4': 43,
      '5': 56,
    };
    this.tractionLimitBase = 10.5;
    this.tractionLimitSpeedFactor = 0.05;
    this.tractionSlipLoss = 0.42;
    this.visualOffsetY = -0.3;
    this.steer = 0;
    this.lastDriveForce = 0;
    this.lastYawTorque = 0;
    this.groundContacts = 0;
    this.lastContactAt = 0;
    this.groundSnapTolerance = 0.02;
    this.stabilityAssist = 3.1;
    this.highSpeedAssist = 6.2;

    this.startPosition = new CANNON.Vec3(0, 0.65, 8);
  }

  create() {
    const carGroup = new THREE.Group();

    const chassis = new THREE.Mesh(
      new THREE.BoxGeometry(1.7, 0.5, 3.2),
      new THREE.MeshStandardMaterial({ color: 0x1e5eff, roughness: 0.35, metalness: 0.2 })
    );
    chassis.position.y = 0.45;
    chassis.castShadow = true;
    chassis.receiveShadow = true;
    carGroup.add(chassis);

    const cabin = new THREE.Mesh(
      new THREE.BoxGeometry(1.25, 0.45, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x2c3038, roughness: 0.25, metalness: 0.05 })
    );
    cabin.position.set(0, 0.83, -0.15);
    cabin.castShadow = true;
    carGroup.add(cabin);

    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.27, 18);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x17191d, roughness: 0.9, metalness: 0 });
    const wheelOffsets = [
      [0.92, 0.34, 1.08],
      [-0.92, 0.34, 1.08],
      [0.92, 0.34, -1.08],
      [-0.92, 0.34, -1.08],
    ];
    for (const [x, y, z] of wheelOffsets) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, y, z);
      wheel.castShadow = true;
      carGroup.add(wheel);
    }

    this.mesh = carGroup;
    this.scene.add(this.mesh);

    const shape = new CANNON.Box(new CANNON.Vec3(0.85, 0.3, 1.55));
    this.body = new CANNON.Body({
      mass: 1200,
      shape,
      material: this.material,
      position: this.startPosition.clone(),
      linearDamping: 0.001,
      angularDamping: 0.05,
    });
    this.body.angularFactor.set(0, 1, 0);
    this.body.updateMassProperties();
    this.world.addBody(this.body);
    this.body.addEventListener('collide', () => {
      this.groundContacts += 1;
      this.lastContactAt = performance.now();
    });

    this.syncVisuals();
  }

  updatePhysics(input, dt) {
    const steerAxis = typeof input.steerAxis === 'number'
      ? THREE.MathUtils.clamp(input.steerAxis, -1, 1)
      : THREE.MathUtils.clamp((input.right ? 1 : 0) - (input.left ? 1 : 0), -1, 1);
    const throttleInput = typeof input.throttleAxis === 'number'
      ? THREE.MathUtils.clamp(input.throttleAxis, 0, 1)
      : (input.forward ? 1 : 0);
    const brakeInput = typeof input.brakeAxis === 'number'
      ? THREE.MathUtils.clamp(input.brakeAxis, 0, 1)
      : (input.backward ? 1 : 0);
    const targetSteer = steerAxis;
    const speedMps = Math.sqrt(this.body.velocity.x * this.body.velocity.x + this.body.velocity.z * this.body.velocity.z);
    const steerResponse = THREE.MathUtils.lerp(
      this.steerResponseLowSpeed,
      this.steerResponseHighSpeed,
      THREE.MathUtils.clamp(speedMps / 45, 0, 1)
    );
    const steerStep = steerResponse * dt;
    this.steer = THREE.MathUtils.clamp(
      THREE.MathUtils.lerp(this.steer, targetSteer, steerStep),
      -1,
      1
    );

    const forward = this.body.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1));
    const right = this.body.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0));
    const speedForward = this.body.velocity.dot(forward);
    const speedLateral = this.body.velocity.dot(right);
    const speedAbs = Math.abs(speedForward);

    const steerLimit = THREE.MathUtils.lerp(
      this.maxSteerLowSpeed,
      this.maxSteerHighSpeed,
      THREE.MathUtils.clamp(speedAbs / 40, 0, 1)
    );
    const steerAngle = this.steer * steerLimit;

    let nextForwardSpeed = speedForward;
    const gearRatio = this.gearRatios[String(this.gear)] ?? 0;
    const gearSpeedCap = this.gearSpeedCaps[String(this.gear)] ?? this.topSpeedMps;
    if (this.gear > 0 && throttleInput > 0.01) {
      nextForwardSpeed += this.accelRate * gearRatio * throttleInput * dt;
      nextForwardSpeed = Math.min(nextForwardSpeed, gearSpeedCap);
    } else if (this.gear < 0 && throttleInput > 0.01) {
      nextForwardSpeed -= this.reverseAccelRate * Math.abs(gearRatio) * throttleInput * dt;
      nextForwardSpeed = Math.max(nextForwardSpeed, -gearSpeedCap);
    } else if (brakeInput > 0.01) {
      if (speedForward > 1.5) {
        const frontBrake = this.brakeRate * this.brakeBiasFront;
        const rearBrake = this.brakeRate * (1 - this.brakeBiasFront);
        nextForwardSpeed -= (frontBrake + rearBrake * 0.92) * brakeInput * dt;
        nextForwardSpeed = Math.max(0, nextForwardSpeed);
      } else if (speedForward < -1.5) {
        nextForwardSpeed += this.brakeRate * brakeInput * dt;
        nextForwardSpeed = Math.min(0, nextForwardSpeed);
      } else {
        nextForwardSpeed = 0;
      }
    } else {
      const coastFactor = Math.max(0, 1 - this.coastDecelRate * dt);
      nextForwardSpeed *= coastFactor;
    }

    const forwardSign = speedForward >= 0 ? 1 : -1;
    const slipRefSpeed = Math.max(1.5, speedAbs);
    const steerSlipVelocity = steerAngle * speedAbs * forwardSign;
    const frontSlip = Math.atan2(speedLateral + steerSlipVelocity, slipRefSpeed);
    const rearSlip = Math.atan2(speedLateral, slipRefSpeed);
    const accelNorm = THREE.MathUtils.clamp((nextForwardSpeed - speedForward) / Math.max(0.1, this.accelRate * dt), -1, 1);
    const steerNorm = THREE.MathUtils.clamp(Math.abs(this.steer), 0, 1);
    const longShift = accelNorm * this.weightTransferLong;
    const latShift = steerNorm * this.weightTransferLat;
    const frontGripDynamic = THREE.MathUtils.clamp(this.baseFrontGrip - longShift + latShift * 0.4, 0.55, 1.35);
    const rearGripDynamic = THREE.MathUtils.clamp(this.baseRearGrip + longShift - latShift * this.rearGripDrop, 0.45, 1.3);

    const frontGripFactor = this.computeGripFromSlip(frontSlip) * frontGripDynamic;
    const rearGripFactor = this.computeGripFromSlip(rearSlip) * rearGripDynamic;

    const frontLateralAccel = -frontSlip * this.frontCorneringStiffness * frontGripFactor;
    const rearLateralAccel = -rearSlip * this.rearCorneringStiffness * rearGripFactor;
    const netLateralAccel = (frontLateralAccel + rearLateralAccel) * 0.5;
    const nextLateralSpeed = speedLateral + netLateralAccel * dt;

    const tractionLimit = this.tractionLimitBase + Math.abs(speedForward) * this.tractionLimitSpeedFactor;
    const combinedSlip = Math.abs(frontSlip) * 0.45 + Math.abs(rearSlip) * 0.55;
    const tractionScale = Math.max(0.4, 1 - combinedSlip * this.tractionSlipLoss);
    const limitedForwardDelta = THREE.MathUtils.clamp(
      nextForwardSpeed - speedForward,
      -tractionLimit * dt,
      tractionLimit * dt
    ) * tractionScale;
    nextForwardSpeed = speedForward + limitedForwardDelta;

    const vx = forward.x * nextForwardSpeed + right.x * nextLateralSpeed;
    const vz = forward.z * nextForwardSpeed + right.z * nextLateralSpeed;
    const speedBlend = THREE.MathUtils.clamp(speedAbs / 45, 0, 1);
    const straightAssist = THREE.MathUtils.lerp(this.stabilityAssist, this.highSpeedAssist, speedBlend);
    const assistLateral = speedLateral * straightAssist * dt * (Math.abs(this.steer) < 0.2 ? 1 : 0.35);
    const stabilizedVx = vx - right.x * assistLateral;
    const stabilizedVz = vz - right.z * assistLateral;
    this.body.velocity.x = vx;
    this.body.velocity.z = vz;
    this.body.velocity.x = stabilizedVx;
    this.body.velocity.z = stabilizedVz;
    this.lastDriveForce = (nextForwardSpeed - speedForward) * this.body.mass / Math.max(dt, 1e-3);

    const speedYawBlend = THREE.MathUtils.clamp((speedAbs - 1.0) / 6.0, 0, 1);
    const steerYawRate = steerAngle * speedAbs * 0.46 * forwardSign;
    const slipYawRate = (frontLateralAccel - rearLateralAccel) * this.yawInertiaScale * speedYawBlend;
    const targetYawRate = steerYawRate + slipYawRate;
    const yawRateError = targetYawRate - this.body.angularVelocity.y;
    const yawTorque = yawRateError * this.yawControl - this.body.angularVelocity.y * this.yawDamping;
    this.body.torque.y += yawTorque;
    this.lastYawTorque = yawTorque;
  }

  computeGripFromSlip(slipAngle) {
    const slip = Math.abs(slipAngle);
    if (slip <= this.slipPeak) {
      return THREE.MathUtils.clamp(1 - (slip / this.slipPeak) * 0.12, 0.75, 1);
    }
    const over = slip - this.slipPeak;
    const falloff = 1 - over / this.slipFalloff;
    return THREE.MathUtils.clamp(falloff, 0.35, 0.9);
  }

  syncVisuals() {
    this.mesh.position.set(
      this.body.position.x,
      this.body.position.y + this.visualOffsetY,
      this.body.position.z
    );
    this.mesh.quaternion.copy(this.body.quaternion);
  }

  reset() {
    this.body.position.copy(this.startPosition);
    this.body.quaternion.set(0, 0, 0, 1);
    this.body.velocity.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.force.set(0, 0, 0);
    this.body.torque.set(0, 0, 0);
    this.steer = 0;
    this.gear = 1;
    this.syncVisuals();
  }

  shiftUp() {
    this.gear = Math.min(this.maxForwardGear, this.gear + 1);
    console.info('[Input:shift]', { direction: 'up', gear: this.getGearLabel() });
  }

  shiftDown() {
    this.gear = Math.max(-1, this.gear - 1);
    console.info('[Input:shift]', { direction: 'down', gear: this.getGearLabel() });
  }

  getGearLabel() {
    if (this.gear < 0) return 'R';
    if (this.gear === 0) return 'N';
    return String(this.gear);
  }

  getEngineState() {
    const forward = this.body.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1));
    const speedForward = this.body.velocity.dot(forward);
    const speedAbs = Math.abs(speedForward);
    const gearKey = String(this.gear);
    const gearCap = this.gearSpeedCaps[gearKey] ?? this.topSpeedMps;
    const normalized = THREE.MathUtils.clamp(speedAbs / Math.max(gearCap, 0.1), 0, 1);
    const rpmRange = this.redlineRpm - this.idleRpm;
    const rpm = Math.round(this.idleRpm + rpmRange * normalized);
    const shouldShiftUp = this.gear > 0 && this.gear < this.maxForwardGear && rpm >= this.shiftSuggestRpm;
    return {
      rpm,
      idleRpm: this.idleRpm,
      redlineRpm: this.redlineRpm,
      shiftSuggestRpm: this.shiftSuggestRpm,
      normalized,
      shouldShiftUp,
    };
  }

  getDebugState() {
    const p = this.body.position;
    const v = this.body.velocity;
    const av = this.body.angularVelocity;
    const msSinceContact = this.lastContactAt > 0 ? performance.now() - this.lastContactAt : Number.POSITIVE_INFINITY;
    const groundClearance = p.y - 0.3;
    const grounded = groundClearance <= this.groundSnapTolerance;
    return {
      position: { x: p.x, y: p.y, z: p.z },
      velocity: { x: v.x, y: v.y, z: v.z },
      angularVelocity: { x: av.x, y: av.y, z: av.z },
      speedMps: Math.sqrt(v.x * v.x + v.z * v.z),
      steer: this.steer,
      driveForce: this.lastDriveForce,
      yawTorque: this.lastYawTorque,
      gear: this.gear,
      brakeBiasFront: this.brakeBiasFront,
      weightTransferLong: this.weightTransferLong,
      weightTransferLat: this.weightTransferLat,
      rearGripDrop: this.rearGripDrop,
      contactCount: this.groundContacts,
      msSinceContact,
      grounded,
      groundClearance,
      bodyHalfHeight: 0.3,
      visualWheelBottomOffset: this.visualOffsetY,
    };
  }

  setTuning(params = {}) {
    if (typeof params.brakeBiasFront === 'number') {
      this.brakeBiasFront = THREE.MathUtils.clamp(params.brakeBiasFront, 0.45, 0.8);
    }
    if (typeof params.weightTransferLong === 'number') {
      this.weightTransferLong = THREE.MathUtils.clamp(params.weightTransferLong, 0.05, 0.6);
    }
    if (typeof params.weightTransferLat === 'number') {
      this.weightTransferLat = THREE.MathUtils.clamp(params.weightTransferLat, 0.05, 0.7);
    }
    if (typeof params.rearGripDrop === 'number') {
      this.rearGripDrop = THREE.MathUtils.clamp(params.rearGripDrop, 0, 0.45);
    }
  }
}
