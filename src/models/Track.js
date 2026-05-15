import * as THREE from 'three';

export class Track {
  constructor(scene, { length = 1200, width = 20, zOffset = -30 } = {}) {
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
      color: 0x4d5258,
      emissive: 0x15181c,
      emissiveIntensity: 0.22,
      roughness: 0.88,
      metalness: 0.03,
      side: THREE.DoubleSide,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }));
    this.mesh.receiveShadow = true;
    this.mesh.renderOrder = 2;
    this.scene.add(this.mesh);
    console.info('[Track:create] Track mesh created', {
      samples: this.centerSamples.length,
      width: this.width,
      closed: true,
    });

    this.addEdges();
    this.addCurbs();
    this.addCenterMarks();
  }

  buildCurve() {
    const points = [
      new THREE.Vector3(0, 0.12, 20),
      new THREE.Vector3(80, 0.12, 70),
      new THREE.Vector3(170, 0.12, 30),
      new THREE.Vector3(210, 0.12, 130),
      new THREE.Vector3(140, 0.12, 220),
      new THREE.Vector3(20, 0.12, 240),
      new THREE.Vector3(-90, 0.12, 170),
      new THREE.Vector3(-110, 0.12, 60),
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
    const leftEdge = [];
    const rightEdge = [];

    for (let i = 0; i < this.centerSamples.length; i += 1) {
      const prevIndex = (i - 1 + this.centerSamples.length) % this.centerSamples.length;
      const nextIndex = (i + 1) % this.centerSamples.length;
      const prev = this.centerSamples[prevIndex];
      const next = this.centerSamples[nextIndex];
      const center = this.centerSamples[i];
      const tangent = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      leftEdge.push(center.clone().addScaledVector(normal, halfWidth));
      rightEdge.push(center.clone().addScaledVector(normal, -halfWidth));
    }

    for (let i = 0; i < this.centerSamples.length; i += 1) {
      const nextIndex = (i + 1) % this.centerSamples.length;
      const left0 = leftEdge[i];
      const right0 = rightEdge[i];
      const left1 = leftEdge[nextIndex];
      const right1 = rightEdge[nextIndex];
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
      leftEdge.push(p0.clone().addScaledVector(normal, halfWidth).setY(0.14));
      rightEdge.push(p0.clone().addScaledVector(normal, -halfWidth).setY(0.14));
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
      mark.position.set(point.x, 0.145, point.z);
      centerMarks.add(mark);
      this.centerMarksCount += 1;
    }
    this.scene.add(centerMarks);
    console.info('[Track:center-marks] Added center marks', { count: this.centerMarksCount });
  }

  addCurbs() {
    const halfWidth = this.width * 0.5;
    const curbWidth = 1.0;
    const redVerts = [];
    const whiteVerts = [];
    const leftInner = [];
    const leftOuter = [];
    const rightInner = [];
    const rightOuter = [];

    for (let i = 0; i < this.centerSamples.length; i += 1) {
      const prevIndex = (i - 1 + this.centerSamples.length) % this.centerSamples.length;
      const nextIndex = (i + 1) % this.centerSamples.length;
      const prev = this.centerSamples[prevIndex];
      const next = this.centerSamples[nextIndex];
      const center = this.centerSamples[i];
      const tangent = new THREE.Vector3().subVectors(next, prev).setY(0).normalize();
      const normal = new THREE.Vector3(-tangent.z, 0, tangent.x);
      leftInner.push(center.clone().addScaledVector(normal, halfWidth).setY(0.142));
      leftOuter.push(center.clone().addScaledVector(normal, halfWidth + curbWidth).setY(0.142));
      rightInner.push(center.clone().addScaledVector(normal, -halfWidth).setY(0.142));
      rightOuter.push(center.clone().addScaledVector(normal, -(halfWidth + curbWidth)).setY(0.142));
    }

    for (let i = 0; i < this.centerSamples.length; i += 1) {
      const nextIndex = (i + 1) % this.centerSamples.length;
      const colorBucket = Math.floor(i / 3) % 2 === 0 ? redVerts : whiteVerts;
      const leftInner0 = leftInner[i];
      const leftOuter0 = leftOuter[i];
      const leftInner1 = leftInner[nextIndex];
      const leftOuter1 = leftOuter[nextIndex];
      colorBucket.push(
        leftInner0.x, leftInner0.y, leftInner0.z,
        leftOuter0.x, leftOuter0.y, leftOuter0.z,
        leftInner1.x, leftInner1.y, leftInner1.z,
        leftOuter0.x, leftOuter0.y, leftOuter0.z,
        leftOuter1.x, leftOuter1.y, leftOuter1.z,
        leftInner1.x, leftInner1.y, leftInner1.z
      );

      const rightInner0 = rightInner[i];
      const rightOuter0 = rightOuter[i];
      const rightInner1 = rightInner[nextIndex];
      const rightOuter1 = rightOuter[nextIndex];

      colorBucket.push(
        rightInner0.x, rightInner0.y, rightInner0.z,
        rightOuter0.x, rightOuter0.y, rightOuter0.z,
        rightInner1.x, rightInner1.y, rightInner1.z,
        rightOuter0.x, rightOuter0.y, rightOuter0.z,
        rightOuter1.x, rightOuter1.y, rightOuter1.z,
        rightInner1.x, rightInner1.y, rightInner1.z
      );
    }

    const redGeo = new THREE.BufferGeometry();
    redGeo.setAttribute('position', new THREE.Float32BufferAttribute(redVerts, 3));
    redGeo.computeVertexNormals();
    const whiteGeo = new THREE.BufferGeometry();
    whiteGeo.setAttribute('position', new THREE.Float32BufferAttribute(whiteVerts, 3));
    whiteGeo.computeVertexNormals();

    const redMesh = new THREE.Mesh(redGeo, new THREE.MeshStandardMaterial({
      color: 0xc73f3f,
      roughness: 0.8,
      metalness: 0.03,
    }));
    const whiteMesh = new THREE.Mesh(whiteGeo, new THREE.MeshStandardMaterial({
      color: 0xe9edf2,
      roughness: 0.8,
      metalness: 0.02,
    }));
    redMesh.receiveShadow = true;
    whiteMesh.receiveShadow = true;
    this.scene.add(redMesh);
    this.scene.add(whiteMesh);
    console.info('[Track:curbs] Added curb strips', {
      redTriangles: redVerts.length / 9,
      whiteTriangles: whiteVerts.length / 9,
      curbWidth,
    });
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
