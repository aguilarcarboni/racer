import { ONLINE } from "../online/Protocol.js";
export class RoomLifecycle {
  static idleMs(room) {
    return !room.sim
      ? ONLINE.lobbyIdleMs
      : room.sim.race.phase === "finished"
        ? ONLINE.finishedIdleMs
        : ONLINE.raceIdleMs;
  }
  static updateExpiry(room) {
    room.expiresAt = Math.min(
      (room.lastActivityAt ?? room.createdAt) + this.idleMs(room),
      room.createdAt + ONLINE.maxRoomLifeMs,
    );
  }
  static touch(room, now) {
    room.lastActivityAt = now;
    this.updateExpiry(room);
  }
  static controlsChanged(a = {}, b = {}) {
    return (
      ["steerAxis", "throttleAxis", "brakeAxis"].some(
        (k) => Math.abs((a[k] ?? 0) - (b[k] ?? 0)) > 0.01,
      ) ||
      !!a.handbrake !== !!b.handbrake ||
      !!a.parked !== !!b.parked
    );
  }
  static reason(room, now) {
    if (now >= room.createdAt + ONLINE.maxRoomLifeMs)
      return "This lobby reached its two-hour limit.";
    const host = room.players.find((p) => p.id === room.host && !p.left);
    if (!host) return "The owner closed the lobby.";
    if (now - host.lastSeen >= ONLINE.disconnectMs)
      return "The owner disconnected. The lobby is closed.";
    if (now >= room.expiresAt) return "This lobby closed after being inactive.";
    return null;
  }
}
