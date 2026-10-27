export const VEHICLE = Object.freeze({
  mass: 1180,
  wheelbase: 2.42,
  frontAxle: 1.17,
  rearAxle: 1.25,
  trackWidth: 1.58,
  wheelRadius: 0.32,
  restLength: 0.3,
  connectionHeight: -0.08,
  rideHeight: 0.62,
  stiffness: 32,
  compression: 3.4,
  rebound: 4.8,
  travel: 0.22,
  maxSuspensionForce: 16000,
  frontCornering: 74000,
  rearCornering: 88000,
  rearGrip: 1.14,
  brakeGripUse: 0.7,
  brakeSteerReduction: 0.35,
  maxSteer: 0.52,
  steerResponse: 7,
  power: 168000,
  driveForce: 5760,
  brakeForce: 13800,
  topSpeed: 74.4,
  fixedStep: 1 / 120,
});
export const DEFAULT_TUNE = Object.freeze({
  brakeBiasFront: 0.62,
  weightTransferLong: 0.15,
  weightTransferLat: 0.18,
  rearGripDrop: 0.06,
  suspensionStiffness: 32,
  frontGrip: 1.15,
});
export const clamp = (x, a, b) =>
  Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
export const approach = (value, target, rate, dt) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));

export const GEAR_SPEEDS = Object.freeze([
  0,
  18,
  30,
  43.2,
  57.6,
  VEHICLE.topSpeed,
]);
export const SURFACE_GRIP = Object.freeze({
  asphalt: 1.3,
  curb: 1.18,
  gravel: 0.76,
  grass: 0.55,
});
