// A local grid can settle under gravity once, then stays parked until players
// are ready. A live race always freezes on pause, setup or a missing controller.
export class LocalRaceGate {
  constructor() {
    this.reset();
  }
  reset() {
    this.settleRemaining = 1.5;
  }
  getMode({ count, phase, paused, lobby, ready, startRequested }) {
    if (paused) return "freeze";
    const blocked =
      lobby || !ready || (count > 1 && phase === "ready" && !startRequested);
    if (!blocked) return "drive";
    return phase === "ready" && this.settleRemaining > 0 ? "settle" : "freeze";
  }
  step(mode, dt) {
    if (mode === "settle")
      this.settleRemaining = Math.max(0, this.settleRemaining - dt);
  }
}
