// Pure data description of the city: road grid, districts, sidewalks, lane graph,
// traffic-light timing and ground heights. No rendering here.
import { makeRng } from '../core/MathUtils.js';

export const GRID = 8;                // blocks per side
export const PITCH = 90;              // distance between road centre lines
export const ROAD_HALF = 8;           // half road width (2 lanes each direction)
export const SIDEWALK_W = 3;          // sidewalk width
export const CITY_HALF = (GRID * PITCH) / 2; // 360 -> outer road centre lines
export const ROAD_EXTENT = CITY_HALF + ROAD_HALF; // roads end here
export const LAND_HALF = 410;         // edge of solid land
export const BEACH_HALF = 460;        // edge of sand (slopes into water)
export const WORLD_LIMIT = 478;       // hard boundary for everything
export const CURB_H = 0.15;           // sidewalk / block slab height
export const LANE_OFFSETS = [2.0, 5.6]; // inner / outer lane centre offsets (right-hand traffic)
export const SIDEWALK_OFFSET = ROAD_HALF + SIDEWALK_W / 2; // 9.5

export const ROADS = [];
for (let i = 0; i <= GRID; i++) ROADS.push(-CITY_HALF + i * PITCH);

export const DISTRICT = {
  DOWNTOWN: 'downtown',
  MIDTOWN: 'midtown',
  RESIDENTIAL: 'residential',
  PARK: 'park',
  PARKING: 'parking',
  POLICE: 'police',
  HOSPITAL: 'hospital',
  AMMU: 'ammunation'
};

const SPECIAL_BLOCKS = {
  '2,5': DISTRICT.PARK,
  '5,1': DISTRICT.PARK,
  '6,6': DISTRICT.PARK,
  '4,5': DISTRICT.PARKING,
  '1,2': DISTRICT.PARKING,
  '6,3': DISTRICT.PARKING,
  '2,2': DISTRICT.POLICE,
  '5,5': DISTRICT.HOSPITAL,
  '4,2': DISTRICT.AMMU
};

export class CityLayout {
  constructor(seed = 2026) {
    this.rng = makeRng(seed);
    this.blocks = [];
    this.buildBlocks();
    this.buildLaneGraph();
    this.buildSidewalkGraph();
    this.lightTimer = 0;
    this.lightCycle = 22; // seconds for full cycle
  }

  // ---------------------------------------------------------------- blocks
  buildBlocks() {
    for (let bx = 0; bx < GRID; bx++) {
      for (let bz = 0; bz < GRID; bz++) {
        const x0 = ROADS[bx] + ROAD_HALF;
        const x1 = ROADS[bx + 1] - ROAD_HALF;
        const z0 = ROADS[bz] + ROAD_HALF;
        const z1 = ROADS[bz + 1] - ROAD_HALF;
        const c = (GRID - 1) / 2;
        const ring = Math.max(Math.abs(bx - c), Math.abs(bz - c));
        let type;
        const key = `${bx},${bz}`;
        if (SPECIAL_BLOCKS[key]) type = SPECIAL_BLOCKS[key];
        else if (ring < 1) type = DISTRICT.DOWNTOWN;
        else if (ring < 2) type = this.rng.chance(0.6) ? DISTRICT.DOWNTOWN : DISTRICT.MIDTOWN;
        else if (ring < 3) type = DISTRICT.MIDTOWN;
        else type = DISTRICT.RESIDENTIAL;
        this.blocks.push({
          bx, bz, type, ring,
          x0, x1, z0, z1,
          cx: (x0 + x1) / 2,
          cz: (z0 + z1) / 2
        });
      }
    }
  }

  getBlock(bx, bz) {
    if (bx < 0 || bz < 0 || bx >= GRID || bz >= GRID) return null;
    return this.blocks[bx * GRID + bz];
  }

  findBlock(type) {
    return this.blocks.find((b) => b.type === type);
  }

  blockAt(x, z) {
    for (let i = 0; i < GRID; i++) {
      if (x > ROADS[i] && x < ROADS[i + 1]) {
        for (let j = 0; j < GRID; j++) {
          if (z > ROADS[j] && z < ROADS[j + 1]) return this.getBlock(i, j);
        }
      }
    }
    return null;
  }

  // ---------------------------------------------------------------- queries
  nearestRoadCoord(v) {
    let best = ROADS[0], bd = Infinity;
    for (const r of ROADS) {
      const d = Math.abs(v - r);
      if (d < bd) { bd = d; best = r; }
    }
    return best;
  }

  isOnRoad(x, z) {
    if (Math.abs(x) > ROAD_EXTENT || Math.abs(z) > ROAD_EXTENT) return false;
    return Math.abs(x - this.nearestRoadCoord(x)) < ROAD_HALF ||
      Math.abs(z - this.nearestRoadCoord(z)) < ROAD_HALF;
  }

  isOnLand(x, z) {
    return Math.abs(x) <= LAND_HALF && Math.abs(z) <= LAND_HALF;
  }

