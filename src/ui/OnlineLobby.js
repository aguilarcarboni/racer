export class OnlineLobby {
  constructor(actions) {
    this.root = document.getElementById("online-lobby");
    this.actions = actions;
    this.room = null;
    this.busy = false;
    this.name = document.getElementById("online-name");
    this.name.value = localStorage.getItem("racer-name") || "Racer";
    const code = new URL(location.href).searchParams.get("room");
    if (code)
      document.getElementById("online-code").value = code
        .toUpperCase()
        .slice(0, 6);
    const run = (fn) => async () => {
      if (this.busy) return;
      this.busy = true;
      this.message("");
      this.render(this.room);
      try {
        localStorage.setItem("racer-name", this.name.value);
        await fn();
      } catch (error) {
        this.message(error.message);
      } finally {
        this.busy = false;
        this.render(this.room);
      }
    };
    document
      .getElementById("online-code")
      .addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          document.getElementById("online-join").click();
        }
      });
    this.name.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        document.getElementById("online-create").click();
      }
    });
    document.getElementById("online-create").onclick = run(() =>
      actions.create(this.name.value),
    );
    document.getElementById("online-join").onclick = run(() =>
      actions.join(
        this.name.value,
        document.getElementById("online-code").value.trim().toUpperCase(),
      ),
    );
    document.getElementById("online-ready").onclick = run(() =>
      actions.ready(
        !this.room?.players.find((p) => p.id === this.room.self)?.ready,
      ),
    );
    document.getElementById("online-start").onclick = run(() =>
      actions.start(),
    );
    document.getElementById("online-rematch").onclick = run(() =>
      actions.rematch(),
    );
    document.getElementById("online-leave").onclick = () => actions.leave();
    document.getElementById("online-offline").onclick = () => actions.offline();
    document.getElementById("online-watch").onclick = () => this.hide();
    document.getElementById("online-copy").onclick = async () => {
      try {
        await navigator.clipboard.writeText(
          `${location.origin}/?room=${this.room.code}`,
        );
        this.message("Invite link copied.");
      } catch {
        this.message(`Share lobby code ${this.room.code}.`);
      }
    };
    this.root.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const controls = [
          ...this.root.querySelectorAll(
            "button:not(:disabled),input:not(:disabled)",
          ),
        ].filter((n) => n.getClientRects().length),
        first = controls[0],
        last = controls.at(-1);
      if (
        event.shiftKey &&
        (document.activeElement === first ||
          document.activeElement.id === "online-title")
      ) {
        event.preventDefault();
        last?.focus();
      }
      if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    });
  }
  get visible() {
    return !this.root.hidden;
  }
  show() {
    const wasHidden = this.root.hidden;
    this.root.hidden = false;
    if (wasHidden) document.getElementById("online-title").focus();
  }
  hide() {
    this.root.hidden = true;
    document.getElementById("app").focus();
  }
  message(message) {
    document.getElementById("online-message").textContent = message;
  }
  render(room, status = "connected") {
    this.room = room;
    const signature = JSON.stringify([
      this.busy,
      status,
      room?.code,
      room?.host,
      room?.self,
      room?.players.map(({ sequence, ...player }) => player),
      room?.snapshot?.race.phase,
      room?.snapshot?.race.phase === "finished"
        ? room.snapshot.race.entries
        : null,
    ]);
    if (signature === this.renderSignature) return;
    this.renderSignature = signature;
    document.getElementById("online-entry").hidden = !!room;
    document.getElementById("online-room").hidden = !room;
    document.getElementById("online-create").disabled = this.busy;
    document.getElementById("online-join").disabled = this.busy;
    if (!room) return;
    const self = room.players.find((p) => p.id === room.self),
      phase = room.snapshot?.race.phase ?? "waiting",
      host = room.host === room.self;
    document.getElementById("online-room-code").textContent = room.code;
    document.getElementById("online-roster").replaceChildren(
      ...room.players.map((p) => {
        const row = document.createElement("div");
        row.className = "online-player";
        row.style.setProperty("--player-color", p.color);
        const name = document.createElement("strong");
        name.textContent = p.name + (p.id === room.self ? " (you)" : "");
        const tag = document.createElement("span");
        tag.textContent = p.left
          ? "Left race"
          : !p.connected
            ? "Reconnecting"
            : p.id === room.host
              ? `Host · ${p.ready ? "Ready" : "Not ready"}`
              : p.ready
                ? "Ready"
                : "Not ready";
        row.append(name, tag);
        return row;
      }),
    );
    const ready = document.getElementById("online-ready"),
      start = document.getElementById("online-start");
    ready.hidden = phase !== "waiting";
    ready.textContent = self?.ready ? "Ready ✓" : "I'm ready";
    ready.setAttribute("aria-pressed", String(!!self?.ready));
    ready.disabled = this.busy;
    start.hidden = phase !== "waiting" || !host;
    start.disabled =
      this.busy ||
      room.players.length < 2 ||
      !room.players.every((p) => p.ready && p.connected && !p.left);
    document.getElementById("online-rematch").hidden =
      phase !== "finished" || !host;
    document.getElementById("online-watch").hidden = phase === "waiting";
    document.getElementById("online-room-status").textContent =
      status !== "connected"
        ? "Connection interrupted. Reconnecting…"
        : phase === "waiting"
          ? `${room.players.length} / 4 players · ${host ? "Start when everyone is ready" : "Waiting for the host"}`
          : phase === "finished"
            ? "Race finished. Host can start another round."
            : "Race in progress. Your car brakes while this menu is open.";
    const results = document.getElementById("online-results");
    results.hidden = phase !== "finished";
    results.replaceChildren();
    if (phase === "finished")
      for (const entry of room.snapshot.race.entries) {
        const line = document.createElement("div");
        line.textContent = `P${entry.rank}  ${entry.name}  ${entry.dnf ? "DNF" : entry.finishedAt !== null ? entry.finishedAt.toFixed(2) + " s" : "Racing"}`;
        results.append(line);
      }
  }
}
