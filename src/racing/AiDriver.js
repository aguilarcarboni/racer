import { VEHICLE, clamp, approach } from "../physics/VehicleConfig.js";

export class AiDriver {
  constructor(layout, profile, { pace = 0.92, lane = 0 } = {}) {
    this.layout = layout;
    this.profile = profile;
    this.pace = pace;
    this.baseLane = lane;
    this.reset();
  }
  reset() {
    this.lane = this.baseLane;
    this.targetLane = this.baseLane;
    this.passTime = 0;
    this.stuckTime = 0;
    this.recovery = 0;
    this.debug = {};
  }
  getInput(state, traffic, dt) {
    const near = this.layout.nearest(state.position),
      q = state.quaternion;
    const forward = {
      x: 2 * (q.x * q.z + q.w * q.y),
      z: 1 - 2 * (q.x * q.x + q.y * q.y),
    };
    const norm = Math.hypot(forward.x, forward.z) || 1;
    forward.x /= norm;
    forward.z /= norm;
    const speed = Math.max(0, state.speedForward);
    // Preview through the steering look-ahead so a short curvature dip cannot
    // trigger acceleration while the chassis is still turning into a corner.
    let lookAhead = 8 + speed * 0.65;
    let targetSpeed =
      Math.min(
        ...[0, 0.5, 1].map((f) =>
          this.profile.getSpeed(
            near.progress + (lookAhead * f) / this.layout.length,
          ),
        ),
      ) * this.pace;
    // Compare cars in circuit coordinates so a bend cannot make the next lane
    // look blocked simply because the chassis is still rotating into it.
    const nearby = traffic.map((other) => {
      const point = this.layout.nearest(other.position);
      let gap = (point.progress - near.progress) * this.layout.length;
      if (gap > this.layout.length / 2) gap -= this.layout.length;
      if (gap < -this.layout.length / 2) gap += this.layout.length;
      return { gap, lane: point.signedDistance, speed: other.speedMps };
    });
    const trafficLookAhead = Math.max(38, speed * 2.8);
    const isClear = (lane, margin = 1.9) =>
      !nearby.some(
        (other) =>
          other.gap > -9 &&
          other.gap < trafficLookAhead &&
          Math.abs(other.lane - lane) < margin,
      );
    this.passTime = Math.max(0, this.passTime - dt);
    let targetLane = this.targetLane;
    if (
      this.passTime === 0 &&
      !nearby.some(
        (other) =>
          other.gap > -9 &&
          other.gap < trafficLookAhead &&
          Math.abs(other.lane - this.baseLane) < 3,
      )
    )
      targetLane = this.baseLane;
    const obstruction = nearby.some(
      (other) =>
        other.gap > 0 &&
        other.gap < trafficLookAhead &&
        Math.abs(other.lane - targetLane) < 3,
    );
    if (obstruction && this.passTime === 0) {
      const candidates = [-3.5, -1.5, 0.5, 2.5, 3.5].sort(
        (a, b) =>
          Math.abs(a - near.signedDistance) - Math.abs(b - near.signedDistance),
      );
      const clearLane =
        candidates.find((lane) => isClear(lane, 3)) ??
        candidates.find((lane) => isClear(lane, 2.2));
      if (clearLane !== undefined) {
        targetLane = clearLane;
        this.passTime = 4;
      }
    }
    this.targetLane = targetLane;
    let nearestGap = Infinity;
    for (const other of nearby) {
      if (
        other.gap > 0 &&
        other.gap < 38 &&
        Math.abs(other.lane - near.signedDistance) < 1.9
      ) {
        nearestGap = Math.min(nearestGap, other.gap);
        // Leave enough forward motion to steer into a clear passing lane.
        const crawl = isClear(targetLane) && other.gap > 3.5 ? 2 : 0;
        targetSpeed = Math.min(
          targetSpeed,
          Math.max(crawl, other.speed + (other.gap - 6) * 0.65),
        );
      }
    }
    targetSpeed *=
      1 - Math.min(0.18, Math.abs(targetLane - near.signedDistance) * 0.06);
    this.lane = approach(this.lane, targetLane, 1.2, dt);
    // Aim for passing room before a close obstacle, not beyond its bumper.
    if (
      speed < 5 &&
      nearestGap < 20 &&
      isClear(targetLane) &&
      Math.abs(targetLane - near.signedDistance) > 0.5
    )
      lookAhead = Math.min(lookAhead, Math.max(3, nearestGap * 0.65));
    const ahead = this.layout.sample(
      near.progress + lookAhead / this.layout.length,
    );
    const target = {
      x: ahead.x + ahead.nx * this.lane,
      z: ahead.z + ahead.nz * this.lane,
    };
    const dx = target.x - state.position.x,
      dz = target.z - state.position.z;
    const heading = Math.atan2(
      dx * forward.z - dz * forward.x,
      dx * forward.x + dz * forward.z,
    );
    const delta = Math.atan2(
      2 * VEHICLE.wheelbase * Math.sin(heading),
      Math.hypot(dx, dz),
    );
    const steerLimit = Math.min(
      VEHICLE.maxSteer,
      Math.atan((11.5 * VEHICLE.wheelbase) / (speed * speed + 25)),
    );
    let steerAxis = clamp(delta / steerLimit, -1, 1);
    if (Math.abs(heading) > 1.25) targetSpeed = Math.min(targetSpeed, 3);
    this.stuckTime =
      state.speedMps < 0.5 &&
      (targetSpeed > 1 ||
        (nearestGap < 7 && Math.abs(targetLane - near.signedDistance) > 0.5))
        ? this.stuckTime + dt
        : 0;
    if (
      this.stuckTime > 4 ||
      (Math.abs(heading) > 2.2 && state.speedMps < 4 && this.recovery <= 0)
    ) {
      this.recovery = 2;
      this.stuckTime = 0;
    }
    if (this.recovery > 0) {
      this.recovery -= dt;
      return {
        // Roll backwards before adding lock; full lock at rest creates
        // more tire scrub than the reduced reverse drive can overcome.
        steerAxis:
          -Math.sign(heading) *
          0.6 *
          clamp(Math.abs(state.speedForward) / 2, 0, 1),
        throttleAxis: 0,
        brakeAxis: 0.7,
        handbrake: false,
      };
    }
    const brakeAxis =
      nearestGap < 3.5
        ? speed > 0.5
          ? 1
          : 0
        : clamp((speed - targetSpeed) * 0.32, 0, 1);
    const throttleAxis =
      brakeAxis > 0.02 ? 0 : clamp((targetSpeed - speed) * 0.55, 0, 1);
    this.debug = {
      targetSpeed,
      lane: this.lane,
      nearestGap,
      steerAxis,
      recovering: false,
    };
    return { steerAxis, throttleAxis, brakeAxis, handbrake: false };
  }
}
