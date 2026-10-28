import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { WheelRig } from "./WheelRig.js";
import { carUrl } from "./Assets.js";
const carAsset = new GLTFLoader();
let carTemplate;
export class CarView {
  constructor(scene, { color = "#dd542f", id = "you" } = {}) {
    this.root = new THREE.Group();
    scene.add(this.root);
    this.wheelRig = null;
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
        });
        this.wheelRig = new WheelRig(model, this.scale);
        this.root.clear();
        this.root.add(model);
        console.info("[Car:model-ready]", {
          url: carUrl,
          id,
          wheels: this.wheelRig.wheels.length,
          length: 3.8,
        });
      },
      (error) => console.error("[Car:model-load-failed]", error),
    );
  }
  sync(body, vehicle, steer, dt = 0, pose = null) {
    const position = pose ? { x: pose.x, y: pose.y, z: pose.z } : body.position;
    const quaternion = pose
      ? new THREE.Quaternion(
          pose.quaternion.x,
          pose.quaternion.y,
          pose.quaternion.z,
          pose.quaternion.w,
        )
      : body.quaternion;
    const offset = new THREE.Vector3(0, -0.62, 0).applyQuaternion(quaternion);
    this.root.position.set(
      position.x + offset.x,
      position.y + offset.y,
      position.z + offset.z,
    );
    this.root.quaternion.copy(quaternion);
    const forward = body.vectorToLocalFrame(body.velocity);
    this.wheelRig?.sync(vehicle, steer, forward.z, dt);
  }
}
