import { OnlineClient } from "./OnlineClient.js";
import { SnapshotBuffer } from "./SnapshotBuffer.js";
import { OnlineLobby } from "../ui/OnlineLobby.js";
import { IDLE_INPUT } from "./Protocol.js";
import { VEHICLE } from "../physics/VehicleConfig.js";

class CameraCar {
  constructor(car) {
    this.car = car;
    this.pose = null;
  }
  get mesh() {
    return this.car.mesh;
  }
  getPose() {
    return this.pose ?? this.car.getPose();
  }
  setVisible(value) {
    this.car.setVisible(value);
  }
}
export class OnlineRace {
  constructor({ world, race, track, views, hud, onEnter, onExit, onMenu }) {
    Object.assign(this, {
      world,
      race,
      track,
      views,
      hud,
      onEnter,
      onExit,
      onMenu,
    });
    this.client = new OnlineClient();
    this.buffer = new SnapshotBuffer();
    this.active = false;
    this.match = -1;
    this.accumulator = 0;
    this.offset = { x: 0, y: 0, z: 0 };
    this.lobby = new OnlineLobby({
      create: (name) => this.client.connect("create", name),
      join: (name, code) => this.client.connect("join", name, code),
      ready: (ready) => this.client.action("ready", { ready }),
      start: () => this.client.action("start"),
      rematch: () => this.client.action("rematch"),
      leave: () => this.leave(),
      offline: () => this.leave(),
    });
    this.client.onRoom = (room, timing) => this.receive(room, timing);
    this.client.onStatus = (status) => {
      if (status === "connected" && this.status === "reconnecting")
        this.lobby.message("");
      this.status = status;
      this.lobby.render(this.room, status);
    };
    this.client.onError = (error) => {
      this.lobby.message(error.message);
      if ([401, 404, 410].includes(error.status)) {
        this.leave();
      }
    };
    this.client.resume().catch(() => {
      this.client.clearSession();
    });
    if (new URL(location.href).searchParams.has("room")) this.open();
  }
  get visible() {
    return this.lobby.visible;
  }
  open() {
    this.lobby.show();
    this.onMenu();
  }
  async leave() {
    this.active = false;
    this.room = null;
    this.match = -1;
    this.hudSignature = "";
    const url = new URL(location.href);
    url.searchParams.delete("room");
    history.replaceState(null, "", url);
    this.lobby.render(null);
    this.lobby.hide();
    this.client.leave();
    this.onExit();
  }
  closeMenu() {
    this.lobby.hide();
    this.onMenu(false);
  }
  setIdle() {
    this.client.setInput({ ...IDLE_INPUT, brakeAxis: 1, parked: true });
  }
  reset() {
    if (this.room?.snapshot?.race.phase === "finished")
      this.client.action("rematch").catch((e) => this.lobby.message(e.message));
  }
  receive(room, timing) {
    if (!this.active) {
      this.onEnter();
      this.active = true;
      this.lobby.show();
    }
    const priorPhase = this.room?.snapshot?.race.phase;
    this.room = room;
    this.status = "connected";
    const url = new URL(location.href);
    if (url.searchParams.get("room") !== room.code) {
      url.searchParams.set("room", room.code);
      history.replaceState(null, "", url);
    }
    const self = room.players.find((p) => p.id === room.self);
    if (!self) return;
    const entry = this.race.entries.find((e) => e.id === self.carId);
    if (!this.cameraCar || this.cameraCar.car !== entry.car) {
      this.cameraCar = new CameraCar(entry.car);
      this.views.configure([{ car: this.cameraCar }], "side");
      this.views.resize(innerWidth, innerHeight);
    }
    this.own = entry;
    if (room.match !== this.match) {
      this.match = room.match;
      this.buffer.clear();
      this.offset = { x: 0, y: 0, z: 0 };
      this.accumulator = 0;
      this.views.reset();
    }
    if (room.snapshot) {
      const before = this.cameraCar.getPose();
      for (const remote of room.snapshot.cars)
        this.race.entries
          .find((e) => e.id === remote.id)
          .car.restoreState(remote.physics);
      // Predict the short return journey, then blend only the presentation correction.
      const advance = Math.min(0.1, timing.rtt / 2000);
      if (room.snapshot.race.phase === "racing")
        for (let i = 0; i < Math.floor(advance / VEHICLE.fixedStep); i++)
          this.predict(this.client.input, VEHICLE.fixedStep);
      const after = this.own.car.getPose(),
        distance = Math.hypot(before.x - after.x, before.z - after.z);
      this.offset =
        distance < 6
          ? {
              x: before.x - after.x,
              y: before.y - after.y,
              z: before.z - after.z,
            }
          : { x: 0, y: 0, z: 0 };
      this.buffer.push(room.snapshot.cars, performance.now() - timing.rtt / 2);
      if (!priorPhase || priorPhase === "waiting") {
        this.lobby.hide();
        this.onMenu(false);
      }
      if (room.snapshot.race.phase === "finished" && priorPhase !== "finished")
        this.lobby.show();
      const view = this.raceView(room.snapshot),
        signature = view.entries
          .map((e) => `${e.id}:${e.name}:${e.isPlayer}`)
          .join("|");
      if (signature !== this.hudSignature) {
        this.hud.bindRace(view);
        this.hudSignature = signature;
      }
    } else this.lobby.show();
    this.lobby.render(room, this.status);
    document.getElementById("online-connection").hidden = false;
    document.getElementById("online-connection").textContent =
      `${room.code} · ${Math.round(this.client.latency)} ms`;
  }
  raceView(snapshot) {
    return {
      ...snapshot.race,
      position:
        snapshot.race.entries.find((e) => e.id === this.own.id)?.rank ?? 1,
      entries: snapshot.race.entries.map((e) => ({
        ...e,
        online: e.isPlayer,
        isPlayer: e.id === this.own.id,
        position: snapshot.cars.find((c) => c.id === e.id).state.position,
      })),
    };
  }
  predict(input, dt) {
    const p = this.own.car.getPosition();
    this.own.car.updatePhysics(
      input,
      dt,
      this.track.getSurface(p),
      this.track.terrain.getHeight(p.x, p.z),
    );
    this.world.step(dt);
  }
  tick(dt, input, paused) {
    if (!this.own) return;
    const stopped = paused || this.visible || this.status !== "connected";
    const controls = stopped
      ? { ...IDLE_INPUT, brakeAxis: 1, parked: true }
      : input;
    this.client.setInput(controls);
    if (performance.now() - (this.lastTelemetry ?? 0) > 1500) {
      this.lastTelemetry = performance.now();
      console.info("[Online:telemetry]", {
        code: this.room?.code,
        car: this.own.id,
        phase: this.room?.snapshot?.race.phase ?? "waiting",
        speedKmh: Math.round(this.own.car.getDebugState().speedMps * 3.6),
        input: controls,
        rttMs: Math.round(this.client.latency),
      });
    }
    const snapshot = this.room?.snapshot;
    if (snapshot) {
      if (["racing", "finished"].includes(snapshot.race.phase)) {
        this.accumulator += dt;
        while (this.accumulator >= VEHICLE.fixedStep) {
          this.predict(controls, VEHICLE.fixedStep);
          this.accumulator -= VEHICLE.fixedStep;
        }
      }
      const decay = Math.exp(-dt * 12);
      for (const key of ["x", "y", "z"]) this.offset[key] *= decay;
      const ownPose = this.own.car.getPose();
      this.cameraCar.pose = {
        ...ownPose,
        x: ownPose.x + this.offset.x,
        y: ownPose.y + this.offset.y,
        z: ownPose.z + this.offset.z,
      };
      for (const entry of this.race.entries)
        entry.car.syncVisuals(
          dt,
          entry === this.own
            ? this.cameraCar.pose
            : this.buffer.pose(entry.id, performance.now()),
        );
      const state = this.own.car.getDebugState(),
        authoritative = snapshot.cars.find((c) => c.id === this.own.id),
        advice = this.track.getLineAdvice(
          state.position,
          state.speedMps,
          state.frontGrip,
        );
      this.views.render(dt, [state]);
      this.hud.update(
        state,
        authoritative.lap,
        input,
        dt,
        paused,
        this.views.cameras[0].mode,
        this.raceView(snapshot),
        advice,
      );
    } else {
      for (const entry of this.race.entries) entry.car.syncVisuals(0);
      this.views.render(dt, [this.own.car.getDebugState()]);
    }
  }
}
