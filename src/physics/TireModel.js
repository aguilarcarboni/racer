import { clamp } from "./VehicleConfig.js";
export function axleForce(slip, cornering, load, mu, longitudinal) {
  const capacity = Math.max(0, load * mu);
  const fx = clamp(longitudinal, -capacity, capacity);
  const lateralCapacity = Math.sqrt(Math.max(0, capacity * capacity - fx * fx));
  const fy =
    lateralCapacity > 0
      ? -lateralCapacity *
        Math.tanh((cornering * slip) / Math.max(1, lateralCapacity))
      : 0;
  return {
    longitudinal: fx,
    lateral: fy,
    usage: capacity > 0 ? Math.hypot(fx, fy) / capacity : 0,
  };
}
