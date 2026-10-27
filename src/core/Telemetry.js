export class Telemetry {
  constructor() {
    this.last = 0;
  }
  input(event, state) {
    console.info(
      "[Input:telemetry]",
      JSON.stringify({
        event: event.event,
        key: event.key,
        inputState: event.state,
        speedKmh: Math.round(state.speedMps * 36) / 10,
        steer: state.steer,
        position: state.position,
      }),
    );
  }
  update(time, state, progress) {
    if (time - this.last < 1.5) return;
    this.last = time;
    console.info(
      "[Telemetry:periodic]",
      JSON.stringify({
        speedKmh: +(state.speedMps * 3.6).toFixed(1),
        progress: +progress.toFixed(3),
        gear: state.gear,
        steer: +state.steer.toFixed(3),
        driveForce: +state.driveForce.toFixed(0),
        yawTorque: +state.yawTorque.toFixed(0),
        grounded: state.grounded,
        wheelContacts: state.wheelContacts,
        surface: state.surface,
        enginePowerKw: state.enginePowerKw,
        frontGrip: state.frontGrip,
        frontLateralForce: Math.round(state.frontLateralForce || 0),
        position: state.position,
        suspension: state.suspension.map((w) => +w.length.toFixed(3)),
      }),
    );
  }
}
