import { VEHICLE, GEAR_SPEEDS as caps, clamp } from "./VehicleConfig.js";
export class PowertrainModel {
  constructor() {
    this.reset();
  }
  reset() {
    this.gear = 1;
    this.automatic = true;
    this.reverseTimer = 0;
    this.throttle = 0;
  }
  shift(direction) {
    this.automatic = false;
    this.gear = clamp(this.gear + direction, -1, 5);
  }
  toggleAutomatic() {
    this.automatic = !this.automatic;
    if (this.automatic && this.gear === 0) this.gear = 1;
  }
  update(speed, input, dt) {
    // A paused or disconnected online driver brakes without requesting reverse.
    if (input.parked) {
      this.reverseTimer = 0;
      this.throttle = 0;
      return { drive: 0, brake: 1, throttle: 0 };
    }
    let throttle = clamp(input.throttleAxis, 0, 1),
      brake = clamp(input.brakeAxis, 0, 1);
    if (this.automatic) {
      if (this.gear > 0) {
        this.reverseTimer =
          brake > 0.2 && throttle < 0.05 && Math.abs(speed) < 0.4
            ? this.reverseTimer + dt
            : 0;
        if (this.reverseTimer > 0.55) this.gear = -1;
        else if (this.gear < 5 && speed > caps[this.gear] * 0.87) this.gear++;
        else if (this.gear > 1 && speed < caps[this.gear - 1] * 0.56)
          this.gear--;
      } else if (this.gear < 0) {
        if (throttle > 0.1 && speed > -0.4) {
          this.gear = 1;
          this.reverseTimer = 0;
        } else {
          const reversePedal = brake;
          brake = throttle;
          throttle = reversePedal;
        }
      }
    }
    const direction = Math.sign(this.gear);
    const gearCap = this.gear < 0 ? 12 : caps[Math.max(1, this.gear)];
    const governor = clamp((gearCap + 3 - Math.abs(speed)) / 4, 0, 1);
    const engine =
      Math.min(
        VEHICLE.driveForce,
        VEHICLE.power / Math.max(10, Math.abs(speed)),
      ) * governor;
    this.throttle = throttle;
    return {
      drive:
        direction * engine * throttle * (1 - brake) * (this.gear < 0 ? 0.5 : 1),
      brake,
      throttle,
    };
  }
  saveState() {
    return {
      gear: this.gear,
      automatic: this.automatic,
      reverseTimer: this.reverseTimer,
      throttle: this.throttle,
    };
  }
  restoreState(state) {
    Object.assign(this, state);
  }
  getState(speed) {
    const normalized = clamp(
      Math.max(
        Math.abs(speed) / (this.gear < 0 ? 12 : caps[Math.max(1, this.gear)]),
        this.throttle * 0.18,
      ),
      0,
      1,
    );
    return {
      gear: this.gear,
      automatic: this.automatic,
      rpm: Math.round(900 + normalized * 6700),
      normalized,
      idleRpm: 900,
      redlineRpm: 7600,
      shiftSuggestRpm: 6600,
      shouldShiftUp:
        !this.automatic && this.gear > 0 && this.gear < 5 && normalized > 0.85,
    };
  }
}
