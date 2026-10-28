export class Telemetry {
  constructor() {
    this.last = 0;
  }
  input(event, state) {
    console.info(
      "[Input:telemetry]",
      JSON.stringify({
        event: event.event,
        player: event.player ?? "P1",
        key: event.key,
        inputState: event.state,
        speedKmh: Math.round(state.speedMps * 36) / 10,
        steer: state.steer,
        position: state.position,
      }),
    );
  }
  update(time, state, progress, race, advice, hoodCamera, localPlayers) {
    if (time - this.last < 1.5) return;
    this.last = time;
    console.info(
      "[Telemetry:periodic]",
      JSON.stringify({
        speedKmh: +(state.speedMps * 3.6).toFixed(1),
        progress: +progress.toFixed(3),
        racePhase: race?.phase,
        racePosition: race?.position,
        opponentProgress: race?.entries
          .filter((e) => !e.isPlayer)
          .map((e) => ({ id: e.id, distance: +e.distance.toFixed(3) })),
        lineStatus: advice?.level,
        lineTargetKmh: advice ? Math.round(advice.targetSpeed * 3.6) : null,
        hoodCamera,
        localPlayers,
        gear: state.gear,
        steer: +state.steer.toFixed(3),
        driveForce: +state.driveForce.toFixed(0),
        yawTorque: +state.yawTorque.toFixed(0),
        grounded: state.grounded,
        wheelContacts: state.wheelContacts,
        surface: state.surface,
        enginePowerKw: state.enginePowerKw,
        frontGrip: state.frontGrip,
        stabilityAssist: state.stabilityAssist,
        recoveryTorque: Math.round(state.recoveryTorque || 0),
        recoveryDrag: Math.round(state.recoveryDrag || 0),
        balanceTorque: Math.round(state.balanceTorque || 0),
        frontLateralLimit: Math.round(state.frontLateralLimit || 0),
        rearLateralCapacity: Math.round(state.rearLateralCapacity || 0),
        rearLateralForce: Math.round(state.rearLateralForce || 0),
        frontBrakeForce: Math.round(state.frontBrakeForce || 0),
        rearBrakeForce: Math.round(state.rearBrakeForce || 0),
        rearGripReserve: +(state.rearGripReserve ?? 1).toFixed(3),
        frontLateralForce: Math.round(state.frontLateralForce || 0),
        position: state.position,
        suspension: state.suspension.map((w) => +w.length.toFixed(3)),
      }),
    );
  }
}
