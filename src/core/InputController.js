export class InputController {
  constructor() {
    this.keys = { w: false, a: false, s: false, d: false };
    this.onReset = null;
    this.onToggleCamera = null;
    this.onTelemetry = null;
    this.lastStateSignature = '';
    console.info('[Input:init] Input controller ready. Keys: W/A/S/D + R reset + C camera');

    window.addEventListener('keydown', (event) => this.handleKeyDown(event));
    window.addEventListener('keyup', (event) => this.handleKeyUp(event));
  }

  handleKeyDown(event) {
    const key = event.key.toLowerCase();
    if (event.repeat) {
      console.log('[Input:key-down-repeat]', { key, keys: { ...this.keys } });
      return;
    }
    if (key in this.keys) {
      this.keys[key] = true;
      console.log('[Input:key-down]', { key, keys: { ...this.keys } });
      if (this.onTelemetry) {
        this.onTelemetry({
          event: 'key-down',
          key,
          state: this.getState(),
        });
      }
    }
    if (key === 'r' && this.onReset) this.onReset();
    if (key === 'c' && this.onToggleCamera) this.onToggleCamera();
  }

  handleKeyUp(event) {
    const key = event.key.toLowerCase();
    if (key in this.keys) {
      this.keys[key] = false;
      console.log('[Input:key-up]', { key, keys: { ...this.keys } });
      if (this.onTelemetry) {
        this.onTelemetry({
          event: 'key-up',
          key,
          state: this.getState(),
        });
      }
    }
  }

  getState() {
    const state = {
      forward: this.keys.w,
      left: this.keys.a,
      backward: this.keys.s,
      right: this.keys.d,
    };
    const signature = `${state.forward ? 1 : 0}${state.left ? 1 : 0}${state.backward ? 1 : 0}${state.right ? 1 : 0}`;
    if (signature !== this.lastStateSignature) {
      this.lastStateSignature = signature;
      console.log('[Input:state-change]', state);
    }
    return state;
  }
}
