import { clamp } from "../physics/VehicleConfig.js";
export function mergeInputState(keyboard, gamepad) {
  const steerAxis = clamp(
    -(gamepad.steerAxis || 0) +
      (keyboard.left ? 1 : 0) -
      (keyboard.right ? 1 : 0),
    -1,
    1,
  );
  const throttleAxis = Math.max(
      gamepad.throttleAxis || 0,
      keyboard.forward ? 1 : 0,
    ),
    brakeAxis = Math.max(gamepad.brakeAxis || 0, keyboard.backward ? 1 : 0);
  return {
    steerAxis,
    throttleAxis,
    brakeAxis,
    handbrake: !!keyboard.handbrake || !!gamepad.handbrake,
    forward: throttleAxis > 0.01,
    backward: brakeAxis > 0.01,
    right: steerAxis > 0.01,
    left: steerAxis < -0.01,
    source: gamepad.connected ? "keyboard+gamepad" : "keyboard",
  };
}
