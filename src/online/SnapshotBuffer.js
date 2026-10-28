import { Quaternion } from "three";
export function mixPose(a, b, t) {
  const qa = new Quaternion(
      a.quaternion.x,
      a.quaternion.y,
      a.quaternion.z,
      a.quaternion.w,
    ),
    qb = new Quaternion(
      b.quaternion.x,
      b.quaternion.y,
      b.quaternion.z,
      b.quaternion.w,
    );
  qa.slerp(qb, t);
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    quaternion: { x: qa.x, y: qa.y, z: qa.z, w: qa.w },
  };
}
export class SnapshotBuffer {
  constructor() {
    this.frames = [];
  }
  clear() {
    this.frames = [];
  }
  push(cars, time) {
    this.frames.push({ cars, time });
    if (this.frames.length > 12) this.frames.shift();
  }
  pose(id, time) {
    if (!this.frames.length) return null;
    const target = time - 120;
    const b = this.frames.find((f) => f.time >= target) ?? this.frames.at(-1);
    const bi = this.frames.indexOf(b),
      a = this.frames[Math.max(0, bi - 1)];
    const pa = a.cars.find((c) => c.id === id).physics.pose,
      pb = b.cars.find((c) => c.id === id).physics.pose;
    if (target <= b.time || a !== b)
      return mixPose(
        pa,
        pb,
        a === b
          ? 1
          : Math.max(0, Math.min(1, (target - a.time) / (b.time - a.time))),
      );
    const entry = b.cars.find((c) => c.id === id),
      dt = Math.min(0.12, (target - b.time) / 1000);
    return {
      ...pb,
      x: pb.x + entry.physics.velocity[0] * dt,
      y: pb.y + entry.physics.velocity[1] * dt,
      z: pb.z + entry.physics.velocity[2] * dt,
    };
  }
}
