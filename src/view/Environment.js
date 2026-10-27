import * as THREE from "three";
export const material = (color, roughness = 0.8, extra = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness, ...extra });
export function box(parent, size, position, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(...size), mat);
  m.position.set(...position);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}
export function label(
  text,
  width = 8,
  height = 2,
  color = "#f1ede1",
  bg = "#273d37",
) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 256;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, 1024, 256);
  ctx.fillStyle = color;
  ctx.font = "600 100px Arial";
  const fontSize = 100 * Math.min(1, 940 / ctx.measureText(text).width);
  ctx.font = `600 ${fontSize}px Arial`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 512, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return new THREE.Mesh(
    new THREE.PlaneGeometry(width, height),
    new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }),
  );
}
export class Environment {
  constructor(scene, terrain, layout) {
    scene.fog = new THREE.Fog("#d9dfd0", 220, 1050);
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(1600, 32, 20),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        uniforms: {
          top: { value: new THREE.Color("#8ab2bd") },
          bottom: { value: new THREE.Color("#eee7ce") },
        },
        vertexShader:
          "varying vec3 p;void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: `varying vec3 p;uniform vec3 top;uniform vec3 bottom;void main(){float h=clamp(normalize(p).y*1.6,0.,1.);gl_FragColor=vec4(mix(bottom,top,pow(h,.65)),1.);
#include <tonemapping_fragment>
#include <colorspace_fragment>
}`,
      }),
    );
    scene.add(sky);
    scene.add(new THREE.HemisphereLight("#ecf2e9", "#51654b", 1.9));
    this.sun = new THREE.DirectionalLight("#ffdfac", 3.1);
    this.sun.position.set(-170, 210, -100);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, {
      left: -90,
      right: 90,
      top: 90,
      bottom: -90,
      near: 5,
      far: 600,
    });
    this.sun.shadow.normalBias = 0.04;
    this.sun.shadow.bias = -0.0001;
    scene.add(this.sun);
    scene.add(this.sun.target);
    const geo = new THREE.PlaneGeometry(
      terrain.size,
      terrain.size,
      terrain.count - 1,
      terrain.count - 1,
    );
    geo.rotateX(-Math.PI / 2);
    const a = geo.attributes.position;
    for (let i = 0; i < a.count; i++) {
      const x = a.getX(i) + terrain.minX + terrain.size / 2,
        z = a.getZ(i) + terrain.maxZ - terrain.size / 2;
      a.setXYZ(i, x, terrain.getHeight(x, z) - 0.015, z);
    }
    geo.computeVertexNormals();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 256;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#809667";
    ctx.fillRect(0, 0, 256, 256);
    let seed = 11;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let i = 0; i < 16000; i++) {
      ctx.fillStyle =
        random() > 0.5 ? "rgba(32,58,24,.055)" : "rgba(214,221,150,.075)";
      ctx.fillRect(random() * 256, random() * 256, 2, 1);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(60, 60);
    const ground = new THREE.Mesh(
      geo,
      material("#b7c393", 0.98, { map: texture }),
    );
    ground.receiveShadow = true;
    scene.add(ground);
    const treeCount = 420,
      trunks = new THREE.InstancedMesh(
        new THREE.CylinderGeometry(0.2, 0.3, 2.5, 6),
        material("#655541"),
        treeCount,
      ),
      crowns = new THREE.InstancedMesh(
        new THREE.DodecahedronGeometry(2.7, 1),
        material("#4c715b"),
        treeCount,
      );
    crowns.castShadow = true;
    trunks.castShadow = true;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < treeCount; i++) {
      let x, z;
      for (let attempt = 0; attempt < 50; attempt++) {
        x = -135 + random() * 470;
        z = -310 + random() * 570;
        if (
          layout.nearest({ x, z }).distance > 18 &&
          !(x < -8 && x > -65 && z > -125 && z < 70)
        )
          break;
      }
      const h = terrain.getHeight(x, z),
        scale = 0.6 + random() * 0.85;
      dummy.position.set(x, h + 1.25 * scale, z);
      dummy.scale.setScalar(scale);
      dummy.rotation.y = random() * 6.28;
      dummy.updateMatrix();
      trunks.setMatrixAt(i, dummy.matrix);
      dummy.position.y = h + 4.8 * scale;
      dummy.scale.set(scale, scale * 1.18, scale);
      dummy.updateMatrix();
      crowns.setMatrixAt(i, dummy.matrix);
      crowns.setColorAt(
        i,
        new THREE.Color().setHSL(
          0.29 + random() * 0.06,
          0.17 + random() * 0.15,
          0.24 + random() * 0.11,
        ),
      );
    }
    scene.add(trunks, crowns);
    for (let i = 0; i < 28; i++) {
      const theta = (i / 28) * Math.PI * 2,
        x = 80 + Math.sin(theta) * 650,
        z = -30 + Math.cos(theta) * 650;
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(1, 24, 12),
        material(i % 2 ? "#8b9e89" : "#9aa991", 1),
      );
      hill.scale.set(
        150 + random() * 140,
        65 + random() * 85,
        150 + random() * 140,
      );
      hill.position.set(x, -25, z);
      hill.rotation.y = random() * 6.28;
      scene.add(hill);
    }
  }
  update(position) {
    this.sun.position.set(position.x - 170, position.y + 210, position.z - 100);
    this.sun.target.position.set(position.x, position.y, position.z);
  }
}
