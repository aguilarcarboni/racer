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
  frontCornering: 68000,
  rearCornering: 74000,
  maxSteer: 0.52,
  steerResponse: 7,
  power: 210000,
  driveForce: 8600,
  brakeForce: 13800,
  topSpeed: 62,
  fixedStep: 1 / 120,
});
export const DEFAULT_TUNE = Object.freeze({
  brakeBiasFront: 0.62,
  weightTransferLong: 0.25,
  weightTransferLat: 0.3,
  rearGripDrop: 0.18,
  suspensionStiffness: 32,
});
export const clamp = (x, a, b) =>
  Math.max(a, Math.min(b, Number.isFinite(x) ? x : a));
export const approach = (value, target, rate, dt) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));
