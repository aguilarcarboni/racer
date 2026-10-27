import { DEFAULT_TUNE } from "../physics/VehicleConfig.js";
import { Car } from "../models/Car.js";
import { LapTracker } from "../models/LapTracker.js";
import { AiDriver } from "./AiDriver.js";
import { RaceSession } from "./RaceSession.js";
import { OPPONENTS, createRaceParticipants } from "./RaceConfig.js";
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
    this.setPlayerCount(1);
  }
  setPlayerCount(count) {
    const participants = createRaceParticipants(count);
    const sharedTune = this.entries[0].car.getDebugState();
    for (const participant of participants)
      Object.assign(
        this.entries.find((e) => e.id === participant.id),
        participant,
      );
    for (const entry of this.entries)
      entry.car.setTuning(entry.isPlayer ? sharedTune : DEFAULT_TUNE);
    this.session = new RaceSession(participants, (type, data) =>
      console.info(`[Race:${type}]`, data),
    );
    for (const entry of this.entries) entry.laps.reset({ keepBest: false });
    this.reset();
  }
  getPhase() {
    return this.session.phase;
  }
  startCountdown() {
    if (this.session.phase === "ready") this.session.step(0, true);
  }
  getPlayers() {
    return this.entries
      .filter((e) => e.isPlayer)
      .sort((a, b) => a.playerIndex - b.playerIndex);
  }
  setTuning(values) {
    for (const entry of this.getPlayers()) entry.car.setTuning(values);
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
    const inputs = Array.isArray(playerInput) ? playerInput : [playerInput];
    this.session.step(
      dt,
      this.getPlayers().some(
        (e) => (inputs[e.playerIndex]?.throttleAxis ?? 0) > 0.1,
      ),
    );
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
          ? (inputs[entry.playerIndex] ?? idle)
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
    for (const entry of this.entries) entry.car.syncVisuals(dt);
  }
  getSnapshot(playerId) {
    const result = this.session.getSnapshot(playerId);
    result.entries = result.entries.map((entry) => ({
      ...entry,
      position: this.entries.find((e) => e.id === entry.id).car.getPosition(),
    }));
    return result;
  }
}
