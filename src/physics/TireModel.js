import { clamp } from "./VehicleConfig.js";
export function axleForce(
  slip,
  cornering,
  load,
  mu,
  longitudinal,
  lateralLimit = Infinity,
) {
  const capacity = Math.max(0, load * mu);
  const fx = clamp(longitudinal, -capacity, capacity);
  const lateralCapacity = Math.sqrt(Math.max(0, capacity * capacity - fx * fx));
  const availableLateral = Math.min(lateralCapacity, Math.max(0, lateralLimit));
  const fy =
    availableLateral > 0
      ? -availableLateral *
        Math.tanh((cornering * slip) / Math.max(1, availableLateral))
      : 0;
  return {
    longitudinal: fx,
    lateralCapacity,
    availableLateral,
    lateral: fy,
    usage: capacity > 0 ? Math.hypot(fx, fy) / capacity : 0,
  };
}
