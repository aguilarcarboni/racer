export const RACE = Object.freeze({
  laps: 3,
  countdown: 3,
  spacing: 6,
  lane: 2,
});
export const LINE = Object.freeze({
  lateralAcceleration: 7,
  brakingDeceleration: 6.5,
  maxSpeed: 40.8,
  minSpeed: 10.5,
  amberRatio: 0.94,
  redRatio: 1.05,
  arrowSpacing: 3,
});
export const OPPONENTS = Object.freeze([
  { id: "sol", name: "SOL", color: "#4d91cc", slot: 0, pace: 0.92, lane: -0.8 },
  { id: "rio", name: "RIO", color: "#eee5cb", slot: 1, pace: 0.96, lane: 0.7 },
  {
    id: "nova",
    name: "NOVA",
    color: "#77a461",
    slot: 3,
    pace: 0.88,
    lane: 1.8,
  },
]);

export function createRaceParticipants(count = 1) {
  count = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
  const grid = [
    { id: "you", name: "YOU", color: "#dd542f", slot: 2 },
    ...OPPONENTS,
  ];
  return grid.map((entry, i) => ({
    ...entry,
    isPlayer: i < count,
    playerIndex: i < count ? i : null,
    name: i < count ? (count === 1 ? "YOU" : `PLAYER ${i + 1}`) : entry.name,
  }));
}
