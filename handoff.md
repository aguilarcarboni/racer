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

The next action is the user's first drive. Follow the repository's fast playtest loop: collect their handling/bump/camera feedback before making another physics or gameplay iteration. Keep this as an arcade-friendly prototype rather than claiming a calibrated real-car simulator. Controller hardware, force-feedback wheels, mobile controls and human full-lap acceptance remain unverified. The original pass had no opponents or races; the club-race addition below supersedes that. Networking, vehicle damage and tire wear remain absent.

## A/D playtest correction

The user reported inverted keyboard steering and explicitly requested swapping A and D. Reversed only the keyboard steering contributions in InputState; retained the controller axis mapping. Updated the existing mapping assertions. Validate with npm test and npm run build, then obtain the next user playtest feedback before further handling edits.

## Controller playtest correction

The user also reported inverted controller steering. Reversed the controller axis contribution at the shared InputState boundary to match the accepted keyboard reversal. Updated the existing mapping assertions for both stick directions and simultaneous keyboard/controller input. No tire or suspension parameters changed.

## Lower-power / stronger-front playtest tune

Requested less horsepower and more front grip. Engine power cap reduced from 210 to 140 kW, peak drive force from 8,600 to 4,800 N, front cornering stiffness from 68,000 to 74,000 N/rad, and a front-only grip multiplier defaults to 1.15. Front tire grip is exposed in Car setup with model-boundary clamping and diagnostics. The existing acceleration/braking checks now allow the slower warm-up; full-circuit and stability checks remain. Earlier acceleration measurements above describe the previous tune. Await user feedback before further handling changes.

Matched-input headless check: five-second acceleration decreased from 92.95 to 69.23 km/h. At a fixed 72 km/h and full steering, modeled front lateral force increased from 3,942 to 4,339 N. All 19 tests and the build pass. These are simulation comparisons; acceptance of the new feel awaits the user.

## Three-opponent club race and reactive line

Added three physical opponents (SOL, RIO, NOVA), a staggered grid, throttle-triggered three-second countdown, three-lap finish classification, live standings and colored minimap dots. R resets the whole field and keeps the player's best lap. Opponents reuse Car, VehicleDynamics and the same suspension/terrain; physical steering bypasses only the human input inversion. The accepted 140 kW/front-grip tune is unchanged.

RaceField owns grid/control/per-car lap coordination. RaceSession owns countdown, distance and finish ordering. AiDriver uses previewed corner speeds, pure pursuit, traffic in circuit coordinates, committed passing lanes with clearance and a reverse recovery. The existing GLB is loaded once and cloned/recolored for the field. The renderer remains separate from control rules.

Replaced the fixed guide with chevrons colored by actual speed relative to a curvature limit and a backward braking envelope. Each road section gets its own color, so upcoming corners can be red while the straight remains green. Slowing down changes colors; brake input alone does not. L toggles the guide. This follows the road center rather than solving an optimal racing trajectory, and the recommendation is approximate rather than a guarantee of available grip.

Validation: 31 behavior tests, including the fastest AI driving the physical bumpy circuit and a four-body field with a stopped player: all three opponents pass it and complete at least three laps within 270 simulated seconds, with their centers remaining on the 12 m asphalt. Race countdown, classification across the timing seam, three-lap finishes, reset, braking-envelope continuity and actual-speed color changes are covered. Production build passes; the existing bundle-size advisory remains. Browser evidence shows all four car models loading, countdown/start, standings and moving minimap positions. Periodic logs report red at 116.9 km/h against a 110 km/h recommendation, amber at 91.6 against 91, and green after slowing. This is local validation, not human acceptance of the full race.

AI remains a prototype: contact and aggressive blocking can upset a car, and reverse recovery is basic. No rubber-banding, teleporting or network racing. Next step is the user's race playtest before any further gameplay/handling changes.

## First-person bounce and wheel detachment correction

The user reported first-person jumping and wheels appearing to fall off when launching with steering lock. The controlled physical launch retained all four contacts: body clearance varied 2.45 cm with a 2.21 degree pitch range. The old wheel animation reproduced 22.36 cm of visual hub-center excursion under steering and rotation, despite a stationary chassis. Its XYZ Euler order rotated steering around a spinning axis, and the original asset pivots were on the inner wheel faces rather than the hub centers.

WheelRig recenters each original wheel without moving the resting asset and separates suspension, steering and axle spin into nested transforms. Suspension displacement still comes from the physical wheel lengths. HoodCamera dampens vertical movement and reduces/filters chassis pitch while following heading immediately. Camera switches and resets snap to the correct pose. No tire, engine, suspension or AI handling parameters changed.

