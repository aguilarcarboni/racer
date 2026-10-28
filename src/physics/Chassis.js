import * as CANNON from "cannon-es";
import { StabilityAssist } from "./StabilityAssist.js";
import { VEHICLE, CONTACT } from "./VehicleConfig.js";
export function createChassis(world, material, spawn) {
  const body = new CANNON.Body({
    mass: VEHICLE.mass,
    material,
    linearDamping: 0.005,
    angularDamping: 0.28,
  });
  body.addShape(
    new CANNON.Box(new CANNON.Vec3(0.76, 0.18, 1.55)),
    new CANNON.Vec3(0, 0.08, 0),
  );
  // Spread pitch/roll inertia without changing the collision hull or steering yaw inertia.
  body.inertia.x *= VEHICLE.pitchInertiaScale;
  body.inertia.z *= VEHICLE.rollInertiaScale;
  body.invInertia.set(
    1 / body.inertia.x,
    1 / body.inertia.y,
    1 / body.inertia.z,
  );
  body.position.set(spawn.x, spawn.y, spawn.z);
  body.quaternion.setFromEuler(0, spawn.yaw || 0, 0);
  body.updateInertiaWorld(true);
  body.allowSleep = false;
  body.updateAABB();
  const vehicle = new CANNON.RaycastVehicle({
    chassisBody: body,
    indexRightAxis: 0,
    indexUpAxis: 1,
    indexForwardAxis: 2,
  });
  for (const z of [VEHICLE.frontAxle, -VEHICLE.rearAxle])
    for (const x of [-VEHICLE.trackWidth / 2, VEHICLE.trackWidth / 2])
      vehicle.addWheel({
        radius: VEHICLE.wheelRadius,
        directionLocal: new CANNON.Vec3(0, -1, 0),
        axleLocal: new CANNON.Vec3(-1, 0, 0),
        chassisConnectionPointLocal: new CANNON.Vec3(
          x,
          VEHICLE.connectionHeight,
          z,
        ),
        suspensionRestLength: VEHICLE.restLength,
        suspensionStiffness: VEHICLE.stiffness,
        dampingCompression: VEHICLE.compression,
        dampingRelaxation: VEHICLE.rebound,
        maxSuspensionTravel: VEHICLE.travel,
        maxSuspensionForce: VEHICLE.maxSuspensionForce,
        frictionSlip: 0,
        rollInfluence: 0.1,
      });
  vehicle.addToWorld(world);
  return { body, vehicle };
}
export function applyDrive(body, forces, tuning) {
  const forward = body.vectorToWorldFrame(new CANNON.Vec3(0, 0, 1)),
    right = body.vectorToWorldFrame(new CANNON.Vec3(1, 0, 0));
  forward.y = 0;
  right.y = 0;
  forward.normalize();
  right.normalize();
  const force = forward
    .scale(forces.longitudinal)
    .vadd(right.scale(forces.lateral));
  // Ground-level force application creates real pitch/roll. Keep the lever modest for arcade recovery.
  body.applyForce(
    force,
    new CANNON.Vec3(0, -0.16 * (tuning.weightTransferLong / 0.25), 0),
  );
  body.torque.y += forces.torque;
  const balance = StabilityAssist.balance(
    body.vectorToWorldFrame(new CANNON.Vec3(0, 1, 0)),
    body.angularVelocity,
    forces.grounded,
    tuning.stabilityAssist ?? 0,
  );
  body.torque.x += balance.x;
  body.torque.z += balance.z;
  return { balanceTorque: Math.hypot(balance.x, balance.z) };
}

export function installVehicleContacts(world, ground, car) {
  world.addContactMaterial(
    new CANNON.ContactMaterial(ground, car, {
      friction: CONTACT.groundFriction,
      restitution: CONTACT.groundRestitution,
    }),
  );
  world.addContactMaterial(
    new CANNON.ContactMaterial(car, car, {
      friction: CONTACT.carFriction,
      restitution: CONTACT.carRestitution,
    }),
  );
}