  /** Height of the walkable/drivable surface at x,z. */
  getGroundHeight(x, z) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > LAND_HALF) {
      // Beach slopes from 0 down into the water
      const t = Math.min((m - LAND_HALF) / (BEACH_HALF - LAND_HALF), 1.6);
      return -t * 0.75;
    }
    if (this.isOnRoad(x, z)) return 0;
    return CURB_H;
  }

  /** Surface grip multiplier used by vehicles. */
  getSurfaceGrip(x, z) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > LAND_HALF) return 0.55; // sand
    return 1;
  }

  /** District-ish name for the HUD. */
  getAreaName(x, z) {
    const m = Math.max(Math.abs(x), Math.abs(z));
    if (m > LAND_HALF) return 'Vespucci Beach';
    const b = this.blockAt(x, z);
    if (!b) return 'Los Santos';
    const names = {
      downtown: 'Downtown',
      midtown: x > 0 ? (z > 0 ? 'Pillbox Hill' : 'Alta') : (z > 0 ? 'Strawberry' : 'Burton'),
      residential: x > 0 ? (z > 0 ? 'Mirror Park' : 'Vinewood Hills') : (z > 0 ? 'Davis' : 'Rockford Hills'),
      park: 'Legion Square Park',
      parking: 'Public Parking',
      police: 'Mission Row Police',
      hospital: 'Pillbox Medical',
      ammunation: 'Ammu-Nation'
    };
    return names[b.type] || 'Los Santos';
  }

  // ---------------------------------------------------------------- lanes
  // Intersections are nodes (i, j) at (ROADS[i], ROADS[j]).
  nodeId(i, j) { return i * (GRID + 1) + j; }

  buildLaneGraph() {
    this.nodes = [];
    for (let i = 0; i <= GRID; i++) {
      for (let j = 0; j <= GRID; j++) {
        this.nodes.push({ id: this.nodeId(i, j), i, j, x: ROADS[i], z: ROADS[j], neighbors: [] });
      }
    }
    for (const n of this.nodes) {
      const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [di, dj] of dirs) {
        const ni = n.i + di, nj = n.j + dj;
        if (ni < 0 || nj < 0 || ni > GRID || nj > GRID) continue;
        n.neighbors.push(this.nodeId(ni, nj));
      }
    }
  }

  getNode(id) { return this.nodes[id]; }

  nearestNode(x, z) {
    let best = null, bd = Infinity;
    for (const n of this.nodes) {
      const d = (n.x - x) ** 2 + (n.z - z) ** 2;
      if (d < bd) { bd = d; best = n; }
    }
    return best;
  }

  /** Breadth-first path between intersection nodes (grid graph). */
  findPath(fromId, toId) {
    if (fromId === toId) return [fromId];
    const prev = new Map([[fromId, -1]]);
    const queue = [fromId];
    while (queue.length) {
      const cur = queue.shift();
      if (cur === toId) break;
      for (const nb of this.nodes[cur].neighbors) {
        if (!prev.has(nb)) { prev.set(nb, cur); queue.push(nb); }
      }
    }
    if (!prev.has(toId)) return [fromId];
    const path = [];
    let c = toId;
    while (c !== -1) { path.push(c); c = prev.get(c); }
    return path.reverse();
  }

  /** Right-hand lane point for travelling from node a to node b at fraction t. */
  lanePoint(a, b, lane, t, out = {}) {
    const dx = Math.sign(b.x - a.x), dz = Math.sign(b.z - a.z);
    const rx = -dz, rz = dx; // right-hand vector
    const off = LANE_OFFSETS[lane];
    out.x = a.x + (b.x - a.x) * t + rx * off;
    out.z = a.z + (b.z - a.z) * t + rz * off;
    out.dx = dx; out.dz = dz;
    return out;
  }

  // ---------------------------------------------------------------- traffic lights
  update(dt) {
    this.lightTimer = (this.lightTimer + dt) % this.lightCycle;
  }

  /** Returns 'green' | 'yellow' | 'red' for traffic moving along axis ('x' or 'z'). */
  getLightState(axis) {
    const half = this.lightCycle / 2;
    const t = this.lightTimer;
    const yellow = 2.5;
    const zPhase = t < half; // first half: traffic moving along Z (north/south) has green
    const local = zPhase ? t : t - half;
    const myTurn = axis === 'z' ? zPhase : !zPhase;
    if (!myTurn) return 'red';
    return local > half - yellow ? 'yellow' : 'green';
  }

  // ---------------------------------------------------------------- sidewalks
  // Sidewalk nodes sit on every combination of ROAD ± SIDEWALK_OFFSET.
  buildSidewalkGraph() {
    const coords = [];
    for (const r of ROADS) {
      coords.push(r - SIDEWALK_OFFSET, r + SIDEWALK_OFFSET);
    }
    coords.sort((a, b) => a - b);
    this.walkCoords = coords;
  }

  /** Index of the closest sidewalk coordinate. */
  nearestWalkIndex(v) {
    let best = 0, bd = Infinity;
    for (let i = 0; i < this.walkCoords.length; i++) {
      const d = Math.abs(this.walkCoords[i] - v);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }

  walkPoint(ix, iz) {
    return { x: this.walkCoords[ix], z: this.walkCoords[iz], ix, iz };
  }

  /** Neighbouring sidewalk nodes: along the sidewalk or across a crosswalk. */
  walkNeighbors(ix, iz) {
    const out = [];
    const n = this.walkCoords.length;
    if (ix > 0) out.push([ix - 1, iz]);
    if (ix < n - 1) out.push([ix + 1, iz]);
    if (iz > 0) out.push([ix, iz - 1]);
    if (iz < n - 1) out.push([ix, iz + 1]);
    return out;
  }

  /** True if the segment between two walk nodes crosses a road. */
  isCrossing(ax, az, bx, bz) {
    const ca = this.walkCoords;
    const d = Math.abs(ca[ax] - ca[bx]) + Math.abs(ca[az] - ca[bz]);
    return d < SIDEWALK_OFFSET * 2 + 1;
  }
}
