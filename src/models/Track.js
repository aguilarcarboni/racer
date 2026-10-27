import * as THREE from "three";
import * as CANNON from "cannon-es";
import { TrackLayout } from "./TrackLayout.js";
import { Terrain } from "../physics/Terrain.js";
import { Environment, material, box, label } from "../view/Environment.js";
import { placeAsset } from "../view/Assets.js";
export class Track {
  constructor(scene) {
    this.scene = scene;
    this.layout = new TrackLayout();
    this.width = this.layout.width;
    this.length = this.layout.length;
    this.startProgress = 0.02;
    this.terrain = new Terrain();
    this.root = new THREE.Group();
    scene.add(this.root);
  }
  create(world, groundMaterial) {
    this.terrain.createBody(world, groundMaterial);
    this.environment = new Environment(this.scene, this.terrain, this.layout);
    this.strip(-11, 11, 0.01, material("#c5b799", 0.99));
    this.strip(-7.25, 7.25, 0.025, material("#515851", 0.96));
    const asphaltCanvas = document.createElement("canvas");
    asphaltCanvas.width = asphaltCanvas.height = 256;
    const ctx = asphaltCanvas.getContext("2d");
    ctx.fillStyle = "#737873";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 30;
    const rnd = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 20000; i++) {
      ctx.fillStyle = i % 2 ? "rgba(0,0,0,.1)" : "rgba(255,255,230,.12)";
      ctx.fillRect(rnd() * 256, rnd() * 256, 1, 1);
    }
    const texture = new THREE.CanvasTexture(asphaltCanvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(2, 80);
    texture.anisotropy = 8;
    this.strip(-6, 6, 0.04, material("#a3aaa4", 0.9, { map: texture }));
    for (const side of [-1, 1]) {
      this.strip(side * 5.77, side * 5.88, 0.047, material("#e8e7d8"));
      const curb = this.strip(side * 6, side * 7.2, 0.105, null, true);
      const shape = new CANNON.Trimesh(
        Array.from(curb.geometry.attributes.position.array),
        Array.from(curb.geometry.index.array),
      );
      const body = new CANNON.Body({ mass: 0, material: groundMaterial });
      body.addShape(shape);
      body.updateAABB();
      world.addBody(body);
      this.guardrail(side, world, groundMaterial);
    }
    this.startFinish();
    this.paddock();
    this.buildGuide();
    console.info("[Track:create]", {
      name: "Valle Motor Park",
      length: this.length,
      width: this.width,
      samples: this.layout.samples.length,
      suspensionSurface: "heightfield + raised curb mesh",
    });
  }
  strip(inner, outer, height, mat, curb = false) {
    const positions = [],
      uv = [],
      indices = [],
      colors = [],
      n = this.layout.samples.length,
      columns = Math.max(1, Math.ceil(Math.abs(outer - inner)));
    for (let i = 0; i <= n; i++) {
      const p = this.layout.samples[i % n];
      for (let column = 0; column <= columns; column++) {
        const offset = inner + ((outer - inner) * column) / columns;
        const x = p.x + p.nx * offset,
          z = p.z + p.nz * offset;
        positions.push(x, this.terrain.getHeight(x, z) + height, z);
        uv.push(column / columns, i / n);
        const color = new THREE.Color(
          curb
            ? Math.floor((i * this.length) / n / 3) % 2
              ? "#ede7d7"
              : "#c96043"
            : "#ffffff",
        );
        colors.push(color.r, color.g, color.b);
      }
      if (i < n) {
        for (let column = 0; column < columns; column++) {
          const a = i * (columns + 1) + column,
            b = a + columns + 1;
          indices.push(a, b, a + 1, a + 1, b, b + 1);
        }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(indices);
    g.computeVertexNormals();
    if (curb)
      g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    const m = new THREE.Mesh(
      g,
      mat ||
        material("#ffffff", 0.8, {
          vertexColors: true,
          side: THREE.DoubleSide,
        }),
    );
    m.material.side = THREE.DoubleSide;
    m.receiveShadow = true;
    this.root.add(m);
    return m;
  }
  guardrail(side, world, groundMaterial) {
    const railMat = material("#b0b9b1", 0.43, { metalness: 0.35 }),
      postMat = material("#6e8076");
    const count = 120,
      posts = new THREE.InstancedMesh(
        new THREE.BoxGeometry(0.12, 0.9, 0.12),
        postMat,
        count,
      ),
      dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const a = this.layout.sample(i / count),
        b = this.layout.sample((i + 1) / count);
      const offset = side;
      const ax = a.x + a.nx * 11.8 * offset,
        az = a.z + a.nz * 11.8 * offset,
        cx = b.x + b.nx * 11.8 * offset,
        cz = b.z + b.nz * 11.8 * offset,
        ay = this.terrain.getHeight(ax, az),
        cy = this.terrain.getHeight(cx, cz),
        length = Math.hypot(cx - ax, cz - az);
      dummy.position.set(ax, ay + 0.45, az);
      dummy.rotation.set(0, Math.atan2(cx - ax, cz - az), 0);
      dummy.updateMatrix();
      posts.setMatrixAt(i, dummy.matrix);
      for (const level of [0.48, 0.76]) {
        const m = box(
          this.root,
          [0.09, 0.18, length + 0.2],
          [(ax + cx) / 2, (ay + cy) / 2 + level, (az + cz) / 2],
          railMat,
        );
        m.rotation.y = Math.atan2(cx - ax, cz - az);
        m.castShadow = false;
      }
      const body = new CANNON.Body({ mass: 0, material: groundMaterial });
      body.addShape(
        new CANNON.Box(new CANNON.Vec3(0.12, 0.45, length / 2 + 0.12)),
      );
      body.position.set((ax + cx) / 2, (ay + cy) / 2 + 0.45, (az + cz) / 2);
      body.quaternion.setFromEuler(0, Math.atan2(cx - ax, cz - az), 0);
      body.updateAABB();
      world.addBody(body);
    }
    this.root.add(posts);
  }
  startFinish() {
    const p = this.layout.sample(this.startProgress),
      y = this.terrain.getHeight(p.x, p.z),
      root = new THREE.Group();
    root.position.set(p.x, y, p.z);
    root.rotation.y = Math.atan2(p.tx, p.tz);
    this.root.add(root);
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const c = canvas.getContext("2d");
    for (let x = 0; x < 16; x++)
      for (let z = 0; z < 2; z++) {
        c.fillStyle = (x + z) % 2 ? "#ece9d9" : "#2d3934";
        c.fillRect(x * 32, z * 32, 32, 32);
      }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 1.5),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 }),
    );
    line.rotation.x = -Math.PI / 2;
    line.position.y = 0.06;
    root.add(line);
    const steel = material("#344a43");
    for (const x of [-7.6, 7.6])
      box(root, [0.35, 6.6, 0.35], [x, 3.3, 0], steel);
    box(root, [16, 1.05, 0.55], [0, 6.2, 0], steel);
    const sign = label(
      "V A L L E  /  M O T O R  P A R K",
      15,
      0.85,
      "#f1ebdb",
      "#344a43",
    );
    sign.position.set(0, 6.2, -0.29);
    sign.rotation.y = Math.PI;
    root.add(sign);
    for (let i = 0; i < 6; i++) {
      const s = this.layout.sample(this.startProgress + 0.02 + i * 0.012),
        g = new THREE.Group();
      g.position.set(s.x, this.terrain.getHeight(s.x, s.z) + 0.05, s.z);
      g.rotation.y = Math.atan2(s.tx, s.tz);
      for (const side of [-1, 1])
        for (const z of [-0.9, 0.9])
          box(g, [1.6, 0.008, 0.07], [side * 2.5, 0, z], material("#d8dacb"));
      this.root.add(g);
    }
    for (const [distance, text] of [
      [0.115, "150"],
      [0.145, "100"],
      [0.17, "50"],
    ]) {
      const s = this.layout.sample(distance),
        x = s.x - s.nx * 8.8,
        z = s.z - s.nz * 8.8;
      const sign = label(text, 2, 1, "#233a32", "#e8e7d6");
      sign.position.set(x, this.terrain.getHeight(x, z) + 1.2, z);
      sign.rotation.y = Math.atan2(s.tx, s.tz) + Math.PI;
      this.root.add(sign);
    }
  }
  paddock() {
    const road = box(
      this.root,
      [8, 0.05, 165],
      [-18, this.terrain.getHeight(-18, -50) + 0.025, -50],
      material("#7b8278"),
    );
    for (let i = 0; i < 5; i++) {
      const z = -100 + i * 28;
      placeAsset(
        this.root,
        "garage",
        [-32, this.terrain.getHeight(-32, z), z],
        20,
        Math.PI / 2,
      );
    }
    placeAsset(
      this.root,
      "office",
      [-50, this.terrain.getHeight(-50, 20), 20],
      26,
      0,
    );
    placeAsset(
      this.root,
      "stand",
      [-34, this.terrain.getHeight(-34, 68), 68],
      45,
      Math.PI / 2,
    );
    const bill = label(
      "F I N D  Y O U R  L I N E",
      19,
      3,
      "#efe8d8",
      "#c45e40",
    );
    bill.position.set(38, this.terrain.getHeight(38, -190) + 3, -190);
    this.root.add(bill);
  }
  buildGuide() {
    const points = this.layout.samples.map(
      (p) =>
        new THREE.Vector3(p.x, this.terrain.getHeight(p.x, p.z) + 0.09, p.z),
    );
    points.push(points[0]);
    this.guide = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineDashedMaterial({
        color: "#c9d9a9",
        dashSize: 1.8,
        gapSize: 3.4,
        transparent: true,
        opacity: 0.45,
      }),
    );
    this.guide.computeLineDistances();
    this.root.add(this.guide);
  }
  toggleGuide() {
    this.guide.visible = !this.guide.visible;
    return this.guide.visible;
  }
  getSpawnPoint() {
    const s = this.layout.sample(this.startProgress - 0.015);
    return {
      ...s,
      y: this.terrain.getHeight(s.x, s.z) + 0.85,
      yaw: Math.atan2(s.tx, s.tz),
    };
  }
  getSurface(position) {
    return this.layout.getSurface(position);
  }
  getNormalizedProgress(position) {
    return this.nearest(position).progress;
  }
  nearest(position) {
    const near = this.layout.nearest(position);
    return {
      ...near,
      curveProgress: near.progress,
      progress: (near.progress - this.startProgress + 1) % 1,
    };
  }
  getStartPoint() {
    return this.layout.sample(this.startProgress);
  }
  sampleAhead(near, distance) {
    return this.layout.sample(near.curveProgress + distance / this.length);
  }
  getMapSamples() {
    return this.layout.samples;
  }
  update(position) {
    this.environment.update(position);
  }
}
