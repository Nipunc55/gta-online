import * as THREE from 'three';
import { GeoBuilder } from './GeoBuilder.js';
import {
  ROADS, ROAD_HALF, ROAD_EXTENT, LAND_HALF, CURB_H, GRID, PITCH, DISTRICT, SIDEWALK_W
} from './CityLayout.js';

// Builds every static mesh of the city (ground, roads, blocks, buildings, props)
// and registers building colliders. Uses one draw call per block.

const GLASS = [0x4a6d8c, 0x5b7f95, 0x3e5a73, 0x7d8f9b, 0xa7b4bd, 0x2f4b5e, 0x6f8fa8, 0x8e9aa5];
const CONCRETE = [0xc9b99a, 0xd8cfc0, 0xb7aa96, 0x9c9184, 0xe2dccf, 0xa89a88];
const MID = [0xb5694e, 0xc98d5f, 0xd9c7a4, 0x9a9387, 0xe0d2b4, 0x8c5a48, 0xc4b59a, 0x7f8a8f, 0xd1a77a];
const PASTEL = [0xf2d7b6, 0xe8c4c4, 0xc9dfe8, 0xf0e6c8, 0xd6e8c9, 0xe6d3ef, 0xf5f0e6, 0xf2c7a0];
const ROOF = [0x8c4b3a, 0x5a5f66, 0x7a3d2f, 0x4a4f55, 0x9b6a4a];
const AWNING = [0xc0392b, 0x2e86c1, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085];

function makeWindowTextures() {
  if (typeof document === 'undefined') {
    return { map: null, emissiveMap: null };
  }
  const w = 512, h = 512;
  const mapCanvas = document.createElement('canvas');
  mapCanvas.width = w; mapCanvas.height = h;
  const mg = mapCanvas.getContext('2d');

  const emCanvas = document.createElement('canvas');
  emCanvas.width = w; emCanvas.height = h;
  const eg = emCanvas.getContext('2d');

  // Base fill: white for map (multiplied by building vertex colors), black for emissive
  mg.fillStyle = '#ffffff';
  mg.fillRect(0, 0, w, h);
  eg.fillStyle = '#000000';
  eg.fillRect(0, 0, w, h);

  // 8x8 grid of distinct windows (64 cells, each 64x64)
  // Only ~25% of windows are lit with diverse warm & office tones; ~75% are dark.
  const warmPalettes = [
    '#ffd875', // warm amber office
    '#ffbe55', // cozy home gold
    '#f5aa38', // tungsten incandescent
    '#c9873a', // dim late-night desk lamp
    '#e2b46c', // soft golden glow
    '#d8ebfa', // modern cool white office
    '#ffcf66', // warm apartment light
    '#eaf4fd', // soft white daylight lamp
    '#ffc24d', // vibrant amber
    '#b8742d', // dim room light
  ];

  // Seeded hash per cell (col, row) so layout is deterministic and nicely distributed
  function cellHash(c, r) {
    const s = Math.sin(c * 17.13 + r * 31.41) * 43758.5453;
    return s - Math.floor(s);
  }

  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      const cx = col * 64;
      const cy = row * 64;
      const hVal = cellHash(col, row);

      // Outer concrete/wall frame
      mg.fillStyle = '#ffffff';
      mg.fillRect(cx, cy, 64, 64);
      eg.fillStyle = '#000000';
      eg.fillRect(cx, cy, 64, 64);

      // Window recessed glass pane in map (dark architectural glass)
      const glassTint = ((col + row) % 2 === 0) ? '#222f3e' : '#2b3a4a';
      mg.fillStyle = glassTint;
      mg.fillRect(cx + 8, cy + 9, 48, 46);
      mg.fillStyle = '#3a4c5f';
      mg.fillRect(cx + 8, cy + 9, 48, 4); // top lintel shadow
      mg.fillStyle = '#e4e8ec';
      mg.fillRect(cx + 31, cy + 9, 2, 46); // vertical mullion
      mg.fillStyle = '#c8d0d8';
      mg.fillRect(cx + 8, cy + 30, 48, 2); // horizontal transom

      // Emissive glowing light: only ~25% of windows are lit (sparse and natural)
      const isLit = hVal > 0.74; // ~26% of windows lit
      if (isLit) {
        const pIdx = Math.floor((hVal * 100) % warmPalettes.length);
        const litColor = warmPalettes[pIdx];
        eg.fillStyle = litColor;
        eg.fillRect(cx + 9, cy + 10, 46, 44);

        // Blinds / curtain variations on some lit windows
        if (hVal > 0.90) {
          // Blinds pulled halfway down
          eg.fillStyle = '#000000';
          eg.fillRect(cx + 9, cy + 10, 46, 20);
          for (let by = cy + 32; by < cy + 54; by += 4) {
            eg.fillRect(cx + 9, by, 46, 1); // thin slat shadows
          }
        } else if (hVal > 0.83) {
          // Curtains drawn on both sides, center glow
          eg.fillStyle = '#000000';
          eg.fillRect(cx + 9, cy + 10, 10, 44);
          eg.fillRect(cx + 45, cy + 10, 10, 44);
        } else if (hVal > 0.78) {
          // Top valence / partial shade
          eg.fillStyle = 'rgba(0, 0, 0, 0.45)';
          eg.fillRect(cx + 9, cy + 10, 46, 12);
        }

        // Window mullions block the interior light
        eg.fillStyle = '#000000';
        eg.fillRect(cx + 31, cy + 10, 2, 44);
        eg.fillRect(cx + 9, cy + 30, 46, 2);
      }
    }
  }

  // Ensure corner [0..8, 0..8] is strictly pure white in map and pure black in emissive (for roofs/slabs)
  mg.fillStyle = '#ffffff';
  mg.fillRect(0, 0, 8, 8);
  eg.fillStyle = '#000000';
  eg.fillRect(0, 0, 8, 8);

  const map = new THREE.CanvasTexture(mapCanvas);
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;

  const emissiveMap = new THREE.CanvasTexture(emCanvas);
  emissiveMap.wrapS = emissiveMap.wrapT = THREE.RepeatWrapping;
  emissiveMap.colorSpace = THREE.SRGBColorSpace;
  emissiveMap.anisotropy = 4;

  return { map, emissiveMap };
}

