import * as THREE from "three";
export const CIRCUIT_POINTS = [
  [0, -140],
  [0, -20],
  [0, 75],
  [40, 135],
  [115, 140],
  [170, 95],
  [165, 45],
  [105, 10],
  [95, -35],
  [155, -70],
  [195, -125],
  [165, -185],
  [95, -210],
  [25, -205],
  [0, -170],
];
export class TrackLayout {
  constructor() {
    this.width = 12;
    this.curve = new THREE.CatmullRomCurve3(
      CIRCUIT_POINTS.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      "centripetal",
    );
    this.curve.arcLengthDivisions = 2400;
    this.length = this.curve.getLength();
    this.samples = Array.from({ length: 720 }, (_, i) => {
      const p = this.curve.getPointAt(i / 720),
        t = this.curve.getTangentAt(i / 720).normalize();
      return {
        x: p.x,
        z: p.z,
        tx: t.x,
        tz: t.z,
        nx: t.z,
        nz: -t.x,
        progress: i / 720,
      };
    });
  }
  sample(progress) {
    const t = ((progress % 1) + 1) % 1,
      p = this.curve.getPointAt(t),
      tangent = this.curve.getTangentAt(t);
    return {
      x: p.x,
      z: p.z,
      tx: tangent.x,
      tz: tangent.z,
      nx: tangent.z,
      nz: -tangent.x,
      progress: t,
    };
  }
  nearest(position) {
    let best = Infinity,
      result = null;
    for (let i = 0; i < this.samples.length; i++) {
      const a = this.samples[i],
        b = this.samples[(i + 1) % this.samples.length],
        dx = b.x - a.x,
        dz = b.z - a.z;
      const f = Math.max(
        0,
        Math.min(
          1,
          ((position.x - a.x) * dx + (position.z - a.z) * dz) /
            (dx * dx + dz * dz),
        ),
      );
      const x = a.x + f * dx,
        z = a.z + f * dz,
        d2 = (position.x - x) ** 2 + (position.z - z) ** 2;
      if (d2 < best) {
        best = d2;
        const len = Math.hypot(dx, dz);
        result = {
          x,
          z,
          tx: dx / len,
          tz: dz / len,
          progress: (i + f) / this.samples.length,
          signedDistance: ((position.x - x) * dz - (position.z - z) * dx) / len,
          distance: Math.sqrt(d2),
        };
      }
    }
    return result;
  }
  getSurface(position) {
    const d = this.nearest(position).distance;
    return d <= 6
      ? "asphalt"
      : d <= 7.2
        ? "curb"
        : d <= 11
          ? "gravel"
          : "grass";
  }
}
