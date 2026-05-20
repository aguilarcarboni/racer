import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Track {
  constructor(scene, { width = 20, zOffset = 0, gridSize = 14 } = {}) {
    this.scene = scene;
    this.width = width;
    this.zOffset = zOffset;
    this.gridSize = gridSize;

    this.mesh = null;
    this.centerSamples = [];
    this.lastProgressLogAt = 0;
    this.progressLogIntervalMs = 300;

    this.gridTiles = new Map();
    this.length = 0;
    this.spawnCenter = new THREE.Vector3(0, 0.12, 0);

    this.modelLoader = new GLTFLoader();
    this.modelCache = new Map();
  }

  create() {
    this.mesh = new THREE.Group();
    this.scene.add(this.mesh);

    this.buildStarterGrid();
    this.refreshCenterSamples();
    this.refreshTrackLength();
    this.addRoadPlane();
    this.addDebugPathLine();
    this.instantiateGridTiles();

    console.info('[Track:create] Track created', {
      gridTiles: this.gridTiles.size,
      samples: this.centerSamples.length,
      models: ['/models/roadStraight.glb'],
    });
    const center = this.centerSamples[0] || this.gridToWorld(0, 0);
    console.info('[Track:center]', { x: center.x, y: center.y, z: center.z });
    const starterTileCenter = this.gridToWorld(0, 0);
    console.info('[Track:tile-center]', { gridX: 0, gridY: 0, x: starterTileCenter.x, y: starterTileCenter.y, z: starterTileCenter.z });
  }

  buildStarterGrid() {
    this.gridTiles.clear();

    this.setGridTile(0, 0, {
      type: 'corner',
      modelPath: '/models/roadCornerSmall.glb',
      yaw: Math.PI / 2,
    });

    this.setGridTile(0, 1, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: 0,
    });

    this.setGridTile(0, 2, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: 0,
    });

    this.setGridTile(0, 3, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: 0,
    });

    this.setGridTile(0, 4, {
      type: 'corner',
      modelPath: '/models/roadCornerSmall.glb',
      yaw: 0,
    });

    this.setGridTile(-1, 4, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: Math.PI / 2,
    });

    this.setGridTile(-2, 4, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: Math.PI / 2,
    });

    this.setGridTile(-3, 4, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: Math.PI / 2,
    });

    this.setGridTile(-4, 4, {
      type: 'corner',
      modelPath: '/models/roadCornerSmall.glb',
      yaw: (3 * Math.PI) / 2,
    });

    this.setGridTile(-4, 3, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: 0,
    });

    this.setGridTile(-4, 2, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: 0,
    });

    this.setGridTile(-4, 1, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: 0,
    });

    this.setGridTile(-4, 0, {
      type: 'corner',
      modelPath: '/models/roadCornerSmall.glb',
      yaw: Math.PI,
    });

    this.setGridTile(-1, 0, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: Math.PI / 2,
    });

    this.setGridTile(-2, 0, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: Math.PI / 2,
    });

    this.setGridTile(-3, 0, {
      type: 'straight',
      modelPath: '/models/roadStraight.glb',
      yaw: Math.PI / 2,
    });
  }

  setGridTile(gridX, gridY, tile) {
    const x = Number.isFinite(gridX) ? Math.trunc(gridX) : 0;
    const y = Number.isFinite(gridY) ? Math.trunc(gridY) : 0;

    const safeTile = {
      type: tile?.type || 'straight',
      modelPath: tile?.modelPath || '/models/roadStraight.glb',
      yaw: Number.isFinite(tile?.yaw) ? tile.yaw : 0,
    };

    this.gridTiles.set(this.getGridKey(x, y), {
      gridX: x,
      gridY: y,
      ...safeTile,
    });
  }

  getGridKey(gridX, gridY) {
    return `${gridX},${gridY}`;
  }

  gridToWorld(gridX, gridY) {
    return new THREE.Vector3(
      gridX * this.gridSize,
      0.12,
      this.zOffset + gridY * this.gridSize
    );
  }

  refreshCenterSamples() {
    const pathTiles = this.tracePathTiles();
    const points = [];

    const addPoint = (point) => {
      if (points.length === 0) {
        points.push(point.clone());
        return;
      }
      const last = points[points.length - 1];
      const dx = last.x - point.x;
      const dz = last.z - point.z;
      if (dx * dx + dz * dz > 1e-6) {
        points.push(point.clone());
      }
    };

    for (const segment of pathTiles) {
      const segmentSamples = this.sampleTileCenterline(segment.tile, segment.entryDir, segment.exitDir);
      for (const sample of segmentSamples) addPoint(sample);
    }

    this.centerSamples = points;
    const spawnTile = pathTiles[0]?.tile;
    this.spawnCenter = spawnTile
      ? this.gridToWorld(spawnTile.gridX, spawnTile.gridY)
      : this.gridToWorld(0, 0);
  }

  tracePathTiles() {
    const tiles = Array.from(this.gridTiles.values());
    if (tiles.length === 0) return [];

    const byKey = new Map();
    for (const tile of tiles) byKey.set(this.getGridKey(tile.gridX, tile.gridY), tile);

    const links = new Map();
    for (const tile of tiles) {
      const key = this.getGridKey(tile.gridX, tile.gridY);
      const tileLinks = [];
      const connectors = this.getTileConnectors(tile);
      for (const dir of connectors) {
        const neighbor = this.getNeighborCoords(tile.gridX, tile.gridY, dir);
        const neighborTile = byKey.get(this.getGridKey(neighbor.gridX, neighbor.gridY));
        if (!neighborTile) continue;
        const neighborConnectors = this.getTileConnectors(neighborTile);
        if (!neighborConnectors.includes(this.getOppositeDirection(dir))) continue;
        tileLinks.push({ key: this.getGridKey(neighbor.gridX, neighbor.gridY), dir });
      }
      links.set(key, tileLinks);
    }

    const startTile = this.pickStartTile(tiles, links);
    if (!startTile) return [];

    const ordered = [];
    const visited = new Set();
    let prevKey = null;
    let currentKey = this.getGridKey(startTile.gridX, startTile.gridY);

    for (let i = 0; i < tiles.length; i += 1) {
      if (visited.has(currentKey)) break;
      visited.add(currentKey);
      const tile = byKey.get(currentKey);
      if (!tile) break;

      const tileConnectors = this.getTileConnectors(tile);
      const tileLinks = links.get(currentKey) || [];
      const nextLink = tileLinks.find((link) => link.key !== prevKey) || null;
      const entryDir = prevKey
        ? this.directionFromTileToTile(tile, byKey.get(prevKey))
        : (tileConnectors.find((dir) => dir !== nextLink?.dir) || tileConnectors[0]);
      const exitDir = nextLink?.dir || (tileConnectors.find((dir) => dir !== entryDir) || entryDir);

      ordered.push({ tile, entryDir, exitDir });

      if (!nextLink) break;
      prevKey = currentKey;
      currentKey = nextLink.key;
    }

    return ordered;
  }

  pickStartTile(tiles, links) {
    const endpoint = tiles.find((tile) => {
      const tileLinks = links.get(this.getGridKey(tile.gridX, tile.gridY)) || [];
      return tileLinks.length <= 1;
    });
    if (endpoint) return endpoint;
    return tiles
      .slice()
      .sort((a, b) => (a.gridY - b.gridY) || (a.gridX - b.gridX))[0];
  }

  getTileConnectors(tile) {
    const quarterTurns = this.getQuarterTurns(tile.yaw);
    if (tile.type === 'corner') {
      // Base corner shape is a right turn in grid space.
      return ['N', 'W'].map((dir) => this.rotateDirection(dir, quarterTurns));
    }
    return ['N', 'S'].map((dir) => this.rotateDirection(dir, quarterTurns));
  }

  getQuarterTurns(yaw) {
    return Math.round(yaw / (Math.PI / 2));
  }

  rotateDirection(dir, quarterTurns) {
    const cycle = ['N', 'W', 'S', 'E'];
    const idx = cycle.indexOf(dir);
    if (idx < 0) return dir;
    const turns = ((quarterTurns % 4) + 4) % 4;
    return cycle[(idx + turns) % 4];
  }

  getOppositeDirection(dir) {
    if (dir === 'N') return 'S';
    if (dir === 'S') return 'N';
    if (dir === 'E') return 'W';
    return 'E';
  }

  getNeighborCoords(gridX, gridY, dir) {
    if (dir === 'N') return { gridX, gridY: gridY - 1 };
    if (dir === 'S') return { gridX, gridY: gridY + 1 };
    if (dir === 'E') return { gridX: gridX + 1, gridY };
    return { gridX: gridX - 1, gridY };
  }

  directionFromTileToTile(fromTile, toTile) {
    if (!toTile) return 'N';
    const dx = toTile.gridX - fromTile.gridX;
    const dy = toTile.gridY - fromTile.gridY;
    if (dx > 0) return 'E';
    if (dx < 0) return 'W';
    if (dy > 0) return 'S';
    return 'N';
  }

  getDirectionVector(dir) {
    if (dir === 'N') return { x: 0, z: -1 };
    if (dir === 'S') return { x: 0, z: 1 };
    if (dir === 'E') return { x: 1, z: 0 };
    return { x: -1, z: 0 };
  }

  sampleTileCenterline(tile, entryDir, exitDir) {
    const center = this.gridToWorld(tile.gridX, tile.gridY);
    const half = this.gridSize * 0.5;
    const entryVec = this.getDirectionVector(entryDir);
    const exitVec = this.getDirectionVector(exitDir);
    const entryPoint = { x: entryVec.x * half, z: entryVec.z * half };
    const exitPoint = { x: exitVec.x * half, z: exitVec.z * half };

    const toWorld = (local) => new THREE.Vector3(center.x + local.x, center.y, center.z + local.z);

    if (tile.type !== 'corner') {
      const points = [];
      const steps = 6;
      for (let i = 0; i < steps; i += 1) {
        const t = i / (steps - 1);
        points.push(toWorld({
          x: THREE.MathUtils.lerp(entryPoint.x, exitPoint.x, t),
          z: THREE.MathUtils.lerp(entryPoint.z, exitPoint.z, t),
        }));
      }
      return points;
    }

    const centerLocal = {
      x: (entryVec.x + exitVec.x) * half,
      z: (entryVec.z + exitVec.z) * half,
    };
    const startAngle = Math.atan2(entryPoint.z - centerLocal.z, entryPoint.x - centerLocal.x);
    const endAngle = Math.atan2(exitPoint.z - centerLocal.z, exitPoint.x - centerLocal.x);
    let delta = endAngle - startAngle;
    while (delta <= -Math.PI) delta += Math.PI * 2;
    while (delta > Math.PI) delta -= Math.PI * 2;

    const points = [];
    const steps = 10;
    for (let i = 0; i < steps; i += 1) {
      const t = i / (steps - 1);
      const angle = startAngle + delta * t;
      points.push(toWorld({
        x: centerLocal.x + Math.cos(angle) * half,
        z: centerLocal.z + Math.sin(angle) * half,
      }));
    }
    return points;
  }

  refreshTrackLength() {
    let sum = 0;
    for (let i = 1; i < this.centerSamples.length; i += 1) {
      sum += this.centerSamples[i - 1].distanceTo(this.centerSamples[i]);
    }
    this.length = sum;
  }

  instantiateGridTiles() {
    for (const tile of this.gridTiles.values()) {
      this.loadTileModel(tile, (model, scale) => {
        model.scale.setScalar(scale);
        this.normalizeTileTransform(model);

        model.traverse((node) => {
          if (node.isMesh) {
            node.castShadow = true;
            node.receiveShadow = true;
          }
        });

        const tileRoot = new THREE.Group();
        tileRoot.position.copy(this.gridToWorld(tile.gridX, tile.gridY));
        tileRoot.rotation.y = tile.yaw + this.getModelYawOffset(tile.modelPath);
        tileRoot.add(model);
        this.mesh.add(tileRoot);
      });
    }
  }

  getModelYawOffset(modelPath) {
    if (modelPath === '/models/roadCornerSmall.glb') return Math.PI;
    return 0;
  }

  normalizeTileTransform(tileRoot) {
    const bounds = new THREE.Box3().setFromObject(tileRoot);
    const center = new THREE.Vector3();
    bounds.getCenter(center);

    // Recenter tile pivot so world position maps to visual center of the road cell.
    tileRoot.position.x -= center.x;
    tileRoot.position.z -= center.z;

    // Keep the model resting on y=0 in local space before world placement.
    tileRoot.position.y -= bounds.min.y;
  }

  loadTileModel(tile, onReady) {
    const { modelPath } = tile;

    if (this.modelCache.has(modelPath)) {
      const cached = this.modelCache.get(modelPath);
      onReady(cached.source.clone(true), cached.scale);
      return;
    }

    this.modelLoader.load(
      modelPath,
      (gltf) => {
        const source = gltf.scene || gltf.scenes?.[0];
        if (!source) {
          console.error('[Track:model-load-failed]', { model: modelPath, reason: 'missing scene' });
          return;
        }

        const bounds = new THREE.Box3().setFromObject(source);
        const size = new THREE.Vector3();
        bounds.getSize(size);
        const sourceLength = Math.max(size.x, size.z, 1e-3);
        const scale = this.gridSize / sourceLength;

        this.modelCache.set(modelPath, { source, scale });
        onReady(source.clone(true), scale);
      },
      undefined,
      (error) => {
        console.error('[Track:model-load-failed]', { model: modelPath, error });
      }
    );
  }

  addRoadPlane() {
    const bounds = new THREE.Box3().setFromPoints(this.centerSamples);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const planeWidth = Math.max(this.gridSize, size.x + this.width * 2);
    const planeLength = Math.max(this.gridSize, size.z + this.width * 2);

    const roadPlane = new THREE.Mesh(
      new THREE.PlaneGeometry(planeWidth, planeLength),
      new THREE.MeshStandardMaterial({
        color: 0x3f454c,
        roughness: 0.95,
        metalness: 0,
      })
    );
    roadPlane.rotation.x = -Math.PI / 2;
    roadPlane.position.set(center.x, 0.11, center.z);
    roadPlane.receiveShadow = true;
    this.mesh.add(roadPlane);
  }

  addDebugPathLine() {
    if (this.centerSamples.length < 2) return;
    const points = this.centerSamples.map((point) => new THREE.Vector3(point.x, point.y + 0.12, point.z));
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(points),
      new THREE.LineBasicMaterial({
        color: 0xff3b30,
        depthTest: false,
        depthWrite: false,
      })
    );
    line.renderOrder = 1000;
    this.mesh.add(line);
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
    const normalized = nearestIndex / Math.max(1, this.centerSamples.length - 1);
    const now = performance.now();

    if (now - this.lastProgressLogAt >= this.progressLogIntervalMs) {
      this.lastProgressLogAt = now;
      console.log('[Track:progress]', { position, nearestIndex, normalized });
    }

    return normalized;
  }

  getSpawnPoint(y = 0.65) {
    const center = this.spawnCenter || this.gridToWorld(0, 0);
    return { x: center.x, y, z: center.z };
  }
}
