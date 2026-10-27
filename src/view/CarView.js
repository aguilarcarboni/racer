import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { carUrl } from "./Assets.js";
const carAsset = new GLTFLoader();
let carTemplate;
export class CarView {
  constructor(scene, { color = "#dd542f", id = "you" } = {}) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.wheels = [];
    this.spin = 0;
    this.root.add(
      new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 0.45, 3.5),
        new THREE.MeshStandardMaterial({ color }),
      ),
    );
    carTemplate ??= carAsset.loadAsync(carUrl);
    carTemplate.then(
      (gltf) => {
        const model = gltf.scene.clone(true),
          box = new THREE.Box3().setFromObject(model),
          size = box.getSize(new THREE.Vector3());
        this.scale = 3.8 / Math.max(size.x, size.z);
        model.scale.setScalar(this.scale);
        box.setFromObject(model);
        const c = box.getCenter(new THREE.Vector3());
        model.position.set(-c.x, -box.min.y, -c.z);
        model.traverse((n) => {
          if (n.isMesh) {
            n.castShadow = true;
            n.receiveShadow = true;
            n.material = n.material.clone();
            n.material.roughness = 0.58;
            if (n.material.name === "red") {
              n.material.color.set(color);
              n.material.metalness = 0.12;
            }
          }
          if (n.name?.startsWith("wheel"))
            this.wheels.push({
              node: n,
              position: n.position.clone(),
              rotation: n.rotation.clone(),
              front: n.name.includes("Front"),
            });
        });
        this.root.clear();
        this.root.add(model);
        console.info("[Car:model-ready]", {
          url: carUrl,
          id,
          wheels: this.wheels.length,
          length: 3.8,
        });
      },
      (error) => console.error("[Car:model-load-failed]", error),
    );
  }
  sync(body, vehicle, steer, dt = 0) {
    const offset = new THREE.Vector3(0, -0.62, 0).applyQuaternion(
      body.quaternion,
    );
    this.root.position.set(
      body.position.x + offset.x,
      body.position.y + offset.y,
      body.position.z + offset.z,
    );
    this.root.quaternion.copy(body.quaternion);
    const forward = body.vectorToLocalFrame(body.velocity);
    this.spin += (forward.z * dt) / 0.32;
    this.wheels.forEach((w, i) => {
      w.node.rotation.copy(w.rotation);
      w.node.rotation.x += this.spin;
      if (w.front) w.node.rotation.y += steer;
      const info =
        vehicle.wheelInfos[
          w.front
            ? w.node.name.includes("Left")
              ? 1
              : 0
            : w.node.name.includes("Left")
              ? 3
              : 2
        ];
      w.node.position.y =
        w.position.y + (0.223 - info.suspensionLength) / (this.scale || 1);
    });
  }
}
