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

## Faster arcade grip and contact recovery

The user requested a stronger shift toward fast, forgiving motorsport arcade handling, citing iRacing Arcade and Karting Superstars. Reviewed their official descriptions plus Circuit Superstars: accessible tactile physics, finite grip, racing-line skill. This is a design reference, not a claim to have played or reproduced their proprietary model. Links and measurements are in README.

Baseline 820cfa9: flat-road 0-100 km/h 6.067 s; five-second speed 83.27 km/h. A physical rear-quarter collision (rear car 38 m/s, front car 8 m/s, 0.95 m offset) reached 73.25 degrees sideslip. Root causes/scope: power/gearing limited acceleration; existing corner guards did not provide a recovery window after a strong external yaw disturbance; thin chassis inertia made pitch/roll easy to excite.

Changed to 230 kW / 7,800 N, longer gears with 84 m/s governor, asphalt/curb grip 1.55/1.42, stronger tires and rear reserve, shared 14 m/s2 steering allowance. Guide/AI profiles carry more pace. New StabilityAssist provides bounded recovery torque/drag only as a slide worsens, plus grounded tilt/rate torques. Normal turn-in, handbrake yaw, reverse and air remain gated. No heading target, velocity rewrite, rotation lock or orientation snap. Increased pitch/roll inertia leaves yaw inertia unchanged. Explicit low-friction, low-bounce car contact materials avoid generic contact snagging. Stability assistance is exposed 0..1 (default 0.85), validated and included in telemetry with recovery/balance torque and drag. All humans/AI use the physical model; local-human slider sharing is retained.

Matched current flat-road results: 0-100 km/h 4.408 s; five-second speed 112.63 km/h. Rear-quarter peak sideslip 29.83 degrees; both cars recovered and continued above 140 km/h after five seconds. A 2.5 rad/s yaw disturbance now stays near 20.7 degrees sideslip (previous 72.9) and recovers under power. Elevated 5,000 Ns side impulse: 24.6 degrees peak tilt with assistance, 92.7 with assistance disabled on the current chassis. These are simulation evidence, not guaranteed human lap-time improvements.

72 behavior tests include physical contacts mirrored left/right, a crossing impact, strong spin recovery both directions, high roll impulse, high-speed full-lock braking, assistance gates, all previous turn-in/quick transitions, road bumps, four-car three-lap AI and mixed local input. Production build passes with the existing bundle-size advisory. Browser acceleration reached 111 km/h, then simultaneous braking/steering reduced speed to 60 km/h in about 1.1 s on asphalt. Terminal telemetry confirms 230 kW, four grounded contacts, active braking forces and the new assistance diagnostics. Next step is the user's pace/contact playtest before another handling iteration. Severe crashes may still stop or overturn a car; R restarts.

## Sites hosting and single keyboard player

The user requested ChatGPT Sites hosting with local multiplayer, then explicitly limited keyboard play to one player maximum. Removed the P2 keyboard profile and lobby choice; keyboard-count validation now clamps to one even for stale or excessive values. Four-player local play supports one keyboard plus three pads, or four pads. Input isolation, sparse pad joins, replacement and camera/shift routing remain tested. This supersedes the earlier two-keyboard implementation. Physics tune remains unchanged. Hosting uses the production Vite static build, with the same browser-side 120 Hz world and split rendering. Performance depends on the client GPU/device and number of views; hosted play is local multiplayer on one device.

Sites publication uses its own checkout at /Users/aguilarcarboni/Documents/Codex/2026-10-27/i-wa/work/sites/racer-valle. Reuse that checkout's .openai/hosting.json and project_id appgprj_6ae1478092f0819195a7c06ca8cd29b4 for future hosted changes; do not create a duplicate Site. The GitHub Racer checkout remains the game source, so sync requested game changes into the Site checkout before its source-helper build/package/publish flow. All 72 tests pass; the static production preview was browser-tested for driving and the four-player lobby with exactly one keyboard option. The Site is owner-private. Native Sites deployment/status is authoritative for availability.

## Offline / online code lobbies

The user authorized online multiplayer for up to four players, one per device, retaining offline solo and local split-screen with at most one keyboard player. Added Create lobby / Join with code, names, invite links, ready checks, host-only start, shared countdown/physics/race, reconnect and another-round flow. Spare grid places use physical AI.

PhysicsCar separates the existing model from CarView. TrackCollisions shares exact sampled terrain/curbs/rails between browser and server. RaceSimulation owns positions, contacts, lap gates and results at 120 Hz. OnlineRace predicts the selected car, blends presentation corrections, interpolates remote snapshots and binds this device's camera/HUD. Accepted offline handling remains unchanged. Parked inputs now bypass automatic reverse after a reproduced online parking issue.

