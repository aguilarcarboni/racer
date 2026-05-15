import * as THREE from 'three';

export class Track {
  constructor(scene, { length = 1200, width = 12, zOffset = -30 } = {}) {
    this.scene = scene;
    this.length = length;
    this.width = width;
    this.zOffset = zOffset;
    this.mesh = null;
    this.centerMarksCount = 0;
    this.lastProgressLogAt = 0;
    this.progressLogIntervalMs = 300;
    this.curve = null;
    this.centerSamples = [];
    this.mapBounds = null;
  }

  create() {
    this.buildCurve();
    this.mesh = new THREE.Mesh(this.buildRoadGeometry(), new THREE.MeshStandardMaterial({
      color: 0x404349,
      roughness: 0.84,
      metalness: 0.03,
    }));
    this.mesh.receiveShadow = true;
    this.scene.add(this.mesh);
    console.info('[Track:create] Track mesh created', {
      samples: this.centerSamples.length,
      width: this.width,
      closed: true,
    });

    this.addEdges();
    this.addCenterMarks();
  }

  buildCurve() {
    const points = [
      new THREE.Vector3(0, 0.02, 20),
      new THREE.Vector3(80, 0.02, 70),
      new THREE.Vector3(170, 0.02, 30),
      new THREE.Vector3(210, 0.02, 130),
      new THREE.Vector3(140, 0.02, 220),
      new THREE.Vector3(20, 0.02, 240),
      new THREE.Vector3(-90, 0.02, 170),
      new THREE.Vector3(-110, 0.02, 60),
    ];

    this.curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.25);
    this.centerSamples = this.curve.getPoints(319);

    const bounds = new THREE.Box3().setFromPoints(this.centerSamples);
    this.mapBounds = {
      minX: bounds.min.x,
      maxX: bounds.max.x,
      minZ: bounds.min.z,
      maxZ: bounds.max.z,
    };
  }

  buildRoadGeometry() {
    const halfWidth = this.width * 0.5;
    const verts = [];

    for (let i = 0; i < this.centerSamples.length; i += 1) {
      const nextIndex = (i + 1) % this.centerSamples.length;
      const p0 = this.centerSamples[i];
      const p1 = this.centerSamples[nextIndex];
      const tangent = new THREE.Vector3().subVectors(p1, p0).setY(0).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);

      const left0 = p0.clone().addScaledVector(normal, halfWidth);
      const right0 = p0.clone().addScaledVector(normal, -halfWidth);
      const left1 = p1.clone().addScaledVector(normal, halfWidth);
      const right1 = p1.clone().addScaledVector(normal, -halfWidth);

      verts.push(
        left0.x, left0.y, left0.z,
        right0.x, right0.y, right0.z,
        left1.x, left1.y, left1.z,
        right0.x, right0.y, right0.z,
        right1.x, right1.y, right1.z,
        left1.x, left1.y, left1.z
      );
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    geo.computeVertexNormals();
    return geo;
  }

  addEdges() {
    const leftEdge = [];
    const rightEdge = [];
    const halfWidth = this.width * 0.5;
    for (let i = 0; i < this.centerSamples.length; i += 1) {
      const nextIndex = (i + 1) % this.centerSamples.length;
      const p0 = this.centerSamples[i];
      const p1 = this.centerSamples[nextIndex];
      const tangent = new THREE.Vector3().subVectors(p1, p0).setY(0).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      leftEdge.push(p0.clone().addScaledVector(normal, halfWidth).setY(0.03));
      rightEdge.push(p0.clone().addScaledVector(normal, -halfWidth).setY(0.03));
    }
    leftEdge.push(leftEdge[0].clone());
    rightEdge.push(rightEdge[0].clone());
    const edgeMat = new THREE.LineBasicMaterial({ color: 0xe6eaee });

    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(leftEdge), edgeMat));
    this.scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(rightEdge), edgeMat));
    console.info('[Track:edges] Edge lines added', {
      leftPoints: leftEdge.length,
      rightPoints: rightEdge.length,
    });
  }

  addCenterMarks() {
    const centerMarks = new THREE.Group();
    for (let i = 0; i < this.centerSamples.length; i += 10) {
      const point = this.centerSamples[i];
      const nextPoint = this.centerSamples[(i + 1) % this.centerSamples.length];
      const yaw = Math.atan2(nextPoint.x - point.x, nextPoint.z - point.z);
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(0.3, 8),
        new THREE.MeshBasicMaterial({ color: 0xf5f5f5 })
      );
      mark.rotation.x = -Math.PI / 2;
      mark.rotation.z = yaw;
      mark.position.set(point.x, 0.031, point.z);
      centerMarks.add(mark);
      this.centerMarksCount += 1;
    }
    this.scene.add(centerMarks);
    console.info('[Track:center-marks] Added center marks', { count: this.centerMarksCount });
  }

  findNearestSampleIndex(position) {
    let bestIndex = 0;
    let bestDistSq = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.centerSamples.length; i += 1) {
      const point = this.centerSamples[i];
      const dx = point.x - position.x;
      const dz = point.z - position.z;
      const distSq = dx * dx + dz * dz;
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  getNormalizedProgress(position) {
    const nearestIndex = this.findNearestSampleIndex(position);
    const normalized = nearestIndex / (this.centerSamples.length - 1);
    const now = performance.now();
    if (now - this.lastProgressLogAt >= this.progressLogIntervalMs) {
      this.lastProgressLogAt = now;
      console.log('[Track:progress]', {
        position,
        nearestIndex,
        normalized,
      });
    }
    return normalized;
  }

  getMapDot(position) {
    const xRange = Math.max(1, this.mapBounds.maxX - this.mapBounds.minX);
    const zRange = Math.max(1, this.mapBounds.maxZ - this.mapBounds.minZ);
    const cx = THREE.MathUtils.clamp(((position.x - this.mapBounds.minX) / xRange) * 84 + 8, 8, 92);
    const cy = THREE.MathUtils.clamp(((position.z - this.mapBounds.minZ) / zRange) * 84 + 8, 8, 92);
    return { cx, cy };
  }
}
