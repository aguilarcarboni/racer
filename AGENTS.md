# AGENTS.md

## Purpose

This file defines how contributors (human or AI agents) should work in this repository.

Goals:

- Keep physics and gameplay behavior understandable.
- Preserve and improve architecture quality.
- Use strong OOP practices as features are added.
- Make debugging reproducible via terminal-visible logs.

---

## Repository Map

- `src/main.js`: logger and app entry point.
- `src/core/Game.js`: orchestration, fixed 120 Hz update order, camera, pause and lifecycle.
- `src/core/InputController.js`, `GamepadController.js`, `InputState.js`: input collection and consistent signs.
- `src/core/GamepadAssignments.js`, `LocalControllers.js`: stable gamepad-index slots and isolated player inputs/actions.
- `src/core/LocalRaceGate.js`: finite parked-grid settling and controller/pause race gates.
- `src/view/PlayerCamera.js`, `SplitScreenRenderer.js`: one camera per player and logical-pixel viewport/scissor rendering.
- `src/ui/LocalLobby.js`, `SplitHud.js`: local joining, layout choices and per-view UI.
- `src/core/Telemetry.js`, `TerminalLogger.js`: event/throttled JSON telemetry and browser-to-terminal bridge.
- `src/models/Car.js`: chassis, dynamics and view composition; public vehicle API.
- `src/physics/VehicleDynamics.js`, `TireModel.js`, `PowertrainModel.js`, `VehicleConfig.js`: vehicle behavior and validated configuration.
- `src/physics/Chassis.js`, `Terrain.js`: four-wheel spring/damper suspension and shared physical heightfield.
- `src/models/TrackLayout.js`, `Track.js`: closed circuit geometry, surfaces, collision curbs/rails and scenery.
- `src/models/LapTracker.js`: ordered lap gates and validity.
- `src/racing/`: race session, physical field, AI controls and curvature/braking speed profile.
- `src/view/RacingLineView.js`: reactive arrow colors from actual speed versus the profile.
- `src/view/`: car, build-safe existing assets, environment and lighting.
- `src/view/WheelRig.js`: original-asset hub pivots, steering/spin hierarchy and suspension travel.
- `src/view/HoodCamera.js`: damped first-person heave/pitch with immediate heading response.
- `src/ui/Hud.js`: instruments, minimap, setup bindings and lap display.
- `index.html`, `src/style.css`: visual presentation and accessible controls.
- `tests/`: behavior tests including a full conservative drive on the actual circuit.
- `handoff.md`: current implementation, evidence and next playtest.

---

## Runtime & Logs

### Dev server

- Run: `npm run dev`
- URL: `http://localhost:5173/`

### Build check

- Run: `npm run build`

### Logging contract

All critical client logs should be visible in terminal.

High-value log streams:

- `[Input:key-down]`, `[Input:key-up]` and event-linked `[Input:telemetry]`
- `[Telemetry:periodic]`: JSON every 1.5 seconds, including speed, surface, forces, grounded wheel count and suspension lengths
- `[Tune:update]`, `[Tune:transmission]`, `[Camera:mode]`, `[Game:pause]`, `[Game:reset]`
- `[Local:players]`, `[Local:join]`, `[Local:disconnect]`, `[Input:gamepad-bound]`: player/device assignment lifecycle.
- `[Race:phase]`, `[Race:finish]`: countdown/start and finish classification events.
- `[Track:create]`, `[Car:model-ready]` and startup/runtime errors

The former multi-line debug/repeated-key flood is replaced by structured snapshots. Keep original vehicle diagnostics keys stable when practical; `groundClearance` now describes the suspended chassis bottom above sampled terrain, and `wheelContacts` is authoritative for grounding.

Do not remove logging paths unless replacing them with better-structured equivalents.

---

## OOP Standards (Strict)

Use these as hard rules when changing code.

### 1) Single Responsibility

Each class should have one primary reason to change.

- `Game`: orchestration only.
- `Car`: vehicle composition only; dynamics, tires, powertrain, suspension construction and rendering live in their own modules.
- `InputController`: input collection only.
- `Track`: track representation only.

