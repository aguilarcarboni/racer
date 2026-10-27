import {
  VEHICLE,
  DEFAULT_TUNE,
  SURFACE_GRIP,
  clamp,
  approach,
} from "./VehicleConfig.js";
import { axleForce } from "./TireModel.js";
import { PowertrainModel } from "./PowertrainModel.js";
export class VehicleDynamics {
  constructor() {
    this.tuning = { ...DEFAULT_TUNE };
    this.powertrain = new PowertrainModel();
    this.reset();
  }
  reset() {
    this.steer = 0;
    this.lastAccel = 0;
    this.lastLateral = 0;
    this.powertrain.reset();
    this.debug = {
      driveForce: 0,
      yawTorque: 0,
      frontSlip: 0,
      rearSlip: 0,
      tireUsage: 0,
      steerAngle: 0,
      surface: "asphalt",
      grounded: false,
      frontBrakeForce: 0,
      rearBrakeForce: 0,
      rearGripReserve: 1,
    };
  }
  setTuning(values) {
    for (const [key, min, max] of [
      ["brakeBiasFront", 0.45, 0.8],
      ["weightTransferLong", 0.05, 0.6],
      ["weightTransferLat", 0.05, 0.7],
      ["rearGripDrop", 0, 0.45],
      ["suspensionStiffness", 20, 50],
      ["frontGrip", 0.85, 1.45],
    ])
      if (Number.isFinite(values[key]))
        this.tuning[key] = clamp(values[key], min, max);
  }
  compute(state, input, dt, surface = "asphalt") {
    const { forward, lateral, yawRate, grounded } = state,
      speed = Math.abs(forward);
    const controls = this.powertrain.update(forward, input, dt);
    this.steer = approach(
      this.steer,
      clamp(input.steerAxis, -1, 1),
      VEHICLE.steerResponse,
      dt,
    );
    // Keyboard full lock remains useful at speed, with finite lateral grip rather than forced yaw.
    const steerLimit = Math.min(
      VEHICLE.maxSteer,
      Math.atan((11.5 * VEHICLE.wheelbase) / (speed * speed + 25)),
    );
    // Soften full-lock steering during hard braking at road speed. Keyboard
    // drivers can keep turning without demanding a tightening radius as speed falls.
    const brakeSteer =
      1 -
      controls.brake *
        VEHICLE.brakeSteerReduction *
        clamp((speed - 3) / 8, 0, 1);
    const angle = this.steer * steerLimit * brakeSteer;
    const mu = SURFACE_GRIP[surface] ?? SURFACE_GRIP.asphalt;
    const g = 9.81,
      mass = VEHICLE.mass;
    const longitudinalTransfer =
      (((mass * this.lastAccel * 0.43) / VEHICLE.wheelbase) *
        this.tuning.weightTransferLong) /
      0.25;
    const frontLoad = clamp(
      (mass * g * VEHICLE.rearAxle) / VEHICLE.wheelbase - longitudinalTransfer,
      mass * g * 0.2,
      mass * g * 0.8,
    );
    const rearLoad = mass * g - frontLoad;
    const brake =
      controls.brake *
      Math.min(VEHICLE.brakeForce, (speed * mass) / Math.max(dt, 0.001));
    const sign = Math.sign(forward),
      frontBrake = -sign * brake * this.tuning.brakeBiasFront,
      rearBrake = -sign * brake * (1 - this.tuning.brakeBiasFront);
    const reference = Math.max(3, speed);
    const frontSlip =
      Math.atan2(lateral + VEHICLE.frontAxle * yawRate, reference) -
      angle * (sign || 1);
    const rearSlip = Math.atan2(
      lateral - VEHICLE.rearAxle * yawRate,
      reference,
    );
    const loadSensitivity =
      1 -
      clamp(Math.abs(this.lastLateral) / g, 0, 1.5) *
        this.tuning.weightTransferLat *
        0.1;
    const rearMu =
      mu *
      VEHICLE.rearGrip *
      loadSensitivity *
      (1 - this.tuning.rearGripDrop * Math.abs(this.steer) * 0.18) *
      (input.handbrake ? 0.42 : 1);
    const frontMu = mu * loadSensitivity * this.tuning.frontGrip;
    // ABS-style force limits keep cornering grip available on both axles,
    // especially at the rear when braking transfers load to the front.
    const safeFrontBrake = clamp(
      frontBrake,
      -frontMu * frontLoad * VEHICLE.brakeGripUse,
      frontMu * frontLoad * VEHICLE.brakeGripUse,
    );
    const safeRearBrake = clamp(
      rearBrake,
      -rearMu * rearLoad * VEHICLE.brakeGripUse,
      rearMu * rearLoad * VEHICLE.brakeGripUse,
    );
    const f = axleForce(
      frontSlip,
      VEHICLE.frontCornering,
      frontLoad,
      frontMu,
      safeFrontBrake,
    );
    const r = axleForce(
      rearSlip,
      VEHICLE.rearCornering,
      rearLoad,
      rearMu,
      clamp(
        controls.drive,
        -rearMu * rearLoad * 0.82,
        rearMu * rearLoad * 0.82,
      ) + safeRearBrake,
    );
    const dynamicBlend = clamp((speed - 1) / 4, 0, 1);
    const lowLateral = clamp(
      -lateral * mass * 7,
      -mass * g * mu,
      mass * g * mu,
    );
    let fx =
      dynamicBlend * (f.lateral * Math.cos(angle) + r.lateral) +
      (1 - dynamicBlend) * lowLateral;
    let torque =
      dynamicBlend *
        (f.lateral * Math.cos(angle) * VEHICLE.frontAxle -
          r.lateral * VEHICLE.rearAxle) -
      yawRate * 90;
    const lowYaw = (forward * Math.tan(angle)) / VEHICLE.wheelbase;
    torque +=
      (1 - dynamicBlend) * (lowYaw - yawRate) * (speed < 0.2 ? 30000 : 3200);
    const rolling =
      surface === "grass" ? 1.6 : surface === "gravel" ? 0.85 : 0.12;
    const resistance =
      sign *
      Math.min(
        (speed * mass) / Math.max(dt, 0.001),
        0.5 * speed * speed +
          mass * rolling +
          (controls.throttle < 0.05 ? mass * 0.3 : 0),
      );
    let fz =
      f.longitudinal +
      r.longitudinal -
      dynamicBlend * f.lateral * Math.sin(angle) -
      resistance;
    if (!grounded) {
      fx = 0;
      fz = -sign * 0.5 * speed * speed;
      torque = 0;
    }
    this.lastAccel = approach(this.lastAccel, fz / mass, 4, dt);
    this.lastLateral = approach(this.lastLateral, fx / mass, 4, dt);
    this.debug = {
      driveForce: fz,
      yawTorque: torque,
      frontSlip,
      rearSlip,
      tireUsage: Math.max(f.usage, r.usage),
      frontLateralForce: f.lateral,
      frontBrakeForce: Math.abs(safeFrontBrake),
      rearBrakeForce: Math.abs(safeRearBrake),
      rearGripReserve:
        rearMu * rearLoad > 0
          ? Math.sqrt(
              Math.max(0, 1 - (r.longitudinal / (rearMu * rearLoad)) ** 2),
            )
          : 0,
      rearLateralForce: r.lateral,
      steerAngle: angle,
      surface,
      grounded,
    };
    return {
      lateral: fx,
      longitudinal: fz,
      torque,
      steerAngle: angle,
      ...controls,
    };
  }
  getState(speed) {
    return {
      ...this.debug,
      steer: this.steer,
      ...this.tuning,
      enginePowerKw: VEHICLE.power / 1000,
      engine: this.powertrain.getState(speed),
    };
  }
}
