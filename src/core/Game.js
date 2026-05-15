import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { Track } from '../models/Track.js';
import { Car } from '../models/Car.js';
import { InputController } from './InputController.js';
import { GamepadController } from './GamepadController.js';

export class Game {
  constructor({ container, hud }) {
    this.container = container;
    this.hud = hud;

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.Fog(0xbfc7d0, 120, 520);

    this.camera = new THREE.PerspectiveCamera(68, window.innerWidth / window.innerHeight, 0.1, 1200);
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;

    this.world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0), allowSleep: false });
    this.world.broadphase = new CANNON.SAPBroadphase(this.world);

    this.clock = new THREE.Clock();
    this.camOffset = new THREE.Vector3(0, 3.2, -7.5);
    this.firstPersonOffset = new THREE.Vector3(0, 1.02, 0.18);
    this.firstPersonLookAhead = new THREE.Vector3(0, 1.02, 12);
    this.lookAt = new THREE.Vector3();
    this.cameraMode = 'chase';
    this.prevVel = new THREE.Vector3();
    this.lapTime = 0;
    this.frameCount = 0;
    this.lastDebugLogAt = 0;
    this.debugLogIntervalMs = 200;
    this.hasWarnedFloat = false;
    this.lastTelemetryVel = new THREE.Vector3();
    this.lastTelemetryAt = 0;
    this.lastTelemetryLogAt = 0;
    this.telemetryLogIntervalMs = 220;
    this.tuneControls = hud.tune || null;

    this.track = null;
    this.car = null;
    this.input = new InputController();
    this.gamepadInput = new GamepadController();
  }

  init() {
    this.container.appendChild(this.renderer.domElement);
    this.setupScene();
    this.setupWorld();
    this.setupTuningUi();
    this.input.onReset = () => this.reset();
    this.input.onToggleCamera = () => this.toggleCameraMode();
    this.input.onTelemetry = (payload) => this.logInputTelemetry(payload);
    this.gamepadInput.onReset = () => this.reset();
    this.gamepadInput.onToggleCamera = () => this.toggleCameraMode();
    this.gamepadInput.onShiftUp = () => this.car?.shiftUp();
    this.gamepadInput.onShiftDown = () => this.car?.shiftDown();
    this.gamepadInput.onTelemetry = (payload) => this.logInputTelemetry(payload);
    console.info('[Game:init] Scene, world, track, and car initialized');

    window.addEventListener('resize', () => this.onResize());
  }

  setupScene() {
    const skyGeo = new THREE.SphereGeometry(700, 32, 20);
    const skyMat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      uniforms: {
        topColor: { value: new THREE.Color(0xc8d3df) },
        bottomColor: { value: new THREE.Color(0xf1f4f7) },
      },
      vertexShader: 'varying vec3 vPos; void main(){vPos=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: 'uniform vec3 topColor; uniform vec3 bottomColor; varying vec3 vPos; void main(){float h=normalize(vPos).y*0.5+0.5; gl_FragColor=vec4(mix(bottomColor, topColor, pow(h,1.35)),1.0);}',
    });
    this.scene.add(new THREE.Mesh(skyGeo, skyMat));

    this.scene.add(new THREE.HemisphereLight(0xf6fbff, 0x6f7176, 0.72));
    const sun = new THREE.DirectionalLight(0xffffff, 1.05);
    sun.position.set(30, 50, 20);
    sun.castShadow = true;
    this.scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(2000, 2000),
      new THREE.MeshStandardMaterial({ color: 0x2f8f3d, roughness: 0.98, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.2;
    ground.receiveShadow = true;
    this.scene.add(ground);
  }

  setupWorld() {
    const groundMaterial = new CANNON.Material('ground');
    const carMaterial = new CANNON.Material('car');
    this.world.addContactMaterial(new CANNON.ContactMaterial(groundMaterial, carMaterial, {
      friction: 0.0001,
      restitution: 0,
      frictionEquationStiffness: 1e4,
      frictionEquationRelaxation: 4,
    }));

    const groundBody = new CANNON.Body({ mass: 0, shape: new CANNON.Plane(), material: groundMaterial });
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    this.world.addBody(groundBody);

    this.track = new Track(this.scene);
    this.track.create();

    this.car = new Car(this.scene, this.world, carMaterial);
    this.car.create();
    console.info('[Game:world] Car and track created', {
      gravity: this.world.gravity,
      trackLength: this.track.length,
      trackWidth: this.track.width,
      carStartPosition: this.car.startPosition,
    });
  }

  reset() {
    this.car.reset();
    this.lapTime = 0;
    console.warn('[Game:reset] Car reset requested');
  }

  setupTuningUi() {
    if (!this.tuneControls || !this.car) return;
    const { brakeBias, wtLong, wtLat, rearDrop, valBrakeBias, valWtLong, valWtLat, valRearDrop } = this.tuneControls;

    const apply = () => {
      const tune = {
        brakeBiasFront: Number(brakeBias.value),
        weightTransferLong: Number(wtLong.value),
        weightTransferLat: Number(wtLat.value),
        rearGripDrop: Number(rearDrop.value),
      };
      this.car.setTuning(tune);
      valBrakeBias.textContent = tune.brakeBiasFront.toFixed(2);
      valWtLong.textContent = tune.weightTransferLong.toFixed(2);
      valWtLat.textContent = tune.weightTransferLat.toFixed(2);
      valRearDrop.textContent = tune.rearGripDrop.toFixed(2);
      console.info('[Tune:update]', tune);
    };

    for (const el of [brakeBias, wtLong, wtLat, rearDrop]) {
      el.addEventListener('input', apply);
    }
    apply();
  }

  updateCamera() {
    const carMesh = this.car.mesh;
    if (this.cameraMode === 'first-person') {
      const eye = this.firstPersonOffset.clone().applyQuaternion(carMesh.quaternion).add(carMesh.position);
      const lookTarget = this.firstPersonLookAhead.clone().applyQuaternion(carMesh.quaternion).add(carMesh.position);
      this.camera.position.copy(eye);
      this.camera.lookAt(lookTarget);
      return;
    }

    const back = new THREE.Vector3(0, 0, this.camOffset.z).applyQuaternion(carMesh.quaternion);
    const side = new THREE.Vector3(this.camOffset.x, 0, 0).applyQuaternion(carMesh.quaternion);
    const desired = carMesh.position.clone().add(back).add(side).add(new THREE.Vector3(0, this.camOffset.y, 0));

    this.camera.position.lerp(desired, 0.1);
    this.lookAt.copy(carMesh.position).add(new THREE.Vector3(0, 1.0, 0));
    this.camera.lookAt(this.lookAt);
  }

  toggleCameraMode() {
    this.cameraMode = this.cameraMode === 'chase' ? 'first-person' : 'chase';
    if (this.car && this.car.mesh) {
      this.car.mesh.visible = this.cameraMode !== 'first-person';
    }
    console.info('[Camera:mode]', { mode: this.cameraMode });
  }

  updateHud(dt) {
    this.lapTime += dt;
    const mins = Math.floor(this.lapTime / 60);
    const secs = (this.lapTime % 60).toFixed(3).padStart(6, '0');
    this.hud.lap.textContent = `${mins}:${secs}`;

    const { x, y, z } = this.car.body.velocity;
    const speedKmh = Math.max(0, Math.sqrt(x * x + z * z) * 3.6);
    this.hud.speed.textContent = speedKmh.toFixed(1).padStart(5, '0');
    this.hud.gear.textContent = this.car.getGearLabel();
    const engine = this.car.getEngineState();
    this.hud.rev.textContent = String(engine.rpm).padStart(4, '0');
    const lightsOn = Math.round(engine.normalized * this.hud.revLights.length);
    for (let i = 0; i < this.hud.revLights.length; i += 1) {
      this.hud.revLights[i].classList.toggle('on', i < lightsOn);
    }
    this.hud.shiftCue.classList.toggle('on', engine.shouldShiftUp);

    const vel = new THREE.Vector3(x, y, z);
    const g = vel.clone().sub(this.prevVel).divideScalar(Math.max(dt, 1e-3)).length() / 9.82;
    this.hud.gforce.textContent = `${g.toFixed(2)}g`;
    this.prevVel.copy(vel);

    const trackPos = { x: this.car.body.position.x, z: this.car.body.position.z };
    this.track.getNormalizedProgress(trackPos);
    const mapDot = this.track.getMapDot(trackPos);
    this.hud.mapDot.setAttribute('cx', String(mapDot.cx));
    this.hud.mapDot.setAttribute('cy', String(mapDot.cy));
  }

  tick() {
    requestAnimationFrame(() => this.tick());

    const dt = Math.min(this.clock.getDelta(), 0.1);
    const keyboardState = this.input.getState();
    const gamepadState = this.gamepadInput.getState();
    const inputState = this.mergeInputState(keyboardState, gamepadState);
    this.car.updatePhysics(inputState, dt);
    this.world.step(1 / 60, dt, 4);

    this.car.syncVisuals();
    this.updateCamera();
    this.updateHud(dt);
    this.debugTick(dt, inputState);
    this.logPeriodicTelemetry();

    this.renderer.render(this.scene, this.camera);
  }

  mergeInputState(keyboardState, gamepadState) {
    const steerAxis = THREE.MathUtils.clamp(
      gamepadState.steerAxis + (keyboardState.left ? 1 : 0) + (keyboardState.right ? -1 : 0),
      -1,
      1
    );
    const throttleAxis = THREE.MathUtils.clamp(
      Math.max(gamepadState.throttleAxis, keyboardState.forward ? 1 : 0),
      0,
      1
    );
    const brakeAxis = THREE.MathUtils.clamp(
      Math.max(gamepadState.brakeAxis, keyboardState.backward ? 1 : 0),
      0,
      1
    );

    return {
      source: gamepadState.connected ? 'keyboard+gamepad' : 'keyboard',
      forward: throttleAxis > 0.01,
      backward: brakeAxis > 0.01,
      left: steerAxis > 0.01,
      right: steerAxis < -0.01,
      steerAxis,
      throttleAxis,
      brakeAxis,
    };
  }

  debugTick(dt, inputState) {
    this.frameCount += 1;
    const now = performance.now();
    if (now - this.lastDebugLogAt < this.debugLogIntervalMs) return;
    this.lastDebugLogAt = now;

    const carDebug = this.car.getDebugState();
    const groundClearance = carDebug.groundClearance ?? (carDebug.position.y - carDebug.bodyHalfHeight);
    const visualHover = carDebug.position.y - carDebug.visualWheelBottomOffset;
    const speedKmh = carDebug.speedMps * 3.6;
    const grounded = carDebug.grounded ?? (carDebug.msSinceContact < 300);

    console.groupCollapsed(
      `[Debug frame=${this.frameCount}] speed=${speedKmh.toFixed(1)}km/h y=${carDebug.position.y.toFixed(3)} grounded=${grounded}`
    );
    console.log('timing', { dt, fpsApprox: dt > 0 ? 1 / dt : 0 });
    console.log('input', inputState);
    console.log('position', carDebug.position);
    console.log('velocity', carDebug.velocity);
    console.log('angularVelocity', carDebug.angularVelocity);
    console.log('forces', { driveForce: carDebug.driveForce, yawTorque: carDebug.yawTorque, steer: carDebug.steer });
    console.log('grounding', {
      grounded,
      contactCount: carDebug.contactCount,
      msSinceContact: carDebug.msSinceContact,
      bodyGroundClearance: groundClearance,
      visualHoverHeight: visualHover,
    });
    console.groupEnd();

    if (!this.hasWarnedFloat && visualHover > 0.35 && grounded) {
      this.hasWarnedFloat = true;
      console.warn(
        '[Debug:float] Car visual appears above ground while physics body is grounded.',
        {
          visualHoverHeight: visualHover,
          bodyGroundClearance: groundClearance,
          hint: 'This usually means body center and mesh offsets do not match.',
        }
      );
    }
  }

  logInputTelemetry({ event, key, state }) {
    if (!this.car || !this.car.body || !this.track) return;

    const now = performance.now();
    const dt = Math.max((now - this.lastTelemetryAt) / 1000, 1 / 120);
    this.lastTelemetryAt = now;

    const debug = this.car.getDebugState();
    const vel = new THREE.Vector3(debug.velocity.x, debug.velocity.y, debug.velocity.z);
    const g = vel.clone().sub(this.lastTelemetryVel).divideScalar(dt).length() / 9.82;
    this.lastTelemetryVel.copy(vel);

    const speedKmh = debug.speedMps * 3.6;
    const progress = this.track.getNormalizedProgress({
      x: debug.position.x,
      z: debug.position.z,
    });
    const grounded = debug.grounded ?? (debug.msSinceContact < 300);
    const groundClearance = debug.groundClearance ?? (debug.position.y - debug.bodyHalfHeight);

    console.warn('[Input:telemetry]', {
      event,
      key,
      inputState: state,
      speedKmh,
      gForce: g,
      position: debug.position,
      velocity: debug.velocity,
      angularVelocity: debug.angularVelocity,
      progress,
      grounded,
      contactCount: debug.contactCount,
      msSinceContact: debug.msSinceContact,
      bodyGroundClearance: groundClearance,
      driveForce: debug.driveForce,
      yawTorque: debug.yawTorque,
      steer: debug.steer,
    });
  }

  logPeriodicTelemetry() {
    if (!this.car || !this.track) return;
    const now = performance.now();
    if (now - this.lastTelemetryLogAt < this.telemetryLogIntervalMs) return;
    this.lastTelemetryLogAt = now;

    const debug = this.car.getDebugState();
    const progress = this.track.getNormalizedProgress({
      x: debug.position.x,
      z: debug.position.z,
    });
    const speedKmh = debug.speedMps * 3.6;
    const grounded = debug.grounded ?? false;
    const groundClearance = debug.groundClearance ?? (debug.position.y - debug.bodyHalfHeight);

    console.info('[Telemetry:periodic]', {
      speedKmh,
      progress,
      grounded,
      groundClearance,
      position: debug.position,
      velocity: debug.velocity,
      steer: debug.steer,
      driveForce: debug.driveForce,
      yawTorque: debug.yawTorque,
    });
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    console.info('[Game:resize]', { width: window.innerWidth, height: window.innerHeight });
  }
}
