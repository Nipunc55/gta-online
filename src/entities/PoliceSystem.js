import { Vehicle } from './Vehicle.js';
import { clamp, wrapAngle, yawFromDir } from '../core/MathUtils.js';
import { LANE_OFFSETS } from '../world/CityLayout.js';

// 5-Star Wanted Level & Tactical Police Dispatch System:
// - Squad coordination with distinct tactical roles: TAIL, FLANK_LEFT, FLANK_RIGHT, INTERCEPT
// - Multi-route BFS pathfinding that penalizes nodes used by fellow cruisers to flank from parallel streets
// - Cruiser-to-cruiser separation, traffic overtaking, friendly officer protection & wall feeler raycasts
// - Controlled perimeter standoff braking when approaching on-foot/stopped suspects for clean officer dismounts
// - Wanted-star scaled pursuit pacing (1-star patrol pacing -> 3+ star PIT & box-in maneuvers)

const ROLES = ['TAIL', 'FLANK_LEFT', 'FLANK_RIGHT', 'INTERCEPT'];

export class PoliceSystem {
  constructor(scene, layout, colliders, audio, pedestrians) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.audio = audio;
    this.pedestrians = pedestrians;

    this.wantedLevel = 0;
    this.crimePoints = 0;
    this.evasionTimer = 0;
    this.isEvading = false;

