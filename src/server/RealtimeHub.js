import { WebSocketServer } from "ws";
import { packRoom } from "../online/SnapshotCodec.js";
import { cleanInput } from "../online/Protocol.js";
export class RealtimeHub {
  constructor(service, store, { allowedOrigins = [] } = {}) {
    this.service = service;
    this.store = store;
    this.allowedOrigins = allowedOrigins;
    this.peers = new Set();
    this.busy = false;
    this.lobbySentAt = new Map();
    this.sockets = new WebSocketServer({
      noServer: true,
      maxPayload: 4096,
      perMessageDeflate: false,
    });
    this.sockets.on("connection", (socket) => this.connect(socket));
    this.timer = setInterval(() => this.broadcast(), 50);
    this.timer.unref?.();
  }
  attach(server) {
    server.on("upgrade", (request, socket, head) => {
      if (!request.url?.startsWith("/api/online/socket")) return;
      const origin = request.headers.origin,
        own = `http://${request.headers.host}`;
      if (origin && origin !== own && !this.allowedOrigins.includes(origin)) {
        socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
        socket.destroy();
        return;
      }
      this.sockets.handleUpgrade(request, socket, head, (ws) =>
        this.sockets.emit("connection", ws, request),
      );
    });
  }
  connect(socket) {
    const peer = {
      socket,
      member: null,
      code: null,
      received: 0,
      window: Date.now(),
    };
    this.peers.add(peer);
    const authTimeout = setTimeout(() => {
      if (!peer.member) socket.close(1008, "Session required");
    }, 5000);
    authTimeout.unref?.();
    socket.on("message", async (raw) => {
      try {
        if (Date.now() - peer.window > 1000) {
          peer.window = Date.now();
          peer.received = 0;
        }
        if (++peer.received > 90) {
          socket.close(1008, "Too many updates");
          return;
        }
        const message = JSON.parse(raw.toString());
        if (!peer.member) {
          if (message.type !== "auth") throw new Error("Session required");
          peer.protocol = message.protocol === 2 ? 2 : 1;
          peer.member = await this.service.authenticate(message.code, message);
          peer.code = message.code;
          clearTimeout(authTimeout);
          for (const old of this.peers)
            if (
              old !== peer &&
              old.code === peer.code &&
              old.member === peer.member
            )
              old.socket.close(1000, "Session resumed elsewhere");
          const row = await this.store.get(peer.code);
          this.send(peer, {
            type: "state",
            room: {
              ...this.service.view(row.room, peer.member, Date.now()),
              revision: row.revision,
            },
          });
        } else if (message.type === "input") {
          if (
            !this.store.setControls(
              peer.code,
              peer.member,
              message.sequence,
              cleanInput(message.input),
              Date.now(),
            )
          )
            socket.close(1008, "Session ended");
        } else if (message.type === "ping")
          this.send(peer, {
            type: "pong",
            at: message.at,
            serverTime: Date.now(),
          });
      } catch {
        socket.close(1008, "Invalid session or update");
      }
    });
    socket.on("close", () => {
      clearTimeout(authTimeout);
      this.peers.delete(peer);
      if (
        peer.member &&
        ![...this.peers].some(
          (p) =>
            p.member === peer.member &&
            p.code === peer.code &&
            p.socket.readyState === 1,
        )
      )
        this.store.park(peer.code, peer.member, Date.now());
    });
    socket.on("error", () => socket.close());
  }
  send(peer, value) {
    if (peer.socket.readyState === 1 && peer.socket.bufferedAmount < 16000)
      peer.socket.send(
        JSON.stringify(
          value.type === "state" && peer.protocol === 2
            ? { type: "frame", room: packRoom(value.room) }
            : value,
        ),
      );
  }
  async broadcast() {
    if (this.busy || !this.peers.size) return;
    this.busy = true;
    const started = performance.now();
    try {
      for (const code of new Set(
        [...this.peers].filter((p) => p.member).map((p) => p.code),
      )) {
        const row = await this.service.tick(code);
        if (!row) {
          for (const peer of this.peers)
            if (peer.code === code) peer.socket.close(1008, "Lobby expired");
          continue;
        }
        if (
          !row.room.sim &&
          Date.now() - (this.lobbySentAt.get(code) ?? 0) < 500
        )
          continue;
        this.lobbySentAt.set(code, Date.now());
        const snapshot = row.room.sim
          ? this.service.simulation.snapshot(row.room.sim)
          : null;
        for (const peer of this.peers)
          if (peer.code === code && peer.member) {
            if (
              !row.room.players.some((p) => p.id === peer.member && !p.left)
            ) {
              peer.socket.close(1000, "Left lobby");
              continue;
            }
            this.send(peer, {
              type: "state",
              room: {
                ...this.service.view(
                  row.room,
                  peer.member,
                  Date.now(),
                  snapshot,
                ),
                revision: row.revision,
              },
            });
          }
      }
    } catch (error) {
      console.error("[Online:stream-error]", error.message);
    } finally {
      this.busy = false;
      this.tickSamples ??= [];
      this.tickSamples.push(performance.now() - started);
      if (performance.now() - (this.lastTelemetry ?? 0) > 3000) {
        this.lastTelemetry = performance.now();
        console.info("[Online:stream]", {
          peers: this.peers.size,
          tickMs: Math.round(performance.now() - started),
          p95TickMs: Math.round(
            this.tickSamples.slice().sort((a, b) => a - b)[
              Math.floor(this.tickSamples.length * 0.95)
            ],
          ),
          maxTickMs: Math.round(Math.max(...this.tickSamples)),
          maxBufferedBytes: Math.max(
            0,
            ...[...this.peers].map((p) => p.socket.bufferedAmount),
          ),
        });
        this.tickSamples = [];
      }
    }
  }
  close() {
    clearInterval(this.timer);
    for (const p of this.peers) p.socket.close();
    this.sockets.close();
  }
}
