import { PlayerCamera } from "./PlayerCamera.js";

export function getSplitLayout(width, height, count, orientation = "side") {
  count = Math.max(1, Math.min(4, Math.round(Number(count) || 1)));
  if (count === 1)
    return { views: [{ x: 0, y: 0, width, height }], center: null };
  const top = 68,
    bottom = 34,
    gap = 2,
    h = Math.max(2, height - top - bottom),
    w = Math.max(2, width);
  const columns = count === 2 && orientation === "stacked" ? 1 : 2,
    rows = count === 2 && orientation !== "stacked" ? 1 : 2;
  const cellW = Math.floor((w - (columns - 1) * gap) / columns),
    cellH = Math.floor((h - (rows - 1) * gap) / rows);
  const cells = Array.from({ length: columns * rows }, (_, i) => {
    const col = i % columns,
      row = Math.floor(i / columns),
      x = col * (cellW + gap),
      y = top + row * (cellH + gap);
    return {
      x,
      y,
      width: col === columns - 1 ? w - x : cellW,
      height: row === rows - 1 ? height - bottom - y : cellH,
    };
  });
  return {
    views: cells.slice(0, count),
    center: count === 3 ? cells[3] : null,
  };
}

export class SplitScreenRenderer {
  constructor(renderer, scene, track) {
    this.renderer = renderer;
    this.scene = scene;
    this.track = track;
    this.cameras = Array.from({ length: 4 }, () => new PlayerCamera());
    this.players = [];
    this.width = 1;
    this.height = 1;
  }
  configure(players, orientation = "side") {
    this.players = players;
    this.orientation = orientation;
    this.cameras.forEach((c) => c.reset());
    return this.resize(this.width, this.height);
  }
  resize(width, height) {
    this.width = width;
    this.height = height;
    this.layout = getSplitLayout(
      width,
      height,
      this.players.length,
      this.orientation,
    );
    this.layout.views.forEach((r, i) =>
      this.cameras[i].resize(r.width, r.height),
    );
    return this.layout;
  }
  reset() {
    this.cameras.forEach((c) => c.reset());
  }
  cycle(index) {
    return this.cameras[index]?.cycle();
  }
  render(dt, states) {
    const renderer = this.renderer;
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, this.width, this.height);
    renderer.clear();
    renderer.setScissorTest(true);
    this.players.forEach((entry, i) => {
      const rect = this.layout.views[i],
        camera = this.cameras[i];
      camera.update(dt, entry.car, this.track, states[i]);
      this.track.update(states[i].position, states[i]);
      const y = this.height - rect.y - rect.height;
      renderer.setViewport(rect.x, y, rect.width, rect.height);
      renderer.setScissor(rect.x, y, rect.width, rect.height);
      const visible = entry.car.mesh.visible;
      try {
        entry.car.setVisible(camera.mode !== 1);
        renderer.render(this.scene, camera.camera);
      } finally {
        entry.car.setVisible(visible);
      }
    });
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, this.width, this.height);
  }
}
