export const ONLINE = Object.freeze({
  maxPlayers: 4,
  inputMs: 80,
  lobbyMs: 1000,
  staleInputMs: 700,
  disconnectMs: 30000,
  roomExpiryMs: 1800000, // Legacy compatibility; active rooms use phase-specific idle limits.
  lobbyIdleMs: 5 * 60 * 1000,
  raceIdleMs: 10 * 60 * 1000,
  finishedIdleMs: 2 * 60 * 1000,
  maxRoomLifeMs: 2 * 60 * 60 * 1000,
  socketSilenceMs: 15000,
  cleanupMs: 5000,
});
export const CAR_IDS = ["you", "sol", "rio", "nova"];
export const CAR_COLORS = ["#dd542f", "#4d91cc", "#eee5cb", "#77a461"];
export const IDLE_INPUT = Object.freeze({
  steerAxis: 0,
  throttleAxis: 0,
  brakeAxis: 0,
  handbrake: false,
});
export function cleanInput(input = {}) {
  const number = (v, min, max) =>
    Math.max(min, Math.min(max, Number.isFinite(v) ? v : 0));
  return {
    steerAxis: number(input.steerAxis, -1, 1),
    throttleAxis: number(input.throttleAxis, 0, 1),
    brakeAxis: number(input.brakeAxis, 0, 1),
    handbrake: input.handbrake === true,
    ...(input.parked === true ? { parked: true } : {}),
  };
}
export function cleanName(value) {
  return (
    String(value ?? "")
      .trim()
      .replace(/[<>\u0000-\u001f]/g, "")
      .slice(0, 18) || "Racer"
  );
}