If a class starts owning multiple domains, split it.

### 2) Encapsulation

- Keep internal state private by convention (class-owned, not externally mutated).
- External code should interact through small explicit methods.
- Avoid reaching into nested internals from other modules.

Example:

- Good: `car.setTuning({...})`
- Bad: `car.frontGrip = ...` from outside.

### 3) Explicit Interfaces

When adding behavior, prefer clear methods over direct field coupling.

Recommended pattern:

- `setTuning(params)`
- `getDebugState()`
- `updatePhysics(input, dt)`

Keep method contracts stable and documented in code comments when non-obvious.

### 4) Separation of Model vs View

- Simulation model state lives in physics/model classes.
- Rendering/HUD classes read model state but do not own physics rules.
- UI controls should call model APIs, not patch model internals ad hoc.

### 5) Composition over Monoliths

If `Car.js` grows further, split into composed components:

- `PowertrainModel`
- `TireModel`
- `StabilityAssist`
- `TuningProfile`

`Car` remains the orchestrator of these components.

### 6) Deterministic Update Flow

Keep update order explicit and consistent:

1. Input sampling
2. Vehicle/control update
3. Physics step
4. Visual sync
5. Camera/HUD/telemetry

Do not introduce hidden side effects that break determinism.

### 7) Validate Inputs

Any externally-driven values (UI sliders, presets) must be clamped/validated at API boundaries.

### 8) Minimize Temporal Coupling

Avoid requiring methods to be called in fragile hidden sequences.
When sequence matters, enforce it with guard clauses and clear naming.

---

## Physics Extension Guidelines

When adding new physics features:

1. Add fields with sane defaults.
2. Integrate into `setTuning(...)` if user-tunable.
3. Surface relevant diagnostics in `getDebugState()`.
4. Add/extend telemetry keys (without flooding).
5. Verify with `npm run build`.

For each change, define expected behavior in plain terms:

- What should increase/decrease?
- At low speed vs high speed?
- Under throttle, brake, and lift-off?

---

## UI Tuning Guidelines

When adding a tunable variable:

1. Add slider + value label in `index.html`.
2. Wire it in `Hud.bindTuning()`, called by `Game.setupTuningUi()`.
3. Add model-boundary validation and expose it in diagnostics.
4. Route to `car.setTuning(...)`.
5. Emit `[Tune:update]` with the updated value.

Avoid adding hidden variables that cannot be inspected or tuned.

---

## Debug Workflow (Expected)

1. Reproduce issue with `npm run dev` running.
2. Observe logs in terminal (not browser-only).
3. Identify whether fault is in:
   - input path,
   - control law,
   - physics integration,
   - rendering alignment,
   - HUD interpretation.
4. Patch smallest correct scope.
5. Build-verify (`npm run build`).
6. Re-test with telemetry evidence.

Never claim physics behavior without checking logs.

---

## Code Quality Rules

- Keep files ASCII unless existing file requires otherwise.
- Prefer clear naming over compact clever code.
- Add short comments only for non-obvious logic.
- Do not duplicate constants across modules; centralize when practical.
- Preserve backward compatibility of tuning controls when possible.

---

## Safe Refactor Boundaries

Safe to refactor:

- Internal details of `Car.updatePhysics`.
- Telemetry formatting and throttle intervals.
- HUD panel layout/structure.

Be careful when changing:

- `Game.tick()` order.
- `Car.getDebugState()` keys (telemetry consumers depend on them).
- Log bridge endpoint (`/__client-log`).

---

## Preferred Next Refactors

1. Save/load/reset tuning profiles.
2. Controller hardware acceptance and wheel support as requested.
3. Add further diagnostic levels only when the existing structured snapshots are insufficient.

---

## Collaboration Notes

When handing off work:

- Update `handoff.md` with:
  - what changed,
  - why,
  - how to test,
  - known limitations.
- Keep `AGENTS.md` aligned with any architectural or logging changes.

### Fast Playtest Loop (Immediate Feedback)

- Assume the user tests immediately after each gameplay/physics code change.
- After implementing such changes, pause and wait for user test feedback before applying further code edits.
- Use incoming terminal-mirrored client logs as primary validation input for the next iteration.
- Prefer small, isolated changes per iteration so test outcomes are attributable.

