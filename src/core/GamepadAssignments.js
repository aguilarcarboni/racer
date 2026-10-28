import { getKeyboardCount } from "./KeyboardProfiles.js";

export class GamepadAssignments {
  constructor() {
    this.bindings = Array(4).fill(null);
    this.joinButtons = new Map();
    this.connected = Array(4).fill(false);
    this.configure(1, false);
  }
  configure(count, keyboardPlayers = 0) {
    this.count = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
    this.keyboardPlayers = getKeyboardCount(this.count, keyboardPlayers);
    for (let i = this.count; i < 4; i++) this.bindings[i] = null;
    for (let i = 0; i < this.keyboardPlayers; i++) this.bindings[i] = null;
    this.connected.fill(false);
  }
  getPad(slot, pads) {
    if (this.count > 1 && slot < this.keyboardPlayers) return null;
    const binding = this.bindings[slot];
    if (!binding) return null;
    return (
      Array.from(pads).find(
        (p) => p?.connected && p.index === binding.index && p.id === binding.id,
      ) ?? null
    );
  }
  update(pads, allowJoin = false) {
    const joined = [],
      lost = [];
    if (this.count === 1) {
      const pad =
        this.getPad(0, pads) ?? Array.from(pads).find((p) => p?.connected);
      this.bindings[0] = pad ? { index: pad.index, id: pad.id } : null;
    } else {
      for (const pad of pads) {
        if (!pad?.connected) continue;
        const key = `${pad.index}:${pad.id}`,
          pressed = !!pad.buttons?.[0]?.pressed;
        const edge = pressed && !this.joinButtons.get(key);
        this.joinButtons.set(key, pressed);
        if (
          !allowJoin ||
          !edge ||
          this.bindings.some((b) => b?.index === pad.index && b.id === pad.id)
        )
          continue;
        const slot = Array.from({ length: this.count }, (_, i) => i).find(
          (i) => i >= this.keyboardPlayers && !this.getPad(i, pads),
        );
        if (slot !== undefined) {
          this.bindings[slot] = { index: pad.index, id: pad.id };
          joined.push(slot);
        }
      }
    }
    const status = this.getStatus(pads);
    status.forEach((s, i) => {
      if (this.connected[i] && !s.connected && !s.keyboard) lost.push(i);
      this.connected[i] = s.connected || s.keyboard;
    });
    return {
      joined,
      lost,
      status,
      ready: status.every((s) => s.keyboard || s.connected),
    };
  }
  getStatus(pads) {
    return Array.from({ length: this.count }, (_, i) => {
      const pad = this.getPad(i, pads);
      return {
        playerIndex: i,
        keyboard: i < this.keyboardPlayers,
        keyboardIndex: i < this.keyboardPlayers ? i : null,
        connected: !!pad,
        index: pad?.index ?? null,
        name: pad?.id ?? "",
        assigned: !!this.bindings[i],
      };
    });
  }
}
