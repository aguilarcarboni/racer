import { Car } from "../models/Car.js";
import { LapTracker } from "../models/LapTracker.js";
import { AiDriver } from "./AiDriver.js";
import { RaceSession } from "./RaceSession.js";
import { OPPONENTS } from "./RaceConfig.js";
const idle = { steerAxis: 0, throttleAxis: 0, brakeAxis: 0, handbrake: false };

export class RaceField {
  constructor({ scene, world, material, track, player, playerLaps }) {
    this.track = track;
    this.entries = [
      {
        id: "you",
        name: "YOU",
        color: "#dd542f",
        slot: 2,
        isPlayer: true,
        car: player,
        laps: playerLaps,
      },
    ];
    for (const config of OPPONENTS) {
      const car = new Car(scene, world, material, {
        color: config.color,
        id: config.id,
      });
      car.create(track.getGridSpawn(config.slot));
      this.entries.push({
        ...config,
        isPlayer: false,
        car,
        laps: new LapTracker(),
        driver: new AiDriver(track.layout, track.lineProfile, config),
      });
    }
    this.session = new RaceSession(
      this.entries.map(({ id, name, color, slot, isPlayer }) => ({
        id,
        name,
        color,
        slot,
        isPlayer,
      })),
      (type, data) => console.info(`[Race:${type}]`, data),
    );
    this.reset();
  }
  reset() {
    this.session.reset();
    for (const entry of this.entries) {
      entry.car.setSpawn(this.track.getGridSpawn(entry.slot));
      entry.car.reset();
      entry.laps.reset();
      entry.driver?.reset();
    }
  }
  updateControls(playerInput, dt) {
    this.session.step(dt, playerInput.throttleAxis > 0.1);
    const running = ["racing", "finished"].includes(this.session.phase);
    const states = this.entries.map((e) => ({
      id: e.id,
      ...e.car.getDebugState(),
      quaternion: e.car.getPose().quaternion,
    }));
    for (const entry of this.entries) {
      const state = states.find((s) => s.id === entry.id);
      const input = !running
        ? idle
        : entry.isPlayer
          ? playerInput
          : entry.driver.getInput(
              state,
              states.filter((s) => s.id !== entry.id),
              dt,
            );
      const p = state.position;
      entry.car.updatePhysics(
        input,
        dt,
        this.track.getSurface(p),
        this.track.terrain.getHeight(p.x, p.z),
      );
    }
  }
  afterStep(dt) {
    if (!["racing", "finished"].includes(this.session.phase)) return;
    for (const entry of this.entries) {
      const near = this.track.nearest(entry.car.getPosition());
      entry.laps.update(near.progress, near.distance, dt);
      this.session.update(entry.id, near.progress, entry.laps.getState());
    }
  }
  syncVisuals(dt) {
    for (const entry of this.entries)
      if (!entry.isPlayer) entry.car.syncVisuals(dt);
  }
  getSnapshot() {
    const result = this.session.getSnapshot();
    result.entries = result.entries.map((entry) => ({
      ...entry,
      position: this.entries.find((e) => e.id === entry.id).car.getPosition(),
    }));
    return result;
  }
}