    this.policeCars = [];
    this.cruiserMeta = new Map(); // cruiser -> { path, nextRebuild, dismounted, stuckTimer, reverseSteer, roleIndex }
  }

  addCrime(points = 1) {
    this.crimePoints += points;
    this.evasionTimer = 0;
    this.isEvading = false;

    const prev = this.wantedLevel;
    if (this.crimePoints >= 22) this.wantedLevel = 5;
    else if (this.crimePoints >= 14) this.wantedLevel = 4;
    else if (this.crimePoints >= 8) this.wantedLevel = 3;
    else if (this.crimePoints >= 3) this.wantedLevel = 2;
    else if (this.crimePoints >= 1) this.wantedLevel = 1;

    if (this.wantedLevel > prev) {
      this.syncPoliceForce();
    }
  }

  clearPolice() {
    this.wantedLevel = 0;
    this.crimePoints = 0;
    this.evasionTimer = 0;
    this.isEvading = false;
    if (this.audio) this.audio.setSiren(false);

    for (let i = this.policeCars.length - 1; i >= 0; i--) {
      const c = this.policeCars[i];
      if (c.driver === 'player') continue; // keep if hijacked by player
      c.destroy();
      this.cruiserMeta.delete(c);
      this.policeCars.splice(i, 1);
    }

    // Dismiss spawned foot officers
    if (this.pedestrians) {
      for (let i = this.pedestrians.pedestrians.length - 1; i >= 0; i--) {
        const p = this.pedestrians.pedestrians[i];
        if (p.role === 'police') {
          this.scene.remove(p.mesh);
          this.pedestrians.pedestrians.splice(i, 1);
        }
      }
    }
  }

  syncPoliceForce(nearPos = null) {
    const desired = Math.min(this.wantedLevel, 4);
    const activeAI = this.policeCars.filter((c) => c.driver === 'police' && !c.isDestroyed).length;
    if (activeAI < desired) {
      for (let i = activeAI; i < desired; i++) {
        this.spawnCruiser(nearPos);
      }
    }
    if (this.wantedLevel > 0 && this.audio) {
      this.audio.setSiren(true);
    }
  }

  spawnCruiser(nearPos = null) {
    const nodes = this.layout.nodes;
    let pickNode = nodes[Math.floor(Math.random() * nodes.length)];

    // Pick a road node at a tactical dispatch distance that doesn't overlap existing police cars
    for (let k = 0; k < 28; k++) {
      const n = nodes[Math.floor(Math.random() * nodes.length)];
      if (nearPos) {
        const d = Math.hypot(n.x - nearPos.x, n.z - nearPos.z);
        if (d < 70 || d > 155) continue;
      }
      let tooClose = false;
      for (let i = 0; i < this.policeCars.length; i++) {
        const other = this.policeCars[i];
        if (Math.hypot(n.x - other.position.x, n.z - other.position.z) < 22) {
          tooClose = true;
          break;
        }
      }
      if (!tooClose) {
        pickNode = n;
        break;
      }
    }

    // Spawn on a valid lane segment oriented toward the player or neighbor intersection
    let spawnX = pickNode.x;
    let spawnZ = pickNode.z;
    let heading = 0;
    if (pickNode.neighbors && pickNode.neighbors.length > 0) {
      let bestNb = this.layout.getNode(pickNode.neighbors[0]);
      if (nearPos) {
        let bestDist = Infinity;
        for (const nbId of pickNode.neighbors) {
          const nb = this.layout.getNode(nbId);
          const d = Math.hypot(nb.x - nearPos.x, nb.z - nearPos.z);
          if (d < bestDist) {
            bestDist = d;
            bestNb = nb;
          }
        }
      }
      const lane = this.policeCars.length % 2;
      const pt = this.layout.lanePoint(pickNode, bestNb, lane, 0.28);
      spawnX = pt.x;
      spawnZ = pt.z;
      heading = yawFromDir(pt.dx, pt.dz);
    }

    const cruiser = new Vehicle(
      this.scene,
      this.layout,
      this.colliders,
      this.audio,
      'police',
      spawnX,
      spawnZ,
      heading
    );
    cruiser.isOccupied = true;
    cruiser.driver = 'police';
    cruiser.sirenOn = true;
    cruiser.useSpotLight = false;
    cruiser.autoHeadlightEligible = true;
    cruiser.setHeadlights(false);
    this.policeCars.push(cruiser);
    this.cruiserMeta.set(cruiser, {
      path: [],
      nextRebuild: 0,
      dismounted: false,
      stuckTimer: 0,
      reverseSteer: 0,
      roleIndex: this.policeCars.length - 1
    });
  }

  /**
   * Tactical BFS pathfinder that optionally penalizes nodes already claimed by fellow cruisers
   * so secondary units naturally flank from parallel streets instead of forming a pile-up train.
   */
  findTacticalPath(fromId, toId, occupiedNodes = null) {
    if (fromId === toId) return [fromId];
    if (!occupiedNodes || occupiedNodes.size === 0) {
      return this.layout.findPath(fromId, toId);
    }

    // Dijkstra / 0-1 weighted search on the small 81-node road grid
    const dist = new Map([[fromId, 0]]);
    const prev = new Map([[fromId, -1]]);
    const queue = [fromId];

    while (queue.length) {
      // Pop lowest cost node
      let bestIdx = 0;
      let bestCost = dist.get(queue[0]);
      for (let i = 1; i < queue.length; i++) {
        const c = dist.get(queue[i]);
        if (c < bestCost) {
          bestCost = c;
          bestIdx = i;
        }
      }
      const cur = queue.splice(bestIdx, 1)[0];
      if (cur === toId) break;

      for (const nb of this.layout.nodes[cur].neighbors) {
        // Penalize intermediate nodes already used by other cruisers (unless it's the destination)
        const penalty = (nb !== toId && occupiedNodes.has(nb)) ? 2.4 : 1.0;
        const nextCost = bestCost + penalty;
        if (!dist.has(nb) || nextCost < dist.get(nb)) {
          dist.set(nb, nextCost);
          prev.set(nb, cur);
          if (!queue.includes(nb)) queue.push(nb);
        }
      }
    }

    if (!prev.has(toId)) return this.layout.findPath(fromId, toId);
    const path = [];
    let c = toId;
    while (c !== -1) {
      path.push(c);
      c = prev.get(c);
    }
    return path.reverse();
  }

  /**
   * Compute tactical target point for a cruiser based on its squad role, wanted level,
   * and whether the player is speeding in a vehicle or on foot / stationary.
   */
  computeTacticalTarget(cruiser, roleIndex, totalActive, player, distToPlayer) {
    const playerPos = player.position;
    const role = ROLES[roleIndex % ROLES.length];

    let playerVx = 0, playerVz = 0, playerSpeed = 0, playerHeading = player.rotationY;
    if (player.inVehicle && player.currentVehicle) {
      const pv = player.currentVehicle;
      playerVx = pv.velocity.x;
      playerVz = pv.velocity.y;
      playerSpeed = Math.abs(pv.speed);
      playerHeading = pv.rotationY;
    }

    const pFwdX = -Math.sin(playerHeading);
    const pFwdZ = -Math.cos(playerHeading);
    const pRightX = Math.cos(playerHeading);
    const pRightZ = -Math.sin(playerHeading);

    // CASE A: Player is on foot or moving slowly -> Establish a spaced tactical perimeter arc!
    // Cruisers fan out into distinct angular slots around the player so they never collide at the center.
    if (!player.inVehicle || playerSpeed < 3.5) {
      const baseAngle = Math.atan2(cruiser.position.x - playerPos.x, cruiser.position.z - playerPos.z);
      const spreadOffset = totalActive > 1
        ? ((roleIndex / (totalActive - 1)) - 0.5) * 1.35
        : 0;
      const slotAngle = baseAngle + spreadOffset * 0.45;
      const standoffDist = !player.inVehicle ? (13.0 + (roleIndex % 2) * 2.5) : (10.5 + roleIndex * 2.2);

      let tx = playerPos.x + Math.sin(slotAngle) * standoffDist;
      let tz = playerPos.z + Math.cos(slotAngle) * standoffDist;

      // Keep perimeter target on drivable road if player is near a road
      if (!this.layout.isOnRoad(tx, tz) && this.layout.isOnRoad(playerPos.x, playerPos.z)) {
        tx = playerPos.x + Math.sin(slotAngle) * 7.5;
        tz = playerPos.z + Math.cos(slotAngle) * 7.5;
      }
      return { tx, tz, mode: 'PERIMETER', standoffDist, playerSpeed };
    }

    // CASE B: High-speed vehicle pursuit -> Coordinated formation & interception
    let tx = playerPos.x;
    let tz = playerPos.z;

    if (role === 'TAIL') {
      // At 1-2 stars, tail behind at a safe pacing distance; at 3+ stars, step up to a rear-quarter PIT offset
      if (this.wantedLevel <= 2) {
        const trailDist = this.wantedLevel === 1 ? 11.5 : 7.5;
        tx = playerPos.x - pFwdX * trailDist + pRightX * 1.6;
        tz = playerPos.z - pFwdZ * trailDist + pRightZ * 1.6;
      } else {
        // PIT maneuver position on rear quarter panel
        const side = (Math.sin(performance.now() * 0.0005) >= 0) ? 1 : -1;
        tx = playerPos.x - pFwdX * 2.8 + pRightX * (2.5 * side);
        tz = playerPos.z - pFwdZ * 2.8 + pRightZ * (2.5 * side);
      }
    } else if (role === 'FLANK_LEFT') {
      // Pull alongside left lane to box player in
      const lead = this.wantedLevel >= 3 ? 3.5 : 0.0;
      tx = playerPos.x + pFwdX * lead - pRightX * 4.4;
      tz = playerPos.z + pFwdZ * lead - pRightZ * 4.4;
    } else if (role === 'FLANK_RIGHT') {
      // Pull alongside right lane to box player in
      const lead = this.wantedLevel >= 3 ? 3.5 : 0.0;
      tx = playerPos.x + pFwdX * lead + pRightX * 4.4;
      tz = playerPos.z + pFwdZ * lead + pRightZ * 4.4;
    } else if (role === 'INTERCEPT') {
      // Predict player's position ahead along their velocity vector
      const lookahead = clamp(distToPlayer / Math.max(14, cruiser.spec.maxSpeed), 0.5, 2.2);
      tx = playerPos.x + playerVx * lookahead;
      tz = playerPos.z + playerVz * lookahead;
    }

    return { tx, tz, mode: 'PURSUIT', standoffDist: 0, playerSpeed };
  }

  /**
   * Compute steering avoidance and speed limit adjustments from:
   * 1. Fellow police cruisers (prevents ramming own squad cars!)
   * 2. Dismounted police officers (prevents running over friendly officers!)
   * 3. Civilian traffic vehicles (smooth lane-change overtaking)
   * 4. Static building walls via 3-feeler lookahead raycasts
   */
  computeAvoidance(cruiser, allCars) {
    const pos = cruiser.position;
    const fwdX = -Math.sin(cruiser.rotationY);
    const fwdZ = -Math.cos(cruiser.rotationY);
    const rightX = Math.cos(cruiser.rotationY);
    const rightZ = -Math.sin(cruiser.rotationY);

    let steerAdjust = 0;
    let speedCap = Infinity;
    let emergencyBrake = false;

    const vehicles = allCars || this.policeCars;

    // 1. Vehicle-to-Vehicle Avoidance (Stronger priority for fellow police cruisers)
    for (let i = 0; i < vehicles.length; i++) {
      const other = vehicles[i];
      if (!other || other === cruiser || !other.mesh.visible) continue;
      // Do not avoid the player's car at 3+ stars when trying to PIT/box them in
      if (other.driver === 'player' && this.wantedLevel >= 3) continue;

      const dx = other.position.x - pos.x;
      const dz = other.position.z - pos.z;
      const distSq = dx * dx + dz * dz;
      const isFellowPolice = other.isPolice && other.driver !== 'player';
      const scanRadius = isFellowPolice ? 24 : 18;
      if (distSq > scanRadius * scanRadius || distSq < 0.01) continue;

      const ahead = dx * fwdX + dz * fwdZ;
      const lat = dx * rightX + dz * rightZ;
      const absLat = Math.abs(lat);
      const d = Math.sqrt(distSq);

      // Forward corridor check: another car is in front of us
      const corridorHalfW = isFellowPolice ? 3.8 : 2.9;
      if (ahead > -1.2 && ahead < scanRadius && absLat < corridorHalfW) {
        // Steer away laterally (if dead-center, bias by cruiser's role or right-hand rule)
        const pushDir = absLat > 0.25 ? -Math.sign(lat) : (i % 2 === 0 ? 1 : -1);
        const urgency = clamp(1.0 - ahead / scanRadius, 0.15, 1.0);
        const weight = isFellowPolice ? 1.45 : 0.95;
        steerAdjust += pushDir * urgency * weight;

        // Modulate speed so we don't rear-end fellow cruisers or stopped traffic
        if (isFellowPolice && absLat < 2.7) {
          const otherSpeed = Math.max(0, other.speed);
          if (ahead < 8.5) {
            speedCap = Math.min(speedCap, Math.max(0, otherSpeed - 3.0));
            if (ahead < 5.5 && cruiser.speed > otherSpeed + 2) {
              emergencyBrake = true;
            }
          } else if (ahead < 15.0) {
            speedCap = Math.min(speedCap, otherSpeed + 3.5);
          }
        } else if (!isFellowPolice && absLat < 2.2 && ahead < 7.5) {
          speedCap = Math.min(speedCap, Math.max(4, other.speed + 2.0));
        }
      }

      // Close-range side-by-side separation bubble so police cars don't sideswipe or lock bumpers
      const minSep = isFellowPolice ? 6.8 : 4.5;
      if (d < minSep && ahead > -3.5) {
        const sideDir = absLat > 0.1 ? -Math.sign(lat) : 1;
        const sepStrength = ((minSep - d) / minSep) * (isFellowPolice ? 1.35 : 0.75);
        steerAdjust += sideDir * sepStrength;
      }
    }

    // 2. Friendly Foot Officer Protection (Never run over dismounted police officers!)
    if (this.pedestrians && this.pedestrians.pedestrians) {
      const peds = this.pedestrians.pedestrians;
      for (let i = 0; i < peds.length; i++) {
        const ped = peds[i];
        if (ped.role !== 'police' || ped.state === 'DEAD') continue;
        const dx = ped.position.x - pos.x;
        const dz = ped.position.z - pos.z;
        const ahead = dx * fwdX + dz * fwdZ;
        const lat = dx * rightX + dz * rightZ;
        if (ahead > -1.0 && ahead < 15.0 && Math.abs(lat) < 3.4) {
          const pushDir = Math.abs(lat) > 0.15 ? -Math.sign(lat) : 1;
          steerAdjust += pushDir * clamp(1.2 - ahead / 15.0, 0.3, 1.2);
          if (ahead < 7.5 && Math.abs(lat) < 2.4) {
            speedCap = Math.min(speedCap, 2.0);
            if (cruiser.speed > 3.5) emergencyBrake = true;
          }
        }
      }
    }

    // 3. Static Building / Wall Feeler Raycasts (Left, Center, Right whisker feelers)
    if (this.colliders && cruiser.speed > 2.0) {
      const feelerDist = clamp(5.5 + cruiser.speed * 0.45, 6.5, 15.0);
      const oy = pos.y + 0.8;
      const spread = 0.38; // ~22 degrees left/right
      const lDirX = -Math.sin(cruiser.rotationY + spread);
      const lDirZ = -Math.cos(cruiser.rotationY + spread);
      const rDirX = -Math.sin(cruiser.rotationY - spread);
      const rDirZ = -Math.cos(cruiser.rotationY - spread);

      const hitC = this.colliders.raycast(pos.x, oy, pos.z, fwdX, 0, fwdZ, feelerDist);
      const hitL = this.colliders.raycast(pos.x, oy, pos.z, lDirX, 0, lDirZ, feelerDist * 0.88);
      const hitR = this.colliders.raycast(pos.x, oy, pos.z, rDirX, 0, rDirZ, feelerDist * 0.88);

      if (hitL && (!hitR || hitL.t < hitR.t)) {
        // Obstacle on front-left -> steer right (-1)
        steerAdjust -= clamp(1.0 - hitL.t / (feelerDist * 0.88), 0.2, 1.1);
      } else if (hitR && (!hitL || hitR.t < hitL.t)) {
        // Obstacle on front-right -> steer left (+1)
        steerAdjust += clamp(1.0 - hitR.t / (feelerDist * 0.88), 0.2, 1.1);
      }
      if (hitC) {
        const turnDir = (hitL && !hitR) ? -1 : ((hitR && !hitL) ? 1 : 1);
        steerAdjust += turnDir * clamp(1.1 - hitC.t / feelerDist, 0.3, 1.2);
        if (hitC.t < 7.0) {
          speedCap = Math.min(speedCap, 7.0);
        }
      }
    }

    return {
      steerAdjust: clamp(steerAdjust, -1.35, 1.35),
      speedCap,
      emergencyBrake
    };
  }

  update(dt, player, effects, allCars = null) {
    const playerPos = player.position;

    if (this.wantedLevel === 0) {
      for (let i = 0; i < this.policeCars.length; i++) {
        const c = this.policeCars[i];
        if (c.driver !== 'player') c.stepPhysics(dt, null, effects);
      }
      return;
    }

    // Recycle abandoned / dismounted police cars that are far behind the action (> 115m)
    for (let i = this.policeCars.length - 1; i >= 0; i--) {
      const c = this.policeCars[i];
      if (c.driver === 'player') continue;
      const dist = Math.hypot(c.position.x - playerPos.x, c.position.z - playerPos.z);
      if ((c.driver !== 'police' || c.isDestroyed) && dist > 115) {
        c.destroy();
        this.cruiserMeta.delete(c);
        this.policeCars.splice(i, 1);
      }
    }

    // Keep force topped up if cruisers get destroyed, hijacked, or dismounted far away
    const activeCruisers = [];
    for (let i = 0; i < this.policeCars.length; i++) {
      const c = this.policeCars[i];
      if (c.driver === 'police' && !c.isDestroyed) {
        activeCruisers.push(c);
      }
    }
    if (activeCruisers.length < Math.min(this.wantedLevel, 4)) {
      this.spawnCruiser(playerPos);
    }

    // Sort active cruisers by distance to player so closest gets role 0 (TAIL/LEAD),
    // while secondary units get FLANK_LEFT, FLANK_RIGHT, and INTERCEPT.
    activeCruisers.sort((a, b) => {
      const da = (a.position.x - playerPos.x) ** 2 + (a.position.z - playerPos.z) ** 2;
      const db = (b.position.x - playerPos.x) ** 2 + (b.position.z - playerPos.z) ** 2;
      return da - db;
    });

    // Track road nodes currently used by higher-priority cruisers for multi-route flanking
    const claimedNodes = new Set();
    let minDist = Infinity;

    // Also include foot police officers in evasion distance check
    if (this.pedestrians && this.pedestrians.pedestrians) {
      for (let i = 0; i < this.pedestrians.pedestrians.length; i++) {
        const p = this.pedestrians.pedestrians[i];
        if (p.role === 'police' && p.state !== 'DEAD') {
          const dp = Math.hypot(p.position.x - playerPos.x, p.position.z - playerPos.z);
          if (dp < minDist) minDist = dp;
        }
      }
    }

    for (let i = 0; i < this.policeCars.length; i++) {
      const cruiser = this.policeCars[i];
      if (cruiser.driver === 'player') {
        this.cruiserMeta.delete(cruiser);
        continue;
      }
      if (cruiser.isDestroyed || cruiser.driver !== 'police') {
        cruiser.stepPhysics(dt, { throttle: 0, steer: 0, handbrake: true }, effects);
        continue;
      }

      const roleIndex = Math.max(0, activeCruisers.indexOf(cruiser));
      const meta = this.cruiserMeta.get(cruiser) || {
        path: [],
        nextRebuild: 0,
        dismounted: false,
        stuckTimer: 0,
        reverseSteer: 0,
        roleIndex
      };
      meta.roleIndex = roleIndex;
      this.cruiserMeta.set(cruiser, meta);

      const dxPlayer = playerPos.x - cruiser.position.x;
      const dzPlayer = playerPos.z - cruiser.position.z;
      const dist = Math.hypot(dxPlayer, dzPlayer);
      if (dist < minDist) minDist = dist;

      // Respawn cruiser if it fell extremely far behind (> 220m)
      if (dist > 220) {
        cruiser.destroy();
        this.cruiserMeta.delete(cruiser);
        this.policeCars.splice(i, 1);
        i--;
        continue;
      }

      // Check direct line-of-sight to player (so cruisers don't cut through buildings when < 42m)
      const hasLOS = !this.colliders || this.colliders.hasLineOfSight(
        cruiser.position.x, cruiser.position.y + 1.1, cruiser.position.z,
        playerPos.x, playerPos.y + 1.1, playerPos.z
      );

      // Dismount officer when player is on foot, cruiser has braked into perimeter range (< 18.5m), and has LOS
      if (!player.inVehicle && dist < 18.5 && hasLOS && !meta.dismounted && Math.abs(cruiser.speed) < 7.5) {
        meta.dismounted = true;
        cruiser.driver = null;
        cruiser.isOccupied = false;
        if (this.pedestrians) {
          const leftX = -Math.cos(cruiser.rotationY);
          const leftZ = Math.sin(cruiser.rotationY);
          // Spawn officer on the side away from other vehicles
          const spawnSide = (roleIndex % 2 === 0) ? 1 : -1;
          this.pedestrians.spawnOfficer(
            cruiser.position.x + leftX * 2.2 * spawnSide,
            cruiser.position.z + leftZ * 2.2 * spawnSide
          );
        }
        cruiser.stepPhysics(dt, { throttle: 0, steer: 0, handbrake: true }, effects);
        continue;
      }

      // Determine tactical target point based on squad role
      const tactic = this.computeTacticalTarget(
        cruiser,
        roleIndex,
        activeCruisers.length,
        player,
        dist
      );

      // Use BFS road network when far (> 42m) OR when buildings block direct line-of-sight
      const useRoadPath = dist > 42 || !hasLOS;
      meta.nextRebuild -= dt;
      if (useRoadPath && (meta.nextRebuild <= 0 || meta.path.length === 0)) {
        meta.nextRebuild = 0.9 + (roleIndex * 0.18);
        const nFrom = this.layout.nearestNode(cruiser.position.x, cruiser.position.z);
        const nTo = this.layout.nearestNode(tactic.tx, tactic.tz);
        meta.path = this.findTacticalPath(nFrom.id, nTo.id, roleIndex > 0 ? claimedNodes : null);
        if (meta.path.length > 1) {
          // If first node is behind us and second node is ahead, skip first node
          const n0 = this.layout.getNode(meta.path[0]);
          const n1 = this.layout.getNode(meta.path[1]);
          const d01 = Math.hypot(n1.x - n0.x, n1.z - n0.z);
          const dc1 = Math.hypot(n1.x - cruiser.position.x, n1.z - cruiser.position.z);
          if (dc1 < d01 + 6) meta.path.shift();
        }
      }

      // Register intermediate path nodes so following cruisers can pick flanking streets
      for (let p = 0; p < Math.min(meta.path.length, 3); p++) {
        claimedNodes.add(meta.path[p]);
      }

      // Select steering waypoint: right-hand lane point when on road graph, or tactical target when in sight
      let tx = tactic.tx;
      let tz = tactic.tz;
      if (useRoadPath && meta.path.length > 0) {
        const node = this.layout.getNode(meta.path[0]);
        tx = node.x;
        tz = node.z;

        // Offset into right-hand lane along segment direction so cruisers stay in clean lanes
        const segDx = node.x - cruiser.position.x;
        const segDz = node.z - cruiser.position.z;
        const segLen = Math.hypot(segDx, segDz);
        if (segLen > 12) {
          const rx = -segDz / segLen;
          const rz = segDx / segLen;
          const laneOff = LANE_OFFSETS[roleIndex % 2] || 2.0;
          tx += rx * laneOff;
          tz += rz * laneOff;
        }

        if (segLen < 12.5) {
          meta.path.shift();
        }
      }

      // Compute obstacle & friendly-unit avoidance
      const avoidance = this.computeAvoidance(cruiser, allCars);

      // Desired steering angle + avoidance blend
      const desiredYaw = yawFromDir(tx - cruiser.position.x, tz - cruiser.position.z);
      const angleDiff = wrapAngle(desiredYaw - cruiser.rotationY);
      let steer = clamp(angleDiff * 1.85 + avoidance.steerAdjust, -1, 1);

      // Wanted-level speed ceiling & cornering speed modulation
      const starSpeedScale = this.wantedLevel === 1 ? 0.78 : (this.wantedLevel === 2 ? 0.88 : 1.0);
      let targetSpeed = cruiser.spec.maxSpeed * starSpeedScale;

      // Slow down smoothly for sharp intersection turns
      const absAngle = Math.abs(angleDiff);
      if (absAngle > 1.15) targetSpeed = Math.min(targetSpeed, 11.0);
      else if (absAngle > 0.65) targetSpeed = Math.min(targetSpeed, 16.5);

      // In 1-2 star pursuits, pace the player instead of overshooting at extreme speed
      if (tactic.mode === 'PURSUIT' && this.wantedLevel <= 2 && dist < 24 && hasLOS) {
        targetSpeed = Math.min(targetSpeed, Math.max(10, tactic.playerSpeed + 3.5));
      }

      // In PERIMETER mode (player on foot or stopped), progressively brake as we reach standoff distance!
      const distToTarget = Math.hypot(tactic.tx - cruiser.position.x, tactic.tz - cruiser.position.z);
      if (tactic.mode === 'PERIMETER' && hasLOS) {
        if (dist < 15.5 || distToTarget < 5.0) {
          targetSpeed = 0;
        } else if (dist < 30.0) {
          targetSpeed = Math.min(targetSpeed, clamp((dist - 13.0) * 0.75, 3.0, 14.0));
        }
      }

      // Apply avoidance speed cap
      targetSpeed = Math.min(targetSpeed, avoidance.speedCap);

      // Convert targetSpeed into smooth throttle / braking commands
      let throttle = 0;
      let handbrake = false;

      if (avoidance.emergencyBrake || (targetSpeed <= 0.5 && cruiser.speed > 1.2)) {
        throttle = -0.95;
        handbrake = cruiser.speed > 6.5;
      } else if (cruiser.speed > targetSpeed + 2.5) {
        throttle = -clamp((cruiser.speed - targetSpeed) * 0.18, 0.25, 0.9);
      } else if (cruiser.speed < targetSpeed - 0.5) {
        throttle = absAngle > 1.0 ? 0.55 : 0.92;
      } else {
        throttle = 0.25;
      }

      // Tactical J-turn / drift only when chasing fast vehicles around a sharp corner with clear space
      if (tactic.mode === 'PURSUIT' && absAngle > 1.45 && cruiser.speed > 15 && !avoidance.emergencyBrake) {
        handbrake = true;
      }

      // Smart 3-point unstick reversing maneuver if blocked against a wall or obstacle
      const isTryingToMove = targetSpeed > 2.5 && !avoidance.emergencyBrake;
      if (isTryingToMove && Math.abs(cruiser.speed) < 1.2) {
        meta.stuckTimer += dt;
        if (meta.stuckTimer > 1.0 && meta.reverseSteer === 0) {
          // Pick reverse steering direction toward whichever side has more clearance
          meta.reverseSteer = angleDiff >= 0 ? -1 : 1;
        }
      } else if (cruiser.speed > 2.5) {
        meta.stuckTimer = Math.max(0, meta.stuckTimer - dt * 2.5);
        meta.reverseSteer = 0;
      }

      if (meta.stuckTimer > 1.0) {
        throttle = -0.85;
        steer = meta.reverseSteer || -Math.sign(steer || 1);
        handbrake = false;
        if (meta.stuckTimer > 2.3) {
          meta.stuckTimer = 0;
          meta.reverseSteer = 0;
          meta.nextRebuild = 0; // force path rebuild after backing out
        }
      }

      cruiser.stepPhysics(dt, { throttle, steer, handbrake }, effects);
    }

    // Distance-based siren volume
    if (this.audio && isFinite(minDist)) {
      this.audio.setSirenVolume(clamp(1.1 - minDist / 120, 0.08, 1.0));
    }

    // Evasion check: if no cruiser or officer is within 62m
    if (minDist > 62) {
      this.isEvading = true;
      this.evasionTimer += dt;
      if (this.evasionTimer >= 10.0) {
        this.wantedLevel = Math.max(0, this.wantedLevel - 1);
        this.crimePoints = Math.max(0, this.crimePoints - 5);
        this.evasionTimer = 0;
        if (this.wantedLevel === 0) {
          this.clearPolice();
        }
      }
    } else {
      this.isEvading = false;
      this.evasionTimer = 0;
    }
  }
}
