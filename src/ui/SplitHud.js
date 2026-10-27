import { formatTime } from "./Hud.js";
const place = (node, r) => {
  Object.assign(node.style, {
    left: `${r.x}px`,
    top: `${r.y}px`,
    width: `${r.width}px`,
    height: `${r.height}px`,
  });
};
export class SplitHud {
  constructor(track, onCamera) {
    this.track = track;
    this.onCamera = onCamera;
    this.root = document.getElementById("split-hud");
    this.panels = [];
  }
  configure(players, layout) {
    this.players = players;
    this.root.replaceChildren();
    this.panels = [];
    this.center = null;
    this.centerEntries = new Map();
    this.root.hidden = players.length === 1;
    if (players.length === 1) return;
    players.forEach((entry, i) => {
      const panel = document.createElement("section");
      panel.className = "player-hud";
      panel.setAttribute("aria-label", `Player ${i + 1} driving view`);
      panel.style.setProperty("--player-color", entry.color);
      panel.innerHTML = `<div class="player-heading"><span class="player-tag">P${i + 1}</span><div><strong>${entry.name}</strong><small data-key="controller"></small></div><button aria-label="Player ${i + 1} camera" class="player-camera">View <kbd>Y / Triangle</kbd></button></div><div class="player-position"><strong data-key="position"></strong><span data-key="lap"></span></div><div class="player-countdown" data-key="countdown"></div><div class="player-instruments"><div><b data-key="speed">000</b><small>KM/H</small></div><span class="player-gear" data-key="gear">1</span><div class="player-times"><span data-key="time"></span><small data-key="cue"></small></div></div>`;
      panel.querySelector(".player-camera").addEventListener("click", (e) => {
        this.onCamera(i);
        e.currentTarget.blur();
      });
      const refs = Object.fromEntries(
        [...panel.querySelectorAll("[data-key]")].map((n) => [
          n.dataset.key,
          n,
        ]),
      );
      this.root.append(panel);
      this.panels.push({ panel, refs });
    });
    if (layout.center) {
      this.center = document.createElement("section");
      this.center.className = "split-race-center";
      this.center.setAttribute("aria-label", "Shared race standings");
      this.center.innerHTML =
        '<span class="eyebrow">VALLE MOTOR PARK</span><h2>Race center.</h2><svg viewBox="0 0 220 220" aria-label="All cars on the circuit"><path class="center-track"/><g class="center-dots"></g></svg><div class="center-standings"></div>';
      const samples = this.track.getMapSamples(),
        project = (p) => [
          30 + ((p.x + 10) / 220) * 160,
          10 + ((p.z + 220) / 380) * 190,
        ];
      this.project = project;
      this.center
        .querySelector("path")
        .setAttribute(
          "d",
          samples
            .map((p, i) => `${i ? "L" : "M"}${project(p).join(",")}`)
            .join(" ") + "Z",
        );
      this.root.append(this.center);
    } else this.center = null;
    this.resize(layout);
  }
  resize(layout) {
    this.panels.forEach((p, i) => place(p.panel, layout.views[i]));
    if (this.center && layout.center) place(this.center, layout.center);
  }
  update(states, race, advice, status, cameras, paused, ready) {
    this.players.forEach((entry, i) => {
      const state = states[i],
        rank = race.entries.find((e) => e.id === entry.id),
        lap = entry.laps.getState(),
        refs = this.panels[i].refs,
        controller = status[i];
      refs.controller.textContent = controller?.keyboard
        ? "KEYBOARD"
        : controller?.connected
          ? `CONTROLLER ${controller.index + 1}`
          : "CONTROLLER NEEDED";
      refs.position.textContent = `POS ${rank.rank} / ${race.total}`;
      refs.lap.textContent = `LAP ${Math.min(race.laps, lap.laps + 1)} / ${race.laps}`;
      refs.speed.textContent = String(
        Math.round(state.speedMps * 3.6),
      ).padStart(3, "0");
      refs.gear.textContent =
        state.gear < 0 ? "R" : state.gear === 0 ? "N" : state.gear;
      refs.time.textContent = formatTime(lap.elapsed);
      refs.cue.textContent =
        rank.finishedAt !== null
          ? "FINISHED"
          : lap.wrongWay
            ? "WRONG WAY"
            : advice[i].level === "brake"
              ? `BRAKE / ${Math.round(advice[i].targetSpeed * 3.6)} KM/H`
              : advice[i].level === "caution"
                ? "EASE OFF"
                : ["CHASE", "HOOD", "CIRCUIT"][cameras[i].mode];
      refs.cue.dataset.line = advice[i].level;
      refs.countdown.textContent = !ready
        ? "CONNECT CONTROLLERS"
        : paused
          ? "PAUSED"
          : race.phase === "countdown"
            ? race.countdown
            : race.phase === "ready"
              ? controller?.keyboard
                ? "W TO START"
                : "RT / R2 TO START"
              : "";
      refs.countdown.classList.toggle(
        "large",
        race.phase === "countdown" && ready && !paused,
      );
    });
    if (this.center) {
      const dots = this.center.querySelector(".center-dots"),
        standings = this.center.querySelector(".center-standings");
      for (const entry of race.entries) {
        let nodes = this.centerEntries.get(entry.id);
        if (!nodes) {
          const dot = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle",
          );
          dot.setAttribute("r", "4");
          dot.setAttribute("fill", entry.color);
          dots.append(dot);
          const row = document.createElement("div");
          row.style.setProperty("--player-color", entry.color);
          standings.append(row);
          nodes = { dot, row };
          this.centerEntries.set(entry.id, nodes);
        }
        const p = this.project(entry.position);
        nodes.dot.setAttribute("cx", p[0]);
        nodes.dot.setAttribute("cy", p[1]);
        nodes.row.textContent = `${entry.rank}  ${entry.name}`;
        nodes.row.style.order = entry.rank;
      }
    }
  }
}
