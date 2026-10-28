export class PredictionHistory {
  constructor() {
    this.frames = [];
  }
  clear() {
    this.frames.length = 0;
  }
  record(end, dt, input) {
    this.frames.push({ end, dt, input: { ...input } });
    this.frames = this.frames.filter((f) => f.end > end - 400);
  }
  replay(frameTime, now, step) {
    const from = Math.max(frameTime, now - 150);
    let count = 0;
    for (const frame of this.frames)
      if (frame.end > from && frame.end <= now && count < 18) {
        step(frame.input, frame.dt);
        count++;
      }
    return count;
  }
}
