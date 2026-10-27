# Racer handoff / 2026-10-27

## Requested direction

The user requested the same level of presentation improvement as Sideout, a proper track, and physics in the spirit of iRacing Arcade: believable but accessible, with some bumpiness. This pass keeps the original Racer repository, existing car/paddock assets, keyboard/controller entry points and tuning controls.

## Completed first pass

Valle Motor Park is a 1.04 km closed circuit with a long opening straight, sweeping bends and an infield sequence. It has physical raised curbs and guardrails, runoff, grass, paddock buildings, a grandstand, start gantry, braking boards, an optional centerline guide, instanced trees and rolling hills. A warm lighting setup, readable instruments, minimap, lap/best/last timing, sector indicator, setup drawer and three camera views replace the diagnostic-page presentation.

Driving uses a 120 Hz tire-force model and a four-wheel Cannon raycast suspension. The shared heightfield creates actual road undulation; curb collision meshes move the suspension and chassis. Full-throttle traction control reserves cornering grip. Steering signs are consistent across keyboard and controller; braking works with held throttle; automatic gears and brake-to-reverse are the default. Manual shifts and original tuning parameters remain. Suspension firmness is a new exposed setup control.

Root causes addressed: reversed input merge; throttle excluding brake logic; front slip opposing a separate yaw controller; frame-dependent control stepping; no suspension; cosmetic-only road height; full-throttle rear saturation turning road disturbances into spins. Road ribbons are subdivided across their width and camera near-plane precision increased to avoid terrain/depth artifacts in the overview. Build-safe GLB imports fix the previous runtime-only asset paths.

## Validation

- All 18 Node behavior tests pass.
- The integrated simulated driver completes the actual undulating circuit in about 70 seconds at a conservative ~57 km/h, with maximum centerline error 3.27 m on the 12 m wide asphalt and 0.122 m of suspension-length variation. This is simulation evidence, not a human lap or a racing AI feature.
- Browser keyboard playtest on the opening straight accelerated to 92.2 km/h in approximately five seconds, with automatic shifts. Braking reduced it to 38.3 km/h over the next 1.3 seconds while remaining on asphalt; all four wheel contacts were reported. Pause and camera cycling were exercised.
- A fresh final browser session showed no warnings/errors during that driving check.
- Production build passes and includes all referenced GLBs. The ~702 KB raw / 186 KB gzip JavaScript chunk still triggers Vite's size advisory.
- Dependency installation audited with zero vulnerabilities after upgrading Vite. No globally installed tools or user settings were changed.
- The dev server uses polling because native file notifications initially left stale browser modules cached during this session.

## Controls and next iteration

W/S throttle, brake and reverse; A/D steering; Space handbrake; C chase/hood/circuit camera; G auto/manual; Up/Down manual shift; L guide; R reset; Escape pause. Open Car setup for the existing tuning controls plus suspension firmness.

The next action is the user's first drive. Follow the repository's fast playtest loop: collect their handling/bump/camera feedback before making another physics or gameplay iteration. Keep this as an arcade-friendly prototype rather than claiming a calibrated real-car simulator. Controller hardware, force-feedback wheels, mobile controls and human full-lap acceptance remain unverified. There are no opponents, races, networking, vehicle damage or tire wear yet.

## A/D playtest correction

The user reported inverted keyboard steering and explicitly requested swapping A and D. Reversed only the keyboard steering contributions in InputState; retained the controller axis mapping. Updated the existing mapping assertions. Validate with npm test and npm run build, then obtain the next user playtest feedback before further handling edits.

## Controller playtest correction

The user also reported inverted controller steering. Reversed the controller axis contribution at the shared InputState boundary to match the accepted keyboard reversal. Updated the existing mapping assertions for both stick directions and simultaneous keyboard/controller input. No tire or suspension parameters changed.
