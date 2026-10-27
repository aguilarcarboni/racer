export class LapTracker {
  constructor() {
    this.best = null;
    this.reset();
  }
  reset() {
    this.time = 0;
    this.started = false;
    this.lapStart = 0;
    this.laps = 0;
    this.last = null;
    this.nextGate = 1;
    this.valid = true;
    this.previous = 0.985;
    this.wrongWay = false;
  }
  update(progress, distance, dt) {
    this.time += dt;
    let delta = progress - this.previous;
    if (delta < -0.5) delta++;
    if (delta > 0.5) delta--;
    this.wrongWay = delta < -0.00012;
    if (this.started && distance > 8) this.valid = false;
    if (delta > 0 && delta < 0.05) {
      if (this.previous > 0.9 && progress < 0.1) {
        if (this.started && this.nextGate === 4) {
          const lap = this.time - this.lapStart;
          this.last = { time: lap, valid: this.valid };
          this.laps++;
          if (this.valid && (this.best === null || lap < this.best))
            this.best = lap;
        }
        this.started = true;
        this.lapStart = this.time;
        this.nextGate = 1;
        this.valid = true;
      } else if (
        this.started &&
        this.nextGate < 4 &&
        this.previous < this.nextGate * 0.25 &&
        progress >= this.nextGate * 0.25
      )
        this.nextGate++;
    }
    this.previous = progress;
    return this.getState();
  }
  getState() {
    return {
      elapsed: this.started ? this.time - this.lapStart : 0,
      laps: this.laps,
      best: this.best,
      last: this.last,
      valid: this.valid,
      started: this.started,
      wrongWay: this.wrongWay,
    };
  }
}