function makeWindowTexture() {
  return makeWindowTextures().map;
}

export function makeTextTexture(text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = opts.bg || '#ffffff';
  g.fillRect(0, 0, w, h);
  if (opts.border) {
    g.strokeStyle = opts.border;
    g.lineWidth = 10;
    g.strokeRect(5, 5, w - 10, h - 10);
  }
  g.fillStyle = opts.color || '#111111';
  g.font = `${opts.weight || 900} ${opts.size || 72}px ${opts.font || 'Montserrat, Arial, sans-serif'}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, w / 2, h / 2 + 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class CityGenerator {
  constructor(scene, layout, colliders, props) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.props = props;
    this.rng = layout.rng;
    this.parkingSpots = [];
    this.policeSpots = [];
    this.zones = {};
    this.buildingMeshes = [];

    const { map, emissiveMap } = makeWindowTextures();
    this.windowTex = map;
    this.windowEmissiveTex = emissiveMap;
    this.buildingMat = new THREE.MeshStandardMaterial({
      map: this.windowTex,
      emissiveMap: this.windowEmissiveTex,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.0,
      vertexColors: true,
      roughness: 0.74,
      metalness: 0.08
    });
    this.groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 });
    this.detailMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true });

    this.buildGround();
    this.buildRoadMarkings();
    for (const block of layout.blocks) this.buildBlock(block);
    this.buildStreetProps();
    this.buildOuterRing();
  }

  updateNightLights(nightFactor = 0) {
    if (!this.buildingMat) return;
    this.buildingMat.emissiveIntensity = Math.max(0, Math.min(1, nightFactor)) * 0.95;
  }

  addMesh(geo, mat, cast = true) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = cast;
    m.receiveShadow = true;
    this.scene.add(m);
    return m;
  }

  addCollider(cx, cz, w, d, h, y0 = 0, tag = 'building') {
    this.colliders.addBox(cx - w / 2, y0, cz - d / 2, cx + w / 2, y0 + h, cz + d / 2, tag);
  }

  // ------------------------------------------------------------ ground
  buildGround() {
    const g = new GeoBuilder();
    const E = ROAD_EXTENT;
    // asphalt base under every road
    g.quad([-E, 0, E], [E, 0, E], [E, 0, -E], [-E, 0, -E], 0x3a3d42);
    // outer ring of grass on land
    const L = LAND_HALF, h = CURB_H;
    const ring = (x0, z0, x1, z1, col) => g.box((x0 + x1) / 2, h / 2, (z0 + z1) / 2, x1 - x0, h, z1 - z0, col);
    ring(-L, -L, L, -E, 0x6f9a4a);
    ring(-L, E, L, L, 0x6f9a4a);
    ring(-L, -E, -E, E, 0x6f9a4a);
    ring(E, -E, L, E, 0x6f9a4a);
    // outer sidewalk strip around the outer roads
    const s = SIDEWALK_W, y = h + 0.01, F = E + s;
    const top = (x0, z0, x1, z1) => g.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], 0xb9b4aa);
    top(-F, -F, F, -E);
    top(-F, E, F, F);
    top(-F, -E, -E, E);
    top(E, -E, F, E);
    this.addMesh(g.build(), this.groundMat, false);

    // Beach: sloped sand ring that dips under the ocean
    const b = new GeoBuilder();
    const B = 470, O = 560;
    const sand = 0xe6d3a3, wet = 0xc8b27e;
    // 4 trapezoids (inner edge at y=0, mid at -0.75, outer -1.6)
    const sides = [
      [[-L, -L], [L, -L], [B, -B], [-B, -B]],
      [[L, L], [-L, L], [-B, B], [B, B]],
      [[-L, L], [-L, -L], [-B, -B], [-B, B]],
      [[L, -L], [L, L], [B, B], [B, -B]]
    ];
    for (const [a, c, d, e] of sides) {
      b.quad([a[0], 0, a[1]], [d[0], -0.82, d[1]], [e[0], -0.82, e[1]], [c[0], 0, c[1]], sand);
      const k = O / B;
      b.quad([d[0], -0.82, d[1]], [d[0] * k, -2.5, d[1] * k], [e[0] * k, -2.5, e[1] * k], [e[0], -0.82, e[1]], wet);
    }
    // fix winding: render both sides for safety
    const beachMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, side: THREE.DoubleSide });
    this.addMesh(b.build(), beachMat, false);
  }

  // ------------------------------------------------------------ markings
  buildRoadMarkings() {
    const g = new GeoBuilder();
    const y = 0.015;
    const yellow = 0xf2c230, white = 0xf2f2f2;
    const rect = (x0, z0, x1, z1, col) => g.quad([x0, y, z1], [x1, y, z1], [x1, y, z0], [x0, y, z0], col);

    for (let i = 0; i <= GRID; i++) {
      const r = ROADS[i];
      for (let j = 0; j < GRID; j++) {
        const a = ROADS[j] + ROAD_HALF, bEnd = ROADS[j + 1] - ROAD_HALF;
        // ---- North-south road segment at x = r
        rect(r - 0.28, a + 3.5, r - 0.12, bEnd - 3.5, yellow);
        rect(r + 0.12, a + 3.5, r + 0.28, bEnd - 3.5, yellow);
        for (let z = a + 5; z < bEnd - 5; z += 9) {
          rect(r - 3.9, z, r - 3.7, z + 3, white);
          rect(r + 3.7, z, r + 3.9, z + 3, white);
        }
        // crosswalks + stop lines
        for (const [zc, dir] of [[a + 1.5, 1], [bEnd - 1.5, -1]]) {
          for (let x = r - 7.2; x < r + 7.2; x += 1.2) rect(x, zc - 1.3, x + 0.6, zc + 1.3, white);
          const zs = zc + dir * 2.0;
          if (dir === 1) rect(r + 0.3, zs, r + 7.6, zs + 0.4, white); // northbound stops here
          else rect(r - 7.6, zs - 0.4, r - 0.3, zs, white);           // southbound
        }
        // ---- East-west road segment at z = r
        rect(a + 3.5, r - 0.28, bEnd - 3.5, r - 0.12, yellow);
        rect(a + 3.5, r + 0.12, bEnd - 3.5, r + 0.28, yellow);
        for (let x = a + 5; x < bEnd - 5; x += 9) {
          rect(x, r - 3.9, x + 3, r - 3.7, white);
          rect(x, r + 3.7, x + 3, r + 3.9, white);
        }
        for (const [xc, dir] of [[a + 1.5, 1], [bEnd - 1.5, -1]]) {
          for (let z = r - 7.2; z < r + 7.2; z += 1.2) rect(xc - 1.3, z, xc + 1.3, z + 0.6, white);
          const xs = xc + dir * 2.0;
          if (dir === 1) rect(xs, r - 7.6, xs + 0.4, r - 0.3, white); // westbound (lanes z<r)
          else rect(xs - 0.4, r + 0.3, xs, r + 7.6, white);           // eastbound (lanes z>r)
        }
      }
    }
    const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -2 });
    this.addMesh(g.build(), mat, false);
  }

  // ------------------------------------------------------------ blocks
  buildBlock(block) {
    const W = new GeoBuilder(); // windowed walls
    const D = new GeoBuilder(); // ground + details
    const { x0, x1, z0, z1 } = block;
    // Block slab = sidewalk colour, inner lot coloured by type
    D.box(block.cx, CURB_H / 2, block.cz, x1 - x0, CURB_H, z1 - z0, 0xb9b4aa);
    const s = SIDEWALK_W;
    const lotColor = {
      residential: 0x77a356, park: 0x6ea84c, parking: 0x45484d, downtown: 0xcfc8bb,
      midtown: 0xa9a49a, police: 0x55585e, hospital: 0xcfc8bb, ammunation: 0xa9a49a
    }[block.type] || 0xa9a49a;
    D.quad([x0 + s, CURB_H + 0.01, z1 - s], [x1 - s, CURB_H + 0.01, z1 - s], [x1 - s, CURB_H + 0.01, z0 + s], [x0 + s, CURB_H + 0.01, z0 + s], lotColor);

    const inner = { x0: x0 + s + 0.5, x1: x1 - s - 0.5, z0: z0 + s + 0.5, z1: z1 - s - 0.5 };
    switch (block.type) {
      case DISTRICT.DOWNTOWN: this.genDowntown(block, inner, W, D); break;
      case DISTRICT.MIDTOWN: this.genMidtown(block, inner, W, D); break;
      case DISTRICT.RESIDENTIAL: this.genResidential(block, inner, W, D); break;
      case DISTRICT.PARK: this.genPark(block, inner, W, D); break;
      case DISTRICT.PARKING: this.genParking(block, inner, W, D, 'public'); break;
      case DISTRICT.POLICE: this.genPolice(block, inner, W, D); break;
      case DISTRICT.HOSPITAL: this.genHospital(block, inner, W, D); break;
      case DISTRICT.AMMU: this.genAmmu(block, inner, W, D); break;
    }
    if (W.vertexCount) this.buildingMeshes.push(this.addMesh(W.build(), this.buildingMat, true));
    if (D.vertexCount) this.addMesh(D.build(), this.detailMat, true);
  }

  /** A box building with windows + collider. */
  building(W, D, cx, cz, w, d, h, color, opts = {}) {
    const y0 = CURB_H;
    W.box(cx, y0 + h / 2, cz, w, h, d, color, { windows: opts.windows || { u: 3.2, v: 3.5 }, topColor: opts.roof || 0x6b6e73 });
    this.addCollider(cx, cz, w, d, h + y0, 0);
    // roof parapet
    if (opts.parapet !== false && h > 8) {
      const pc = opts.trim || 0x8d8f93;
      D.box(cx, y0 + h + 0.4, cz - d / 2 + 0.2, w, 0.8, 0.4, pc);
      D.box(cx, y0 + h + 0.4, cz + d / 2 - 0.2, w, 0.8, 0.4, pc);
      D.box(cx - w / 2 + 0.2, y0 + h + 0.4, cz, 0.4, 0.8, d, pc);
      D.box(cx + w / 2 - 0.2, y0 + h + 0.4, cz, 0.4, 0.8, d, pc);
    }
    // rooftop clutter
    if (opts.clutter !== false && h > 6) {
      const n = 1 + Math.floor(this.rng() * 3);
      for (let i = 0; i < n; i++) {
        const bw = 1.5 + this.rng() * 3, bd = 1.5 + this.rng() * 3;
        const bx = cx + (this.rng() - 0.5) * (w - bw - 2);
        const bz = cz + (this.rng() - 0.5) * (d - bd - 2);
        D.box(bx, y0 + h + 0.7, bz, bw, 1.4, bd, 0x9fa3a8);
      }
    }
  }

  genDowntown(block, r, W, D) {
    const rng = this.rng;
    const lots = [];
    const mx = (r.x0 + r.x1) / 2, mz = (r.z0 + r.z1) / 2;
    const layout = rng();
    if (layout < 0.3) {
      lots.push({ x0: r.x0, x1: r.x1, z0: r.z0, z1: r.z1, big: true });
    } else if (layout < 0.55) {
      lots.push({ x0: r.x0, x1: mx - 1, z0: r.z0, z1: r.z1 });
      lots.push({ x0: mx + 1, x1: r.x1, z0: r.z0, z1: r.z1 });
    } else {
      lots.push({ x0: r.x0, x1: mx - 1, z0: r.z0, z1: mz - 1 });
      lots.push({ x0: mx + 1, x1: r.x1, z0: r.z0, z1: mz - 1 });
      lots.push({ x0: r.x0, x1: mx - 1, z0: mz + 1, z1: r.z1 });
      lots.push({ x0: mx + 1, x1: r.x1, z0: mz + 1, z1: r.z1 });
    }
    const tallFactor = block.ring < 1 ? 1 : 0.7;
    for (const lot of lots) {
      const lw = lot.x1 - lot.x0, ld = lot.z1 - lot.z0;
      const cx = (lot.x0 + lot.x1) / 2, cz = (lot.z0 + lot.z1) / 2;
      const glass = rng() < 0.65;
      const color = glass ? rng.pick(GLASS) : rng.pick(CONCRETE);
      if (lot.big) {
        // Plaza with a single landmark tower
        const tw = lw * 0.55, td = ld * 0.55;
        const h = rng.range(90, 160) * tallFactor;
        this.building(W, D, cx, cz, tw, td, h, color, { windows: { u: 2.6, v: 3.6 } });
        // upper tier + spire
        D.box(cx, CURB_H + h + 4, cz, tw * 0.6, 8, td * 0.6, color);
        D.geometry(new THREE.CylinderGeometry(0.15, 0.35, 16, 6), 0xdddddd, cx, CURB_H + h + 16, cz);
        // plaza trees & benches
        for (const [px, pz] of [[lot.x0 + 5, lot.z0 + 5], [lot.x1 - 5, lot.z0 + 5], [lot.x0 + 5, lot.z1 - 5], [lot.x1 - 5, lot.z1 - 5]]) {
          this.props.add('tree', px, CURB_H, pz, rng() * 6, 0.9);
          D.box(px, CURB_H + 0.3, pz, 3.4, 0.6, 3.4, 0x8d8f93);
        }
        this.props.add('bench', cx, CURB_H, lot.z1 - 4, 0);
        this.props.add('bench', cx, CURB_H, lot.z0 + 4, Math.PI);
        continue;
      }
      // podium
      const podH = rng.range(5, 9);
      this.building(W, D, cx, cz, lw - 1, ld - 1, podH, rng.pick(CONCRETE), { windows: { u: 3.5, v: 3.2 }, clutter: false, parapet: false });
      // tower
      const tw = Math.max(12, lw - rng.range(6, 12)), td = Math.max(12, ld - rng.range(6, 12));
      const h = rng.range(40, 120) * tallFactor;
      W.box(cx, CURB_H + podH + h / 2, cz, tw, h, td, color, { windows: { u: glass ? 2.6 : 3.2, v: 3.5 }, topColor: 0x6b6e73 });
      this.addCollider(cx, cz, tw, td, CURB_H + podH + h, 0);
      if (rng() < 0.5) {
        const h2 = h * rng.range(0.15, 0.35);
        W.box(cx, CURB_H + podH + h + h2 / 2, cz, tw * 0.7, h2, td * 0.7, color, { windows: { u: 2.6, v: 3.5 } });
        if (rng() < 0.5) D.geometry(new THREE.CylinderGeometry(0.12, 0.25, 10, 5), 0xcccccc, cx, CURB_H + podH + h + h2 + 5, cz);
      } else if (rng() < 0.4) {
        // helipad
        D.geometry(new THREE.CylinderGeometry(Math.min(tw, td) * 0.35, Math.min(tw, td) * 0.35, 0.3, 12), 0x3a3d42, cx, CURB_H + podH + h + 0.2, cz);
      } else {
        for (let i = 0; i < 3; i++) {
          D.box(cx + (rng() - 0.5) * tw * 0.6, CURB_H + podH + h + 1, cz + (rng() - 0.5) * td * 0.6, 3, 2, 3, 0x9fa3a8);
        }
      }
    }
  }

  genMidtown(block, r, W, D) {
    const rng = this.rng;
    const cols = 3, rows = 3;
    const cw = (r.x1 - r.x0) / cols, rd = (r.z1 - r.z0) / rows;
    for (let i = 0; i < cols; i++) {
      for (let j = 0; j < rows; j++) {
        const cx = r.x0 + cw * (i + 0.5), cz = r.z0 + rd * (j + 0.5);
        if (i === 1 && j === 1) {
          // inner courtyard: small car park / trees
          this.props.add('tree', cx - 5, CURB_H, cz, rng() * 6, 0.8);
          this.props.add('tree', cx + 5, CURB_H, cz + 3, rng() * 6, 0.8);
          continue;
        }
        const w = cw - 0.6, d = rd - 0.6;
        const h = rng.range(9, block.ring < 3 ? 38 : 22);
        const color = rng.pick(MID);
        this.building(W, D, cx, cz, w, d, h, color, { windows: { u: 3.2, v: 3.4 } });
        // storefront band + awning on the road-facing sides
        const faces = [];
        if (i === 0) faces.push('w');
        if (i === cols - 1) faces.push('e');
        if (j === 0) faces.push('n');
        if (j === rows - 1) faces.push('s');
        const aw = rng.pick(AWNING);
        for (const f of faces) {
          const y = CURB_H + 1.6;
          if (f === 'w') { D.box(cx - w / 2 - 0.05, y, cz, 0.1, 3.2, d * 0.9, 0x2b3440); D.box(cx - w / 2 - 0.8, CURB_H + 3.5, cz, 1.6, 0.15, d * 0.85, aw); }
          if (f === 'e') { D.box(cx + w / 2 + 0.05, y, cz, 0.1, 3.2, d * 0.9, 0x2b3440); D.box(cx + w / 2 + 0.8, CURB_H + 3.5, cz, 1.6, 0.15, d * 0.85, aw); }
          if (f === 'n') { D.box(cx, y, cz - d / 2 - 0.05, w * 0.9, 3.2, 0.1, 0x2b3440); D.box(cx, CURB_H + 3.5, cz - d / 2 - 0.8, w * 0.85, 0.15, 1.6, aw); }
          if (f === 's') { D.box(cx, y, cz + d / 2 + 0.05, w * 0.9, 3.2, 0.1, 0x2b3440); D.box(cx, CURB_H + 3.5, cz + d / 2 + 0.8, w * 0.85, 0.15, 1.6, aw); }
        }
        if (h > 20 && rng() < 0.3) {
          // water tower
          D.geometry(new THREE.CylinderGeometry(1.4, 1.4, 2.4, 8), 0x7a5a3a, cx, CURB_H + h + 3.2, cz);
          D.geometry(new THREE.ConeGeometry(1.6, 1, 8), 0x5a4030, cx, CURB_H + h + 4.9, cz);
        }
      }
    }
  }

  genResidential(block, r, W, D) {
    const rng = this.rng;
    const n = 4;
    const lw = (r.x1 - r.x0) / n, ld = (r.z1 - r.z0) / n;
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        const cx = r.x0 + lw * (i + 0.5), cz = r.z0 + ld * (j + 0.5);
        const edge = i === 0 || j === 0 || i === n - 1 || j === n - 1;
        if (!edge) {
          // shared back garden
          if (i === 1 && j === 1) {
            D.box(cx + lw / 2, CURB_H + 0.05, cz + ld / 2, 10, 0.1, 6, 0x41b8e0); // pool
            D.box(cx + lw / 2, CURB_H + 0.03, cz + ld / 2, 11.5, 0.06, 7.5, 0xe8e2d6);
          }
          if (rng() < 0.7) this.props.add('tree', cx + rng.range(-3, 3), CURB_H, cz + rng.range(-3, 3), rng() * 6, rng.range(0.8, 1.2));
          continue;
        }
        const hw = rng.range(8, 11), hd = rng.range(8, 10);
        const h = rng.range(3.5, 6.5);
        const color = rng.pick(PASTEL);
        // push house slightly away from the street (front yard)
        let ox = 0, oz = 0;
        if (i === 0) ox = 1.5; if (i === n - 1) ox = -1.5;
        if (j === 0) oz = 1.5; if (j === n - 1) oz = -1.5;
        const hx = cx + ox, hz = cz + oz;
        this.building(W, D, hx, hz, hw, hd, h, color, { windows: { u: 3, v: 3 }, parapet: false, clutter: false, roof: 0x6b6e73 });
        // hip roof
        const roofH = rng.range(1.8, 3);
        const cone = new THREE.ConeGeometry(0.7071, 1, 4);
        cone.rotateY(Math.PI / 4); // square base aligned with the axes before scaling
        D.geometry(cone, rng.pick(ROOF), hx, CURB_H + h + roofH / 2, hz, 0, 0, 0, hw * 1.12, roofH, hd * 1.12);
        // door facing the street
        const doorCol = 0x5a3b28;
        if (j === 0) D.box(hx, CURB_H + 1.1, hz - hd / 2 - 0.05, 1.2, 2.2, 0.1, doorCol);
        else if (j === n - 1) D.box(hx, CURB_H + 1.1, hz + hd / 2 + 0.05, 1.2, 2.2, 0.1, doorCol);
        else if (i === 0) D.box(hx - hw / 2 - 0.05, CURB_H + 1.1, hz, 0.1, 2.2, 1.2, doorCol);
        else D.box(hx + hw / 2 + 0.05, CURB_H + 1.1, hz, 0.1, 2.2, 1.2, doorCol);
        // yard vegetation
        if (rng() < 0.6) this.props.add(rng() < 0.3 ? 'palm' : 'tree', cx - ox * 2.2 + rng.range(-2, 2), CURB_H, cz - oz * 2.2 + rng.range(-2, 2), rng() * 6, rng.range(0.7, 1));
        if (rng() < 0.5) this.props.add('bush', cx + rng.range(-5, 5), CURB_H, cz + rng.range(-5, 5), rng() * 6, 1);
      }
    }
  }

  genPark(block, r, W, D) {
    const rng = this.rng;
    const cx = block.cx, cz = block.cz;
    const path = 0xd9cfb4;
    D.box(cx, CURB_H + 0.03, cz, r.x1 - r.x0, 0.05, 4, path);
    D.box(cx, CURB_H + 0.03, cz, 4, 0.05, r.z1 - r.z0, path);
    this.props.add('fountain', cx, CURB_H, cz, 0, 1);
    for (let k = 0; k < 26; k++) {
      const x = rng.range(r.x0 + 2, r.x1 - 2), z = rng.range(r.z0 + 2, r.z1 - 2);
      if (Math.abs(x - cx) < 4.5 || Math.abs(z - cz) < 4.5) continue;
      this.props.add(rng() < 0.25 ? 'palm' : 'tree', x, CURB_H, z, rng() * 6, rng.range(0.8, 1.3));
    }
    for (let k = 0; k < 10; k++) {
      const x = rng.range(r.x0 + 2, r.x1 - 2), z = rng.range(r.z0 + 2, r.z1 - 2);
      if (Math.abs(x - cx) < 4 || Math.abs(z - cz) < 4) continue;
      this.props.add('bush', x, CURB_H, z, rng() * 6, rng.range(0.8, 1.4));
    }
    for (const [bx, bz, rot] of [[cx + 12, cz - 3, 0], [cx - 12, cz + 3, Math.PI], [cx - 3, cz - 12, Math.PI / 2], [cx + 3, cz + 12, -Math.PI / 2]]) {
      this.props.add('bench', bx, CURB_H, bz, rot);
    }
    this.zones.park = this.zones.park || [];
    this.zones.park.push({ x: cx, z: cz });
  }

  genParking(block, r, W, D, kind) {
    const lineCol = 0xe8e8e8;
    const rows = [r.z0 + 7, r.z0 + 24, r.z1 - 24, r.z1 - 7];
    rows.forEach((rz, ri) => {
      const facing = ri % 2 === 0 ? 0 : Math.PI; // cars nose -z or +z
      for (let x = r.x0 + 4; x < r.x1 - 4; x += 3.6) {
        D.box(x - 1.8, CURB_H + 0.02, rz, 0.15, 0.03, 5.2, lineCol);
        this.parkingSpots.push({ x: x, z: rz, heading: facing, kind });
      }
    });
    // ticket booth
    D.box(r.x0 + 3, CURB_H + 1.3, block.cz, 2.4, 2.6, 2.4, 0xd6d0c4);
    this.addCollider(r.x0 + 3, block.cz, 2.4, 2.4, 3);
  }

  sign(text, x, y, z, rotY, w, h, opts) {
    const tex = makeTextTexture(text, opts);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }));
    m.position.set(x, y, z);
    m.rotation.y = rotY;
    this.scene.add(m);
    return m;
  }

  genPolice(block, r, W, D) {
    const cx = block.cx, cz = r.z0 + 14;
    const frontZ = cz - 11.0; // -165.5
    this.building(W, D, cx, cz, 50, 22, 14, 0x9aa7b8, { windows: { u: 3, v: 3.5 }, trim: 0x2c3e66 });
    D.box(cx, CURB_H + 4.2, frontZ - 0.1, 50.2, 0.8, 0.2, 0x2c3e66);
    this.sign('POLICE', cx, CURB_H + 10.2, frontZ - 0.15, Math.PI, 16, 3.2, { bg: '#1f3a72', color: '#ffffff', border: '#ffffff' });
    this.sign('PRECINCT 04 — DETENTION & RELEASE', cx, CURB_H + 5.6, frontZ - 0.15, Math.PI, 15, 1.3, { bg: '#141c2b', color: '#f1c40f', border: '#2c3e66' });

    // Security Release Gate archway & dark recessed prison vestibule
    D.box(cx, CURB_H + 2.1, frontZ - 0.12, 5.6, 4.2, 0.35, 0x2c3e66); // Steel frame
    D.box(cx, CURB_H + 1.85, frontZ - 0.22, 4.4, 3.7, 0.2, 0x0d121a); // Dark interior recess
    D.box(cx, CURB_H + 3.9, frontZ - 1.2, 6.4, 0.35, 2.4, 0x1f3a72);  // Release canopy overhang

    // Vertical prison steel bars across the entrance recess
    for (let bx = -1.8; bx <= 1.8; bx += 0.45) {
      // Leave center gap slightly parted where the player steps out
      if (Math.abs(bx) < 0.35) continue;
      D.box(cx + bx, CURB_H + 1.85, frontZ - 0.28, 0.08, 3.6, 0.08, 0x7f8c8d);
    }
    // Horizontal cross-bars
    D.box(cx, CURB_H + 3.1, frontZ - 0.28, 4.4, 0.1, 0.1, 0x7f8c8d);

    // Concrete release walkway to the sidewalk & yellow/black security bollards
    D.box(cx, CURB_H + 0.03, frontZ - 3.2, 5.2, 0.06, 6.4, 0x6c727a);
    for (const side of [-3.2, 3.2]) {
      D.box(cx + side, CURB_H + 0.55, frontZ - 2.2, 0.32, 1.1, 0.32, 0xf1c40f);
      D.box(cx + side, CURB_H + 0.55, frontZ - 4.8, 0.32, 1.1, 0.32, 0xf1c40f);
    }

    // lot for cruisers
    for (let x = r.x0 + 6; x < r.x1 - 6; x += 4) {
      D.box(x - 2, CURB_H + 0.02, r.z1 - 12, 0.15, 0.03, 5.2, 0xe8e8e8);
      this.policeSpots.push({ x, z: r.z1 - 12, heading: 0 });
    }
    D.quad([r.x0, CURB_H + 0.015, r.z1], [r.x1, CURB_H + 0.015, r.z1], [r.x1, CURB_H + 0.015, cz + 12], [r.x0, CURB_H + 0.015, cz + 12], 0x45484d);
    this.zones.police = { x: cx, z: r.z0 - 2 };
  }

  genHospital(block, r, W, D) {
    const cx = block.cx, cz = block.cz;
    this.building(W, D, cx, cz, 44, 34, 22, 0xeeeeea, { windows: { u: 3, v: 3.6 }, trim: 0xc0392b, clutter: false });
    D.geometry(new THREE.CylinderGeometry(9, 9, 0.3, 16), 0x3a3d42, cx, CURB_H + 22.6, cz);
    D.box(cx, CURB_H + 22.8, cz, 8, 0.05, 1.6, 0xffffff);
    D.box(cx - 3.2, CURB_H + 22.8, cz, 1.6, 0.05, 7, 0xffffff);
    D.box(cx + 3.2, CURB_H + 22.8, cz, 1.6, 0.05, 7, 0xffffff);
    this.sign('✚ HOSPITAL', cx, CURB_H + 17, cz + 17.05, 0, 18, 3.6, { bg: '#ffffff', color: '#c0392b' });
    this.sign('✚ HOSPITAL', cx, CURB_H + 17, cz - 17.05, Math.PI, 18, 3.6, { bg: '#ffffff', color: '#c0392b' });
    for (const [px, pz] of [[r.x0 + 4, r.z0 + 4], [r.x1 - 4, r.z0 + 4], [r.x0 + 4, r.z1 - 4], [r.x1 - 4, r.z1 - 4]]) {
      this.props.add('palm', px, CURB_H, pz, 0, 1);
    }
    this.zones.hospital = { x: cx, z: block.z1 - 1.5 };
  }

  genAmmu(block, r, W, D) {
    // half the block is regular midtown, the north side has the gun shop
    const cx = block.cx, cz = r.z0 + 9;
    this.building(W, D, cx, cz, 26, 16, 7, 0x6d6a62, { windows: { u: 4, v: 7 }, clutter: false });
    this.sign('AMMU-NATION', cx, CURB_H + 5.2, cz - 8.06, Math.PI, 14, 2.4, { bg: '#111111', color: '#e74c3c', border: '#e74c3c' });
    for (let i = 0; i < 3; i++) {
      const bx = r.x0 + 11 + i * 23;
      this.building(W, D, bx, r.z1 - 14, 20, 26, 10 + this.rng() * 18, this.rng.pick(MID));
    }
    this.zones.ammu = { x: cx, z: block.z0 + 1.5 };
  }

  // ------------------------------------------------------------ props
  buildStreetProps() {
    const rng = this.rng;
    const off = ROAD_HALF + 0.7;
    for (let i = 0; i <= GRID; i++) {
      const r = ROADS[i];
      for (let j = 0; j < GRID; j++) {
        const a = ROADS[j] + ROAD_HALF + 6, b = ROADS[j + 1] - ROAD_HALF - 6;
        for (let t = a + 6; t < b; t += 30) {
          // NS road lamps (both sides)
          this.props.add('lamp', r + off, CURB_H, t, Math.PI / 2);
          this.props.add('lamp', r - off, CURB_H, t + 15, -Math.PI / 2);
          // EW road lamps
          this.props.add('lamp', t, CURB_H, r + off, 0);
          this.props.add('lamp', t + 15, CURB_H, r - off, Math.PI);
        }
        if (rng() < 0.4) this.props.add('hydrant', r + off, CURB_H, a + rng.range(5, 50), 0);
        if (rng() < 0.4) this.props.add('bin', a + rng.range(5, 50), CURB_H, r - off, 0);
        // boulevard palms on the central avenues
        if (i === 4) {
          for (let t = a + 2; t < b; t += 15) {
            this.props.add('palm', r + off, CURB_H, t + 7, rng() * 6, rng.range(0.9, 1.1));
            this.props.add('palm', r - off, CURB_H, t, rng() * 6, rng.range(0.9, 1.1));
          }
        }
      }
    }
    // Traffic lights at every intersection corner
    const c = ROAD_HALF + 0.6;
    for (const x of ROADS) {
      for (const z of ROADS) {
        this.props.addTrafficLight(x + c, CURB_H, z + c, Math.PI, 'z');   // faces +z (northbound)
        this.props.addTrafficLight(x - c, CURB_H, z - c, 0, 'z');         // faces -z (southbound)
        this.props.addTrafficLight(x - c, CURB_H, z + c, Math.PI / 2, 'x');  // faces -x (eastbound)
        this.props.addTrafficLight(x + c, CURB_H, z - c, -Math.PI / 2, 'x'); // faces +x (westbound)
      }
    }
  }

  buildOuterRing() {
    const rng = this.rng;
    // Palms on the beach edge and trees in the green belt
    for (let t = -LAND_HALF + 10; t < LAND_HALF - 10; t += 18) {
      for (const [x, z] of [[t, LAND_HALF - 4], [t, -LAND_HALF + 4], [LAND_HALF - 4, t], [-LAND_HALF + 4, t]]) {
        this.props.add('palm', x + rng.range(-2, 2), CURB_H, z + rng.range(-1, 1), rng() * 6, rng.range(0.9, 1.2));
      }
      for (const [x, z] of [[t + 9, ROAD_EXTENT + 20], [t + 9, -ROAD_EXTENT - 20], [ROAD_EXTENT + 20, t + 9], [-ROAD_EXTENT - 20, t + 9]]) {
        if (rng() < 0.6) this.props.add('tree', x + rng.range(-6, 6), CURB_H, z + rng.range(-6, 6), rng() * 6, rng.range(0.9, 1.4));
      }
    }
    // A few beach umbrellas (simple meshes)
    const g = new GeoBuilder();
    const cols = [0xe74c3c, 0x3498db, 0xf1c40f, 0x2ecc71, 0xffffff];
    for (let z = -380; z < 380; z += 26) {
      const x = LAND_HALF + 10 + rng.range(-3, 5);
      const y = -((x - LAND_HALF) / 50) * 0.82;
      g.geometry(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 4), 0xdddddd, x, y + 1.3, z);
      g.geometry(new THREE.ConeGeometry(1.6, 0.7, 8), rng.pick(cols), x, y + 2.6, z);
      g.box(x + 1.4, y + 0.2, z, 0.8, 0.12, 1.9, rng.pick(cols));
    }
    this.addMesh(g.build(), this.detailMat, true);
  }
}
