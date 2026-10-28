import {
  CAR_IDS,
  CAR_COLORS,
  ONLINE,
  IDLE_INPUT,
  cleanInput,
  cleanName,
} from "../online/Protocol.js";
export class RoomError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const random = (length) =>
  Array.from(
    crypto.getRandomValues(new Uint8Array(length)),
    (x) => alphabet[x & 31],
  ).join("");
const hash = async (value) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
export class RoomService {
  constructor(store, simulation, { now = () => Date.now() } = {}) {
    this.store = store;
    this.simulation = simulation;
    this.now = now;
  }
  validateDevice(device) {
    if (typeof device !== "string" || !/^[\w-]{16,80}$/.test(device))
      throw new RoomError("Open the game again to initialize this device.");
  }
  async create(data) {
    this.validateDevice(data.device);
    const now = this.now();
    await this.store.prune(now);
    if ((await this.store.count(data.device)) >= 2)
      throw new RoomError(
        "Leave an existing lobby before creating another.",
        429,
      );
    const token = random(48),
      player = await this.player(data, token, 0, now);
    for (let attempt = 0; attempt < 8; attempt++) {
      const room = {
        code: random(6),
        host: player.id,
        creatorDevice: data.device,
        createdAt: now,
        expiresAt: now + ONLINE.roomExpiryMs,
        players: [player],
        sim: null,
        lastStep: now,
        match: 0,
      };
      if (await this.store.insert(room)) {
        console.info("[Online:create]", { code: room.code });
        return { ...this.view(room, player.id, now), revision: 0, token };
      }
    }
    throw new RoomError("Could not create a lobby. Try again.", 503);
  }
  async player(data, token, slot, now) {
    return {
      id: crypto.randomUUID(),
      device: data.device,
      secret: await hash(token),
      name: cleanName(data.name),
      slot,
      ready: false,
      lastSeen: now,
      input: { ...IDLE_INPUT },
      sequence: -1,
      left: false,
    };
  }
  async request(code, action, data) {
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code))
      throw new RoomError("Enter a valid six-character lobby code.");
    const tokenHash =
      typeof data.token === "string" ? await hash(data.token) : "";
    const newToken = action === "join" ? random(48) : null;
    const newPlayer =
      action === "join"
        ? await this.player(data, newToken, 0, this.now())
        : null;
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.store.get(code),
        now = this.now();
      if (!row || row.room.expiresAt < now)
        throw new RoomError("Lobby not found or expired.", 404);
      const room = row.room;
      this.simulation.advance(room, now);
      if (!room.sim) {
        room.players = room.players.filter(
          (p) => !p.left && now - p.lastSeen < ONLINE.disconnectMs,
        );
        room.players.forEach((p, i) => (p.slot = i));
      }
      const active = room.players.filter(
        (p) => !p.left && now - p.lastSeen < ONLINE.disconnectMs,
      );
      if (!active.some((p) => p.id === room.host))
        room.host = active[0]?.id ?? null;
      let player = room.players.find(
        (p) => p.secret === tokenHash && p.device === data.device && !p.left,
      );
      let issuedToken = null;
      if (action === "join" && !player) {
        this.validateDevice(data.device);
        if (room.sim)
          throw new RoomError(
            "This race has started. Join after the host starts a new lobby round.",
            409,
          );
        if (room.players.some((p) => p.device === data.device))
          throw new RoomError(
            "This device already has a player in the lobby.",
            409,
          );
        if (room.players.length >= ONLINE.maxPlayers)
          throw new RoomError("This lobby is full (4 players).", 409);
        player = { ...newPlayer, slot: room.players.length };
        room.players.push(player);
        room.host ??= player.id;
        issuedToken = newToken;
      }
      if (!player)
        throw new RoomError(
          "Your lobby session is no longer valid. Join again.",
          401,
        );
      player.lastSeen = now;
      if (action === "ready") {
        if (room.sim) throw new RoomError("The race is already running.", 409);
        player.ready = data.ready === true;
      } else if (action === "start") {
        if (room.host !== player.id)
          throw new RoomError("Only the host can start the race.", 403);
        if (!room.sim) {
          if (
            room.players.length < 2 ||
            !room.players.every((p) => p.ready && now - p.lastSeen < 5000)
          )
            throw new RoomError(
              "At least two players must be connected and ready.",
              409,
            );
          room.sim = this.simulation.create(room.players);
          room.lastStep = now;
          room.match++;
        }
      } else if (action === "input") {
        if (
          Number.isSafeInteger(data.sequence) &&
          data.sequence > player.sequence
        ) {
          player.sequence = data.sequence;
          player.input = cleanInput(data.input);
        }
      } else if (action === "leave") {
        player.left = true;
        player.input = { ...IDLE_INPUT, brakeAxis: 1, parked: true };
        const next = room.players.find((p) => !p.left);
        if (room.host === player.id) room.host = next?.id ?? null;
      } else if (action === "rematch") {
        if (room.host !== player.id)
          throw new RoomError("Only the host can start another round.", 403);
        if (room.sim?.race.phase !== "finished")
          throw new RoomError(
            "Finish the race before starting another round.",
            409,
          );
        room.players = room.players.filter(
          (p) => !p.left && now - p.lastSeen < ONLINE.disconnectMs,
        );
        room.players.forEach((p, i) => {
          p.slot = i;
          p.ready = false;
          p.input = { ...IDLE_INPUT };
        });
        room.sim = null;
      } else if (
        ![
          "poll",
          "join",
          "start",
          "ready",
          "input",
          "leave",
          "rematch",
        ].includes(action)
      )
        throw new RoomError("Unknown lobby action.", 404);
      room.expiresAt = now + ONLINE.roomExpiryMs;
      if (await this.store.compareAndSwap(code, row.revision, room)) {
        if (!["input", "poll"].includes(action))
          console.info(`[Online:${action}]`, {
            code,
            players: room.players.filter((p) => !p.left).length,
            slot: player.slot,
            phase: room.sim?.race.phase ?? "waiting",
          });
        return {
          ...this.view(room, player.id, now),
          revision: row.revision + 1,
          ...(issuedToken ? { token: issuedToken } : {}),
        };
      }
    }
    throw new RoomError("Lobby is busy. Reconnecting…", 503);
  }
  async authenticate(code, data) {
    const row = await this.store.get(code);
    if (!row || row.room.expiresAt < this.now())
      throw new RoomError("Lobby not found or expired.", 404);
    const secret = typeof data.token === "string" ? await hash(data.token) : "";
    const player = row.room.players.find(
      (p) => p.secret === secret && p.device === data.device && !p.left,
    );
    if (!player)
      throw new RoomError("Your lobby session is no longer valid.", 401);
    return player.id;
  }
  async tick(code) {
    for (let attempt = 0; attempt < 12; attempt++) {
      const row = await this.store.get(code);
      if (!row) return null;
      const now = this.now();
      if (row.room.expiresAt < now) return null;
      this.simulation.advance(row.room, now);
      if (!row.room.sim) {
        row.room.players = row.room.players.filter(
          (p) => !p.left && now - p.lastSeen < ONLINE.disconnectMs,
        );
        row.room.players.forEach((p, i) => (p.slot = i));
      }
      const active = row.room.players.filter(
        (p) => !p.left && now - p.lastSeen < ONLINE.disconnectMs,
      );
      if (!active.some((p) => p.id === row.room.host))
        row.room.host = active[0]?.id ?? null;
      if (await this.store.compareAndSwap(code, row.revision, row.room))
        return { ...row, revision: row.revision + 1 };
    }
    return null;
  }
  view(room, self, now) {
    return {
      code: room.code,
      host: room.host,
      self,
      serverTime: now,
      match: room.match,
      players: room.players.map((p) => ({
        id: p.id,
        name: p.name,
        slot: p.slot,
        color: CAR_COLORS[p.slot],
        carId: CAR_IDS[p.slot],
        ready: p.ready,
        connected: !p.left && now - p.lastSeen < 5000,
        left: p.left,
        sequence: p.id === self ? p.sequence : undefined,
      })),
      snapshot: room.sim ? this.simulation.snapshot(room.sim) : null,
    };
  }
}