The first deployed Worker/D1 HTTP transport passed membership checks but measured 664 ms median requests and could not sustain race pace. Replaced the fast path with a dedicated Node/WebSocket server, memory room state and 20 Hz input/snapshot streams. The existing public Site remains the frontend; applied D1 migrations are retained and immutable, outside the race loop. SiteWorker forwards legacy HTTP room requests to the dedicated service.

The user selected personal project eaglenest-507101 and aguilarcarboni@gmail.com, enabled billing, and explicitly approved racer-build (Cloud Run Builder role) plus racer-runtime (no project roles). No company project/configuration changes. Cloud Run service racer-online is in us-central1, min zero/max one instance, 512 MiB/1 CPU, 80 concurrent requests, one-hour WebSocket timeout. The production endpoint is in ServerConfig.js. Rooms are transient and reset on deployment/restart. Room cap is 16; a larger service needs deliberate room routing/shared persistence.

Membership is session/device bound with six random code characters and four-member capacity. Tokens are hashed, never logged or leaked to peers. Inputs are bounded and sequence checked; silence brakes at 700 ms, disconnect grace is 30 seconds, then DNF. Host control transfers on leave/staleness. Online pause brakes only the local car. Reload resumes the saved session; leaving returns to offline. Stream logs report tick duration and buffered bytes without credentials.

Local evidence: 83 behavior tests pass, including four real HTTP/WebSocket sessions with physical input isolation, shared wall-clock timing, capacity/host guards, reconnect, invalid token/origin rejection, and all 72 prior physics/wheel/camera/local multiplayer tests. Browser Create/ready/start showed four members and a shared race; browser Join in the earlier transport selected the correct non-host car/camera and reached 43 km/h. Four actual devices under real WAN conditions still need user acceptance. Hosted performance and publication evidence are appended after final validation.

Hosted streaming validation: production revision racer-online-00002-xsf served four independent HTTPS/WebSocket clients. Fifth member rejected (409), non-host start rejected (403), no token leakage. Median round trip 162 ms, latest snapshot ages 65-67 ms, shared-clock spread zero, clock drift 0.001 s over the eight-second measured driving window. The controlled car reached 156.2 km/h. Initial per-message compression caused growing delays on the hosted server; disabling it restored stable streaming. Measured aggregate outbound was 1,067 KiB/s for four clients, about 3.7 GiB per lobby-hour. This is a short live protocol/physics probe, not four-device hardware acceptance.

## Online lag optimization

User playtesting reported severe lag despite the earlier short ping result. Live logs showed 180-348 ms simulation windows against a 50 ms budget, and a fresh baseline probe reproduced multi-second ping bursts, 1.377 s simulation drift and 0.608 s inter-client clock spread. CPU profiling identified whole-circuit curb triangle queries and broadphase scans; the client also re-simulated all four wheel suspensions during reconciliation and rebuilt hidden lobby DOM each packet.

Partitioned the same curb triangles into short centered sections, indexed static AABBs for wheel rays, and removed allocations from nearest-track queries. Kept accepted handling parameters and physical road geometry. Server snapshot generation now runs once per room/broadcast. Protocol 2 uses bounded compact snapshots (full precision is retained server-side), with protocol 1 compatibility. Removed redundant HTTP polling while a stream is active and cached CORS preflights. Client prediction replays historical controls with a measured server-time mapping and a bounded catch-up budget; remote hulls retain collision presence without duplicate suspension, restored on leaving online. Presentation heading corrections blend instead of snapping. Hidden lobby render work is keyed to meaningful changes. Server physics initializes during startup. Resource allocation increased to 2 CPUs / 1 GiB, min zero/max one instance, personal project only.

87 tests passed, including indexed query equivalence across 600 random/seam/moving-body cases, compact packet precision and >70 percent size reduction, changing-control replay bounds, remote-proxy return to full dynamics, real four-client protocol-2 physics, and prior handling/wheel/camera/local tests. Browser non-host Join/ready/race drove to 57 km/h; telemetry recorded 16-17 ms render frames and 0.02-0.08 m presentation corrections in observed local samples. No handling retune.

Hosted revision racer-online-00003-pw2: four-client probe measured 129 ms median ping, 215 KiB/s aggregate outbound (80 percent below 1,067), zero measured eight-second clock drift, 0.1 s maximum client clock spread, and 154.8 km/h controlled-car peak. Stream window p95 16 ms/max 23 ms in the sampled log. Two humans plus two physical AI: 122 ms median ping, 99 KiB/s, 0.034 s drift over 15 seconds, zero measured inter-client spread; sampled p95 windows 18-37 ms/max 51 ms. No queued output bytes in sampled logs. Physical WAN group playtest remains the user's acceptance step. Resource/payload changes imply a gross estimated US$0.27-0.33 per four-player hour before free allowances and minor ancillary charges.

## Network latency pass and South Carolina migration

