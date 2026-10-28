import { VEHICLE, clamp } from "./VehicleConfig.js";

// Forces stay in the physical step: no heading target, velocity rewrite or orientation snap.
export class StabilityAssist {
  static slide(
    { forward, lateral, yawRate, grounded },
    handbrake,
    strength,
    grip,
  ) {
    const slip = Math.atan2(lateral, Math.max(3, Math.abs(forward)));
    if (!grounded || handbrake || forward < 3 || slip * yawRate >= 0)
      return { torque: 0, drag: 0 };
    const engagement = clamp((Math.abs(slip) - 0.055) / 0.18, 0, 1);
    const limit = VEHICLE.mass * 9.81 * grip * VEHICLE.trackWidth * 0.12;
    const torque = clamp(
      -yawRate * VEHICLE.slideRecoveryRate * strength * engagement,
      -limit,
      limit,
    );
    return { torque, drag: Math.abs(torque) / (VEHICLE.trackWidth / 2) };
  }
  static balance(up, angularVelocity, grounded, strength) {
    if (!grounded || up.y < 0.1 || strength <= 0) return { x: 0, z: 0 };
    const tilt = Math.acos(clamp(up.y, -1, 1));
    const engagement = clamp((tilt - 0.12) / 0.22, 0, 1);
    const rate = Math.hypot(angularVelocity.x, angularVelocity.z);
    const damping = Math.max(engagement, clamp((rate - 0.8) / 2, 0, 1));
    const limit = VEHICLE.mass * 9.81 * 0.8 * strength;
    return {
      x: clamp(
        (-up.z * VEHICLE.balanceRate * engagement -
          angularVelocity.x * 1900 * damping) *
          strength,
        -limit,
        limit,
      ),
      z: clamp(
        (up.x * VEHICLE.balanceRate * engagement -
          angularVelocity.z * 1900 * damping) *
          strength,
        -limit,
        limit,
      ),
    };
  }
}
