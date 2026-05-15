import * as THREE from 'three';

export class GamepadController {
  constructor() {
    this.onReset = null;
    this.onToggleCamera = null;
    this.onShiftUp = null;
    this.onShiftDown = null;
    this.onTelemetry = null;
    this.lastStateSignature = '';
    this.lastButtons = {
      cameraToggle: false,
      shiftUp: false,
      shiftDown: false,
    };

    this.deadzone = 0.12;
    this.triggerDeadzone = 0.05;
    console.info('[Input:gamepad-init] Gamepad controller ready');

    window.addEventListener('gamepadconnected', (event) => {
      console.info('[Input:gamepad-connected]', {
        index: event.gamepad.index,
        id: event.gamepad.id,
        mapping: event.gamepad.mapping,
      });
    });

    window.addEventListener('gamepaddisconnected', (event) => {
      console.warn('[Input:gamepad-disconnected]', {
        index: event.gamepad.index,
        id: event.gamepad.id,
      });
    });
  }

  getState() {
    const gamepad = this.getPrimaryGamepad();
    if (!gamepad) {
      this.emitStateChangeIfNeeded(this.getIdleState());
      return this.getIdleState();
    }

    const rawSteer = this.readAxis(gamepad, 0);
    const steer = -this.applyDeadzone(rawSteer, this.deadzone);
    const leftStickY = this.readAxis(gamepad, 1);
    const leftStickThrottle = this.applyDeadzone(-leftStickY, this.deadzone);
    const triggerThrottle = this.readTrigger(gamepad, 7);
    const triggerBrake = this.readTrigger(gamepad, 6);

    const throttle = THREE.MathUtils.clamp(Math.max(leftStickThrottle, triggerThrottle), 0, 1);
    const brake = THREE.MathUtils.clamp(triggerBrake, 0, 1);

    const state = {
      connected: true,
      source: 'gamepad',
      forward: throttle > 0.08,
      backward: brake > 0.08,
      left: steer > 0.08,
      right: steer < -0.08,
      steerAxis: steer,
      throttleAxis: throttle,
      brakeAxis: brake,
    };

    this.handleResetButton(gamepad, state);
    this.emitStateChangeIfNeeded(state);
    return state;
  }

  getPrimaryGamepad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (pad && pad.connected) return pad;
    }
    return null;
  }

  readAxis(gamepad, index) {
    if (!gamepad.axes || typeof gamepad.axes[index] !== 'number') return 0;
    return THREE.MathUtils.clamp(gamepad.axes[index], -1, 1);
  }

  readTrigger(gamepad, index) {
    if (!gamepad.buttons || !gamepad.buttons[index]) return 0;
    const value = THREE.MathUtils.clamp(gamepad.buttons[index].value ?? 0, 0, 1);
    return value < this.triggerDeadzone ? 0 : value;
  }

  applyDeadzone(value, deadzone) {
    const abs = Math.abs(value);
    if (abs <= deadzone) return 0;
    const normalized = (abs - deadzone) / (1 - deadzone);
    return Math.sign(value) * normalized;
  }

  handleResetButton(gamepad, state) {
    const cameraTogglePressed = Boolean(gamepad.buttons?.[3]?.pressed);
    const shiftUpPressed = Boolean(gamepad.buttons?.[0]?.pressed);
    const shiftDownPressed = Boolean(gamepad.buttons?.[1]?.pressed);

    if (cameraTogglePressed && !this.lastButtons.cameraToggle && this.onToggleCamera) {
      this.onToggleCamera();
      if (this.onTelemetry) {
        this.onTelemetry({
          event: 'gamepad-camera-toggle',
          key: 'button-triangle',
          state,
        });
      }
    }

    if (shiftUpPressed && !this.lastButtons.shiftUp && this.onShiftUp) {
      this.onShiftUp();
      if (this.onTelemetry) {
        this.onTelemetry({
          event: 'gamepad-shift-up',
          key: 'button-x',
          state,
        });
      }
    }

    if (shiftDownPressed && !this.lastButtons.shiftDown && this.onShiftDown) {
      this.onShiftDown();
      if (this.onTelemetry) {
        this.onTelemetry({
          event: 'gamepad-shift-down',
          key: 'button-circle',
          state,
        });
      }
    }
    this.lastButtons.cameraToggle = cameraTogglePressed;
    this.lastButtons.shiftUp = shiftUpPressed;
    this.lastButtons.shiftDown = shiftDownPressed;
  }

  emitStateChangeIfNeeded(state) {
    const signature = [
      state.connected ? 1 : 0,
      state.forward ? 1 : 0,
      state.backward ? 1 : 0,
      state.left ? 1 : 0,
      state.right ? 1 : 0,
      state.steerAxis.toFixed(2),
      state.throttleAxis.toFixed(2),
      state.brakeAxis.toFixed(2),
    ].join('|');

    if (signature === this.lastStateSignature) return;
    this.lastStateSignature = signature;
    console.log('[Input:gamepad-state-change]', state);
    if (this.onTelemetry) {
      this.onTelemetry({
        event: 'gamepad-state-change',
        key: 'analog',
        state,
      });
    }
  }

  getIdleState() {
    return {
      connected: false,
      source: 'gamepad',
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
