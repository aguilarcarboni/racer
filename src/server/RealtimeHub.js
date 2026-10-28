import { WebSocketServer } from "ws";
import { cleanInput } from "../online/Protocol.js";
export class RealtimeHub {
  constructor(service, store, { allowedOrigins = [] } = {}) {
    this.service = service;
    this.store = store;
    this.allowedOrigins = allowedOrigins;
    this.peers = new Set();
    this.busy = false;
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
          this.send(peer, { type: "pong", at: message.at });
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
    if (peer.socket.readyState === 1 && peer.socket.bufferedAmount < 256000)
      peer.socket.send(JSON.stringify(value));
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
                ...this.service.view(row.room, peer.member, Date.now()),
                revision: row.revision,
              },
            });
          }
      }
    } catch (error) {
      console.error("[Online:stream-error]", error.message);
    } finally {
      this.busy = false;
      if (performance.now() - (this.lastTelemetry ?? 0) > 3000) {
        this.lastTelemetry = performance.now();
        console.info("[Online:stream]", {
          peers: this.peers.size,
          tickMs: Math.round(performance.now() - started),
          maxBufferedBytes: Math.max(
            0,
            ...[...this.peers].map((p) => p.socket.bufferedAmount),
          ),
        });
      }
    }
  }
  close() {
    clearInterval(this.timer);
    for (const p of this.peers) p.socket.close();
    this.sockets.close();
  }
}
