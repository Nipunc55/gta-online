import * as THREE from 'three';
import { GeoBuilder } from './GeoBuilder.js';
import { createLightBeamMaterial } from './LightBeamMaterial.js';

// Instanced low-poly street furniture & vegetation. Each prop type is one merged
// vertex-coloured geometry drawn with a single InstancedMesh.

let cachedLampPoolTex = null;
function getStreetLampPoolTexture() {
  if (cachedLampPoolTex) return cachedLampPoolTex;
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 62);
  grad.addColorStop(0.0, 'rgba(255, 242, 175, 0.95)');
  grad.addColorStop(0.2, 'rgba(255, 225, 130, 0.65)');
  grad.addColorStop(0.5, 'rgba(255, 200, 90, 0.26)');
  grad.addColorStop(0.8, 'rgba(255, 180, 60, 0.08)');
  grad.addColorStop(1.0, 'rgba(255, 180, 60, 0.0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  cachedLampPoolTex = new THREE.CanvasTexture(c);
  cachedLampPoolTex.colorSpace = THREE.SRGBColorSpace;
  return cachedLampPoolTex;
}

function buildPropGeometries() {
  const G = {};
  const cyl = (rt, rb, h, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);

  // Street lamp
  let b = new GeoBuilder();
  b.geometry(cyl(0.09, 0.13, 7), 0x3b3f45, 0, 3.5, 0);
  b.box(0, 7.0, -0.9, 0.12, 0.12, 1.9, 0x3b3f45);
  G.lamp = b.build();
  G.streetLampBulb = new THREE.BoxGeometry(0.52, 0.22, 0.85);

  const beamH = 6.7;
  const beamGeo = new THREE.ConeGeometry(3.0, beamH, 20, 1, true);
  beamGeo.translate(0, -beamH * 0.5, 0); // apex at (0, 0, 0), opens downward
  G.streetLampBeam = beamGeo;

  const poolGeo = new THREE.PlaneGeometry(8.5, 8.5);
  poolGeo.rotateX(-Math.PI / 2);
  G.streetLampPool = poolGeo;

  // Traffic light housing (lamp is a separate instanced mesh)
  b = new GeoBuilder();
  b.geometry(cyl(0.1, 0.12, 4.2), 0x2d3035, 0, 2.1, 0);
  b.box(0, 4.6, 0, 0.42, 1.2, 0.36, 0x1d1f23);
  b.box(0, 4.6, -0.2, 0.5, 1.3, 0.04, 0xf0c419);
  G.trafficLight = b.build();
  G.trafficLamp = new THREE.BoxGeometry(0.26, 0.26, 0.06);

  // Deciduous tree
  b = new GeoBuilder();
  b.geometry(cyl(0.16, 0.24, 2.6, 5), 0x6b4a2f, 0, 1.3, 0);
  b.geometry(new THREE.IcosahedronGeometry(1.9, 0), 0x3f8f3a, 0, 3.6, 0);
  b.geometry(new THREE.IcosahedronGeometry(1.3, 0), 0x4fa046, 0.6, 4.6, 0.3);
  b.geometry(new THREE.IcosahedronGeometry(1.1, 0), 0x358233, -0.7, 4.2, -0.4);
  G.tree = b.build();

  // Palm tree
  b = new GeoBuilder();
  for (let i = 0; i < 4; i++) {
    b.geometry(cyl(0.17 - i * 0.02, 0.2 - i * 0.02, 2.2, 6), 0x8a6a45, i * 0.12, 1.1 + i * 2.1, 0, 0, 0, -0.05);
  }
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    const leaf = new THREE.ConeGeometry(0.45, 3.2, 4);
    b.geometry(leaf, i % 2 ? 0x3c8f3a : 0x2f7a35,
      0.48 + Math.sin(a) * 1.3, 8.6, Math.cos(a) * 1.3,
      Math.cos(a) * 1.25, 0, -Math.sin(a) * 1.25, 1, 1, 0.25);
  }
  b.geometry(new THREE.IcosahedronGeometry(0.4, 0), 0x6b5030, 0.48, 8.7, 0);
  G.palm = b.build();

  // Bush
  b = new GeoBuilder();
  b.geometry(new THREE.IcosahedronGeometry(0.9, 0), 0x3d8a3a, 0, 0.6, 0, 0, 0, 0, 1.3, 0.8, 1.1);
  G.bush = b.build();

  // Bench
  b = new GeoBuilder();
  b.box(0, 0.45, 0, 1.8, 0.08, 0.5, 0x8b5a2b);
  b.box(0, 0.8, 0.22, 1.8, 0.4, 0.06, 0x8b5a2b);
  b.box(-0.8, 0.22, 0, 0.08, 0.45, 0.45, 0x333333);
  b.box(0.8, 0.22, 0, 0.08, 0.45, 0.45, 0x333333);
  G.bench = b.build();

  // Fire hydrant
  b = new GeoBuilder();
  b.geometry(cyl(0.14, 0.17, 0.7, 6), 0xd42a1e, 0, 0.35, 0);
  b.geometry(new THREE.SphereGeometry(0.15, 6, 4), 0xd42a1e, 0, 0.72, 0);
  b.box(0, 0.45, 0, 0.45, 0.1, 0.1, 0xb0201a);
  G.hydrant = b.build();

  // Trash bin
  b = new GeoBuilder();
  b.geometry(cyl(0.3, 0.26, 0.95, 8), 0x2f5d3a, 0, 0.47, 0);
  b.geometry(cyl(0.33, 0.33, 0.06, 8), 0x1f3d27, 0, 0.97, 0);
  G.bin = b.build();

  // Fountain (park centrepiece)
  b = new GeoBuilder();
  b.geometry(cyl(4.5, 4.8, 0.7, 12), 0xc9c2b2, 0, 0.35, 0);
  b.geometry(cyl(4.0, 4.0, 0.1, 12), 0x3fa9d6, 0, 0.62, 0);
  b.geometry(cyl(0.5, 0.7, 2.2, 8), 0xc9c2b2, 0, 1.4, 0);
  b.geometry(cyl(1.5, 1.2, 0.3, 10), 0xc9c2b2, 0, 2.5, 0);
  b.geometry(cyl(1.3, 1.3, 0.05, 10), 0x5cc2ea, 0, 2.66, 0);
  G.fountain = b.build();

  return G;
}

