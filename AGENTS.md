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

- `src/main.js`
  - App entrypoint.
  - Installs browser-to-terminal logging bridge.
  - Creates and starts `Game`.

- `src/core/Game.js`
  - Orchestrates app lifecycle and game loop.
  - Owns world stepping, camera follow, HUD updates.
  - Owns UI tuning controls and telemetry emission.

- `src/core/InputController.js`
  - Keyboard input source.
  - Emits key state changes and input telemetry events.

- `src/core/TerminalLogger.js`
  - Mirrors browser `console.*` + runtime errors to Vite terminal.

- `src/models/Car.js`
  - Vehicle simulation/controller logic.
  - Contains simcade dynamics and tuning parameters.
  - Exposes `setTuning(...)` and `getDebugState()`.

- `src/models/Track.js`
  - Track scene model and normalized progress helper.

- `vite.config.js`
  - Dev middleware endpoint (`/__client-log`) for log bridge.

- `index.html`
  - HUD + tuning panel markup.

- `handoff.md`
  - Current state summary and next-step roadmap.

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
- `[Input:key-down]`, `[Input:key-up]`, `[Input:key-down-repeat]`
- `[Input:telemetry]` (event-linked snapshot)
- `[Telemetry:periodic]` (throttled runtime status)
- `[Debug frame=...]` (throttled physics detail)
- `[Tune:update]` (live tuning changes)

Do not remove logging paths unless replacing them with better-structured equivalents.

---

## OOP Standards (Strict)

Use these as hard rules when changing code.

### 1) Single Responsibility
Each class should have one primary reason to change.
- `Game`: orchestration only.
- `Car`: vehicle simulation only.
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
2. Wire it in `main.js` HUD `tune` object.
3. Bind event in `Game.setupTuningUi()`.
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

1. Introduce `VehicleConfig` object for all tunable defaults.
2. Extract tire/grip calculations into a dedicated helper class/module.
3. Add preset manager:
   - save/load/reset tuning profiles.
4. Add debug mode levels:
   - `minimal`, `normal`, `verbose`.

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
