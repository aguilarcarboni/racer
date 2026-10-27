import * as THREE from "three";
import * as CANNON from "cannon-es";
import { RaceField } from "../racing/RaceField.js";
import { Track } from "../models/Track.js";
import { Car } from "../models/Car.js";
import { LapTracker } from "../models/LapTracker.js";
import { InputController } from "./InputController.js";
import { LocalRaceGate } from "./LocalRaceGate.js";
import { LocalControllers } from "./LocalControllers.js";
import { Telemetry } from "./Telemetry.js";
import { VEHICLE } from "../physics/VehicleConfig.js";
import { SplitScreenRenderer } from "../view/SplitScreenRenderer.js";
import { Hud } from "../ui/Hud.js";
import { LocalLobby } from "../ui/LocalLobby.js";
import { SplitHud } from "../ui/SplitHud.js";
const idle = { steerAxis: 0, throttleAxis: 0, brakeAxis: 0, handbrake: false };

export class Game {
  constructor({ container }) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 12;
    this.input = new InputController();
    this.controllers = new LocalControllers();
    this.advance = new LocalRaceGate();
    this.telemetry = new Telemetry();
    this.laps = new LapTracker();
    this.playerCount = 1;
    this.keyboardPlayerOne = true;
    this.orientation = "side";
    this.accumulator = 0;
    this.lastTime = null;
    this.simTime = 0;
    this.paused = false;
  }
  init() {
    this.container.append(this.renderer.domElement);
    const ground = new CANNON.Material("ground"),
      carMat = new CANNON.Material("car");
    this.world.addContactMaterial(
      new CANNON.ContactMaterial(ground, carMat, {
        friction: 0.05,
        restitution: 0.08,
      }),
    );
    this.track = new Track(this.scene);
    this.track.create(this.world, ground);
    this.car = new Car(this.scene, this.world, carMat);
    this.car.create(this.track.getGridSpawn(2));
    this.race = new RaceField({
      scene: this.scene,
      world: this.world,
      material: carMat,
      track: this.track,
      player: this.car,
      playerLaps: this.laps,
    });
    this.views = new SplitScreenRenderer(this.renderer, this.scene, this.track);
    this.hud = new Hud(this.track);
    this.splitHud = new SplitHud(this.track, (index) =>
      this.toggleCameraMode(index),
    );
    this.lobby = new LocalLobby({
      onCount: (count) => this.configurePlayers(count, this.keyboardPlayerOne),
      onKeyboard: (keyboard) =>
        this.configurePlayers(this.playerCount, keyboard),
      onLayout: (layout) => this.changeLayout(layout),
      onStart: () => this.startLocal(),
      onPreview: () => this.previewGrid(),
      onSolo: () => this.returnToSolo(),
    });
    this.configurePlayers(1, true);
    this.hud.bindTuning({
      getDebugState: () => this.car.getDebugState(),
      setTuning: (values) => this.race.setTuning(values),
    });
    this.input.onReset = () => this.reset();
    this.input.onToggleCamera = () => this.toggleCameraMode(0);
    this.input.onShiftUp = () => this.car.shiftUp();
    this.input.onShiftDown = () => this.car.shiftDown();
    this.input.onTelemetry = (e) =>
      this.telemetry.input(e, this.car.getDebugState());
    this.input.onPause = () => this.handlePause();
    this.input.onToggleTransmission = () => this.car.toggleAutomatic();
    this.input.onToggleGuide = () => {
      const on = this.track.toggleGuide();
      document
        .getElementById("line-button")
        .setAttribute("aria-pressed", String(on));
    };
    this.controllers.readers.forEach((reader, i) => {
      reader.onToggleCamera = () => this.toggleCameraMode(i);
      reader.onShiftUp = () => this.race.getPlayers()[i]?.car.shiftUp();
      reader.onShiftDown = () => this.race.getPlayers()[i]?.car.shiftDown();
      reader.onTelemetry = (e) => {
        const car = this.race.getPlayers()[i]?.car;
        if (car) this.telemetry.input(e, car.getDebugState());
      };
    });
    this.controllers.onPause = () => this.handlePause();
    this.controllers.onDisconnect = (slots) => {
      if (this.playerCount > 1) {
        this.setPaused(true);
        this.lobby.show(
          `Player ${slots.map((i) => i + 1).join(" / ")} disconnected. Reconnect, or press A / Cross on a replacement controller.`,
        );
      }
    };
    const buttons = {
      reset: () => this.reset(),
      camera: () => this.toggleCameraMode(0),
      gearboxButton: () => this.car.toggleAutomatic(),
      pause: () => this.handlePause(),
      resume: () => this.handlePause(),
      "line-button": () => this.input.onToggleGuide(),
      "local-race": () => this.openLocal(),
    };
    for (const [id, fn] of Object.entries(buttons))
      document.getElementById(id).addEventListener("click", (e) => {
        fn();
        e.currentTarget.blur();
      });
    window.addEventListener("resize", () => this.resize());
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) this.setPaused(true);
      this.lastTime = null;
    });
    this.resize();
    console.info("[Game:init]", {
      track: "Valle Motor Park",
      length: Math.round(this.track.length),
      physicsHz: 120,
      suspension: "4 raycast wheels",
      transmission: "automatic",
      maxLocalPlayers: 4,
    });
  }
  configurePlayers(count, keyboardPlayerOne) {
    this.playerCount = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
    this.keyboardPlayerOne = this.playerCount === 1 || !!keyboardPlayerOne;
    this.race.setPlayerCount(this.playerCount);
    this.advance.reset();
    this.players = this.race.getPlayers();
    this.controllers.configure(this.playerCount, this.keyboardPlayerOne);
    this.views.configure(this.players, this.orientation);
    this.hud.bindRace(this.race.getSnapshot());
    this.lobby.configure(
      this.players,
      this.keyboardPlayerOne,
      this.orientation,
    );
    document.body.classList.toggle("split-mode", this.playerCount > 1);
    document.body.dataset.players = this.playerCount;
    document.querySelector(".session-name").innerHTML =
      this.playerCount > 1
        ? `<i></i> LOCAL RACE <span>${this.playerCount} PLAYERS / VALLE</span>`
        : "<i></i> CLUB RACE <span>01 / VALLE</span>";
    this.paused = false;
    this.accumulator = 0;
    this.input.clear();
    this.resize();
    this.splitHud.configure(this.players, this.views.layout);
    console.info("[Local:players]", {
      count: this.playerCount,
      keyboardPlayerOne: this.keyboardPlayerOne,
      orientation: this.orientation,
    });
  }
  openLocal() {
    if (this.playerCount === 1) this.configurePlayers(2, false);
    this.lobby.show();
    this.accumulator = 0;
  }
  startLocal() {
    if (!this.controllers.ready) return;
    this.lobby.hide();
    this.setPaused(false);
    this.race.startCountdown();
  }
  previewGrid() {
    if (this.race.getPhase() !== "ready") return;
    this.lobby.hide();
    this.setPaused(false);
  }
  returnToSolo() {
    this.lobby.hide();
    this.configurePlayers(1, true);
    this.setPaused(false);
  }
  changeLayout(orientation) {
    this.orientation = orientation === "stacked" ? "stacked" : "side";
    this.views.configure(this.players, this.orientation);
    this.resize();
    this.lobby.configure(
      this.players,
      this.keyboardPlayerOne,
      this.orientation,
    );
  }
  reset() {
    this.race.reset();
    this.advance.reset();
    this.views.reset();
    this.accumulator = 0;
    console.info("[Game:reset]", {
      spawn: this.car.getPosition(),
      players: this.playerCount,
    });
  }
  toggleCameraMode(index = 0) {
    const mode = this.views.cycle(index);
    console.info("[Camera:mode]", { player: index + 1, mode });
  }
  handlePause() {
    if (this.lobby.visible) {
      if (this.controllers.ready) this.startLocal();
      else this.previewGrid();
      return;
    }
    if (this.playerCount > 1 && !this.controllers.ready) {
      this.lobby.show("Connect every player controller to continue.");
      return;
    }
    this.setPaused(!this.paused);
  }
  setPaused(value) {
    this.paused = value;
    this.accumulator = 0;
    this.input.clear();
    console.info("[Game:pause]", { paused: value });
  }
  resize() {
    this.renderer.setPixelRatio(
      Math.min(devicePixelRatio, this.playerCount > 1 ? 1.25 : 1.75),
    );
    this.renderer.setSize(innerWidth, innerHeight);
    const layout = this.views.resize(innerWidth, innerHeight);
    if (this.splitHud.players?.length === this.playerCount)
      this.splitHud.resize(layout);
  }
  tick(time = 0) {
    requestAnimationFrame((t) => this.tick(t));
    const dt =
      this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    const inputs = this.controllers.sample(this.input.getState(), {
      allowJoin:
        this.playerCount > 1 && (this.lobby.visible || !this.controllers.ready),
      actionsEnabled:
        !this.lobby.visible && !this.paused && this.controllers.ready,
    });
    const ready = this.controllers.ready;
    const gate = () =>
      this.advance.getMode({
        count: this.playerCount,
        phase: this.race.getPhase(),
        paused: this.paused,
        lobby: this.lobby.visible,
        ready,
        startRequested: inputs.some((i) => i.throttleAxis > 0.1),
      });
    if (gate() !== "freeze") {
      this.accumulator += dt;
      while (this.accumulator >= VEHICLE.fixedStep) {
        const mode = gate();
        if (mode === "freeze") {
          this.accumulator = 0;
          break;
        }
        this.race.updateControls(
          mode === "settle" ? this.players.map(() => idle) : inputs,
          VEHICLE.fixedStep,
        );
        this.world.step(VEHICLE.fixedStep);
        this.simTime += VEHICLE.fixedStep;
        this.race.afterStep(VEHICLE.fixedStep);
        this.advance.step(mode, VEHICLE.fixedStep);
        this.accumulator -= VEHICLE.fixedStep;
      }
    } else this.accumulator = 0;
    const stopped = gate() !== "drive";
    this.race.syncVisuals(stopped ? 0 : dt);
    const states = this.players.map((e) => e.car.getDebugState()),
      race = this.race.getSnapshot();
    const advice = states.map((s) =>
      this.track.getLineAdvice(s.position, s.speedMps, s.frontGrip),
    );
    this.views.render(dt, states);
    const status = this.controllers.getStatus();
    this.lobby.update(status, ready, race.phase);
    if (this.playerCount === 1)
      this.hud.update(
        states[0],
        this.laps.getState(),
        inputs[0],
        dt,
        this.paused,
        this.views.cameras[0].mode,
        race,
        advice[0],
      );
    else {
      this.splitHud.update(
        states,
        race,
        advice,
        status,
        this.views.cameras,
        this.paused,
        ready,
      );
      document.getElementById("pause-screen").hidden =
        !this.paused || this.lobby.visible;
    }
    this.telemetry.update(
      this.simTime,
      states[0],
      this.track.getNormalizedProgress(states[0].position),
      race,
      advice[0],
      this.views.cameras[0].mode === 1
        ? this.views.cameras[0].hood.getState()
        : undefined,
      this.playerCount > 1
        ? states.map((s, i) => ({
            player: i + 1,
            id: this.players[i].id,
            speedKmh: +(s.speedMps * 3.6).toFixed(1),
            gear: s.gear,
            controller: status[i]?.keyboard
              ? "keyboard"
              : (status[i]?.index ?? null),
            x: +s.position.x.toFixed(1),
            z: +s.position.z.toFixed(1),
          }))
        : undefined,
    );
  }
}
