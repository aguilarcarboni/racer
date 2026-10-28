import { GamepadAssignments } from "./GamepadAssignments.js";
import { GamepadController } from "./GamepadController.js";
import { mergeInputState } from "./InputState.js";

export class LocalControllers {
  constructor({
    getPads = () => globalThis.navigator?.getGamepads?.() ?? [],
    logger = console,
  } = {}) {
    this.getPads = getPads;
    this.logger = logger;
    this.assignments = new GamepadAssignments();
    this.readers = Array.from(
      { length: 4 },
      (_, i) =>
        new GamepadController({ listen: false, label: `P${i + 1}`, logger }),
    );
    this.onPause = null;
    this.onDisconnect = null;
    this.onJoin = null;
    this.readerPads = Array(4).fill("");
    this.lastPads = [];
    this.lastStatus = [];
    this.ready = true;
    this.pauseRequested = false;
    this.readers.forEach(
      (reader) =>
        (reader.onPause = () => {
          this.pauseRequested = true;
        }),
    );
  }
  configure(count, keyboardPlayers) {
    this.assignments.configure(count, keyboardPlayers);
    this.readers.forEach((r) => r.prime(null));
    this.readerPads.fill("");
    this.ready = count === 1;
  }
  sample(keyboard, { allowJoin = false, actionsEnabled = true } = {}) {
    const pads = Array.from(this.getPads()),
      update = this.assignments.update(pads, allowJoin);
    for (const slot of update.joined) {
      this.readers[slot].prime(this.assignments.getPad(slot, pads));
      this.logger.info("[Local:join]", update.status[slot]);
      this.onJoin?.(slot);
    }
    this.lastPads = pads;
    this.lastStatus = update.status;
    this.ready = update.ready;
    this.pauseRequested = false;
    const inputs = update.status.map((status, i) => {
      const pad = this.assignments.getPad(i, pads);
      const key = pad ? `${pad.index}:${pad.id}` : "";
      if (key !== this.readerPads[i]) {
        this.readers[i].prime(pad);
        this.readerPads[i] = key;
        this.logger.info("[Input:gamepad-bound]", {
          player: i + 1,
          index: pad?.index ?? null,
          id: pad?.id ?? null,
        });
      }
      return mergeInputState(
        status.keyboard
          ? Array.isArray(keyboard)
            ? (keyboard[status.keyboardIndex] ?? {})
            : i === 0
              ? keyboard
              : {}
          : {},
        this.readers[i].getState(pad, { actionsEnabled }),
      );
    });
    if (update.lost.length) {
      this.logger.warn("[Local:disconnect]", {
        players: update.lost.map((i) => i + 1),
      });
      this.onDisconnect?.(update.lost);
    }
    if (this.pauseRequested) this.onPause?.();
    return inputs;
  }
  getStatus() {
    return this.lastStatus;
  }
}
