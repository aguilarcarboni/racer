import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import * as THREE from "three";
import carUrl from "../../models/raceCarRed.glb?url";
import standUrl from "../../models/grandStandCovered.glb?url";
import garageUrl from "../../models/pitsGarageClosed.glb?url";
import officeUrl from "../../models/pitsOffice.glb?url";
export { carUrl };
const urls = { stand: standUrl, garage: garageUrl, office: officeUrl },
  cache = new Map(),
  loader = new GLTFLoader();
export async function placeAsset(parent, name, position, length, yaw = 0) {
  const url = urls[name];
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  try {
    const gltf = await cache.get(url),
      model = gltf.scene.clone(true),
      bounds = new THREE.Box3().setFromObject(model),
      size = bounds.getSize(new THREE.Vector3());
    model.scale.setScalar(
      Math.min(length / Math.max(size.x, size.z), 8 / size.y),
    );
    bounds.setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.set(-center.x, -bounds.min.y, -center.z);
    const root = new THREE.Group();
    root.add(model);
    root.position.set(...position);
    root.rotation.y = yaw;
    model.traverse((n) => {
      if (n.isMesh) {
        n.castShadow = true;
        n.receiveShadow = true;
      }
    });
    parent.add(root);
    return root;
  } catch (error) {
    console.warn("[Scene:asset]", name, error.message);
    return null;
  }
}