User clarified the way cars drive is accepted and remaining work is server/code/network. No engine, grip, steering, suspension or stability retune. Identified up to 50 ms waiting for periodic control sends, another server pump wait, fixed 120 ms remote interpolation, and an extrapolation branch that froze the newest pose when multiple snapshots existed. Lobby HTTP timing could also distort the displayed WebSocket ping.

InputSender now sends material changes immediately, coalesces analog samples at a maximum of 50 Hz, retains a 20 Hz heartbeat, and clears pending callbacks on disconnect. Server room pump is 60 Hz, snapshots 30 Hz, physical integration unchanged at 120 Hz. Remote interpolation starts at 60 ms and adapts within 50-100 ms; missed frames extrapolate with a 120 ms cap and clock corrections retain ordered samples. The ping label uses only WebSocket RTT once available.

Measured candidate region HTTP latencies from this connection: South Carolina 92 ms, Iowa 125 ms, North Virginia 112 ms, Dallas 120 ms, Mexico 144 ms. Deployed the same dedicated Racer architecture in us-east1 with the existing approved service accounts and 2 CPUs / 1 GiB, min zero/max one instance. Actual protocol-2 racing tests then measured 98 ms median ping with four clients and 99 ms with two humans plus two AI, against 122-129 ms previously in Iowa. Both rooms tested concurrently. Four-client snapshot ages 40-46 ms, clock drift 0.009 s over eight seconds, zero inter-client spread, 328 KiB/s outbound. Mixed field drift 0.015 s over 15 seconds, zero spread, 150 KiB/s. Membership capacity/host checks and token isolation passed. South Carolina revision racer-online-00001-7cj. Short sampled pump p95 values 11-15 ms, with one 69 ms maximum; no queued output bytes in samples. Region benefits can vary for other players' connections.

Five focused tests protect immediate delivery, analog coalescing/rate bounds, held-input heartbeat and cancellation, missed-frame extrapolation/clock ordering, and HTTP-independent ping reporting. Full suite now 92 tests. Update cadence adds bandwidth relative to the previous 20 Hz version; gross current estimate US$0.32-0.40 per four-player hour before free allowances and ancillary charges. Frontend endpoint is now the us-east1 service. Retire the former Iowa game service after the published client switches successfully; old rooms are transient. Next step is the user's same-handling network playtest.

## Owner closure and resource lifecycle

User requested reliable lobby/server cleanup and owner closure on leaving. Owner Leave/Close now immediately revision-deletes the room and emits terminal closure to every associated socket. Guest leave preserves the owner's room. There is no automatic host transfer. Owner loss has 30 seconds of reconnect grace; leaving a page sends WebSocket leave plus best-effort keepalive HTTP. Expired/closed sessions do not reconnect forever. UI labels explicitly state owner closure affects everyone, and guests receive the reason before returning to the online entry screen.

RoomLifecycle separates meaningful controls/user actions from presence. Waiting/racing/results idle limits are 5/10/2 minutes and absolute lifetime is 2 hours. Control heartbeats/polls keep presence current without extending idle expiry. Cleanup sweeps every 5 seconds. Unauthenticated sockets expire after 5 seconds, silent authenticated sockets after 15 seconds, and close handshakes have a 2-second forced-termination bound. Timing maps are removed on room closure. The 60 Hz pump starts with an authenticated peer and stops when none remain; no application request/connection is held open just to keep an empty service alive. Cloud Run min instances remains zero; platform scale-down timing is distinct from confirmed zero application rooms/connections.

Fixed late Create/resume cancellation so a user returning offline cannot reopen an orphaned room when a delayed response arrives. Invalid room tokens are rejected before running simulation work. Reset the camera/prediction binding on online exit so entering another lobby reconfigures the correct per-device camera and remote proxies. Accepted driving tune stays unchanged.

104 tests passed. New cases cover both Memory and real SQLite deletion/CAS safety, owner-only close, guest leave, owner grace and guest presence, heartbeat-only expiry, max lifetime despite activity, distinct race/results timeouts, real HTTP/WebSocket owner exit and page exit, cross-room isolation, terminal guest closure without reconnect, timing-cache and pump release, health counters, and cancelled-create cleanup. Local browser Create displayed both owner-close labels; clicking Close lobby returned to offline and health showed rooms=0, connections=0, roomPumpRunning=false. Production backend deployed revision racer-online-00002-47k in us-east1. Live cleanup probe and frontend publication are completed in this delivery.

Live production closure probe: a guest close attempt was rejected (403); owner exit notified and disconnected the guest; the closed code rejected joining (404); a separate owner lobby remained connected. Page exit from that second owner then returned aggregate health to rooms=0, connections=0, roomPumpRunning=false, unchanged after 1.2 seconds with no guest reconnect. No other active rooms were present at baseline.