All 36 tests pass, including five new presentation checks using the actual GLB: resting geometry, full-lock spin without hub drift or axle precession, suspension travel in meters, camera vibration damping/heading response, and reset snapping. Production build passes with the existing bundle advisory. Browser chase/hood checks load all four rigs without console warnings/errors. Terminal telemetry now includes hood eye height, raw chassis pitch and filtered view pitch; a stationary sample showed 0.40 degrees raw versus 0.08 degrees in view. Browser control overlapped with a connected controller, so the controlled launch measurements above come from the deterministic simulation rather than browser input timing.

Next playtest: switch to first person with C, launch with full steering in both directions, and confirm the horizon is comfortable and the tires remain attached. Physical road undulation is intentionally retained. Await the user's feedback before another handling iteration.

## Faster, more forgiving arcade handling

The user accepted the wheel/camera correction and requested less fragile handling under braking and mid-corner, with roughly 20% more pace. The reproduced root cause was rear braking saturation: a fixed rear brake share consumed the unloaded rear axle's entire friction circle, leaving zero cornering force. A matched 90 km/h braking/turning run reached 108.65 degrees of sideslip; the car spun even with four wheel contacts.

Braking now uses at most 70% of each axle's current longitudinal grip, retaining cornering capacity. Full-lock steering is softened by up to 35% during hard braking at road speed; parking-speed steering is retained. Rear cornering stiffness is 88,000 N/rad, rear grip multiplier 1.14, asphalt/curb grip is more forgiving, pitch/load sensitivity defaults to 0.15/0.18, and rear rotation to 0.06. Tire forces still obey the friction circle and physical suspension remains. No direct yaw forcing or velocity steering was added. The low-speed tire blend now also applies to the steered lateral force's longitudinal projection, preventing steering alone from creating propulsion at rest.

Engine power/peak drive rise 20% to 168 kW/5,760 N. Forward gear speed ranges and the guide's straight speed ceiling rise 20%. Opponents share this physical tune; traffic preview grows with speed and close passing aims for room before an obstacle. Passing plans retain extra lateral clearance and blocked recovery recognizes a partially completed lane change.

Matched five-second acceleration: 69.23 to 83.27 km/h (+20.3%). In the matched 90 km/h brake/corner scenario, maximum sideslip decreases from 108.65 to 7.17 degrees; power-on mid-corner slip falls from 5.88 to 1.34 degrees. Full-brake/full-lock checks at 65, 90 and 115 km/h in both directions remain below 15 degrees. Those are deterministic simulation measurements, not a universal 20% lap-time improvement or human acceptance of the handling feel.

Validation includes 40 behavior tests: hard braking with full lock, power/lift-off stability, rear grip under a rearward brake setup, the measured acceleration range, original suspension/wheel/camera checks, the actual bumpy circuit, and three physical opponents passing a stopped player and completing three laps. Setup UI initializes from the model, keeping displayed slider defaults consistent. Periodic telemetry includes rear lateral force, per-axle braking and remaining rear cornering capacity. Next action is the user's braking/cornering playtest before another handling iteration.

Browser validation of this tune reached 67 km/h on the opening straight, then stopped with full steering/braking while staying on asphalt. A braking telemetry sample retained 3,049 N rear lateral force, a 0.714 rear cornering-capacity fraction and four wheel contacts, with 168 kW reported. No browser warnings/errors were observed. The production build passes with the existing bundle-size advisory.

## Sharper turn-in with planted cornering

The user requested more responsive steering and front bite while keeping the forgiving balance. The previous steering filter (rate 7) and front cornering stiffness (74,000 versus rear 88,000 N/rad) left a slow initial response and pronounced understeer. Matched 90 km/h steering-step measurement reached 0.15 rad/s yaw after 0.292 s, with 0.176 rad/s yaw after two seconds.

Steering response is now rate 11, front stiffness 88,000 N/rad, and default front grip 1.20 (previously 1.15). Sharpening the front alone reproduced snap oversteer in the existing hard-brake/power-on checks: the front could demand more yaw moment than the rear's remaining friction circle supported. TireModel now accepts a finite lateral-force ceiling, and VehicleDynamics bounds front cornering capacity by remaining rear lateral capacity times the axle lever ratio with a small reserve. This preserves initial tire stiffness/turn-in while favoring understeer at the combined-grip limit. Handbrake rotation bypasses this balance aid. There is no direct yaw forcing, velocity steering or new aerodynamic force.

Matched 90 km/h response is 0.192 s (about 34% sooner), with 0.231 rad/s yaw after two seconds (about 31% more sustained rotation). Full-lock stress tests at 65/90/115 km/h show maximum braking sideslip about 9.0-9.2 degrees and power-on sideslip about 3 degrees. Existing braking reserves, rear tune, 168 kW power and forward gear speeds are retained. Front grip remains adjustable; the guide's grip-scaling test now references the actual default instead of the old literal value.

