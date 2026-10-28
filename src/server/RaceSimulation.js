import { TrackBroadphase } from "../physics/TrackBroadphase.js";
import * as C from "cannon-es";
import { PhysicsCar } from "../physics/PhysicsCar.js";
import { TrackLayout } from "../models/TrackLayout.js";
import { Terrain } from "../physics/Terrain.js";
import { TrackCollisions } from "../physics/TrackCollisions.js";
import { installVehicleContacts } from "../physics/Chassis.js";
import { VEHICLE } from "../physics/VehicleConfig.js";
import { LapTracker } from "../models/LapTracker.js";
import { RaceSession } from "../racing/RaceSession.js";
import {
  createRaceParticipants,
  OPPONENTS,
  RACE,
} from "../racing/RaceConfig.js";
import { AiDriver } from "../racing/AiDriver.js";
import { RacingLineProfile } from "../racing/RacingLineProfile.js";
import { IDLE_INPUT, ONLINE } from "../online/Protocol.js";

// A render-free world reused sequentially within an isolate; each request restores its room first.
export class RaceSimulation {
  constructor() {
    this.world = new C.World({ gravity: new C.Vec3(0, -9.81, 0) });
    this.world.broadphase = new TrackBroadphase(this.world);
    this.world.solver.iterations = 12;
    this.layout = new TrackLayout();
    this.terrain = new Terrain();
    const ground = new C.Material(),
      material = new C.Material();
    installVehicleContacts(this.world, ground, material);
    new TrackCollisions(this.layout, this.terrain).create(this.world, ground);
    this.profile = new RacingLineProfile(this.layout);
    this.entries = createRaceParticipants(4).map((config, i) => {
      const car = new PhysicsCar(this.world, material);
      const point = this.layout.sample(
        0.02 - 0.003 - (config.slot * RACE.spacing) / this.layout.length,
      );
      const lane = config.slot % 2 ? RACE.lane : -RACE.lane;
      const x = point.x + point.nx * lane,
        z = point.z + point.nz * lane;
      car.create({
        x,
        z,
        y: this.terrain.getHeight(x, z) + 0.85,
        yaw: Math.atan2(point.tx, point.tz),
      });
      return {
        car,
        laps: new LapTracker(),
        driver: new AiDriver(
          this.layout,
          this.profile,
          OPPONENTS[Math.max(0, i - 1)],
        ),
        config,
      };
    });
  }
  create(players) {
    const participants = createRaceParticipants(players.length).map((p, i) => ({
      ...p,
      name: players[i]?.name ?? p.name,
    }));
    this.race = new RaceSession(participants);
    this.entries.forEach((e, i) => {
      e.config = participants[i];
      e.car.reset();
      e.laps.reset({ keepBest: false });
      e.driver.reset();
    });
    for (let i = 0; i < 180; i++) this.step([], 0, false);
    this.race.step(0, true);
    return this.save();
  }
  restore(state) {
    this.race = new RaceSession(state.participants);
    this.race.restoreState(state.race);
    this.entries.forEach((e, i) => {
      e.config = state.participants[i];
      e.car.restoreState(state.cars[i]);
      e.laps.restoreState(state.laps[i]);
      e.driver.restoreState(state.ai?.[i] ?? e.driver.saveState());
    });
    this.world.time = state.time ?? 0;
  }
  step(players, now, running = true) {
    const dt = VEHICLE.fixedStep;
    if (running) this.race.step(dt, false);
    const racing = running && ["racing", "finished"].includes(this.race.phase);
    const states = this.entries.map((e) => ({
      id: e.config.id,
      ...e.car.getDebugState(),
      quaternion: e.car.getPose().quaternion,
    }));
    this.entries.forEach((e, i) => {
      const player = players.find((p) => p.slot === i);
      const withdrawn =
        player?.left || (player && now - player.lastSeen > ONLINE.disconnectMs);
      if (withdrawn && racing) this.race.withdraw(e.config.id);
      let input = IDLE_INPUT;
      if (racing)
        input =
          player && !withdrawn
            ? now - player.lastSeen > ONLINE.staleInputMs
              ? { ...IDLE_INPUT, brakeAxis: 1, parked: true }
              : player.input
            : e.driver.getInput(
                states[i],
                states.filter((_, j) => i !== j),
                dt,
              );
      const p = e.car.getPosition();
      e.car.updatePhysics(
        input,
        dt,
        this.layout.getSurface(p),
        this.terrain.getHeight(p.x, p.z),
      );
    });
    this.world.step(dt);
    if (racing)
      this.entries.forEach((e) => {
        const near = this.layout.nearest(e.car.getPosition());
        e.laps.update((near.progress - 0.02 + 1) % 1, near.distance, dt);
        this.race.update(
          e.config.id,
          (near.progress - 0.02 + 1) % 1,
          e.laps.getState(),
        );
      });
  }
  advance(room, now) {
    if (!room.sim) return;
    this.restore(room.sim);
    const elapsed = Math.max(0, Math.min(0.25, (now - room.lastStep) / 1000));
    const steps = Math.floor(elapsed / VEHICLE.fixedStep);
    for (let i = 0; i < steps; i++) this.step(room.players, now);
    room.lastStep = now - (elapsed - steps * VEHICLE.fixedStep) * 1000;
    room.sim = this.save();
  }
  save() {
    return {
      participants: this.entries.map((e) => e.config),
      race: this.race.saveState(),
      time: this.world.time,
      ai: this.entries.map((e) => e.driver.saveState()),
      cars: this.entries.map((e) => e.car.saveState()),
      laps: this.entries.map((e) => e.laps.saveState()),
    };
  }
  snapshot(sim) {
    this.restore(sim);
    return {
      race: this.race.getSnapshot(),
      cars: this.entries.map((e) => ({
        id: e.config.id,
        physics: e.car.saveState(),
        state: e.car.getDebugState(),
        lap: e.laps.getState(),
      })),
    };
  }
}

export class DeferredRaceSimulation {
  get() {
    return (this.simulation ??= new RaceSimulation());
  }
  create(players) {
    return this.get().create(players);
  }
  advance(room, now) {
    if (room.sim) this.get().advance(room, now);
  }
  snapshot(state) {
    return this.get().snapshot(state);
  }
}
