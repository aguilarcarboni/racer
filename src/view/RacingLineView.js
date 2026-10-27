import * as THREE from "three";
import { LINE } from "../racing/RaceConfig.js";

export class RacingLineView {
  constructor(parent, layout, terrain, profile) {
    this.profile = profile;
    this.progress = [];
    const vertices = [],
      count = Math.floor(layout.length / LINE.arrowSpacing);
    for (let i = 0; i < count; i++) {
      const progress = i / count,
        p = layout.sample(progress);
      this.progress.push(progress);
      for (const [long, lateral] of [
        [0.9, 0],
        [-0.65, -0.42],
        [-0.15, 0],
        [0.9, 0],
        [-0.15, 0],
        [-0.65, 0.42],
      ]) {
        const x = p.x + p.tx * long + p.nx * lateral,
          z = p.z + p.tz * long + p.nz * lateral;
        vertices.push(x, terrain.getHeight(x, z) + 0.09, z);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(vertices, 3),
    );
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(new Float32Array(vertices.length), 3),
    );
    this.mesh = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.86,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    parent.add(this.mesh);
    this.green = new THREE.Color("#5ce78a");
    this.amber = new THREE.Color("#ffd45b");
    this.red = new THREE.Color("#ff4c32");
    this.color = new THREE.Color();
    this.update(0);
  }
  update(speed, frontGrip) {
    const colors = this.mesh.geometry.attributes.color;
    this.progress.forEach((p, i) => {
      const { ratio } = this.profile.getAdvice(p, speed, frontGrip);
      if (ratio < LINE.amberRatio) this.color.copy(this.green);
      else if (ratio < LINE.redRatio)
        this.color
          .copy(this.green)
          .lerp(
            this.amber,
            (ratio - LINE.amberRatio) / (LINE.redRatio - LINE.amberRatio),
          );
      else
        this.color
          .copy(this.amber)
          .lerp(this.red, Math.min(1, (ratio - LINE.redRatio) / 0.13));
      for (let j = 0; j < 6; j++)
        colors.setXYZ(i * 6 + j, this.color.r, this.color.g, this.color.b);
    });
    colors.needsUpdate = true;
  }
  toggle() {
    this.mesh.visible = !this.mesh.visible;
    return this.mesh.visible;
  }
}
