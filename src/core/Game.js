import * as THREE from "three";
import * as CANNON from "cannon-es";
import { Track } from "../models/Track.js";
import { Car } from "../models/Car.js";
import { LapTracker } from "../models/LapTracker.js";
import { InputController } from "./InputController.js";
import { GamepadController } from "./GamepadController.js";
import { mergeInputState } from "./InputState.js";
import { Telemetry } from "./Telemetry.js";
import { VEHICLE } from "../physics/VehicleConfig.js";
import { Hud } from "../ui/Hud.js";
export class Game {
  constructor({ container }) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: "high-performance",
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.camera = new THREE.PerspectiveCamera(
      57,
      innerWidth / innerHeight,
      0.8,
      2500,
    );
    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.81, 0) });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);
    this.world.solver.iterations = 12;
    this.input = new InputController();
    this.gamepad = new GamepadController();
    this.telemetry = new Telemetry();
    this.laps = new LapTracker();
    this.accumulator = 0;
    this.lastTime = null;
    this.simTime = 0;
    this.paused = false;
    this.cameraMode = 0;
    this.cameraReady = false;
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
    this.car.create(this.track.getSpawnPoint());
    this.hud = new Hud(this.track);
    this.setupTuningUi();
    for (const source of [this.input, this.gamepad]) {
      source.onReset = () => this.reset();
      source.onToggleCamera = () => this.toggleCameraMode();
      source.onShiftUp = () => this.car.shiftUp();
      source.onShiftDown = () => this.car.shiftDown();
      source.onTelemetry = (e) =>
        this.telemetry.input(e, this.car.getDebugState());
    }
    this.input.onPause = () => this.setPaused(!this.paused);
    this.input.onToggleTransmission = () => this.car.toggleAutomatic();
    this.input.onToggleGuide = () => {
      const on = this.track.toggleGuide();
      document
        .getElementById("line-button")
        .setAttribute("aria-pressed", String(on));
    };
    const buttons = {
      reset: () => this.reset(),
      camera: () => this.toggleCameraMode(),
      gearboxButton: () => this.car.toggleAutomatic(),
      pause: () => this.setPaused(!this.paused),
      resume: () => this.setPaused(false),
      "line-button": () => this.input.onToggleGuide(),
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
      visuals: "existing Racer assets",
    });
  }
  setupTuningUi() {
    this.hud.bindTuning(this.car);
  }
  reset() {
    this.car.reset();
    this.laps.reset();
    this.cameraReady = false;
    console.info("[Game:reset]", { spawn: this.car.getPosition() });
  }
  toggleCameraMode() {
    this.cameraMode = (this.cameraMode + 1) % 3;
    this.car.setVisible(this.cameraMode !== 1);
    this.cameraReady = false;
    console.info("[Camera:mode]", { mode: this.cameraMode });
  }
  setPaused(value) {
    this.paused = value;
    this.accumulator = 0;
    this.input.clear();
    console.info("[Game:pause]", { paused: value });
  }
  resize() {
    this.renderer.setSize(innerWidth, innerHeight);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }
  updateCamera(dt, state) {
    const pose = this.car.getPose(),
      q = new THREE.Quaternion(
        pose.quaternion.x,
        pose.quaternion.y,
        pose.quaternion.z,
        pose.quaternion.w,
      ),
      position = new THREE.Vector3(pose.x, pose.y, pose.z);
    let desired, look;
    if (this.cameraMode === 2) {
      desired = new THREE.Vector3(305, 280, -325);
      look = new THREE.Vector3(85, 0, -35);
    } else if (this.cameraMode === 1) {
      desired = position
        .clone()
        .add(new THREE.Vector3(0, 0.8, 0.5).applyQuaternion(q));
      look = position
        .clone()
        .add(new THREE.Vector3(0, 0.8, 30).applyQuaternion(q));
    } else {
      const forward = new THREE.Vector3(0, 0, 1).applyQuaternion(q);
      forward.y = 0;
      forward.normalize();
      desired = position
        .clone()
        .addScaledVector(forward, -10 - state.speedMps * 0.035)
        .add(new THREE.Vector3(0, 5.4, 0));
      look = position
        .clone()
        .addScaledVector(forward, 3 + state.speedMps * 0.08)
        .add(new THREE.Vector3(0, 0.8, 0));
      desired.y = Math.max(
        desired.y,
        this.track.terrain.getHeight(desired.x, desired.z) + 2.2,
      );
    }
    this.camera.position.lerp(
      desired,
      !this.cameraReady || this.cameraMode === 1 ? 1 : 1 - Math.exp(-dt * 5),
    );
    this.camera.lookAt(look);
    this.cameraReady = true;
  }
  tick(time = 0) {
    requestAnimationFrame((t) => this.tick(t));
    const dt =
      this.lastTime === null ? 0 : Math.min((time - this.lastTime) / 1000, 0.1);
    this.lastTime = time;
    const input = mergeInputState(
      this.input.getState(),
      this.gamepad.getState(),
    );
    if (!this.paused) {
      this.accumulator += dt;
      while (this.accumulator >= VEHICLE.fixedStep) {
        const p = this.car.getPosition();
        this.car.updatePhysics(
          input,
          VEHICLE.fixedStep,
          this.track.getSurface(p),
          this.track.terrain.getHeight(p.x, p.z),
        );
        this.world.step(VEHICLE.fixedStep);
        this.simTime += VEHICLE.fixedStep;
        const near = this.track.nearest(this.car.getPosition());
        this.laps.update(near.progress, near.distance, VEHICLE.fixedStep);
        this.accumulator -= VEHICLE.fixedStep;
      }
    }
    const state = this.car.getDebugState();
    this.car.syncVisuals(this.paused ? 0 : dt);
    this.track.update(state.position);
    this.updateCamera(dt, state);
    this.hud.update(
      state,
      this.laps.getState(),
      input,
      dt,
      this.paused,
      this.cameraMode,
    );
    this.telemetry.update(
      this.simTime,
      state,
      this.track.getNormalizedProgress(state.position),
    );
    this.renderer.render(this.scene, this.camera);
  }
}
