# Racer / Valle Motor Park

A stylized circuit racer built with Three.js and Cannon. Valle Motor Park is a 1.04 km closed course with a long straight, flowing corners, an infield sequence, runoff, raised curbs, barriers, paddock and wooded scenery.

## Drive

Node 22.12+; Node 24 recommended.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. Press throttle to begin a three-second countdown, then race three opponents over three laps.

| Control   | Action                                                                |
| --------- | --------------------------------------------------------------------- |
| W / S     | Throttle / brake. Hold S at rest to reverse; W brakes out of reverse. |
| A / D     | Left / right steering                                                 |
| Space     | Handbrake                                                             |
| C         | Chase, hood, circuit overview                                         |
| G         | Automatic / manual gearbox                                            |
| Up / Down | Manual shift; selecting a gear switches to manual                     |
| L         | Toggle reactive racing line                                           |
| R         | Restart the race; retain the session best lap                         |
| Escape    | Pause / resume                                                        |

Automatic gears are on initially. The arrow guide follows the center of the road. Its color compares your actual speed with a curvature-based cornering and braking envelope: green means comfortable, amber means ease off, red means brake. Slowing down turns it green again. Each section previews its own speed requirement, so a corner can be red while the straight remains green. It is a driving aid rather than a fully optimized racing trajectory. Grass and gravel have lower grip and greater rolling resistance. Open Car setup to adjust brake bias, pitch response, cornering load, rear rotation, front tire grip and suspension firmness. The original four tuning settings remain available.

A standard gamepad uses the left stick to steer, triggers to accelerate/brake, the top face button for camera, the left face button for handbrake, and bottom/right face buttons for shifting. Start / Options pauses or resumes the shared race. Four-physical-controller acceptance is still pending; automated coverage uses independent controller snapshots and the physical car model.

## Local split screen

Open **Local race**, choose **2, 3 or 4 players**, and press **A / Cross** on each controller to claim a player. Once every slot is ready, click **Start local race** or press **Start / Options** for the countdown. Solo remains the default; **Back to solo** returns to its full-screen race. **View grid** previews the layout while waiting for controllers and keeps the cars parked.

Two players can choose side-by-side or top-and-bottom views. Three players get three equal quadrants plus a shared map/standings panel; four players get four equal quadrants. Each player has their own camera, speed, gear, lap timer, position and speed-sensitive line. Y / Triangle changes only that player's camera. A first-person player's car remains visible to everyone else.

| Controller            | Action                                                               |
| --------------------- | -------------------------------------------------------------------- |
| Left stick            | Steer                                                                |
| RT / R2               | Throttle                                                             |
| LT / L2               | Brake; hold at rest to reverse                                       |
| X / Square            | Handbrake                                                            |
| Y / Triangle          | Chase / hood / circuit camera for your view                          |
| Start / Options       | Start from the ready lobby; pause/resume during a race               |
| A / Cross, B / Circle | Manual up/down shifts during play; joining is ignored by the gearbox |

**Keyboard players** selects zero, one or two keyboard seats. For two people sharing the keyboard plus one controller, choose **3 players**, **2 - Players 1 and 2**, then press **A / Cross** on the controller to join as Player 3. Two keyboard players can also race together without any controller.

| Keyboard | Drive      | Handbrake   | Camera | Manual up / down |
| -------- | ---------- | ----------- | ------ | ---------------- |
| Player 1 | WASD       | Space       | C      | E / Q            |
| Player 2 | Arrow keys | Right Shift | Enter  | Period / Comma   |

Escape pauses everyone; R restarts. Local arrow keys drive Player 2 and never shift Player 1. Solo retains its arrow-key manual shifts. Keyboard rollover depends on the hardware, so simultaneous keys should be checked on your shared keyboard.

Spare grid spots stay AI-controlled: two humans race two AI, three race one AI, and four race each other. The host's car setup is shared by local humans; AI retains its default setup. Changing player count or keyboard assignment starts a fresh race. Layout changes preserve the race. The race stays active until every human finishes three laps, with individual finish order retained.

A disconnected controller neutralizes that player's input and pauses the whole local race. Reconnect it, or press A / Cross on a replacement; other players keep their assignments. Press Start / Options or Resume race after everyone is ready. A held Start button on reconnection does not silently resume.

Focus the game and press a controller button if the browser has not exposed it yet. Device assignments retain the browser's gamepad indices, including sparse indices and identical controller names, following the [Gamepad API guidance](https://developer.mozilla.org/en-US/docs/Web/API/Gamepad_API/Using_the_Gamepad_API).