### Bug-Fix Rule (Root Cause First)

- Before applying a fix, read the relevant source code path end-to-end and identify likely logic-level root causes.
- Do not start with random parameter tweaks when behavior indicates a potential logic/sign/order issue.
- For handling/physics bugs, form a short hypothesis from code + logs, then patch the root cause first.
- Use fallback tuning tweaks only after the logic path is validated.

## Current physics and visuals

The handling target is believable arcade racing with forgiving grip and physical bump response. Do not reintroduce a competing direct target-yaw controller or per-frame velocity steering. Raycast wheel contact and sampled terrain must agree with the visible road. Check full-throttle stability after changing tire grip allocation. Use imported GLB URLs so assets survive production builds. Keep the existing car and environment assets unless replacement is requested.

## Club racing

Opponents use the same Car and VehicleDynamics API as the player. AI steering uses the physical axis directly; preserve the user-approved keyboard/controller inversion only at InputState. RaceField computes controls before the world step and lap/classification state after it. RaceSession and RacingLineProfile remain independent of rendering. Guide colors reflect actual speed; do not turn them green simply because brake input is held. The shared arcade tune uses 230 kW power / 7,800 N peak drive, stronger surface/tire grip, a steadier rear axle, reduced load-transfer sensitivity and braking grip reserves. Keep accepted keyboard/controller direction and wheel/camera fixes intact.

For wheel animation, keep steering above spin in the transform hierarchy and rotate around the actual hub center. Test against the original GLB, including full steering lock and rolling. Keep first-person camera stabilization separate from physical suspension; preserve road bumps in the chassis. Hood camera diagnostics are included in periodic telemetry while that view is active.

For braking stability, cap brake force against each axle's current grip capacity so rear unloading cannot remove all lateral grip. Hard-braking steering assistance is speed dependent; keep the default full-lock brake/corner and power/lift-off behavior tests. Apply speed/handling changes to the physical opponents too, and recheck the multi-car passing test before release. Do not describe an acceleration comparison as a guaranteed lap-time gain.

For responsive steering, keep axle-force balance separate from input response. The front tire force may be bounded by the rear axle's remaining lateral capacity and axle lever arms; the handbrake bypasses that balance aid. Do not reintroduce a direct target-yaw controller or remove the braking/power-on guards to improve turn-in. Verify both the response-time check and quick left/right transitions after front-grip or steering changes.

StabilityAssist applies bounded physical torque/drag only for a worsening slide and grounded tilt/angular-rate recovery. It must not chase a target yaw/heading, overwrite velocity/quaternion, assist airborne tires or suppress intentional handbrake yaw. Stability strength is exposed in setup and telemetry. Chassis pitch/roll inertia and explicit car-to-car materials also resist impact upset while leaving yaw steering and suspension physical. Keep mirrored real collision, roll impulse, high-speed braking, turn-in, bump and full-field race tests when changing this model. Steering acceleration limits in VehicleDynamics and AiDriver share VEHICLE.steeringAcceleration.

## Local multiplayer contract

Solo remains keyboard + first pad. Local mode reserves zero or one keyboard seat at P1 and requires one unique controller for each remaining human. KeyboardProfiles centralizes P1 WASD/Space/C, labels and count validation. Enforce the one-keyboard maximum at both UI and model boundaries; no P2 keyboard mapping. Preserve independent camera/shift actions and blur/key-up clearing. Solo arrows shift; local arrows never shift P1. Join by bottom face-button edge, preserve original browser gamepad indices (including sparse arrays and equal IDs), and prime held buttons on join/reconnect so A does not change gear and held Start cannot resume. A missing pad must never silently control another car. Any local disconnect pauses the whole running race and neutralizes missing input.

RaceField promotes its existing cars to human slots and fills only unused places with AI. Local humans inherit the host setup; solo AI retains defaults. Finish classification must wait for all human players while preserving individual finish times. R restarts the race; mode/input changes start a fresh race. Keep simulation ordering shared at 120 Hz.

