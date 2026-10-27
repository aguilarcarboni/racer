export class InputController {
  constructor() {
    this.keys = { w: false, a: false, s: false, d: false, " ": false };
    this.onReset = null;
    this.onToggleCamera = null;
    this.onShiftUp = null;
    this.onShiftDown = null;
    this.onTelemetry = null;
    this.onPause = null;
    this.onToggleTransmission = null;
    this.onToggleGuide = null;
    window.addEventListener("keydown", (e) => this.key(e, true));
    window.addEventListener("keyup", (e) => this.key(e, false));
    window.addEventListener("blur", () => this.clear());
    console.info(
      "[Input:init] W/S throttle/brake + reverse; A/D steer; Space handbrake; arrows shift; G gearbox; C camera; L line; R reset; Escape pause",
    );
  }
  key(event, down) {
    if (event.target.closest("input,textarea,select")) return;
    const key = event.key.toLowerCase();
    if ([" ", "arrowup", "arrowdown", "escape"].includes(key))
      event.preventDefault();
    if (event.repeat) return;
    if (key in this.keys) {
      this.keys[key] = down;
      console.info(down ? "[Input:key-down]" : "[Input:key-up]", { key });
      this.onTelemetry?.({
        event: down ? "key-down" : "key-up",
        key,
        state: this.getState(),
      });
    }
    if (down) {
      const map = {
        r: "onReset",
        c: "onToggleCamera",
        arrowup: "onShiftUp",
        arrowdown: "onShiftDown",
        escape: "onPause",
        g: "onToggleTransmission",
        l: "onToggleGuide",
      };
      if (map[key]) this[map[key]]?.();
    }
  }
  clear() {
    for (const k in this.keys) this.keys[k] = false;
  }
  getState() {
    return {
      forward: this.keys.w,
      backward: this.keys.s,
      left: this.keys.a,
      right: this.keys.d,
      handbrake: this.keys[" "],
    };
  }
}