const COLLIDER_SIZE = {
  lamp: 0.18, trafficLight: 0.18, tree: 0.3, palm: 0.25, hydrant: 0.2, bin: 0.32, bench: null,
  fountain: 4.7
};

export class Props {
  constructor(scene, colliders) {
    this.scene = scene;
    this.colliders = colliders;
    this.geos = buildPropGeometries();
    this.items = {};
    this.trafficLamps = []; // {x,y,z,rotY,axis}
    this.material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });
  }

  add(type, x, y, z, rotY = 0, scale = 1, tint = null) {
    if (!this.items[type]) this.items[type] = [];
    this.items[type].push({ x, y, z, rotY, scale, tint });
    const r = COLLIDER_SIZE[type];
    if (r && this.colliders) {
      const h = type === 'fountain' ? 0.7 : 3;
      this.colliders.addBox(x - r * scale, y, z - r * scale, x + r * scale, y + h, z + r * scale, 'prop');
    }
    if (type === 'trafficLight') {
      this.trafficLamps.push({ x, y, z, rotY, axis: this._pendingAxis || 'z' });
    }
  }

  addTrafficLight(x, y, z, rotY, axis) {
    this._pendingAxis = axis;
    this.add('trafficLight', x, y, z, rotY);
    this._pendingAxis = null;
  }

  build() {
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3();
    const col = new THREE.Color();
    for (const type of Object.keys(this.items)) {
      const list = this.items[type];
      const mesh = new THREE.InstancedMesh(this.geos[type], this.material, list.length);
      list.forEach((it, i) => {
        q.setFromAxisAngle(up, it.rotY);
        p.set(it.x, it.y, it.z);
        s.setScalar(it.scale);
        m4.compose(p, q, s);
        mesh.setMatrixAt(i, m4);
        col.set(it.tint !== null ? it.tint : 0xffffff);
        mesh.setColorAt(i, col);
      });
      mesh.castShadow = type !== 'bush' && type !== 'hydrant';
      mesh.receiveShadow = true;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      this.scene.add(mesh);
    }

    // Traffic light lamps (colour changes with the light phase)
    const n = this.trafficLamps.length;
    if (n) {
      this.lampMesh = new THREE.InstancedMesh(this.geos.trafficLamp, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
      this.trafficLamps.forEach((l, i) => {
        q.setFromAxisAngle(up, l.rotY);
        // lamp sits on the front face of the housing (local -z)
        const fx = -Math.sin(l.rotY) * 0.2, fz = -Math.cos(l.rotY) * 0.2;
        p.set(l.x + fx, l.y + 4.6, l.z + fz);
        s.setScalar(1);
        m4.compose(p, q, s);
        this.lampMesh.setMatrixAt(i, m4);
        this.lampMesh.setColorAt(i, col.set(0x00ff55));
      });
      this.lampMesh.computeBoundingSphere();
      this.scene.add(this.lampMesh);
    }

    // Street lamp luminaire bulbs, volumetric light beams & ground light pools
    const streetLamps = this.items.lamp || [];
    this.streetLampCoords = [];
    if (streetLamps.length) {
      this.streetLampMat = new THREE.MeshBasicMaterial({ color: 0x9aa3ad });
      this.streetLampBulbMesh = new THREE.InstancedMesh(this.geos.streetLampBulb, this.streetLampMat, streetLamps.length);

      this.streetLampBeamMat = createLightBeamMaterial({ color: 0xffd98a, intensity: 0.0, lengthFalloff: 1.4, edgeFalloff: 2.2 });
      this.streetLampBeamMesh = new THREE.InstancedMesh(this.geos.streetLampBeam, this.streetLampBeamMat, streetLamps.length);
      this.streetLampBeamMesh.visible = false;
      this.streetLampBeamMesh.frustumCulled = false;

      this.streetLampPoolMat = new THREE.MeshBasicMaterial({
        map: getStreetLampPoolTexture(),
        color: 0xffe899,
        transparent: true,
        opacity: 0.0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -3
      });
      this.streetLampPoolMesh = new THREE.InstancedMesh(this.geos.streetLampPool, this.streetLampPoolMat, streetLamps.length);
      this.streetLampPoolMesh.visible = false;
      this.streetLampPoolMesh.renderOrder = 2;

      streetLamps.forEach((l, i) => {
        q.setFromAxisAngle(up, l.rotY);
        const fx = -Math.sin(l.rotY) * 1.75 * l.scale;
        const fz = -Math.cos(l.rotY) * 1.75 * l.scale;
        const hx = l.x + fx;
        const hy = l.y + 6.88 * l.scale;
        const hz = l.z + fz;
        this.streetLampCoords.push({ x: hx, y: hy, z: hz });

        // Bulb
        p.set(hx, hy, hz);
        s.setScalar(l.scale);
        m4.compose(p, q, s);
        this.streetLampBulbMesh.setMatrixAt(i, m4);

        // Volumetric downward light beam
        p.set(hx, hy - 0.05, hz);
        s.set(l.scale, l.scale, l.scale);
        m4.compose(p, q, s);
        this.streetLampBeamMesh.setMatrixAt(i, m4);

        // Ground light pool decal
        p.set(hx, 0.04, hz);
        s.set(l.scale, l.scale, l.scale);
        m4.compose(p, q, s);
        this.streetLampPoolMesh.setMatrixAt(i, m4);
      });

      this.streetLampBulbMesh.instanceMatrix.needsUpdate = true;
      this.streetLampBulbMesh.computeBoundingSphere();
      this.scene.add(this.streetLampBulbMesh);

      this.streetLampBeamMesh.instanceMatrix.needsUpdate = true;
      this.streetLampBeamMesh.computeBoundingSphere();
      this.scene.add(this.streetLampBeamMesh);

      this.streetLampPoolMesh.instanceMatrix.needsUpdate = true;
      this.streetLampPoolMesh.computeBoundingSphere();
      this.scene.add(this.streetLampPoolMesh);

      // Local dynamic PointLight for real-time illumination on player and surroundings
      this.localLampLight = new THREE.PointLight(0xffe28a, 0, 24, 1.4);
      this.localLampLight.visible = false;
      this.scene.add(this.localLampLight);
    }
  }

  /** Toggle street lamp luminaire glow, beams & ground pools based on day/night cycle. */
  updateNightLights(isNight, nightFactor = 1.0) {
    const nf = Math.max(0, Math.min(1, nightFactor));
    if (this.streetLampMat) {
      this.streetLampMat.color.setHex(isNight ? 0xfff6b8 : 0x9aa3ad);
    }
    if (this.streetLampBeamMat) {
      this.streetLampBeamMat.uniforms.uIntensity.value = nf * 0.22;
    }
    if (this.streetLampPoolMat) {
      this.streetLampPoolMat.opacity = nf * 0.76;
    }
    const vis = nf > 0.02;
    if (this.streetLampBeamMesh && this.streetLampBeamMesh.visible !== vis) {
      this.streetLampBeamMesh.visible = vis;
    }
    if (this.streetLampPoolMesh && this.streetLampPoolMesh.visible !== vis) {
      this.streetLampPoolMesh.visible = vis;
    }
  }

  update(dt, playerPos, isNight, nightFactor = 1.0) {
    if (!this.localLampLight) return;
    const nf = Math.max(0, Math.min(1, nightFactor));
    if (nf <= 0.05 || !playerPos || !this.streetLampCoords || !this.streetLampCoords.length) {
      this.localLampLight.intensity = 0;
      this.localLampLight.visible = false;
      return;
    }

    let nearest = null;
    let minDistSq = 28 * 28;
    for (let i = 0; i < this.streetLampCoords.length; i++) {
      const c = this.streetLampCoords[i];
      const dx = c.x - playerPos.x;
      const dz = c.z - playerPos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < minDistSq) {
        minDistSq = d2;
        nearest = c;
      }
    }

    if (nearest) {
      this.localLampLight.position.set(nearest.x, nearest.y - 0.5, nearest.z);
      this.localLampLight.intensity = nf * 2.8;
      this.localLampLight.visible = true;
    } else {
      this.localLampLight.intensity = 0;
      this.localLampLight.visible = false;
    }
  }

  /** Recolour traffic lamps. getState(axis) -> 'green'|'yellow'|'red'. */
  updateTrafficLights(getState) {
    if (!this.lampMesh) return;
    const zs = getState('z'), xs = getState('x');
    const key = zs + xs;
    if (key === this._lastKey) return;
    this._lastKey = key;
    const colors = { green: 0x22ff66, yellow: 0xffc400, red: 0xff2222 };
    const col = new THREE.Color();
    const yOff = { green: -0.36, yellow: 0, red: 0.36 };
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const p = new THREE.Vector3();
    const s = new THREE.Vector3(1, 1, 1);
    this.trafficLamps.forEach((l, i) => {
      const st = l.axis === 'z' ? zs : xs;
      this.lampMesh.setColorAt(i, col.set(colors[st]));
      q.setFromAxisAngle(up, l.rotY);
      const fx = -Math.sin(l.rotY) * 0.2, fz = -Math.cos(l.rotY) * 0.2;
      p.set(l.x + fx, l.y + 4.6 + yOff[st], l.z + fz);
      m4.compose(p, q, s);
      this.lampMesh.setMatrixAt(i, m4);
    });
    this.lampMesh.instanceColor.needsUpdate = true;
    this.lampMesh.instanceMatrix.needsUpdate = true;
  }
}
