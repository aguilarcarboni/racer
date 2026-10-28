import { ONLINE } from "../online/Protocol.js";
export class D1RoomStore {
  constructor(db) {
    this.db = db;
  }
  async get(code) {
    const row = await this.db
      .prepare("SELECT revision, payload FROM online_rooms WHERE code = ?")
      .bind(code)
      .first();
    return row
      ? { revision: row.revision, room: JSON.parse(row.payload) }
      : null;
  }
  async insert(room) {
    const r = await this.db
      .prepare(
        "INSERT OR IGNORE INTO online_rooms (code, revision, expires_at, payload) VALUES (?, 0, ?, ?)",
      )
      .bind(room.code, room.expiresAt, JSON.stringify(room))
      .run();
    return r.meta.changes === 1;
  }
  async compareAndSwap(code, revision, room) {
    const r = await this.db
      .prepare(
        "UPDATE online_rooms SET revision = revision + 1, expires_at = ?, payload = ? WHERE code = ? AND revision = ?",
      )
      .bind(room.expiresAt, JSON.stringify(room), code, revision)
      .run();
    return r.meta.changes === 1;
  }
  async prune(now) {
    await this.db
      .prepare("DELETE FROM online_rooms WHERE expires_at < ?")
      .bind(now)
      .run();
  }
  async count(device) {
    const row = await this.db
      .prepare(
        "SELECT COUNT(*) AS count FROM online_rooms WHERE json_extract(payload, '$.creatorDevice') = ?",
      )
      .bind(device)
      .first();
    return row.count;
  }
}

// Dedicated real-time servers keep race state in their single process, outside any database round trip.
export class MemoryRoomStore {
  constructor() {
    this.rooms = new Map();
  }
  async get(code) {
    const value = this.rooms.get(code);
    return value ? structuredClone(value) : null;
  }
  async insert(room) {
    if (this.rooms.has(room.code) || this.rooms.size >= 16) return false;
    this.rooms.set(room.code, { revision: 0, room: structuredClone(room) });
    return true;
  }
  async compareAndSwap(code, revision, room) {
    const current = this.rooms.get(code);
    if (!current || current.revision !== revision) return false;
    this.rooms.set(code, {
      revision: revision + 1,
      room: structuredClone(room),
    });
    return true;
  }
  async prune(now) {
    for (const [code, value] of this.rooms)
      if (value.room.expiresAt < now) this.rooms.delete(code);
  }
  async count(device) {
    return [...this.rooms.values()].filter(
      (v) => v.room.creatorDevice === device,
    ).length;
  }
  setControls(code, member, sequence, input, now) {
    const row = this.rooms.get(code),
      player = row?.room.players.find((p) => p.id === member && !p.left);
    if (!player) return false;
    if (Number.isSafeInteger(sequence) && sequence > player.sequence) {
      player.sequence = sequence;
      player.input = input;
      row.revision++;
    }
    player.lastSeen = now;
    row.room.expiresAt = now + ONLINE.roomExpiryMs;
    return true;
  }
  park(code, member, now) {
    const row = this.rooms.get(code),
      player = row?.room.players.find((p) => p.id === member);
    if (player) {
      player.input = {
        steerAxis: 0,
        throttleAxis: 0,
        brakeAxis: 1,
        handbrake: false,
        parked: true,
      };
      row.revision++;
    }
  }
}
