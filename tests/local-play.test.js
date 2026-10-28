import test from "node:test";
import assert from "node:assert/strict";
import * as C from "cannon-es";
import * as THREE from "three";
import { InputController } from "../src/core/InputController.js";
import { LocalRaceGate } from "../src/core/LocalRaceGate.js";
import { GamepadAssignments } from "../src/core/GamepadAssignments.js";
import { LocalControllers } from "../src/core/LocalControllers.js";
import { RaceSession } from "../src/racing/RaceSession.js";
import { createRaceParticipants } from "../src/racing/RaceConfig.js";
import {
  getSplitLayout,
  SplitScreenRenderer,
} from "../src/view/SplitScreenRenderer.js";
import { createChassis, applyDrive } from "../src/physics/Chassis.js";
import { VehicleDynamics } from "../src/physics/VehicleDynamics.js";
const logger = { info() {}, warn() {} };
function pad(index, id = "Identical controller") {
  return {
    index,
    id,
    connected: true,
    axes: [0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
  };
}
function press(p, index, value = 1) {
  p.buttons[index] = { pressed: value > 0.5, value };
  return p;
}
function joinAll(assignments, pads) {
  pads.filter(Boolean).forEach((p) => press(p, 0));
  const result = assignments.update(pads, true);
  pads.filter(Boolean).forEach((p) => press(p, 0, 0));
  assignments.update(pads, true);
  return result;
}

test("four identical controllers join unique player slots using their original device indices", () => {
  const a = new GamepadAssignments();
  a.configure(4);
  const pads = [];
  for (const i of [0, 2, 5, 7]) pads[i] = pad(i);
  const result = joinAll(a, pads);
  assert.deepEqual(result.joined, [0, 1, 2, 3]);
  assert.deepEqual(
    a.getStatus(pads).map((s) => s.index),
    [0, 2, 5, 7],
  );
  assert.equal(result.ready, true);
});
test("a controller cannot join twice or take another connected player slot", () => {
  const a = new GamepadAssignments();
  a.configure(2);
  const first = pad(1),
    second = pad(3),
    third = pad(6);
  joinAll(a, [first, second]);
  press(first, 0);
  press(third, 0);
  a.update([first, second, third], true);
  assert.deepEqual(
    a.getStatus([first, second, third]).map((s) => s.index),
    [1, 3],
  );
});
test("keyboard player one reserves its slot and the first pad joins player two", () => {
  const a = new GamepadAssignments();
  a.configure(2, true);
  const p = pad(4);
  joinAll(a, [p]);
  const s = a.getStatus([p]);
  assert.equal(s[0].keyboard, true);
  assert.equal(s[0].index, null);
  assert.equal(s[1].index, 4);
});
test("disconnect neutralizes only that player, preserves other assignments and requires explicit replacement", () => {
  const a = new GamepadAssignments();
  a.configure(3);
  const p = [pad(0), pad(1), pad(2)];
  joinAll(a, p);
  p[1].connected = false;
  const lost = a.update(p, false);
  assert.deepEqual(lost.lost, [1]);
  assert.equal(lost.ready, false);
  assert.deepEqual(
    a.getStatus(p).map((s) => s.index),
    [0, null, 2],
  );
  const replacement = pad(1, "Replacement controller");
  a.update([p[0], replacement, p[2]], false);
  assert.equal(a.getStatus([p[0], replacement, p[2]])[1].connected, false);
  press(replacement, 0);
  const joined = a.update([p[0], replacement, p[2]], true);
  assert.deepEqual(joined.joined, [1]);
  assert.equal(joined.ready, true);
});
test("reconnecting a known pad restores the same slot without reordering players", () => {
  const a = new GamepadAssignments();
  a.configure(3);
  const p = [pad(0), pad(2), pad(4)];
  joinAll(a, p);
  p[0].connected = false;
  a.update(p);
  p[0].connected = true;
  assert.equal(a.update(p).ready, true);
  assert.deepEqual(
    a.getStatus(p).map((s) => s.index),
    [0, 2, 4],
  );
});
test("joining does not shift a car out of automatic, and camera actions stay per-player", () => {
  const pads = [pad(0), pad(1)],
    controls = new LocalControllers({ getPads: () => pads, logger });
  controls.configure(2, false);
  const shifts = [0, 0],
    cameras = [0, 0];
  controls.readers.forEach((r, i) => {
    r.onShiftUp = () => shifts[i]++;
    r.onToggleCamera = () => cameras[i]++;
  });
  pads.forEach((p) => press(p, 0));
  controls.sample({}, { allowJoin: true });
  assert.deepEqual(shifts, [0, 0]);
  pads.forEach((p) => press(p, 0, 0));
  controls.sample({});
  press(pads[1], 3);
  controls.sample({});
  assert.deepEqual(cameras, [0, 1]);
  press(pads[1], 0);
  controls.sample({});
  assert.deepEqual(shifts, [0, 1]);
});
test("four controller inputs remain isolated and preserve accepted steering direction", () => {
  const pads = [pad(0), pad(2), pad(5), pad(7)],
    controls = new LocalControllers({ getPads: () => pads, logger });
  controls.configure(4, false);
  pads.forEach((p) => press(p, 0));
  controls.sample({}, { allowJoin: true });
  pads.forEach((p) => press(p, 0, 0));
  pads[0].axes[0] = 0.6;
  press(pads[0], 7, 0.8);
  pads[1].axes[0] = -0.7;
  press(pads[1], 6, 0.4);
  press(pads[2], 2);
  const inputs = controls.sample({ forward: true, left: true });
  assert.ok(inputs[0].steerAxis < 0);
  assert.equal(inputs[0].throttleAxis, 0.8);
  assert.ok(inputs[1].steerAxis > 0);
  assert.equal(inputs[1].brakeAxis, 0.4);
  assert.equal(inputs[1].throttleAxis, 0);
  assert.equal(inputs[2].handbrake, true);
  assert.equal(inputs[3].throttleAxis, 0);
});
test("simultaneous Start presses request one global pause and holding Start does not retrigger", () => {
  const pads = [pad(0), pad(1)],
    controls = new LocalControllers({ getPads: () => pads, logger });
  controls.configure(2);
  pads.forEach((p) => press(p, 0));
  controls.sample({}, { allowJoin: true });
  pads.forEach((p) => press(p, 0, 0));
  controls.sample({});
  let calls = 0;
  controls.onPause = () => calls++;
  pads.forEach((p) => press(p, 9));
  controls.sample({});
  controls.sample({});
  assert.equal(calls, 1);
});
test("a local disconnect produces one pause notification with a neutral input for the missing car", () => {
  const pads = [pad(0), pad(1)],
    controls = new LocalControllers({ getPads: () => pads, logger });
  controls.configure(2);
  pads.forEach((p) => press(p, 0));
  controls.sample({}, { allowJoin: true });
  pads.forEach((p) => press(p, 0, 0));
  press(pads[1], 7);
  controls.sample({});
  let notifications = 0;
  controls.onDisconnect = (slots) => {
    notifications++;
    assert.deepEqual(slots, [1]);
  };
  pads[1].connected = false;
  const inputs = controls.sample({});
  controls.sample({});
  assert.equal(notifications, 1);
  assert.equal(inputs[1].throttleAxis, 0);
  assert.equal(controls.ready, false);
});
test("a three-player race waits for all human finishes and reports each player rank", () => {
  const session = new RaceSession(createRaceParticipants(3));
  session.step(3, true);
  session.update("you", 0, { started: true, laps: 3 });
  assert.equal(session.phase, "racing");
  session.step(1, false);
  session.update("sol", 0, { started: true, laps: 3 });
  assert.equal(session.phase, "racing");
  session.step(1, false);
  session.update("rio", 0, { started: true, laps: 3 });
  assert.equal(session.phase, "finished");
  assert.equal(session.getSnapshot("sol").position, 2);
  assert.equal(session.getSnapshot("rio").position, 3);
});
test("all local counts keep a four-car grid and fill only unused places with AI", () => {
  for (let count = 1; count <= 4; count++) {
    const grid = createRaceParticipants(count);
    assert.equal(grid.length, 4);
    assert.equal(grid.filter((e) => e.isPlayer).length, count);
    assert.deepEqual(
      grid.filter((e) => e.isPlayer).map((e) => e.playerIndex),
      Array.from({ length: count }, (_, i) => i),
    );
    assert.equal(new Set(grid.map((e) => e.slot)).size, 4);
  }
});
test("split rectangles fit odd viewport sizes without overlap and support both two-player layouts", () => {
  for (const count of [2, 3, 4])
    for (const mode of ["side", "stacked"]) {
      const { views, center } = getSplitLayout(1279, 721, count, mode),
        all = center ? [...views, center] : views;
      assert.equal(views.length, count);
      for (const r of all) {
        assert.ok(r.x >= 0 && r.y >= 0 && r.width > 0 && r.height > 0);
        assert.ok(r.x + r.width <= 1279 && r.y + r.height <= 721);
      }
      for (let i = 0; i < all.length; i++)
        for (let j = i + 1; j < all.length; j++) {
          const a = all[i],
            b = all[j];
          assert.ok(
            a.x + a.width <= b.x ||
              b.x + b.width <= a.x ||
              a.y + a.height <= b.y ||
              b.y + b.height <= a.y,
          );
        }
    }
  assert.equal(getSplitLayout(1280, 720, 2, "side").views[1].y, 68);
  assert.equal(getSplitLayout(1280, 720, 2, "stacked").views[1].x, 0);
  assert.deepEqual(getSplitLayout(1280, 720, 1).views[0], {
    x: 0,
    y: 0,
    width: 1280,
    height: 720,
  });
});
test("each split render uses its own camera, racing-line speed and hood visibility, then restores renderer state", () => {
  const calls = [],
    cars = [];
  const renderer = {
    setScissorTest: (v) => calls.push(["test", v]),
    setViewport: (...v) => calls.push(["viewport", ...v]),
    setScissor: (...v) => calls.push(["scissor", ...v]),
    clear() {},
    render(scene, camera) {
      calls.push(["render", camera, cars.map((c) => c.mesh.visible)]);
    },
  };
  const speeds = [],
    track = {
      terrain: { getHeight: () => 0 },
      update(p, s) {
        speeds.push(s.speedMps);
      },
    };
  const entries = Array.from({ length: 4 }, (_, i) => {
    const car = {
      mesh: { visible: true },
      setVisible(v) {
        this.mesh.visible = v;
      },
      getPose: () => ({
        x: i * 8,
        y: 0.62,
        z: i * 15,
        quaternion: { x: 0, y: 0, z: 0, w: 1 },
      }),
    };
    cars.push(car);
    return { car };
  });
  const view = new SplitScreenRenderer(renderer, new THREE.Scene(), track);
  view.configure(entries);
  view.resize(1280, 720);
  view.cycle(1);
  view.render(
    1 / 60,
    entries.map((_, i) => ({
      position: { x: i * 8, y: 0.62, z: i * 15 },
      speedMps: i * 7,
    })),
  );
  const draws = calls.filter((x) => x[0] === "render");
  assert.equal(draws.length, 4);
  assert.equal(new Set(draws.map((d) => d[1])).size, 4);
  assert.deepEqual(speeds, [0, 7, 14, 21]);
  assert.deepEqual(draws[0][2], [true, true, true, true]);
  assert.deepEqual(draws[1][2], [true, false, true, true]);
  assert.ok(cars.every((c) => c.mesh.visible));
  assert.equal(view.cameras[0].mode, 0);
  assert.equal(view.cameras[1].mode, 1);
  assert.deepEqual(calls.at(-2), ["test", false]);
  assert.deepEqual(calls.at(-1), ["viewport", 0, 0, 1280, 720]);
});
test("a single controller moves only its own physical car in a four-player field", () => {
  const pads = [pad(0), pad(2), pad(5), pad(7)],
    controls = new LocalControllers({ getPads: () => pads, logger });
  controls.configure(4, false);
  pads.forEach((p) => press(p, 0));
  controls.sample({}, { allowJoin: true });
  pads.forEach((p) => press(p, 0, 0));
  const world = new C.World({ gravity: new C.Vec3(0, -9.81, 0) }),
    plane = new C.Body({ mass: 0, shape: new C.Plane() });
  plane.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
  plane.updateAABB();
  world.addBody(plane);
  const cars = pads.map((_, i) => ({
    ...createChassis(world, new C.Material(), { x: i * 8, y: 0.85, z: 0 }),
    model: new VehicleDynamics(),
  }));
  for (let frame = 0; frame < 480; frame++) {
    if (frame === 240) press(pads[2], 7);
    const inputs = controls.sample({});
    cars.forEach((car, i) => {
      const v = car.body.vectorToLocalFrame(car.body.velocity),
        f = car.model.compute(
          {
            forward: v.z,
            lateral: v.x,
            yawRate: car.body.angularVelocity.y,
            grounded: car.vehicle.wheelInfos.some((w) => w.isInContact),
          },
          inputs[i],
          1 / 120,
        );
      applyDrive(car.body, f, car.model.tuning);
    });
    world.step(1 / 120);
  }
  assert.ok(cars[2].body.position.z > 5);
  for (const i of [0, 1, 3])
    assert.ok(Math.abs(cars[i].body.position.z) < 0.05);
});

test("a reconnected controller holding Start cannot silently unpause the race", () => {
  const pads = [pad(0), pad(1)],
    controls = new LocalControllers({ getPads: () => pads, logger });
  controls.configure(2);
  pads.forEach((p) => press(p, 0));
  controls.sample({}, { allowJoin: true });
  pads.forEach((p) => press(p, 0, 0));
  controls.sample({});
  let pauses = 0;
  controls.onPause = () => pauses++;
  pads[1].connected = false;
  controls.sample({});
  press(pads[1], 9);
  pads[1].connected = true;
  controls.sample({}, { actionsEnabled: false });
  assert.equal(pauses, 0);
  press(pads[1], 9, 0);
  controls.sample({}, { actionsEnabled: false });
  press(pads[1], 9);
  controls.sample({}, { actionsEnabled: false });
  assert.equal(pauses, 1);
});

test("a waiting local grid settles once and then stays parked even with a held throttle", () => {
  const gate = new LocalRaceGate(),
    state = {
      count: 4,
      phase: "ready",
      paused: false,
      lobby: true,
      ready: false,
      startRequested: true,
    };
  let settleSteps = 0;
  for (let i = 0; i < 1200; i++) {
    const mode = gate.getMode(state);
    if (mode === "settle") settleSteps++;
    gate.step(mode, 1 / 120);
  }
  assert.ok(settleSteps >= 180 && settleSteps <= 181);
  assert.equal(gate.getMode(state), "freeze");
  state.lobby = false;
  assert.equal(gate.getMode(state), "freeze");
  state.ready = true;
  assert.equal(gate.getMode(state), "drive");
});
test("a running local race freezes for disconnect, setup or pause regardless of pedal input", () => {
  const gate = new LocalRaceGate(),
    state = {
      count: 4,
      phase: "racing",
      paused: false,
      lobby: false,
      ready: true,
      startRequested: true,
    };
  assert.equal(gate.getMode(state), "drive");
  for (const key of ["paused", "lobby"]) {
    assert.equal(gate.getMode({ ...state, [key]: true }), "freeze");
  }
  assert.equal(gate.getMode({ ...state, ready: false }), "freeze");
});
test("solo throttle-to-start and parked local countdown remain distinct", () => {
  const gate = new LocalRaceGate();
  gate.step("settle", 2);
  const state = {
    count: 1,
    phase: "ready",
    paused: false,
    lobby: false,
    ready: true,
    startRequested: false,
  };
  assert.equal(gate.getMode(state), "drive");
  assert.equal(gate.getMode({ ...state, count: 2 }), "freeze");
  assert.equal(
    gate.getMode({ ...state, count: 2, phase: "countdown" }),
    "drive",
  );
});

function keyboardHarness() {
  const listeners = {};
  const input = new InputController({
    eventTarget: {
      addEventListener: (name, callback) => {
        listeners[name] = callback;
      },
    },
    logger,
  });
  return {
    input,
    key(code, down = true, target = null) {
      listeners[down ? "keydown" : "keyup"]({
        code,
        repeat: false,
        target,
        preventDefault() {},
      });
    },
    blur: () => listeners.blur(),
  };
}
test("one keyboard slot plus three controllers fills four unique seats, including replacement", () => {
  const a = new GamepadAssignments();
  a.configure(4, 99);
  assert.equal(a.keyboardPlayers, 1);
  const pads = [pad(0), pad(2), pad(5)];
  const joined = joinAll(a, pads);
  assert.deepEqual(joined.joined, [1, 2, 3]);
  assert.equal(joined.ready, true);
  assert.deepEqual(
    joined.status.map((s) => s.keyboardIndex),
    [0, null, null, null],
  );
  assert.deepEqual(
    joined.status.map((s) => s.index),
    [null, 0, 2, 5],
  );
  pads[1].connected = false;
  assert.deepEqual(a.update(pads).lost, [2]);
  const replacement = pad(4, "Replacement");
  assert.equal(joinAll(a, [...pads, replacement]).ready, true);
  assert.equal(a.getStatus([...pads, replacement])[2].index, 4);
});
test("a second keyboard seat cannot bypass required controllers, and keyboard mode releases P1's pad", () => {
  const a = new GamepadAssignments();
  a.configure(2, 0);
  joinAll(a, [pad(0), pad(1)]);
  a.configure(2, 2);
  assert.equal(a.keyboardPlayers, 1);
  assert.equal(a.update([]).ready, false);
  assert.equal(a.bindings[0], null);
  assert.equal(a.getStatus([])[1].keyboard, false);
  a.configure(2, 0);
  assert.equal(a.update([]).ready, false);
});
test("one keyboard and three controller inputs remain independent; arrow keys cannot drive P2", () => {
  const { input, key, blur } = keyboardHarness(),
    pads = [pad(0), pad(2), pad(5)];
  input.configure(2, true);
  const controls = new LocalControllers({ getPads: () => pads, logger });
  controls.configure(4, 2);
  pads.forEach((p) => press(p, 0));
  controls.sample(input.getStates(), { allowJoin: true });
  pads.forEach((p) => press(p, 0, 0));
  key("KeyW");
  key("KeyA");
  key("ArrowDown");
  key("ArrowRight");
  key("ShiftRight");
  press(pads[1], 7, 0.6);
  pads[1].axes[0] = 0.4;
  const states = controls.sample(input.getStates());
  assert.equal(states[0].throttleAxis, 1);
  assert.equal(states[0].steerAxis, 1);
  assert.equal(states[1].throttleAxis, 0);
  assert.equal(states[1].brakeAxis, 0);
  assert.equal(states[1].steerAxis, 0);
  assert.equal(states[1].handbrake, false);
  assert.equal(states[2].throttleAxis, 0.6);
  assert.ok(states[2].steerAxis < -0.3 && states[2].steerAxis > -0.4);
  assert.equal(states[3].throttleAxis, 0);
  key("KeyW", false);
  assert.equal(input.getState().forward, false);
  blur();
  assert.ok(input.getStates().every((s) => Object.values(s).every((v) => !v)));
});
test("keyboard actions only target P1 while solo arrows still shift", () => {
  const { input, key } = keyboardHarness(),
    cameras = [],
    shifts = [];
  input.onToggleCamera = (i) => cameras.push(i);
  input.onShiftUp = (i) => shifts.push(i);
  input.configure(2, true);
  key("ArrowUp");
  key("KeyC");
  key("Enter");
  key("Period");
  key("KeyE");
  assert.deepEqual(cameras, [0]);
  assert.deepEqual(shifts, [0]);
  assert.deepEqual(input.getState(1), {});
  input.configure(0, true);
  key("KeyW");
  key("ArrowUp");
  key("KeyC");
  key("Enter");
  assert.deepEqual(input.getStates(), [{}]);
  assert.deepEqual(cameras, [0]);
  input.configure(1, false);
  key("ArrowUp");
  assert.deepEqual(shifts, [0, 0]);
  assert.equal(input.getState().forward, false);
});
test("keyboard key-up clears held controls even after focus moves into setup", () => {
  const { input, key } = keyboardHarness();
  input.configure(1, true);
  key("KeyW");
  key("KeyW", false, { closest: () => ({}) });
  assert.equal(input.getState().forward, false);
});
