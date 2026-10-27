const $ = (id) => document.getElementById(id);
export function formatTime(time) {
  if (time === null) return "--:--.---";
  return `${Math.floor(time / 60)}:${(time % 60).toFixed(3).padStart(6, "0")}`;
}
export class Hud {
  constructor(track) {
    this.track = track;
    this.lastSpeed = 0;
    this.drawMap();
    $("track-length").textContent = (track.length / 1000).toFixed(2);
  }
  bindRace(race) {
    const body = $("standings-body"),
      dots = $("map-opponents");
    body.replaceChildren();
    dots.replaceChildren();
    for (const entry of race.entries) {
      const row = document.createElement("div");
      row.className = "standing-row";
      row.id = `standing-${entry.id}`;
      row.innerHTML = `<span class="standing-rank">${entry.rank}</span><i style="background:${entry.color}"></i><strong>${entry.name}</strong><small>${entry.isPlayer ? "YOU" : "AI"}</small>`;
      body.append(row);
      if (!entry.isPlayer) {
        const dot = document.createElementNS(
          "http://www.w3.org/2000/svg",
          "circle",
        );
        dot.setAttribute("r", "3");
        dot.setAttribute("fill", entry.color);
        dot.id = `map-${entry.id}`;
        dots.append(dot);
      }
    }
  }
  bindTuning(car) {
    const controls = [
      ["tuneBrakeBias", "valBrakeBias", "brakeBiasFront"],
      ["tuneWtLong", "valWtLong", "weightTransferLong"],
      ["tuneWtLat", "valWtLat", "weightTransferLat"],
      ["tuneRearDrop", "valRearDrop", "rearGripDrop"],
      ["tuneSuspension", "valSuspension", "suspensionStiffness"],
      ["tuneFrontGrip", "valFrontGrip", "frontGrip"],
    ];
    const initial = car.getDebugState();
    for (const [id, value, key] of controls) {
      $(id).value = initial[key];
      $(value).textContent = initial[key].toFixed(
        key === "suspensionStiffness" ? 0 : 2,
      );
      $(id).addEventListener("input", (e) => {
        const tune = { [key]: Number(e.target.value) };
        car.setTuning(tune);
        $(value).textContent = Number(e.target.value).toFixed(
          key === "suspensionStiffness" ? 0 : 2,
        );
        console.info("[Tune:update]", tune);
      });
      $(id).addEventListener("change", (e) => e.target.blur());
    }
  }
  drawMap() {
    const samples = this.track.getMapSamples();
    this.mapBounds = { minX: -10, minZ: -220, width: 220, height: 380 };
    const project = (p) => [
      ((p.x + 10) / 220) * 160 + 30,
      ((p.z + 220) / 380) * 190 + 10,
    ];
    this.project = project;
    const d =
      samples
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${project(p)
              .map((n) => n.toFixed(1))
              .join(",")}`,
        )
        .join(" ") + "Z";
    $("map-road").setAttribute("d", d);
    $("map-edge").setAttribute("d", d);
    const p = project(this.track.getStartPoint());
    $("map-start").setAttribute("cx", p[0]);
    $("map-start").setAttribute("cy", p[1]);
  }
  update(state, lap, input, dt, paused, camera, race, advice) {
    const speed = Math.round(state.speedMps * 3.6);
    $("speed").textContent = String(speed).padStart(3, "0");
    $("gear").textContent =
      state.gear < 0 ? "R" : state.gear === 0 ? "N" : state.gear;
    $("rev").textContent = state.engine.rpm;
    $("gearbox").textContent = state.engine.automatic ? "AUTO" : "MANUAL";
    $("shiftCue").classList.toggle("on", state.engine.shouldShiftUp);
    document
      .querySelectorAll(".rev-light")
      .forEach((e, i) =>
        e.classList.toggle("on", i < state.engine.normalized * 12),
      );
    $("throttle-fill").style.height = `${input.throttleAxis * 100}%`;
    $("brake-fill").style.height = `${input.brakeAxis * 100}%`;
    $("lap").textContent = formatTime(lap.elapsed);
    $("laps").textContent =
      `${Math.min(race.laps, lap.laps + 1)} / ${race.laps}`;
    $("best").textContent = formatTime(lap.best);
    $("last-lap").textContent = lap.last
      ? formatTime(lap.last.time)
      : "--:--.---";
    $("lap-status").textContent = !lap.started
      ? "OUT LAP"
      : !lap.valid
        ? "LAP INVALID"
        : lap.wrongWay
          ? "WRONG WAY"
          : "CLUB RACE";
    $("lap-status").classList.toggle("invalid", !lap.valid || lap.wrongWay);
    $("surface").textContent = state.surface.toUpperCase();
    $("surface").classList.toggle(
      "offtrack",
      !["asphalt", "curb"].includes(state.surface),
    );
    const g =
      Math.hypot(
        state.driveForce / 1180,
        state.speedForward * state.angularVelocity.y,
      ) / 9.81;
    $("gforce").textContent = `${g.toFixed(2)} G`;
    $("pause-screen").hidden = !paused;
    $("camera-label").textContent = ["CHASE", "HOOD", "CIRCUIT"][camera];
    $("intro").classList.toggle("driving", race.phase !== "ready");
    $("race-panel").hidden = race.phase === "ready";
    $("race-position").textContent = `${race.position} / ${race.total}`;
    $("race-state").textContent =
      race.phase === "finished" ? "FINISHED" : "LIVE STANDINGS";
    for (const entry of race.entries) {
      const row = $(`standing-${entry.id}`);
      row.style.order = entry.rank;
      row.querySelector(".standing-rank").textContent = entry.rank;
      row.classList.toggle("you", entry.isPlayer);
      if (!entry.isPlayer) {
        const point = this.project(entry.position);
        const dot = $(`map-${entry.id}`);
        dot.setAttribute("cx", point[0]);
        dot.setAttribute("cy", point[1]);
      }
    }
    const p = this.project(state.position);
    $("map-car").setAttribute("transform", `translate(${p[0]},${p[1]})`);
    const near = this.track.nearest(state.position);
    $("sector").textContent =
      `S${Math.min(3, 1 + Math.floor(near.progress * 3))}`;
    const ahead = this.track.sampleAhead(
        near,
        Math.max(25, state.speedMps * 2),
      ),
      turn = near.tx * ahead.tz - near.tz * ahead.tx;
    $("corner-cue").textContent = lap.wrongWay
      ? "Turn around to follow the circuit"
      : Math.abs(turn) > 0.22
        ? (turn < 0 ? "RIGHT" : "LEFT") + " AHEAD / BRAKE EARLY"
        : "Find your rhythm. Follow the line.";
    const cue = $("corner-cue");
    if (race.phase === "ready")
      cue.textContent = "Throttle to start / 3 lap race";
    else if (race.phase === "countdown")
      cue.textContent = `LIGHTS OUT IN ${race.countdown}`;
    else if (race.phase === "finished")
      cue.textContent = `P${race.position} / FINISHED. R to race again.`;
    else if (!lap.wrongWay && advice.level !== "safe")
      cue.textContent = `${advice.level === "brake" ? "BRAKE" : "EASE OFF"} / ${Math.round(advice.targetSpeed * 3.6)} KM/H`;
    cue.dataset.line = advice.level;
    $("speed-ring").style.setProperty(
      "--rpm",
      `${state.engine.normalized * 100}%`,
    );
  }
}
