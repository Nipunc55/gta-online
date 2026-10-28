import { Vehicle } from './Vehicle.js';
import { clamp, wrapAngle, yawFromDir } from '../core/MathUtils.js';

// Ambient city traffic + parked cars.
// - AI cars follow right-hand lanes between intersection nodes (CityLayout.nodes)
// - Obeys traffic lights at intersections (stops on red/yellow)
// - Brakes behind slower vehicles or the player
// - Hijackable by the player; abandoned hijacked cars remain parked where left

const TRAFFIC_TYPES = ['sedan', 'sedan', 'suv', 'pickup', 'sport'];

export class TrafficSystem {
  constructor(scene, layout, colliders, audio, parkingSpots = []) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.audio = audio;

    this.vehicles = [];
    this.aiMeta = new Map(); // Vehicle -> { fromNode, toNode, lane, progress, cruiseSpeed }

    this.spawnTraffic(24);
    this.spawnParked(parkingSpots, 14);
  }

  spawnTraffic(count) {
    const nodes = this.layout.nodes;
    for (let i = 0; i < count; i++) {
      const from = nodes[Math.floor(Math.random() * nodes.length)];
      const nbId = from.neighbors[Math.floor(Math.random() * from.neighbors.length)];
      const to = this.layout.getNode(nbId);
      const lane = i % 2; // 0 = inner, 1 = outer
      const t = 0.2 + Math.random() * 0.6;
      const pt = this.layout.lanePoint(from, to, lane, t);
      const heading = yawFromDir(pt.dx, pt.dz);
      const typeKey = TRAFFIC_TYPES[i % TRAFFIC_TYPES.length];

      const car = new Vehicle(this.scene, this.layout, this.colliders, this.audio, typeKey, pt.x, pt.z, heading);
      car.isOccupied = true;
      car.driver = 'traffic';
      car.useSpotLight = false;
      car.autoHeadlightEligible = true;
      car.setHeadlights(false);
      this.vehicles.push(car);
      this.aiMeta.set(car, {
        fromNode: from,
        toNode: to,
        lane,
        cruiseSpeed: 12 + Math.random() * 6
      });
    }
  }

  spawnParked(spots, maxCount) {
    if (!spots || !spots.length) return;
    const step = Math.max(1, Math.floor(spots.length / maxCount));
    for (let i = 0; i < spots.length && this.vehicles.length < 40; i += step) {
      const sp = spots[i];
      const typeKey = TRAFFIC_TYPES[(i * 3) % TRAFFIC_TYPES.length];
      const car = new Vehicle(this.scene, this.layout, this.colliders, this.audio, typeKey, sp.x, sp.z, sp.heading);
      car.isOccupied = false;
      car.driver = null;
      car.useSpotLight = false;
      car.autoHeadlightEligible = false;
      car.setHeadlights(false);
      this.vehicles.push(car);
    }
  }

  getNearestVehicle(pos, maxDist = 4.6) {
    let best = null, bd = maxDist;
    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      if (v.isDestroyed) continue;
      const d = pos.distanceTo(v.position);
      if (d < bd) { bd = d; best = v; }
    }
    return best;
  }

  update(dt, playerPos, allCars, effects) {
    for (let i = 0; i < this.vehicles.length; i++) {
      const car = this.vehicles[i];
      if (car.driver === 'player') {
        // Once player takes a traffic car, remove its AI route so it stays parked when exited
        if (this.aiMeta.has(car)) this.aiMeta.delete(car);
        continue;
      }
      if (car.isDestroyed || car.driver !== 'traffic' || !this.aiMeta.has(car)) {
        car.stepPhysics(dt, null, effects);
        continue;
      }

      const meta = this.aiMeta.get(car);
      const { fromNode, toNode, lane } = meta;

      // Target waypoint at the end of current road segment in our lane
      const targetPt = this.layout.lanePoint(fromNode, toNode, lane, 0.88);
      const dx = targetPt.x - car.position.x;
      const dz = targetPt.z - car.position.z;
      const distToIntersection = Math.hypot(dx, dz);

      // Advance to next road segment when reaching the intersection
      if (distToIntersection < 5.5) {
        const candidates = toNode.neighbors.filter((id) => id !== fromNode.id);
        const nextId = candidates.length
          ? candidates[Math.floor(Math.random() * candidates.length)]
          : fromNode.id;
        meta.fromNode = toNode;
        meta.toNode = this.layout.getNode(nextId);
      }

      // Respawn far-away traffic cars onto a road closer to the player
      if (playerPos) {
        const dp = Math.hypot(car.position.x - playerPos.x, car.position.z - playerPos.z);
        if (dp > 260) {
          this.repositionNearPlayer(car, meta, playerPos);
          continue;
        }
      }

      // Traffic light check when approaching intersection
      const axis = Math.abs(toNode.z - fromNode.z) > Math.abs(toNode.x - fromNode.x) ? 'z' : 'x';
      const light = this.layout.getLightState(axis);
      let mustStop = false;
      if (light !== 'green' && distToIntersection > 4.5 && distToIntersection < 17) {
        mustStop = true;
      }

      // Obstacle / lead-car spacing check
      const fwdX = -Math.sin(car.rotationY), fwdZ = -Math.cos(car.rotationY);
      if (playerPos) {
        const px = playerPos.x - car.position.x, pz = playerPos.z - car.position.z;
        const ahead = px * fwdX + pz * fwdZ;
        const lat = Math.abs(px * (-fwdZ) + pz * fwdX);
        if (ahead > 1 && ahead < 13 && lat < 2.6) mustStop = true;
      }
      if (!mustStop && allCars) {
        for (let j = 0; j < allCars.length; j++) {
          const other = allCars[j];
          if (other === car) continue;
          const ox = other.position.x - car.position.x, oz = other.position.z - car.position.z;
          const ahead = ox * fwdX + oz * fwdZ;
          const lat = Math.abs(ox * (-fwdZ) + oz * fwdX);
          if (ahead > 1.5 && ahead < 12 && lat < 2.3) {
            mustStop = true;
            break;
          }
        }
      }

      // Steer smoothly toward the lane target point
      const desiredYaw = yawFromDir(dx, dz);
      const angleDiff = wrapAngle(desiredYaw - car.rotationY);
      const steer = clamp(angleDiff * 1.9, -1, 1);

      let throttle = 0;
      if (mustStop) {
        throttle = car.speed > 0.6 ? -0.9 : 0;
      } else {
        const targetSpeed = Math.abs(angleDiff) > 0.35 ? meta.cruiseSpeed * 0.55 : meta.cruiseSpeed;
        throttle = car.speed < targetSpeed ? 0.65 : -0.2;
      }

      car.stepPhysics(dt, { throttle, steer, handbrake: false }, effects);
    }
  }

  repositionNearPlayer(car, meta, playerPos) {
    const nodes = this.layout.nodes;
    for (let attempt = 0; attempt < 12; attempt++) {
      const from = nodes[Math.floor(Math.random() * nodes.length)];
      const d = Math.hypot(from.x - playerPos.x, from.z - playerPos.z);
      if (d < 85 || d > 195) continue;
      const nbId = from.neighbors[Math.floor(Math.random() * from.neighbors.length)];
      const to = this.layout.getNode(nbId);
      const pt = this.layout.lanePoint(from, to, meta.lane, 0.35);
      car.position.set(pt.x, this.layout.getGroundHeight(pt.x, pt.z), pt.z);
      car.rotationY = yawFromDir(pt.dx, pt.dz);
      car.velocity.set(0, 0);
      car.speed = 8;
      car.mesh.position.copy(car.position);
      car.mesh.rotation.y = car.rotationY;
      meta.fromNode = from;
      meta.toNode = to;
      return;
    }
  }
}
