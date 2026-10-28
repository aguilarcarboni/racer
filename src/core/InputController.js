import { KEYBOARD_PROFILES, getKeyboardCount } from "./KeyboardProfiles.js";

export class InputController {
  constructor({ eventTarget = window, logger = console } = {}) {
    this.logger = logger;
    this.keys = new Set();
    this.configure(1, false);
    this.onReset = null;
    this.onToggleCamera = null;
    this.onShiftUp = null;
    this.onShiftDown = null;
    this.onTelemetry = null;
    this.onPause = null;
    this.onToggleTransmission = null;
    this.onToggleGuide = null;
    eventTarget.addEventListener("keydown", (e) => this.key(e, true));
    eventTarget.addEventListener("keyup", (e) => this.key(e, false));
    eventTarget.addEventListener("blur", () => this.clear());
    this.logger.info(
      "[Input:init] P1 WASD/Space/C; maximum one keyboard player; Escape pause; R reset",
    );
  }
  configure(keyboardPlayers, local) {
    this.local = local;
    this.keyboardPlayers = getKeyboardCount(local ? 4 : 1, keyboardPlayers);
    this.clear();
  }
  key(event, down) {
    if (down && event.target?.closest?.("input,textarea,select")) return;
    const code = event.code;
    if (
      down &&
      ["Space", "Enter"].includes(code) &&
      event.target?.closest?.("button")
    )
      return;
    const profiles = KEYBOARD_PROFILES.slice(0, this.keyboardPlayers);
    const globalAction = {
      KeyR: "onReset",
      Escape: "onPause",
      KeyL: "onToggleGuide",
    }[code];
    const used =
      globalAction ||
      profiles.some((p) => p.keys[code] || p.actions[code]) ||
      (!this.local && ["ArrowUp", "ArrowDown"].includes(code));
    if (!used) return;
    event.preventDefault();
    if (event.repeat) return;
    if (down) this.keys.add(code);
    else this.keys.delete(code);
    profiles.forEach((profile, index) => {
      if (profile.keys[code]) {
        this.logger.info(down ? "[Input:key-down]" : "[Input:key-up]", {
          key: code,
          player: index + 1,
        });
        this.onTelemetry?.({
          event: down ? "key-down" : "key-up",
          key: code,
          player: index + 1,
          state: this.getState(index),
        });
      }
      if (down && profile.actions[code]) this[profile.actions[code]]?.(index);
    });
    if (down && !this.local && ["ArrowUp", "ArrowDown"].includes(code))
      this[code === "ArrowUp" ? "onShiftUp" : "onShiftDown"]?.(0);
    if (down && globalAction) this[globalAction]?.();
  }
  clear() {
    this.keys.clear();
  }
  getState(index = 0) {
    if (index >= this.keyboardPlayers) return {};
    return Object.fromEntries(
      Object.entries(KEYBOARD_PROFILES[index].keys).map(([code, action]) => [
        action,
        this.keys.has(code),
      ]),
    );
  }
  getStates() {
    return KEYBOARD_PROFILES.map((_, i) => this.getState(i));
  }
}
