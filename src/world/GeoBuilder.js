import * as THREE from 'three';

// Accumulates many low-poly primitives (with per-vertex colours) into a single
// non-indexed BufferGeometry so a whole city block can be drawn in one call.
const _v = new THREE.Vector3();
const _n = new THREE.Vector3();
const _c = new THREE.Color();
const _m = new THREE.Matrix4();
const _nm = new THREE.Matrix3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();
const _e = new THREE.Euler();

export class GeoBuilder {
  constructor() {
    this.pos = [];
    this.nor = [];
    this.col = [];
    this.uv = [];
  }

  get vertexCount() {
    return this.pos.length / 3;
  }

  _push(x, y, z, nx, ny, nz, c, u = 0.03, v = 0.03) {
    this.pos.push(x, y, z);
    this.nor.push(nx, ny, nz);
    this.col.push(c.r, c.g, c.b);
    this.uv.push(u, v);
  }

  /** Quad from 4 corners (counter-clockwise when seen from the front). */
  quad(a, b, c, d, color, uvs = null) {
    _c.set(color);
    const ab = new THREE.Vector3(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
    const ad = new THREE.Vector3(d[0] - a[0], d[1] - a[1], d[2] - a[2]);
    _n.crossVectors(ab, ad).normalize();
    const U = uvs || [[0.005, 0.005], [0.005, 0.005], [0.005, 0.005], [0.005, 0.005]];
    const P = [a, b, c, d];
    const order = [0, 1, 2, 0, 2, 3];
    for (const i of order) this._push(P[i][0], P[i][1], P[i][2], _n.x, _n.y, _n.z, _c, U[i][0], U[i][1]);
  }

  /**
   * Axis-aligned box with optional window UV mapping on its walls.
   * uvScale: {u: metres per tile horizontally, v: metres per tile vertically} or null.
   */
  box(cx, cy, cz, w, h, d, color, opts = {}) {
    const x0 = cx - w / 2, x1 = cx + w / 2;
    const y0 = cy - h / 2, y1 = cy + h / 2;
    const z0 = cz - d / 2, z1 = cz + d / 2;
    const ws = opts.windows;

    // Pseudo-random offset based on building 3D location so every building has a unique window layout
    const bHash = Math.abs(Math.sin(cx * 12.9898 + cz * 78.233 + w * 4.1 + d * 7.3) * 43758.5453);
    const uRand = Math.floor(bHash * 8);
    const vRand = Math.floor((bHash * 13.7) * 8);

    const wallUV = (len, faceOffset = 0) => {
      if (!ws) return null;
      const tiles = ws.tiles || 8;
      const uCount = Math.max(1, Math.round(len / ws.u));
      const vCount = Math.max(1, Math.round(h / ws.v));
      const u0 = ((uRand + faceOffset * 3) % tiles) / tiles;
      const v0 = ((vRand + faceOffset * 2) % tiles) / tiles;
      const u1 = u0 + uCount / tiles;
      const v1 = v0 + vCount / tiles;
      return [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];
    };
    const top = opts.topColor !== undefined ? opts.topColor : color;
    // front (+z)
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], color, wallUV(w, 0));
    // back (-z)
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], color, wallUV(w, 2));
    // right (+x)
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], color, wallUV(d, 1));
    // left (-x)
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], color, wallUV(d, 3));
    // top
    if (!opts.noTop) this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], top);
    // bottom
    if (opts.bottom) this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], color);
  }

  /** Append any THREE geometry transformed by position/rotation/scale. */
  geometry(geo, color, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _e.set(rx, ry, rz);
    _q.setFromEuler(_e);
    _p.set(px, py, pz);
    _s.set(sx, sy, sz);
    _m.compose(_p, _q, _s);
    _nm.getNormalMatrix(_m);
    _c.set(color);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(_m);
      if (N) _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      else _n.set(0, 1, 0);
      this._push(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, _c);
    }
    if (g !== geo) g.dispose();
  }

  /** Append geometry using an explicit Matrix4. */
  geometryMatrix(geo, color, matrix) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    _nm.getNormalMatrix(matrix);
    _c.set(color);
    const P = g.attributes.position, N = g.attributes.normal;
    for (let i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i).applyMatrix4(matrix);
      if (N) _n.fromBufferAttribute(N, i).applyMatrix3(_nm).normalize();
      else _n.set(0, 1, 0);
      this._push(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, _c);
    }
    if (g !== geo) g.dispose();
  }

  build() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2));
    g.computeBoundingSphere();
    g.computeBoundingBox();
    return g;
  }
}
