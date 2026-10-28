import { unpackRoom } from "./SnapshotCodec.js";
import { ONLINE, IDLE_INPUT, cleanInput } from "./Protocol.js";
import { onlineServerUrl } from "./ServerConfig.js";
export class OnlineClient {
  constructor({
    fetcher = globalThis.fetch.bind(globalThis),
    storage = globalThis.localStorage,
    sessionStorage = globalThis.sessionStorage,
    serverUrl = onlineServerUrl(),
    Socket = globalThis.WebSocket,
  } = {}) {
    this.fetcher = fetcher;
    this.serverUrl = serverUrl;
    this.Socket = Socket;
    this.socket = null;
    this.streaming = false;
    this.reconnectTimer = null;
    this.streamTimer = null;
    this.reconnectDelay = 500;
    this.storage = storage;
    this.sessionStorage = sessionStorage;
    this.device = storage.getItem("racer-device") || crypto.randomUUID();
    storage.setItem("racer-device", this.device);
    this.session = null;
    this.room = null;
    this.sequence = 0;
    this.generation = 0;
    this.timer = null;
    this.input = { ...IDLE_INPUT };
    this.revision = -1;
    this.latency = 0;
  }
  setInput(input) {
    this.input = cleanInput(input);
  }
  async api(path, extra = {}, session = this.session) {
    const started = performance.now(),
      controller = new AbortController(),
      timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await this.fetcher(
        `${this.serverUrl}/api/online/rooms${path}`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            device: this.device,
            ...(session ? { token: session.token } : {}),
            ...extra,
          }),
          signal: controller.signal,
          cache: "no-store",
        },
      );
      const data = await response.json();
      if (!response.ok) {
        const error = new Error(data.error || "Could not reach the lobby.");
        error.status = response.status;
        throw error;
      }
      const rtt = performance.now() - started;
      this.latency = this.latency ? this.latency * 0.7 + rtt * 0.3 : rtt;
      return { data, rtt, sentAt: started };
    } catch (error) {
      if (error.name === "AbortError")
        throw new Error("Connection delayed. Reconnecting…");
      if (error instanceof SyntaxError || error instanceof TypeError)
        throw new Error(
          "Could not reach online racing. Offline racing is still available.",
        );
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
  accept(result) {
    if (result.data.revision < this.revision) return;
    this.revision = result.data.revision;
    this.room = result.data;
    if (this.connectionStatus !== "connected") {
      this.connectionStatus = "connected";
      this.onStatus?.("connected");
    }
    this.onRoom?.(result.data, result);
  }
  async connect(action, name, code = "") {
    if (this.session) await this.leave();
    this.revision = -1;
    this.generation++;
    let saved;
    try {
      saved = JSON.parse(
        this.sessionStorage.getItem("racer-online-session") || "null",
      );
    } catch {
      this.sessionStorage.removeItem("racer-online-session");
    }
    const resume = action === "join" && saved?.code === code ? saved : null;
    const result = await this.api(
      action === "create" ? "" : `/${code}/join`,
      { name },
      resume,
    );
    this.session = {
      code: result.data.code,
      token: result.data.token ?? resume?.token,
    };
    this.sequence = Math.max(
      0,
      (result.data.players.find((p) => p.id === result.data.self)?.sequence ??
        0) + 1,
    );
    this.sessionStorage.setItem(
      "racer-online-session",
      JSON.stringify(this.session),
    );
    this.accept(result);
    this.openStream(this.generation);
    this.poll(this.generation);
  }
  async resume() {
    let saved;
    try {
      saved = JSON.parse(
        this.sessionStorage.getItem("racer-online-session") || "null",
      );
    } catch {
      this.sessionStorage.removeItem("racer-online-session");
    }
    if (!saved) return false;
    const result = await this.api(`/${saved.code}/poll`, {}, saved);
    this.session = saved;
    this.generation++;
    this.revision = -1;
    this.sequence =
      (result.data.players.find((p) => p.id === result.data.self)?.sequence ??
        0) + 1;
    this.accept(result);
    this.openStream(this.generation);
    this.poll(this.generation);
    return true;
  }
  async poll(generation) {
    if (generation !== this.generation || !this.session) return;
    let delay = this.streaming
      ? ONLINE.lobbyMs
      : this.room?.snapshot
        ? ONLINE.inputMs
        : ONLINE.lobbyMs;
    if (this.streaming) {
      this.timer = setTimeout(() => this.poll(generation), ONLINE.lobbyMs);
      return;
    }
    try {
      const playing = !!this.room?.snapshot;
      const result = await this.api(
        `/${this.session.code}/${playing ? "input" : "poll"}`,
        playing ? { input: this.input, sequence: ++this.sequence } : {},
      );
      if (generation !== this.generation) return;
      this.accept(result);
    } catch (error) {
      if (generation !== this.generation) return;
      this.onStatus?.("reconnecting");
      this.onError?.(error);
      delay = 1200;
      if ([401, 404, 410].includes(error.status)) {
        this.clearSession();
        return;
      }
    }
    if (generation === this.generation)
      this.timer = setTimeout(() => this.poll(generation), delay);
  }
  openStream(generation) {
    if (!this.Socket || !this.session || generation !== this.generation) return;
    const endpoint = new URL(
      `${this.serverUrl}/api/online/socket`,
      globalThis.location?.origin || "http://localhost",
    );
    endpoint.protocol = endpoint.protocol === "https:" ? "wss:" : "ws:";
    const socket = new this.Socket(endpoint.href);
    this.socket = socket;
    socket.onopen = () => {
      if (generation !== this.generation) {
        socket.close();
        return;
      }
      socket.send(
        JSON.stringify({
          type: "auth",
          protocol: 2,
          ...this.session,
          device: this.device,
        }),
      );
    };
    socket.onmessage = ({ data }) => {
      if (generation !== this.generation) return;
      try {
        const message = JSON.parse(data);
        if (message.type === "state" || message.type === "frame") {
          if (!this.streaming) {
            this.streaming = true;
            this.reconnectDelay = 500;
            let lastPing = -Infinity;
            this.streamTimer = setInterval(() => {
              if (socket.readyState !== 1 || generation !== this.generation)
                return;
              socket.send(
                JSON.stringify({
                  type: "input",
                  sequence: ++this.sequence,
                  input: this.input,
                }),
              );
              if (performance.now() - lastPing > 2000) {
                lastPing = performance.now();
                socket.send(JSON.stringify({ type: "ping", at: lastPing }));
              }
            }, 50);
          }
          this.accept({
            data: unpackRoom(message.room),
            rtt: this.latency,
            sentAt: performance.now() - this.latency,
            frameTime:
              this.clockOffset === undefined
                ? performance.now() - this.latency / 2
                : message.room.serverTime - this.clockOffset,
          });
        } else if (message.type === "pong" && Number.isFinite(message.at)) {
          const rtt = performance.now() - message.at;
          this.streamLatency = this.streamLatency
            ? this.streamLatency * 0.7 + rtt * 0.3
            : rtt;
          this.latency = this.streamLatency;
          if (Number.isFinite(message.serverTime) && rtt < 1000) {
            const offset = message.serverTime - (performance.now() - rtt / 2);
            if (
              this.clockOffset === undefined ||
              rtt <= (this.bestRtt ?? Infinity) * 1.25
            )
              this.clockOffset = offset;
            this.bestRtt = Math.min(this.bestRtt ?? Infinity, rtt);
          }
        }
      } catch {
        this.onError?.(new Error("Invalid server update. Reconnecting…"));
        socket.close();
      }
    };
    socket.onerror = () => {};
    socket.onclose = ({ code, reason }) => {
      if (generation !== this.generation) return;
      this.streaming = false;
      clearInterval(this.streamTimer);
      if (code === 1000 && reason === "Session resumed elsewhere") {
        this.clearSession();
        this.onError?.(new Error("This player reconnected in another tab."));
        return;
      }
      this.onStatus?.("reconnecting");
      this.reconnectTimer = setTimeout(
        () => this.openStream(generation),
        this.reconnectDelay,
      );
      this.reconnectDelay = Math.min(5000, this.reconnectDelay * 2);
    };
  }
  async action(action, data = {}) {
    if (!this.session) return;
    const generation = this.generation,
      result = await this.api(`/${this.session.code}/${action}`, data);
    if (generation === this.generation) this.accept(result);
  }
  clearSession() {
    this.generation++;
    clearTimeout(this.timer);
    clearTimeout(this.reconnectTimer);
    clearInterval(this.streamTimer);
    this.streaming = false;
    this.connectionStatus = null;
    this.clockOffset = undefined;
    this.bestRtt = undefined;
    this.streamLatency = undefined;
    this.socket?.close();
    this.socket = null;
    this.session = null;
    this.room = null;
    this.sessionStorage.removeItem("racer-online-session");
  }
  async leave() {
    const session = this.session;
    this.setInput({ ...IDLE_INPUT, brakeAxis: 1 });
    this.clearSession();
    if (session)
      try {
        await this.api(`/${session.code}/leave`, {}, session);
      } catch {}
  }
}
