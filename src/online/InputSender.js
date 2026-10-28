import { cleanInput, IDLE_INPUT } from "./Protocol.js";
export class InputSender {
  constructor(
    send,
    {
      now = () => performance.now(),
      setTimer = setTimeout,
      clearTimer = clearTimeout,
    } = {},
  ) {
    Object.assign(this, { send, now, setTimer, clearTimer });
    this.latest = { ...IDLE_INPUT };
    this.lastSent = null;
    this.lastAt = -Infinity;
    this.pending = null;
    this.stopped = false;
  }
  changed() {
    const a = this.latest,
      b = this.lastSent;
    return (
      !b ||
      Math.abs(a.steerAxis - b.steerAxis) > 0.01 ||
      Math.abs(a.throttleAxis - b.throttleAxis) > 0.01 ||
      Math.abs(a.brakeAxis - b.brakeAxis) > 0.01 ||
      a.handbrake !== b.handbrake ||
      a.parked !== b.parked
    );
  }
  update(input) {
    this.latest = cleanInput(input);
    if (this.stopped || !this.changed()) return;
    const remaining = 20 - (this.now() - this.lastAt);
    if (remaining <= 0) this.flush();
    else if (this.pending === null)
      this.pending = this.setTimer(() => {
        this.pending = null;
        if (this.changed()) this.flush();
      }, remaining);
  }
  flush() {
    if (this.stopped) return;
    if (this.send(this.latest) === false) return;
    this.lastAt = this.now();
    this.lastSent = { ...this.latest };
    if (this.pending !== null) {
      this.clearTimer(this.pending);
      this.pending = null;
    }
  }
  heartbeat() {
    if (!this.stopped && this.now() - this.lastAt >= 50) this.flush();
  }
  stop() {
    this.stopped = true;
    if (this.pending !== null) this.clearTimer(this.pending);
    this.pending = null;
  }
}
