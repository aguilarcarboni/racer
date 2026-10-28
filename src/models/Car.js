import { PhysicsCar } from "../physics/PhysicsCar.js";
import { CarView } from "../view/CarView.js";
export class Car extends PhysicsCar {
  constructor(scene, world, material, appearance = {}) {
    super(world, material);
    this.scene = scene;
    this.appearance = appearance;
  }
  create(spawn) {
    super.create(spawn);
    this.view = new CarView(this.scene, this.appearance);
    this.mesh = this.view.root;
    this.syncVisuals();
  }
  syncVisuals(dt = 0, pose = null) {
    this.view?.sync(
      this.body,
      this.vehicle,
      this.dynamics.debug.steerAngle,
      dt,
      pose,
    );
  }
  setVisible(visible) {
    this.mesh.visible = visible;
  }
}
