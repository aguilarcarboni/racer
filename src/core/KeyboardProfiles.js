export const KEYBOARD_PROFILES = [
  {
    label: "WASD + Space",
    start: "W TO START",
    cameraLabel: "C",
    keys: {
      KeyW: "forward",
      KeyS: "backward",
      KeyA: "left",
      KeyD: "right",
      Space: "handbrake",
    },
    actions: {
      KeyC: "onToggleCamera",
      KeyE: "onShiftUp",
      KeyQ: "onShiftDown",
      KeyG: "onToggleTransmission",
    },
  },
];

export function getKeyboardCount(players, requested = 0) {
  return players === 1
    ? 1
    : Math.max(0, Math.min(1, players, Math.round(Number(requested) || 0)));
}
