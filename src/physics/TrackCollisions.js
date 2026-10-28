import * as C from "cannon-es";

export class TrackCollisions {
  constructor(layout, terrain) {
    this.layout = layout;
    this.terrain = terrain;
  }
  create(world, material) {
    this.terrain.createBody(world, material);
    for (const side of [-1, 1]) {
      // Short, centered sections let wheel rays reject distant curbs before triangle tests.
      // The surface vertices and triangles are identical to the original continuous strips.
      const n = this.layout.samples.length,
        columns = 2,
        sectionSize = 24;
      for (let start = 0; start < n; start += sectionSize) {
        const end = Math.min(n, start + sectionSize);
        const center = this.layout.samples[Math.floor((start + end) / 2) % n];
        const originX = Math.round(center.x),
          originZ = Math.round(center.z);
        const points = [],
          triangles = [];
        for (let i = start; i <= end; i++) {
          const p = this.layout.samples[i % n];
          for (let c = 0; c <= columns; c++) {
            const offset = side * (6 + (1.2 * c) / columns);
            const x = p.x + p.nx * offset,
              z = p.z + p.nz * offset;
            points.push(
              Math.fround(x) - originX,
              Math.fround(this.terrain.getHeight(x, z) + 0.105),
              Math.fround(z) - originZ,
            );
          }
          if (i < end)
            for (let c = 0; c < columns; c++) {
              const a = (i - start) * 3 + c,
                b = a + 3;
              triangles.push(a, b, a + 1, a + 1, b, b + 1);
            }
        }
        const curb = new C.Body({ mass: 0, material });
        curb.position.set(originX, 0, originZ);
        curb.addShape(new C.Trimesh(points, triangles));
        curb.updateAABB();
        world.addBody(curb);
      }
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
