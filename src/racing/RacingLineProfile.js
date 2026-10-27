import { LINE } from "./RaceConfig.js";
import { DEFAULT_TUNE, clamp } from "../physics/VehicleConfig.js";

export class RacingLineProfile {
  constructor(layout) {
    this.layout = layout;
    const count = layout.samples.length,
      segmentLength = layout.length / count;
    this.limits = layout.samples.map((point) => {
      const a = layout.sample(point.progress - 4 / layout.length);
      const b = layout.sample(point.progress + 4 / layout.length);
      const angle = Math.abs(
        Math.atan2(a.tx * b.tz - a.tz * b.tx, a.tx * b.tx + a.tz * b.tz),
      );
      const curvature = angle / 8;
      return clamp(
        Math.sqrt(LINE.lateralAcceleration / Math.max(curvature, 0.0001)),
        LINE.minSpeed,
        LINE.maxSpeed,
      );
    });
    // Propagate a braking envelope backwards around the closed circuit, including its seam.
    for (let pass = 0; pass < 3; pass++)
      for (let i = count - 1; i >= 0; i--) {
        const next = this.limits[(i + 1) % count];
        this.limits[i] = Math.min(
          this.limits[i],
          Math.sqrt(next * next + 2 * LINE.brakingDeceleration * segmentLength),
        );
      }
  }
  getSpeed(progress, frontGrip = DEFAULT_TUNE.frontGrip) {
    const index = (((progress % 1) + 1) % 1) * this.limits.length;
    const i = Math.floor(index),
      f = index - i;
    const speed =
      this.limits[i] * (1 - f) + this.limits[(i + 1) % this.limits.length] * f;
    // Front grip helps, but cannot make the rear axle or braking capacity unlimited.
    return (
      speed * Math.sqrt(clamp(frontGrip / DEFAULT_TUNE.frontGrip, 0.8, 1.1))
    );
  }
  getAdvice(progress, speed, frontGrip) {
    const targetSpeed = this.getSpeed(progress, frontGrip),
      ratio = Math.max(0, speed) / targetSpeed;
    return {
      targetSpeed,
      ratio,
      level:
        ratio > LINE.redRatio
          ? "brake"
          : ratio > LINE.amberRatio
            ? "caution"
            : "safe",
    };
  }
}