Validation covers 42 behavior tests, adding measured turn-in in both directions and rapid left/right full-throttle transitions. It also retains full-brake, power/lift-off, physical bump/circuit, four-car three-lap, wheel-hub and camera checks. Periodic telemetry includes front lateral ceiling and available rear lateral force for follow-up diagnosis. These measurements are local simulation evidence; next action is the user's corner-entry playtest before further tuning.

All 42 tests and the production build pass for this turn-in tune; the existing bundle-size advisory remains.

## Local split screen for up to four players

Added a Local race lobby with 2/3/4-player selection, A/Cross controller joining, optional keyboard P1, controller readiness and Start/Options start/resume. Two players choose side-by-side or stacked views. Three players use equal quadrants plus a shared race-center map/classification; four get equal quadrants. View grid allows a parked preview before controllers are joined. Solo remains the default and Back to solo restores it. Player-count/input setup changes reset the race; layout changes keep progress.

The existing four physical cars are promoted to human slots, with AI filling remaining places. Local humans inherit the host tune. Each player owns camera selection, instruments, lap timing, finish rank and reactive line colors. All views share one 120 Hz physics world and one WebGL context; viewport/scissor rectangles are logical pixels, with a per-camera aspect. Hood view hides its owner only during that render and restores visibility for other players. Local rendering caps pixel ratio at 1.25; the accepted physics tune is unchanged.

GamepadAssignments stores the actual device index/id per slot, preserving holes and identical device names. LocalControllers reads fresh snapshots once per frame and isolates action callbacks and driving inputs. Join/reconnect primes held buttons so joining does not shift and a held Start cannot resume. Any missing local controller neutralizes that input, pauses the running race and opens reconnect/replacement setup. Other players retain their slots. RaceSession records each human finish and only completes after all humans finish.

A preview issue was reproduced visually: continuously simulating the unoccupied parked cars let tiny idle yaw drift accumulate. LocalRaceGate now permits only 1.5 s of gravity settling in the parked local preview, then freezes until ready/start. Running-race pause, setup and controller-loss states never advance physics. Telemetry identifies player/device, all local car speeds/positions, and per-player camera events.

Validation: all 60 tests pass, including sparse-index four-pad assignment, no double claims, replacement/reconnection, held-button safety, independent camera/actions, one pause for simultaneous Start, four physical car input isolation, multiplayer finishes, viewport bounds/restoration, per-view line speeds and owner-only hood hiding. Existing handling, wheel/camera, bumpy circuit and AI three-lap tests remain. The production build passes with the existing bundle-size advisory.

Browser checks exercised solo, 2-player stacked mode, 3-player race center, four distinct views, and changing only P2 to hood view. Holding keyboard throttle while another required pad was absent did not start the race or move a car. No browser warnings/errors appeared in these checks. No real controllers were exposed in the test browser: four-controller routing was exercised with fixtures, so four-physical-pad playability/performance remains a user acceptance step. No navigator/controller injection was left in the browser.

Next playtest: connect up to four standard controllers, focus the game, Local race -> choose count -> press A/Cross on each -> Start/Options. Check input isolation, each camera, full-race finishes and disconnect/reconnect pause. Then obtain user feedback before another gameplay iteration.

## Two shared-keyboard players plus a controller

Replaced the keyboard-P1 checkbox with a zero/one/two keyboard-seat selector. Choose 3 players and 2 keyboard players; P1 uses WASD/Space/C, P2 arrows/Right Shift/Enter, and A/Cross joins the one pad into P3. Two keyboard players can race without pads; four players can use two keyboard seats plus two pads. Automatic gears remain default. P1 manual shifts use E/Q in local mode (solo arrows retained); P2 uses period/comma. Escape pauses the shared race. All accepted vehicle tuning is unchanged.

KeyboardProfiles centralizes key maps and labels. InputController samples both sets independently, maps per-player camera/shift actions, clears on blur and key-up even if focus moved into a setup field. GamepadAssignments reserves every keyboard seat so a pad cannot steal it, while preserving explicit replacement/disconnect behavior. HUD and lobby show each keyboard's actual controls and start/camera hints. Returning from the lobby focuses the game surface so Enter controls P2 rather than clicking a previously focused menu button.

Validation: 65 behavior tests including mixed two-keyboard/one-pad input isolation, slot reservation and replacement, both keyboard cameras/shift routes, solo arrow shifts and held-key release. Production build passes with the existing size advisory. Browser checks showed P2 at 36 km/h on Up while P1 stayed at zero; W then accelerated P1 to 24 km/h. Enter changed only P2 to hood, C changed P1, and Escape paused both. Terminal logs confirmed per-player key and camera events. Physical shared-keyboard rollover and the actual controller still require the user's playtest.
