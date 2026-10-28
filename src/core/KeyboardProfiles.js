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
  {
    label: "Arrow keys + Right Shift",
    start: "UP ARROW TO START",
    cameraLabel: "Enter",
    keys: {
      ArrowUp: "forward",
      ArrowDown: "backward",
      ArrowLeft: "left",
      ArrowRight: "right",
      ShiftRight: "handbrake",
    },
    actions: {
      Enter: "onToggleCamera",
      Period: "onShiftUp",
      Comma: "onShiftDown",
    },
  },
];

export function getKeyboardCount(players, requested = 0) {
  return players === 1
    ? 1
    : Math.max(0, Math.min(2, players, Math.round(Number(requested) || 0)));
}
