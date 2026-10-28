import { DEFAULT_TUNE } from "../physics/VehicleConfig.js";
const surfaces = ["asphalt", "curb", "gravel", "grass"];
const q = (n, scale = 1000) =>
  Math.round((Number.isFinite(n) ? n : 0) * scale) / scale;
// Wire-only quantization: server physics and room storage retain full precision.
export function packRoom(room) {
  if (!room.snapshot) return room;
  return {
    ...room,
    snapshot: {
      race: room.snapshot.race,
      cars: room.snapshot.cars.map((car) => {
        const p = car.physics,
          d = p.dynamics,
          e = d.engine,
          pose = p.pose,
          r = pose.quaternion;
        return [
          car.id,
          [
            q(pose.x),
            q(pose.y),
            q(pose.z),
            q(r.x, 100000),
            q(r.y, 100000),
            q(r.z, 100000),
            q(r.w, 100000),
            ...p.velocity.map((v) => q(v)),
            ...p.angularVelocity.map((v) => q(v)),
            q(p.groundHeight),
            q(d.steer, 100000),
            q(d.lastAccel),
            q(d.lastLateral),
            e.gear,
            +e.automatic,
            q(e.reverseTimer),
            q(e.throttle),
            q(d.debug.steerAngle, 100000),
            q(d.debug.driveForce, 10),
          ],
          p.wheels.flatMap((w) => [
            q(w.length, 10000),
            +w.contact,
            q(w.force, 10),
          ]),
          surfaces.indexOf(p.surface),
          car.lap,
        ];
      }),
    },
  };
}
export function unpackRoom(room) {
  if (!room.snapshot || !Array.isArray(room.snapshot.cars[0])) return room;
  return {
    ...room,
    snapshot: {
      race: room.snapshot.race,
      cars: room.snapshot.cars.map(([id, a, w, s, lap]) => {
        const pose = {
          x: a[0],
          y: a[1],
          z: a[2],
          quaternion: { x: a[3], y: a[4], z: a[5], w: a[6] },
        };
        const velocity = a.slice(7, 10),
          wheels = Array.from({ length: 4 }, (_, i) => ({
            length: w[i * 3],
            contact: !!w[i * 3 + 1],
            force: w[i * 3 + 2],
          }));
        const physics = {
          pose,
          velocity,
          angularVelocity: a.slice(10, 13),
          groundHeight: a[13],
          surface: surfaces[s] || "asphalt",
          wheels,
          dynamics: {
            steer: a[14],
            lastAccel: a[15],
            lastLateral: a[16],
            tuning: { ...DEFAULT_TUNE },
            engine: {
              gear: a[17],
              automatic: !!a[18],
              reverseTimer: a[19],
              throttle: a[20],
            },
            debug: {
              steerAngle: a[21],
              driveForce: a[22],
              yawTorque: 0,
              grounded: wheels.some((w) => w.contact),
            },
          },
        };
        return {
          id,
          physics,
          lap,
          state: {
            position: { x: pose.x, y: pose.y, z: pose.z },
            speedMps: Math.hypot(velocity[0], velocity[2]),
            frontGrip: DEFAULT_TUNE.frontGrip,
          },
        };
      }),
    },
  };
}
