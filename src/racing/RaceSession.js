import { RACE } from "./RaceConfig.js";

export class RaceSession {
  constructor(participants, onEvent = () => {}) {
    this.participants = participants;
    this.onEvent = onEvent;
    this.reset();
  }
  reset() {
    this.phase = "ready";
    this.countdown = RACE.countdown;
    this.elapsed = 0;
    this.standings = this.participants.map((p) => ({
      ...p,
      distance: -0.003 - p.slot * 0.006,
      finishedAt: null,
    }));
  }
  step(dt, startRequested) {
    if (this.phase === "ready" && startRequested) {
      this.phase = "countdown";
      this.onEvent("phase", { phase: this.phase });
    }
    if (this.phase === "countdown") {
      this.countdown = Math.max(0, this.countdown - dt);
      if (this.countdown < 1e-8) {
        this.phase = "racing";
        this.onEvent("phase", { phase: this.phase });
      }
    } else if (this.phase === "racing" || this.phase === "finished")
      this.elapsed += dt;
  }
  update(id, progress, lap) {
    if (!["racing", "finished"].includes(this.phase)) return;
    const entry = this.standings.find((e) => e.id === id);
    if (!entry) return;
    entry.distance = lap.started ? lap.laps + progress : progress - 1;
    if (entry.finishedAt === null && lap.laps >= RACE.laps) {
      entry.finishedAt = this.elapsed;
      this.onEvent("finish", { id, time: this.elapsed });
      if (entry.isPlayer) this.phase = "finished";
    }
  }
  getSnapshot() {
    const entries = this.standings
      .slice()
      .sort((a, b) => {
        if (a.finishedAt !== null && b.finishedAt !== null)
          return a.finishedAt - b.finishedAt || a.slot - b.slot;
        if (a.finishedAt !== null) return -1;
        if (b.finishedAt !== null) return 1;
        return b.distance - a.distance || a.slot - b.slot;
      })
      .map((p, i) => ({ ...p, rank: i + 1 }));
    return {
      phase: this.phase,
      countdown: Math.ceil(this.countdown),
      elapsed: this.elapsed,
      laps: RACE.laps,
      total: entries.length,
      position: entries.find((e) => e.isPlayer)?.rank ?? 1,
      entries,
    };
  }
}
