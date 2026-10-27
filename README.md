# Racer / Valle Motor Park

A stylized circuit racer built with Three.js and Cannon. Valle Motor Park is a 1.04 km closed course with a long straight, flowing corners, an infield sequence, runoff, raised curbs, barriers, paddock and wooded scenery.

## Drive

Node 22.12+; Node 24 recommended.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173. No menu blocks the first drive.

| Control   | Action                                                                |
| --------- | --------------------------------------------------------------------- |
| W / S     | Throttle / brake. Hold S at rest to reverse; W brakes out of reverse. |
| A / D     | Left / right steering                                                 |
| Space     | Handbrake                                                             |
| C         | Chase, hood, circuit overview                                         |
| G         | Automatic / manual gearbox                                            |
| Up / Down | Manual shift; selecting a gear switches to manual                     |
| L         | Toggle centerline guide                                               |
| R         | Reset to the opening straight; retain the session best lap            |
| Escape    | Pause / resume                                                        |

Automatic gears are on initially. The guide is a centerline aid, not an optimized braking/racing line. Slow down before corners. Grass and gravel have lower grip and greater rolling resistance. Open Car setup to adjust brake bias, pitch response, cornering load, rear rotation and suspension firmness. The original four tuning settings remain available.

A standard gamepad uses the left stick to steer, triggers to accelerate/brake, the top face button for camera, the left face button for handbrake, and bottom/right face buttons for shifting. Hardware controller acceptance is still pending.

## Driving model

The goal is approachable, believable arcade handling: progressive grip, useful braking, recoverable slides and a lively road. [iRacing Arcade's official introduction](https://www.iracing.com/introducing-iracing-arcade/) describes accessible racing that remains rewarding to master. That is a design reference; this project uses its own simplified vehicle model and is not a recreation of that game's physics.

- Four raycast spring/damper wheels support a freely pitching and rolling chassis.
- Rendered terrain and wheel collision queries use the same sampled heightfield. Road undulation is physical; raised curb strips have their own collision mesh.
- Front/rear slip angles include yaw velocity at each axle. Smooth tire-force saturation and a combined friction circle limit lateral and longitudinal grip together.
- Traction control reserves rear cornering grip under full throttle. The old separate target-yaw controller is removed; low-speed steering blends into the tire model.
- Steering is smoothed and limited with speed. Keyboard and controller steering both follow the requested reversed mapping.
- Brakes remain effective when throttle is held. Automatic shifting and brake-to-reverse make the default drive accessible, while manual shifting remains available.
- Surface grip and drag change off the asphalt. Contact is required for tire traction, so throttle cannot steer or accelerate an airborne chassis through tire force.
- Fixed 120 Hz physics; rendering follows model state. A hidden tab pauses. Long frame stalls are capped to avoid runaway catch-up, which can slow simulation under heavy load.

This is a simcade prototype. It has no measured real-car tire data, full drivetrain/clutch simulation, tire temperature/wear, fuel, damage model, multiplayer, opponents or force-feedback wheel integration. Suspension and grip require human playtesting, especially on curbs. The spring/damper constants are calibrated for playability rather than a specific licensed car.

## Time attack

The timer starts at the gantry. Ordered quarter-lap checkpoints prevent a shortcut across the start line from counting as a lap. Going well outside the road invalidates the current lap. Best/last times and lap count are session-only. Reset restarts the out lap while keeping the current session best.

## Code map

- `src/core/Game.js`: lifecycle, fixed-step order, input orchestration, camera, pause.
- `src/core/InputState.js`: shared keyboard/controller input mapping.
- `src/core/Telemetry.js`: event and throttled JSON driving telemetry.
- `src/models/Car.js`: chassis/dynamics/view composition and public vehicle API.
- `src/physics/VehicleDynamics.js`: axle slip, forces, steering and surface response.
- `src/physics/TireModel.js`: smooth friction-circle tire saturation.
- `src/physics/PowertrainModel.js`: gear selection, drive force, braking and reverse.
- `src/physics/VehicleConfig.js`: dimensions, physical constants and defaults.
- `src/physics/Chassis.js`: Cannon chassis and four-wheel suspension construction.
- `src/physics/Terrain.js`: shared heightfield generation and height queries.
- `src/models/TrackLayout.js`: closed spline, sampling, nearest path and surface classification.
- `src/models/Track.js`: road meshes, physical curbs/barriers, spawn and circuit scenery.
- `src/models/LapTracker.js`: ordered lap gates, validity and best time.
- `src/view/CarView.js`: existing car asset, wheel steering/rotation/travel.
- `src/view/Environment.js`: lighting, grass, instanced trees and distant hills.
- `src/view/Assets.js`: build-safe references to the repository's existing models.
- `src/ui/Hud.js`: instruments, minimap, lap display and setup.

No outside game assets were copied. Car and paddock models are reused from the existing Racer repository. Referencing GLBs through Vite imports also makes them available in the production build.

## Checks

`npm test` runs 18 behavior tests, including a conservative simulated drive around the actual undulating circuit, suspension over a raised curb, steering direction, recovery from a yaw disturbance, braking with throttle, auto gears, reverse, off-road speed loss, lap gates and deterministic fixed-step behavior.

`npm run build` creates `dist/`. `npm run preview` serves it at http://127.0.0.1:4173. Three.js/Cannon produce a large initial JavaScript chunk; Vite's bundle-size advisory is retained. CI runs install, tests and build. The upgraded Vite toolchain audits clean at this revision.

Browser console/error messages still mirror to the Vite terminal. Periodic `[Telemetry:periodic]` messages are JSON at 1.5 second intervals, with input-linked snapshots, grounded/wheel contacts, steering, forces and suspension lengths. See handoff.md for observed browser evidence and outstanding acceptance.
