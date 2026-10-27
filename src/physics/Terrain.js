import * as CANNON from "cannon-es";
export class Terrain {
  constructor() {
    this.minX = -240;
    this.maxZ = 300;
    this.size = 700;
    this.cell = 2;
    this.count = this.size / this.cell + 1;
    this.data = Array.from({ length: this.count }, (_, i) =>
      Array.from({ length: this.count }, (_, j) =>
        this.height(this.minX + i * this.cell, this.maxZ - j * this.cell),
      ),
    );
  }
  height(x, z) {
    return (
      0.75 * Math.sin(z * 0.014) +
      0.38 * Math.cos(x * 0.023) +
      0.11 * Math.sin(x * 0.032 + z * 0.044) +
      0.035 * Math.sin(z * 0.72 + x * 0.19) +
      0.012 * Math.sin(z * 1.8 - x * 0.4)
    );
  }
  createBody(world, material) {
    this.shape = new CANNON.Heightfield(this.data, { elementSize: this.cell });
    this.body = new CANNON.Body({ mass: 0, material });
    this.body.addShape(this.shape);
    this.body.position.set(this.minX, 0, this.maxZ);
    this.body.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.body.updateAABB();
    world.addBody(this.body);
  }
  getHeight(x, z) {
    const gx = (x - this.minX) / this.cell,
      gz = (this.maxZ - z) / this.cell;
    if (gx < 0 || gz < 0 || gx >= this.count - 1 || gz >= this.count - 1)
      return this.height(x, z);
    return this.shape
      ? this.shape.getHeightAt(gx * this.cell, gz * this.cell, true)
      : this.height(x, z);
  }
}
