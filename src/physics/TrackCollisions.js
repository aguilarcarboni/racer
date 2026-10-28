import * as C from "cannon-es";

export class TrackCollisions {
  constructor(layout, terrain) {
    this.layout = layout;
    this.terrain = terrain;
  }
  create(world, material) {
    this.terrain.createBody(world, material);
    for (const side of [-1, 1]) {
      const points = [],
        triangles = [],
        n = this.layout.samples.length,
        columns = 2;
      for (let i = 0; i <= n; i++) {
        const p = this.layout.samples[i % n];
        for (let c = 0; c <= columns; c++) {
          const offset = side * (6 + (1.2 * c) / columns),
            x = p.x + p.nx * offset,
            z = p.z + p.nz * offset;
          points.push(
            Math.fround(x),
            Math.fround(this.terrain.getHeight(x, z) + 0.105),
            Math.fround(z),
          );
        }
        if (i < n)
          for (let c = 0; c < columns; c++) {
            const a = i * 3 + c,
              b = a + 3;
            triangles.push(a, b, a + 1, a + 1, b, b + 1);
          }
      }
      const curb = new C.Body({ mass: 0, material });
      curb.addShape(new C.Trimesh(points, triangles));
      curb.updateAABB();
      world.addBody(curb);
      for (let i = 0; i < 120; i++) {
        const a = this.layout.sample(i / 120),
          b = this.layout.sample((i + 1) / 120);
        const ax = a.x + a.nx * 11.8 * side,
          az = a.z + a.nz * 11.8 * side,
          bx = b.x + b.nx * 11.8 * side,
          bz = b.z + b.nz * 11.8 * side;
        const body = new C.Body({
          mass: 0,
          material,
          shape: new C.Box(
            new C.Vec3(0.12, 0.45, Math.hypot(bx - ax, bz - az) / 2 + 0.12),
          ),
        });
        body.position.set(
          (ax + bx) / 2,
          (this.terrain.getHeight(ax, az) + this.terrain.getHeight(bx, bz)) /
            2 +
            0.45,
          (az + bz) / 2,
        );
        body.quaternion.setFromEuler(0, Math.atan2(bx - ax, bz - az), 0);
        body.updateAABB();
        world.addBody(body);
      }
    }
  }
}
