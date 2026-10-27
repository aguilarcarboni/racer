export class GamepadAssignments {
  constructor() {
    this.bindings = Array(4).fill(null);
    this.joinButtons = new Map();
    this.connected = Array(4).fill(false);
    this.configure(1, false);
  }
  configure(count, keyboardPlayerOne = false) {
    this.count = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
    this.keyboardPlayerOne = this.count === 1 || !!keyboardPlayerOne;
    for (let i = this.count; i < 4; i++) this.bindings[i] = null;
    if (this.keyboardPlayerOne) this.bindings[0] = null;
    this.connected.fill(false);
  }
  getPad(slot, pads) {
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
          (i) => !(i === 0 && this.keyboardPlayerOne) && !this.getPad(i, pads),
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
        keyboard: i === 0 && this.keyboardPlayerOne,
        connected: !!pad,
        index: pad?.index ?? null,
        name: pad?.id ?? "",
        assigned: !!this.bindings[i],
      };
    });
  }
}
