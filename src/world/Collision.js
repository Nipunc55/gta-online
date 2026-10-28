// Static collision world: axis-aligned boxes in a uniform spatial hash.
// Supports circle push-out (characters / vehicles) and ray casts (bullets, camera, LOS).

export class StaticColliders {
  constructor(cellSize = 16) {
    this.cellSize = cellSize;
    this.cells = new Map();
    this.boxes = [];
    this._stamp = 0;
  }

  _key(cx, cz) {
    return cx * 73856093 ^ cz * 19349663;
  }

  addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = 'building') {
    const box = { minX, minY, minZ, maxX, maxY, maxZ, tag, _stamp: 0 };
    this.boxes.push(box);
    const cs = this.cellSize;
    const cx0 = Math.floor(minX / cs), cx1 = Math.floor(maxX / cs);
    const cz0 = Math.floor(minZ / cs), cz1 = Math.floor(maxZ / cs);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const k = this._key(cx, cz);
        let list = this.cells.get(k);
        if (!list) { list = []; this.cells.set(k, list); }
        list.push(box);
      }
    }
    return box;
  }

  /** Collect boxes overlapping an XZ rectangle (deduplicated). */
  query(minX, minZ, maxX, maxZ, out = []) {
    out.length = 0;
    const cs = this.cellSize;
    const stamp = ++this._stamp;
    const cx0 = Math.floor(minX / cs), cx1 = Math.floor(maxX / cs);
    const cz0 = Math.floor(minZ / cs), cz1 = Math.floor(maxZ / cs);
    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cz = cz0; cz <= cz1; cz++) {
        const list = this.cells.get(this._key(cx, cz));
        if (!list) continue;
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          out.push(b);
        }
      }
    }
    return out;
  }

  /**
   * Push a vertical cylinder (feet at pos.y, given height) out of all boxes.
   * Mutates pos.x / pos.z. Returns {hit, nx, nz, depth} of the deepest contact.
   */
  resolveCircle(pos, radius, height = 1.8) {
    const res = { hit: false, nx: 0, nz: 0, depth: 0 };
    if (!this._q) this._q = [];
    for (let iter = 0; iter < 3; iter++) {
      const boxes = this.query(pos.x - radius, pos.z - radius, pos.x + radius, pos.z + radius, this._q);
      let any = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (pos.y >= b.maxY - 0.05 || pos.y + height <= b.minY) continue;
        const cx = Math.max(b.minX, Math.min(pos.x, b.maxX));
        const cz = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
        let dx = pos.x - cx, dz = pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= radius * radius) continue;
        let nx, nz, depth;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          nx = dx / d; nz = dz / d; depth = radius - d;
        } else {
          // Centre inside the box: push out along the axis of least penetration
          const pl = pos.x - b.minX, pr = b.maxX - pos.x;
          const pb = pos.z - b.minZ, pf = b.maxZ - pos.z;
          const m = Math.min(pl, pr, pb, pf);
          if (m === pl) { nx = -1; nz = 0; depth = pl + radius; }
          else if (m === pr) { nx = 1; nz = 0; depth = pr + radius; }
          else if (m === pb) { nx = 0; nz = -1; depth = pb + radius; }
          else { nx = 0; nz = 1; depth = pf + radius; }
        }
        pos.x += nx * depth;
        pos.z += nz * depth;
        any = true;
        if (depth > res.depth) { res.hit = true; res.nx = nx; res.nz = nz; res.depth = depth; res.box = b; }
      }
      if (!any) break;
    }
    return res;
  }

  /** Ray vs single box (slab test). Returns t or -1. Writes the hit normal to out. */
  static rayBox(ox, oy, oz, dx, dy, dz, b, maxT, out) {
    let tmin = 0, tmax = maxT, axis = -1, sign = 0;
    const o = [ox, oy, oz], d = [dx, dy, dz];
    const mn = [b.minX, b.minY, b.minZ], mx = [b.maxX, b.maxY, b.maxZ];
    for (let a = 0; a < 3; a++) {
      if (Math.abs(d[a]) < 1e-9) {
        if (o[a] < mn[a] || o[a] > mx[a]) return -1;
      } else {
        const inv = 1 / d[a];
        let t1 = (mn[a] - o[a]) * inv, t2 = (mx[a] - o[a]) * inv;
        let s = -1;
        if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; s = 1; }
        if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
        if (t2 < tmax) tmax = t2;
        if (tmin > tmax) return -1;
      }
    }
    if (axis === -1) return -1; // origin inside box
    if (out) {
      out.nx = axis === 0 ? sign : 0;
      out.ny = axis === 1 ? sign : 0;
      out.nz = axis === 2 ? sign : 0;
    }
    return tmin;
  }

  /**
   * Ray cast against static boxes using a 2D DDA over the grid.
   * dir must be normalised. Returns {t, nx, ny, nz, box} or null.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 200) {
    const cs = this.cellSize;
    let cx = Math.floor(ox / cs), cz = Math.floor(oz / cs);
    const stepX = dx > 0 ? 1 : -1, stepZ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(dx) > 1e-9 ? Math.abs(cs / dx) : Infinity;
    const tDeltaZ = Math.abs(dz) > 1e-9 ? Math.abs(cs / dz) : Infinity;
    const nextX = (cx + (stepX > 0 ? 1 : 0)) * cs;
    const nextZ = (cz + (stepZ > 0 ? 1 : 0)) * cs;
    let tMaxX = Math.abs(dx) > 1e-9 ? (nextX - ox) / dx : Infinity;
    let tMaxZ = Math.abs(dz) > 1e-9 ? (nextZ - oz) / dz : Infinity;
    const stamp = ++this._stamp;
    let best = null;
    const n = {};
    let tCell = 0;
    for (let guard = 0; guard < 512; guard++) {
      const list = this.cells.get(this._key(cx, cz));
      if (list) {
        for (let i = 0; i < list.length; i++) {
          const b = list[i];
          if (b._stamp === stamp) continue;
          b._stamp = stamp;
          const t = StaticColliders.rayBox(ox, oy, oz, dx, dy, dz, b, best ? best.t : maxDist, n);
          if (t >= 0 && (!best || t < best.t)) best = { t, nx: n.nx, ny: n.ny, nz: n.nz, box: b };
        }
      }
      // Hit found inside cells already traversed -> done
      if (best && best.t <= Math.min(tMaxX, tMaxZ)) break;
      if (tMaxX < tMaxZ) { tCell = tMaxX; tMaxX += tDeltaX; cx += stepX; }
      else { tCell = tMaxZ; tMaxZ += tDeltaZ; cz += stepZ; }
      if (tCell > maxDist) break;
    }
    return best;
  }

  /** Line-of-sight test between two points. */
  hasLineOfSight(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (len < 0.01) return true;
    const hit = this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len);
    return !hit;
  }
}