Rendering uses one shared scene, one physics world and one WebGL renderer, with independent cameras and [scissored viewports](https://threejs.org/manual/pages/multiple-scenes.html). The local-mode pixel ratio is capped at 1.25 to contain GPU work (solo: 1.75). Four real controllers and their hardware/browser performance still need a group playtest.

## Driving model

The goal is approachable, believable arcade handling: progressive grip, useful braking, recoverable slides and a lively road. [iRacing Arcade's official introduction](https://www.iracing.com/introducing-iracing-arcade/) describes accessible racing that remains rewarding to master. That is a design reference; this project uses its own simplified vehicle model and is not a recreation of that game's physics.

- Four raycast spring/damper wheels support a freely pitching and rolling chassis. Increased pitch/roll inertia resists tipping without locking rotation.
- Rendered terrain and wheel collision queries use the same sampled heightfield. Road undulation is physical; raised curb strips have their own collision mesh.
- Front/rear slip angles include yaw velocity at each axle. Smooth tire-force saturation and a combined friction circle limit lateral and longitudinal grip together.
- Traction control reserves rear cornering grip under full throttle. A tunable arcade recovery assist applies bounded yaw torque and drag only when sideslip is worsening; grounded tilt/rate assistance helps a bumped chassis stay balanced. Handbrake slides bypass yaw recovery. Assistance never rewrites velocity or orientation and is inactive in the air. The old separate target-yaw controller is removed; low-speed steering blends into the tire model.
- Steering is smoothed and limited with speed. Keyboard and controller steering both follow the requested reversed mapping.
- Braking reserves tire capacity for cornering on both axles, with gentler full-lock steering under hard braking. A stronger rear axle and reduced load-transfer sensitivity favor recoverable understeer over a sudden spin.
- Brakes remain effective when throttle is held. Automatic shifting and brake-to-reverse make the default drive accessible, while manual shifting remains available.
- Surface grip and drag change off the asphalt. Contact is required for tire traction, so throttle cannot steer or accelerate an airborne chassis through tire force.
- Fixed 120 Hz physics; rendering follows model state. A hidden tab pauses. Long frame stalls are capped to avoid runaway catch-up, which can slow simulation under heavy load.

This is a simcade prototype. It has no measured real-car tire data, full drivetrain/clutch simulation, tire temperature/wear, fuel, damage model, online multiplayer or force-feedback wheel integration. Suspension and grip require human playtesting, especially on curbs. The spring/damper constants are calibrated for playability rather than a specific licensed car.

## Club race

Three differently colored opponents use the same car physics, suspension, surface grip and collisions as you. They steer, brake, follow traffic and seek passing room; they have no teleport or catch-up speed bonus. Live standings and minimap dots track the field. Throttle starts the countdown; R restarts the field. The race ends after three completed laps.

The lap timer starts at the gantry. Ordered quarter-lap checkpoints prevent a shortcut across the start line from counting as a lap. Going well outside the road invalidates the current lap. Best/last times and lap count are session-only. Reset restarts the out lap while keeping the current session best.

## Code map

- `src/core/Game.js`: lifecycle, fixed-step order, input orchestration, camera, pause.
- `src/core/GamepadAssignments.js`, `LocalControllers.js`: stable controller slots, join, reconnect and per-player input.
- `src/core/LocalRaceGate.js`: parked preview, missing-controller and pause gates.
- `src/view/PlayerCamera.js`, `SplitScreenRenderer.js`: per-player cameras, logical viewports and per-view line state.
- `src/ui/LocalLobby.js`, `SplitHud.js`: controller lobby, layouts and individual instruments.
- `src/core/InputState.js`: shared keyboard/controller input mapping.
- `src/core/Telemetry.js`: event and throttled JSON driving telemetry.
- `src/models/Car.js`: chassis/dynamics/view composition and public vehicle API.
- `src/physics/VehicleDynamics.js`: axle slip, forces, steering and surface response.
- `src/physics/TireModel.js`: smooth friction-circle tire saturation.
- `src/physics/PowertrainModel.js`: gear selection, drive force, braking and reverse.
- `src/physics/VehicleConfig.js`: dimensions, physical constants and defaults.
- `src/physics/Chassis.js`: Cannon chassis, four-wheel suspension, contact materials and physical force application.
- `src/physics/StabilityAssist.js`: bounded slide/tilt recovery with normal-corner, handbrake and airborne gates.
- `src/physics/Terrain.js`: shared heightfield generation and height queries.
- `src/models/TrackLayout.js`: closed spline, sampling, nearest path and surface classification.
- `src/models/Track.js`: road meshes, physical curbs/barriers, spawn and circuit scenery.
- `src/models/LapTracker.js`: ordered lap gates, validity and best time.
- `src/racing/RaceField.js`: physical grid, opponent controls and per-car lap tracking.
- `src/racing/RaceSession.js`: countdown, race distance, standings and finish order.
- `src/racing/AiDriver.js`: path following, speed preview and traffic decisions.
- `src/racing/RacingLineProfile.js`: closed-circuit corner speed and braking envelope.
- `src/view/RacingLineView.js`: speed-reactive road chevrons.
- `src/view/CarView.js`: existing car asset and chassis pose.
- `src/view/WheelRig.js`: hub-centered wheel steering/rotation/travel.
- `src/view/HoodCamera.js`: stabilized first-person view with damped heave/pitch.
- `src/view/Environment.js`: lighting, grass, instanced trees and distant hills.
- `src/view/Assets.js`: build-safe references to the repository's existing models.
- `src/ui/Hud.js`: instruments, minimap, lap display and setup.

No outside game assets were copied. Car and paddock models are reused from the existing Racer repository. Referencing GLBs through Vite imports also makes them available in the production build.

## Checks

`npm test` runs 72 behavior tests, including large-spin recovery, real mirrored rear-quarter/crossing impacts, roll-impulse recovery, full-lock braking from 180 km/h, mixed two-keyboard/one-pad isolation, keyboard release/camera/shift routing, controller isolation/reconnection, local finish order, parked/pause gates, viewport bounds and a four-car input isolation drive. It also runs behavior tests for race starts, classification, finishes, speed guidance and physical opponents, alongside existing handling checks, including a conservative simulated drive around the actual undulating circuit, suspension over a raised curb, steering direction, recovery from a yaw disturbance, braking with throttle, auto gears, reverse, off-road speed loss, lap gates and deterministic fixed-step behavior.

`npm run build` creates `dist/`. `npm run preview` serves it at http://127.0.0.1:4173. Three.js/Cannon produce a large initial JavaScript chunk; Vite's bundle-size advisory is retained. CI runs install, tests and build. The upgraded Vite toolchain audits clean at this revision.

Browser console/error messages still mirror to the Vite terminal. Periodic `[Telemetry:periodic]` messages are JSON at 1.5 second intervals, with input-linked snapshots, grounded/wheel contacts, steering, forces and suspension lengths. See handoff.md for observed browser evidence and outstanding acceptance.

## Current handling tune

Engine power is 230 kW, peak drive force 7,800 N and the final gear governor is 84 m/s. Surface grip, tire stiffness and the speed-dependent steering allowance rise together, with rear grip and brake reserves retained. AI and racing-line speed profiles use the new pace. Car-to-car friction/restitution are configured explicitly so light contact slides rather than snagging against generic materials. Car setup exposes **Stability assistance** from zero to one (default 0.85), shared among local human cars.

Matched flat-road measurements against commit 820cfa9:

| Measurement                                | Previous      | Current       |
| ------------------------------------------ | ------------- | ------------- |
| 0-100 km/h, automatic/full throttle        | 6.07 s        | 4.41 s        |
| Speed after five seconds                   | 83.27 km/h    | 112.63 km/h   |
| Severe rear-quarter contact: peak sideslip | 73.25 degrees | 29.83 degrees |

These are deterministic simulation comparisons, not guaranteed lap-time gains or a licensed real-car calibration. In the current chassis, a high side impulse at an elevated contact point reaches about 24.6 degrees of tilt with default assistance and returns onto four wheels; the same impulse with assistance disabled exceeds 90 degrees. Severe impacts can still stop or overturn a car; R restarts the race.

The handling references are [iRacing Arcade](https://iracingarcade.com/), [Karting Superstars](https://store.steampowered.com/app/2503220/Karting_Superstars/) and [Circuit Superstars](https://store.steampowered.com/app/1097130/Circuit_Superstars/). Their official descriptions emphasize accessible, tactile handling and skill in grip/racing lines. Our implementation translates that design direction into more speed and a larger recovery window; it does not reproduce their proprietary physics.