Use one WebGL renderer/world. Set each camera aspect and matching viewport/scissor in logical pixels, convert top-origin UI rectangles to bottom-origin WebGL coordinates, and restore the renderer state after the pass. Restore the owning car's visibility after hood rendering so others still see it. Update guide colors and lighting from the player for each viewport. Never multiply the physics step by the number of views. The parked preview settles for a bounded interval, then freezes until all players are ready; a live race cannot advance through setup, pause or missing-controller states.

Controller tests use injected snapshots, including a four-body physical input-isolation test. Keep this distinct from an actual four-controller hardware/browser acceptance claim.

## Online multiplayer contract

Preserve offline solo/local modes. Online is one car per device, maximum four human members per room, keyboard or first pad. PhysicsCar and TrackCollisions are the shared render-free physical core; Car adds presentation. RaceSimulation runs the same 120 Hz dynamics, track collision shapes, AI and lap gates on the server. Never accept client positions, lap counts, finish times or host privileges.

RoomService validates six-character codes, device/session membership, all-ready host-only start, capacity and monotonic input sequences. Session tokens are hashed server-side, never logged or included in other players' views. CAS revisions prevent concurrent actions and input packets from overwriting each other. Dedicated servers keep room state in memory; SQL storage remains covered for compatibility. Public API bodies and input values are bounded. Room expiry, disconnect braking/DNF and host transfer are server decisions. A parked input must brake without invoking automatic reverse.

Online pause is per-player, not a global race pause. Reload can reconnect with the existing session. OnlineRace composes prediction, presentation correction, per-device camera/HUD and lobby controls; remote poses are interpolated. Do not turn those network corrections into a new offline steering controller. The dedicated Node server streams snapshots and controls over WebSockets at 20 Hz; HTTP handles lobby actions and reconnect fallback. Keep transport latency and fixed-step clock measurements distinct from four-physical-device acceptance.

Sites migration: preserve the existing project_id and audience. The frontend Worker serves assets and forwards legacy HTTP requests to the dedicated server; remove `static` only in the Site manifest. Build emits one ESM Worker with the Vite client/assets embedded and `.openai/drizzle` migrations. Local dev uses the same MemoryRoomStore and RealtimeHub as production. SQLite is test-only; tests and Vite build stay on Node 24. Never put the local SQLite adapter in the hosted Worker. Keep applied SQL/journals immutable and append future migrations.

High-value logs: [Online:create/join/ready/start/leave/rematch], [Online:telemetry] and [Online:server-error]. Avoid logging credentials or flooding individual input packets. Verify race membership, concurrent joins/starts, input isolation, stale input, host transfer, reconnect and leaving back to offline alongside the original handling/wheel/camera suite.

Cloud Run: use only personal project eaglenest-507101 with the explicitly selected account aguilarcarboni@gmail.com. Keep racer-build (roles/run.builder) separate from racer-runtime (no project roles). Use a single active instance and revision for in-memory room routing; deployments/restarts reset rooms. Keep the browser endpoint in ServerConfig.js reproducible in source. Never silently switch to the company cloud project. Stream timing/backpressure telemetry is throttled under [Online:stream].

Online performance: TrackCollisions partitions the original curb triangles into centered 24-sample sections. TrackBroadphase indexes immutable static track bounds for wheel-ray AABB queries while retaining SAP collision pairs and exact moving-body bounds. Invalidate/rebuild on body add/remove; static objects must not move without invalidation. Keep query equivalence, curb/bump and full-circuit behavior tests.

Protocol 2 compacts wire snapshots without changing full-precision server state; online tuning is the shared DEFAULT_TUNE. Preserve legacy protocol 1 clients. Any future online tuning option must extend the protocol instead of silently assuming defaults. Build each room snapshot once per broadcast, bound queued data, and avoid rebuilding hidden lobby DOM per packet. PredictionHistory replays recent actual controls using measured server clock mapping; catch-up is bounded. Remote client hulls are kinematic suspension proxies; restore full dynamics when returning offline. Keep remote-proxy restoration and packet precision/size tests. Current Cloud Run allocation is 2 CPUs / 1 GiB RAM, min zero/max one instance.
