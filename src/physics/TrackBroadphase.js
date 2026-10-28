import { SAPBroadphase, Body } from "cannon-es";
// Track scenery is static. Index its bounds once instead of scanning every barrier for every wheel ray.
export class TrackBroadphase extends SAPBroadphase {
  constructor(world) {
    super(world);
    this.gridDirty = true;
    this.cellSize = 20;
    world.addEventListener("addBody", () => (this.gridDirty = true));
    world.addEventListener("removeBody", () => (this.gridDirty = true));
  }
  rebuild(world) {
    this.cells = new Map();
    this.globalBodies = [];
    this.movingBodies = [];
    for (const body of world.bodies) {
      if (body.type !== Body.STATIC) {
        this.movingBodies.push(body);
        continue;
      }
      if (body.aabbNeedsUpdate) body.updateAABB();
      const a = body.aabb,
        x0 = Math.floor(a.lowerBound.x / this.cellSize),
        x1 = Math.floor(a.upperBound.x / this.cellSize),
        z0 = Math.floor(a.lowerBound.z / this.cellSize),
        z1 = Math.floor(a.upperBound.z / this.cellSize);
      if ((x1 - x0 + 1) * (z1 - z0 + 1) > 32) {
        this.globalBodies.push(body);
        continue;
      }
      for (let x = x0; x <= x1; x++)
        for (let z = z0; z <= z1; z++) {
          const key = x + "," + z;
          let list = this.cells.get(key);
          if (!list) this.cells.set(key, (list = []));
          list.push(body);
        }
    }
    this.gridDirty = false;
  }
  aabbQuery(world, aabb, result = []) {
    if (this.gridDirty) this.rebuild(world);
    const x0 = Math.floor(aabb.lowerBound.x / this.cellSize),
      x1 = Math.floor(aabb.upperBound.x / this.cellSize),
      z0 = Math.floor(aabb.lowerBound.z / this.cellSize),
      z1 = Math.floor(aabb.upperBound.z / this.cellSize);
    // Rare large queries use the original general path.
    if ((x1 - x0 + 1) * (z1 - z0 + 1) > 64)
      return super.aabbQuery(world, aabb, result);
    const seen = new Set();
    const add = (body) => {
      if (seen.has(body.id)) return;
      seen.add(body.id);
      if (body.aabbNeedsUpdate) body.updateAABB();
      if (body.aabb.overlaps(aabb)) result.push(body);
    };
    this.globalBodies.forEach(add);
    this.movingBodies.forEach(add);
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++)
        for (const body of this.cells.get(x + "," + z) || []) add(body);
    return result;
  }
}
