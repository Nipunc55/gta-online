import { Vehicle } from './Vehicle.js';
import { clamp, wrapAngle, yawFromDir } from '../core/MathUtils.js';

// 5-Star Wanted Level & Police Dispatch System:
// - Cruisers navigate the road network via BFS pathfinding toward the player
// - Cruisers use real Vehicle.stepPhysics() so they collide with buildings & traffic
// - Officers dismount from cruisers when close to an on-foot player and engage with pistols
// - Breaking line-of-sight / distance > 65m for 12s decays wanted stars

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
    this.cruiserMeta = new Map(); // cruiser -> { path, nextRebuild, dismounted, stuckTimer }
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

  syncPoliceForce() {
    const desired = Math.min(this.wantedLevel, 4);
    const activeAI = this.policeCars.filter((c) => c.driver === 'police' && !c.isDestroyed).length;
    if (activeAI < desired) {
      for (let i = activeAI; i < desired; i++) {
        this.spawnCruiser();
      }
    }
    if (this.wantedLevel > 0 && this.audio) {
      this.audio.setSiren(true);
    }
  }

  spawnCruiser(nearPos = null) {
    const nodes = this.layout.nodes;
    let pickNode = nodes[Math.floor(Math.random() * nodes.length)];
    if (nearPos) {
      for (let k = 0; k < 15; k++) {
        const n = nodes[Math.floor(Math.random() * nodes.length)];
        const d = Math.hypot(n.x - nearPos.x, n.z - nearPos.z);
        if (d > 65 && d < 145) { pickNode = n; break; }
      }
    }
    const cruiser = new Vehicle(
      this.scene,
      this.layout,
      this.colliders,
      this.audio,
      'police',
      pickNode.x,
      pickNode.z,
      0
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
      stuckTimer: 0
    });
  }

  update(dt, player, effects) {
    const playerPos = player.position;

    if (this.wantedLevel === 0) {
      for (let i = 0; i < this.policeCars.length; i++) {
        const c = this.policeCars[i];
        if (c.driver !== 'player') c.stepPhysics(dt, null, effects);
      }
      return;
    }

    // Keep force topped up if cruisers get destroyed or hijacked
    const activeAI = this.policeCars.filter((c) => c.driver === 'police' && !c.isDestroyed).length;
    if (activeAI < Math.min(this.wantedLevel, 4)) {
      this.spawnCruiser(playerPos);
    }

    let minDist = Infinity;

    for (let i = 0; i < this.policeCars.length; i++) {
      const cruiser = this.policeCars[i];
      if (cruiser.driver === 'player') {
        this.cruiserMeta.delete(cruiser);
        continue;
      }
      if (cruiser.isDestroyed || cruiser.driver !== 'police') {
        cruiser.stepPhysics(dt, null, effects);
        continue;
      }

      const meta = this.cruiserMeta.get(cruiser) || { path: [], nextRebuild: 0, dismounted: false, stuckTimer: 0 };
      this.cruiserMeta.set(cruiser, meta);

      const dxPlayer = playerPos.x - cruiser.position.x;
      const dzPlayer = playerPos.z - cruiser.position.z;
      const dist = Math.hypot(dxPlayer, dzPlayer);
      if (dist < minDist) minDist = dist;

      // Dismount officer if player is on foot and cruiser gets within 15m
      if (!player.inVehicle && dist < 15.5 && !meta.dismounted && Math.abs(cruiser.speed) < 9) {
        meta.dismounted = true;
        cruiser.driver = null;
        cruiser.isOccupied = false;
        if (this.pedestrians) {
          const leftX = -Math.cos(cruiser.rotationY);
          const leftZ = Math.sin(cruiser.rotationY);
          this.pedestrians.spawnOfficer(
            cruiser.position.x + leftX * 2.2,
            cruiser.position.z + leftZ * 2.2
          );
        }
        cruiser.stepPhysics(dt, { throttle: 0, steer: 0, handbrake: true }, effects);
        continue;
      }

      // Rebuild road path periodically if far from player
      meta.nextRebuild -= dt;
      if (dist > 36 && (meta.nextRebuild <= 0 || meta.path.length === 0)) {
        meta.nextRebuild = 1.4;
        const nFrom = this.layout.nearestNode(cruiser.position.x, cruiser.position.z);
        const nTo = this.layout.nearestNode(playerPos.x, playerPos.z);
        meta.path = this.layout.findPath(nFrom.id, nTo.id);
        if (meta.path.length > 1) meta.path.shift();
      }

      // Choose target point: next road node when navigating, or direct intercept when close
      let tx = playerPos.x, tz = playerPos.z;
      if (dist > 36 && meta.path.length > 0) {
        const node = this.layout.getNode(meta.path[0]);
        tx = node.x; tz = node.z;
        if (Math.hypot(tx - cruiser.position.x, tz - cruiser.position.z) < 11) {
          meta.path.shift();
        }
      }

      const desiredYaw = yawFromDir(tx - cruiser.position.x, tz - cruiser.position.z);
      const angleDiff = wrapAngle(desiredYaw - cruiser.rotationY);
      let steer = clamp(angleDiff * 2.1, -1, 1);
      let throttle = Math.abs(angleDiff) > 1.1 ? 0.45 : 0.95;
      let handbrake = Math.abs(angleDiff) > 1.35 && cruiser.speed > 14;

      // Unstick reversing maneuver if blocked against a wall
      if (Math.abs(cruiser.speed) < 1.2) {
        meta.stuckTimer += dt;
      } else {
        meta.stuckTimer = Math.max(0, meta.stuckTimer - dt * 2);
      }
      if (meta.stuckTimer > 1.1) {
        throttle = -0.85;
        steer = -steer;
        handbrake = false;
        if (meta.stuckTimer > 2.2) meta.stuckTimer = 0;
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
