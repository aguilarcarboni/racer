import { clamp } from "../physics/VehicleConfig.js";

export class GamepadController {
  constructor({ listen = true, label = "P1", logger = console } = {}) {
    this.label = label;
    this.logger = logger;
    this.onReset = null;
    this.onToggleCamera = null;
    this.onShiftUp = null;
    this.onShiftDown = null;
    this.onPause = null;
    this.onTelemetry = null;
    this.deadzone = 0.12;
    this.triggerDeadzone = 0.05;
    this.lastStateSignature = "";
    this.lastButtons = {};
    if (listen && typeof window !== "undefined") {
      window.addEventListener("gamepadconnected", (e) =>
        logger.info("[Input:gamepad-connected]", {
          index: e.gamepad.index,
          id: e.gamepad.id,
          mapping: e.gamepad.mapping,
        }),
      );
      window.addEventListener("gamepaddisconnected", (e) =>
        logger.warn("[Input:gamepad-disconnected]", {
          index: e.gamepad.index,
          id: e.gamepad.id,
        }),
      );
    }
  }
  prime(gamepad) {
    this.lastButtons = this.readButtons(gamepad);
  }
  getState(
    gamepad = this.getPrimaryGamepad(),
    { actionsEnabled = true, pauseEnabled = true } = {},
  ) {
    if (!gamepad?.connected) {
      this.lastButtons = {};
      const state = this.getIdleState();
      this.emitStateChangeIfNeeded(state);
      return state;
    }
    const steer = this.applyDeadzone(this.readAxis(gamepad, 0), this.deadzone);
    const throttle = clamp(
      Math.max(
        this.applyDeadzone(-this.readAxis(gamepad, 1), this.deadzone),
        this.readTrigger(gamepad, 7),
      ),
      0,
      1,
    );
    const brake = this.readTrigger(gamepad, 6);
    const state = {
      connected: true,
      source: "gamepad",
      gamepadIndex: gamepad.index,
      handbrake: !!gamepad.buttons?.[2]?.pressed,
      forward: throttle > 0.08,
      backward: brake > 0.08,
      left: steer < -0.08,
      right: steer > 0.08,
      steerAxis: steer,
      throttleAxis: throttle,
      brakeAxis: brake,
    };
    const buttons = this.readButtons(gamepad);
    for (const [key, callback] of [
      ["cameraToggle", "onToggleCamera"],
      ["shiftUp", "onShiftUp"],
      ["shiftDown", "onShiftDown"],
      ["pause", "onPause"],
    ]) {
      const enabled = key === "pause" ? pauseEnabled : actionsEnabled;
      if (enabled && buttons[key] && !this.lastButtons[key]) this[callback]?.();
    }
    this.lastButtons = buttons;
    this.emitStateChangeIfNeeded(state);
    return state;
  }
  readButtons(pad) {
    return {
      cameraToggle: !!pad?.buttons?.[3]?.pressed,
      shiftUp: !!pad?.buttons?.[0]?.pressed,
      shiftDown: !!pad?.buttons?.[1]?.pressed,
      pause: !!pad?.buttons?.[9]?.pressed,
    };
  }
  getPrimaryGamepad() {
    const pads = globalThis.navigator?.getGamepads?.() ?? [];
    return Array.from(pads).find((p) => p?.connected) ?? null;
  }
  readAxis(pad, index) {
    return clamp(pad.axes?.[index] ?? 0, -1, 1);
  }
  readTrigger(pad, index) {
    const value = clamp(pad.buttons?.[index]?.value ?? 0, 0, 1);
    return value < this.triggerDeadzone ? 0 : value;
  }
  applyDeadzone(value, deadzone) {
    const abs = Math.abs(value);
    return abs <= deadzone
      ? 0
      : (Math.sign(value) * (abs - deadzone)) / (1 - deadzone);
  }
  emitStateChangeIfNeeded(state) {
    const signature = [
      state.connected,
      state.gamepadIndex,
      state.steerAxis.toFixed(2),
      state.throttleAxis.toFixed(2),
      state.brakeAxis.toFixed(2),
      state.handbrake,
    ].join("|");
    if (signature === this.lastStateSignature) return;
    this.lastStateSignature = signature;
    this.logger.info("[Input:gamepad-state-change]", {
      player: this.label,
      ...state,
    });
    this.onTelemetry?.({
      event: "gamepad-state-change",
      key: "analog",
      player: this.label,
      state,
    });
  }
  getIdleState() {
    return {
      connected: false,
      source: "gamepad",
      handbrake: false,
      forward: false,
      backward: false,
      left: false,
      right: false,
      steerAxis: 0,
      throttleAxis: 0,
      brakeAxis: 0,
    };
  }
}
