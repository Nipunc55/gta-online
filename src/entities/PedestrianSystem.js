import * as THREE from 'three';
import { createHumanoid, animateHumanoid } from './HumanoidModel.js';
import { clamp, lerpAngle, damp, yawFromDir } from '../core/MathUtils.js';
import { WORLD_LIMIT } from '../world/CityLayout.js';

// Living city NPC system:
// - Roles: 'civilian' (~80%), 'gang' (~20%, armed with pistol, fights back when provoked)
// - Police System can also spawn 'police' foot officers via spawnOfficer()
// - Sidewalk graph navigation with traffic-light-aware crosswalks
// - States: WALK, WAIT_CROSS, FLEE, COMBAT, RAGDOLL, DEAD
// - Drops cash pickups when eliminated

export class PedestrianSystem {
  constructor(scene, layout, colliders, audio, events) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.audio = audio;
    this.events = events;

    this.pedestrians = [];
    this.pickups = []; // floating cash bundles { mesh, position, amount, ttl }
    this.spawnInitial(44);
  }

  spawnInitial(count) {
    const n = this.layout.walkCoords.length;
    for (let i = 0; i < count; i++) {
      const ix = Math.floor(Math.random() * n);
      const iz = Math.floor(Math.random() * n);
      const role = i % 5 === 0 ? 'gang' : 'civilian';
      this.createNPC(ix, iz, role);
    }
  }

  createNPC(ix, iz, role = 'civilian', explicitPos = null) {
    const rig = createHumanoid({ role });
    const pt = explicitPos || this.layout.walkPoint(ix, iz);
    const y = this.layout.getGroundHeight(pt.x, pt.z);
    const pos = new THREE.Vector3(pt.x, y, pt.z);

    // Attach small low-poly pistol to armed NPCs (gang / police)
    if (role === 'gang' || role === 'police') {
      const gun = new THREE.Mesh(
        new THREE.BoxGeometry(0.06, 0.11, 0.24),
        new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8, roughness: 0.3 })
      );
      gun.position.set(0, -0.02, -0.10);
      rig.weaponSocket.add(gun);
    }

    rig.root.position.copy(pos);
    this.scene.add(rig.root);

    const nbs = this.layout.walkNeighbors(ix, iz);
    const next = nbs[Math.floor(Math.random() * nbs.length)] || [ix, iz];

    const npc = {
      rig,
      mesh: rig.root,
      role,
      position: pos,
      velocity: new THREE.Vector3(),
      rotationY: Math.random() * Math.PI * 2,
      health: role === 'police' ? 120 : (role === 'gang' ? 100 : 75),
      maxHealth: role === 'police' ? 120 : 100,
      state: role === 'police' ? 'COMBAT' : 'WALK',
      ix,
      iz,
      targetIx: next[0],
      targetIz: next[1],
      walkSpeed: 1.7 + Math.random() * 0.7,
      runSpeed: role === 'police' ? 5.8 : 5.2,
      stateTimer: 0,
      shootCooldown: 0.6 + Math.random() * 0.6,
      punchCooldown: 0
    };
    this.pedestrians.push(npc);
    return npc;
  }

  spawnOfficer(x, z) {
    const ix = this.layout.nearestWalkIndex(x);
    const iz = this.layout.nearestWalkIndex(z);
    return this.createNPC(ix, iz, 'police', { x, z });
  }

  /**
   * Spawn a stationary armed syndicate guard for story missions.
   * Holds position until player approaches or attacks, and carries an overhead 3D target marker.
   */
  spawnMissionGuard(x, z, rotationY = 0) {
    const ix = this.layout.nearestWalkIndex(x);
    const iz = this.layout.nearestWalkIndex(z);
    const npc = this.createNPC(ix, iz, 'gang', { x, z });
    npc.rotationY = rotationY;
    npc.mesh.rotation.y = rotationY;
    npc.state = 'GUARD';
    npc.health = 110;
    npc.maxHealth = 110;
    npc.isMissionActor = true;
    npc.isMissionTarget = true;
    npc.guardOrigin = new THREE.Vector3(x, npc.position.y, z);

    // Overhead crimson diamond indicator so player can track syndicate guards
    const markerGeo = new THREE.OctahedronGeometry(0.22, 0);
    const markerMat = new THREE.MeshBasicMaterial({ color: 0xff1744 });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(0, 2.25, 0);
    npc.mesh.add(marker);
    npc.targetMarker = marker;
    return npc;
  }

  clearMissionActors() {
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const p = this.pedestrians[i];
      if (p.isMissionActor) {
        this.scene.remove(p.mesh);
        this.pedestrians.splice(i, 1);
      }
    }
  }

  /** Alert nearby NPCs when a gunshot or explosion happens. */
  alertGunshot(origin, radius = 38) {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (p.state === 'DEAD' || p.state === 'RAGDOLL') continue;
      const d = p.position.distanceTo(origin);
      if (d > radius) continue;
      if (p.role === 'gang' || p.role === 'police') {
        p.state = 'COMBAT';
        p.stateTimer = 14;
      } else {
        p.state = 'FLEE';
        p.stateTimer = 9 + Math.random() * 4;
        const dx = p.position.x - origin.x, dz = p.position.z - origin.z;
        p.rotationY = yawFromDir(dx, dz);
      }
    }
  }

  damagePedestrian(ped, amount, knockDir = null, effects = null) {
    if (ped.state === 'DEAD') return false;
    ped.health -= amount;
    if (effects) {
      effects.createBloodSplatter(new THREE.Vector3(ped.position.x, ped.position.y + 1.1, ped.position.z));
    }

    if (ped.health <= 0) {
      this.killPedestrian(ped, knockDir);
      return true;
    }

    // Surviving NPC reacts
    if (ped.role === 'gang' || ped.role === 'police') {
      ped.state = 'COMBAT';
      ped.stateTimer = 16;
    } else {
      ped.state = 'FLEE';
      ped.stateTimer = 10;
      if (knockDir) ped.rotationY = yawFromDir(knockDir.x, knockDir.z);
    }
    return false;
  }

  killPedestrian(ped, knockDir = null) {
    if (ped.state === 'DEAD') return;
    ped.state = 'DEAD';
    ped.stateTimer = 8.0;
    ped.mesh.rotation.x = -Math.PI / 2;
    ped.mesh.position.y = ped.position.y + 0.15;
    if (ped.targetMarker) ped.targetMarker.visible = false;

    // Spawn floating cash pickup
    this.spawnCashPickup(ped.position.x, ped.position.z, ped.role === 'gang' ? 120 : 45);
    if (this.events) this.events.emit('npc:killed', { npc: ped });
  }

  spawnCashPickup(x, z, amount = 50) {
    const y = this.layout.getGroundHeight(x, z) + 0.35;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.18, 0.26),
      new THREE.MeshStandardMaterial({ color: 0x2ecc71, emissive: 0x145a32, roughness: 0.4 })
    );
    mesh.position.set(x + (Math.random() - 0.5) * 0.5, y, z + (Math.random() - 0.5) * 0.5);
    this.scene.add(mesh);
    this.pickups.push({ mesh, position: mesh.position, amount, ttl: 25 });
  }

  update(dt, player, allCars, effects, onVehicleHitPed) {
    const playerPos = player.position;

    // 1. Cash pickup collection & animation
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pk = this.pickups[i];
      pk.ttl -= dt;
      pk.mesh.rotation.y += dt * 2.5;
      if (pk.position.distanceTo(playerPos) < 2.0 && !player.inVehicle) {
        player.addCash(pk.amount);
        if (this.audio) this.audio.play('pickup', 0.9);
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      } else if (pk.ttl <= 0) {
        this.scene.remove(pk.mesh);
        this.pickups.splice(i, 1);
      }
    }

    // 2. Update every pedestrian
    for (let i = this.pedestrians.length - 1; i >= 0; i--) {
      const p = this.pedestrians[i];

      // Check vehicle-vs-pedestrian impacts first
      if (p.state !== 'DEAD' && p.state !== 'RAGDOLL' && allCars) {
        for (let c = 0; c < allCars.length; c++) {
          const car = allCars[c];
          const carSpeed = Math.abs(car.speed);
          if (carSpeed < 4.5) continue;
          const dx = p.position.x - car.position.x;
          const dz = p.position.z - car.position.z;
          if (dx * dx + dz * dz < (car.halfW + 0.55) ** 2) {
            // Friendly police cars nudge foot officers out of the way instead of running them over
            if (p.role === 'police' && car.driver === 'police') {
              const d = Math.hypot(dx, dz) || 1;
              p.position.x += (dx / d) * 1.4;
              p.position.z += (dz / d) * 1.4;
              continue;
            }
            // Launch ragdoll!
            p.state = 'RAGDOLL';
            p.stateTimer = 2.2;
            const d = Math.hypot(dx, dz) || 1;
            const launch = Math.min(carSpeed * 0.85, 22);
            p.velocity.set((dx / d) * launch, 5.5 + Math.min(carSpeed * 0.25, 6), (dz / d) * launch);
            p.health -= carSpeed * 4.5;
            if (onVehicleHitPed) onVehicleHitPed(p, car);
            break;
          }
        }
      }

      if (p.state === 'DEAD') {
        p.stateTimer -= dt;
        if (p.stateTimer <= 0) {
          if (p.isMissionActor) {
            this.scene.remove(p.mesh);
            this.pedestrians.splice(i, 1);
          } else {
            this.recyclePedestrian(p, playerPos);
          }
        }
        continue;
      }

      if (p.state === 'RAGDOLL') {
        p.velocity.y -= 20 * dt;
        p.position.addScaledVector(p.velocity, dt);
        if (this.colliders) this.colliders.resolveCircle(p.position, 0.38, 1.6);
        p.mesh.rotation.x += 7 * dt;
        p.mesh.rotation.z += 5 * dt;
        const gy = this.layout.getGroundHeight(p.position.x, p.position.z);
        if (p.position.y <= gy) {
          p.position.y = gy;
          p.velocity.x *= 0.6;
          p.velocity.z *= 0.6;
          p.velocity.y = 0;
        }
        p.mesh.position.copy(p.position);
        p.stateTimer -= dt;
        if (p.stateTimer <= 0) {
          p.mesh.rotation.set(0, p.rotationY, 0);
          if (p.health <= 0) {
            this.killPedestrian(p);
          } else if (p.isMissionActor) {
            p.state = 'COMBAT';
            p.stateTimer = 60;
          } else {
            p.state = 'FLEE';
            p.stateTimer = 8;
          }
        }
        continue;
      }

      // Recycle far-away ambient NPCs closer to player (never recycle mission actors)
      const distToPlayer = Math.hypot(p.position.x - playerPos.x, p.position.z - playerPos.z);
      if (distToPlayer > 190 && p.role !== 'police' && !p.isMissionActor) {
        this.recyclePedestrian(p, playerPos);
        continue;
      }

      if (p.targetMarker && p.targetMarker.visible) {
        p.targetMarker.rotation.y += dt * 3.2;
        p.targetMarker.position.y = 2.22 + Math.sin(performance.now() * 0.006) * 0.12;
      }

      let moving = false;
      let sprinting = false;
      let aiming = false;

      if (p.state === 'GUARD') {
        // Hold post until player enters detection radius
        if (distToPlayer < 35 && player.isAlive) {
          p.state = 'COMBAT';
          p.stateTimer = 120;
        }
      } else if (p.state === 'COMBAT') {
        p.stateTimer -= dt;
        const dx = playerPos.x - p.position.x;
        const dz = playerPos.z - p.position.z;
        const dist = Math.hypot(dx, dz);
        p.rotationY = lerpAngle(p.rotationY, yawFromDir(dx, dz), damp(10, dt));

        const fx = -Math.sin(p.rotationY), fz = -Math.cos(p.rotationY);
        const rx = Math.cos(p.rotationY), rz = -Math.sin(p.rotationY);

        // Tactical spacing between fellow officers/combatants + dodging oncoming vehicles
        let sepX = 0, sepZ = 0;
        if (p.role === 'police') {
          for (let j = 0; j < this.pedestrians.length; j++) {
            const other = this.pedestrians[j];
            if (other === p || other.state === 'DEAD') continue;
            const odx = p.position.x - other.position.x;
            const odz = p.position.z - other.position.z;
            const od2 = odx * odx + odz * odz;
            if (od2 > 0.01 && od2 < 14.0) {
              const od = Math.sqrt(od2);
              const push = (3.75 - od) / 3.75;
              sepX += (odx / od) * push * 2.4;
              sepZ += (odz / od) * push * 2.4;
            }
          }
          if (allCars) {
            for (let c = 0; c < allCars.length; c++) {
              const car = allCars[c];
              if (Math.abs(car.speed) < 3.0) continue;
              const cdx = p.position.x - car.position.x;
              const cdz = p.position.z - car.position.z;
              const cd = Math.hypot(cdx, cdz);
              if (cd < 9.5) {
                const cFwdX = -Math.sin(car.rotationY) * Math.sign(car.speed);
                const cFwdZ = -Math.cos(car.rotationY) * Math.sign(car.speed);
                const ahead = cdx * cFwdX + cdz * cFwdZ;
                if (ahead > 0) {
                  // Sidestep perpendicular to oncoming vehicle
                  const cRightX = -cFwdZ, cRightZ = cFwdX;
                  const side = (cdx * cRightX + cdz * cRightZ) >= 0 ? 1 : -1;
                  sepX += cRightX * side * 4.8;
                  sepZ += cRightZ * side * 4.8;
                  moving = true;
                }
              }
            }
          }
        }

        if (!player.isAlive || (p.role !== 'police' && !p.isMissionActor && p.stateTimer <= 0)) {
          p.state = p.isMissionActor ? 'GUARD' : 'WALK';
        } else if (dist > 22) {
          // Sprint toward player while maintaining squad spread
          moving = true;
          sprinting = true;
          p.position.x += (fx * p.runSpeed + sepX) * dt;
          p.position.z += (fz * p.runSpeed + sepZ) * dt;
        } else {
          // Aim and fire at player with smart standoff range & tactical strafing
          aiming = true;
          if (dist > 13.5) {
            moving = true;
            p.position.x += (fx * (p.walkSpeed * 1.15) + sepX) * dt;
            p.position.z += (fz * (p.walkSpeed * 1.15) + sepZ) * dt;
          } else if (p.role === 'police' && dist < 7.5) {
            // Backpedal if suspect or vehicle gets dangerously close
            moving = true;
            p.position.x += (-fx * p.walkSpeed + sepX) * dt;
            p.position.z += (-fz * p.walkSpeed + sepZ) * dt;
          } else if (Math.abs(sepX) + Math.abs(sepZ) > 0.25) {
            moving = true;
            p.position.x += sepX * dt;
            p.position.z += sepZ * dt;
          } else if (p.role === 'police') {
            // Subtle lateral tactical strafe while holding firing line
            const strafeDir = Math.sin(performance.now() * 0.0018 + i * 1.7);
            if (Math.abs(strafeDir) > 0.55) {
              moving = true;
              p.position.x += rx * Math.sign(strafeDir) * (p.walkSpeed * 0.65) * dt;
              p.position.z += rz * Math.sign(strafeDir) * (p.walkSpeed * 0.65) * dt;
            }
          }
          p.shootCooldown -= dt;
          if (p.shootCooldown <= 0 && dist < 34) {
            p.shootCooldown = (p.role === 'police' ? 0.85 : 1.1) + Math.random() * 0.5;
            const hasLOS = !this.colliders || this.colliders.hasLineOfSight(
              p.position.x, p.position.y + 1.35, p.position.z,
              playerPos.x, playerPos.y + 1.2, playerPos.z
            );
            if (hasLOS) {
              const vol = clamp(1 - dist / 45, 0.15, 0.85);
              if (this.audio) this.audio.play('gunshot', vol, false);
              if (effects) {
                const muzzle = new THREE.Vector3(p.position.x + fx * 0.6, p.position.y + 1.35, p.position.z + fz * 0.6);
                effects.spawnTracer(muzzle, new THREE.Vector3(
                  playerPos.x + (Math.random() - 0.5) * 1.1,
                  playerPos.y + 1.1 + (Math.random() - 0.5) * 0.6,
                  playerPos.z + (Math.random() - 0.5) * 1.1
                ));
              }
              // Hit probability decreases with distance and speed
              const hitChance = clamp(0.62 - dist * 0.012, 0.18, 0.58);
              if (Math.random() < hitChance) {
                if (player.inVehicle && player.currentVehicle) {
                  player.currentVehicle.takeDamage(8, effects);
                } else {
                  player.takeDamage(p.role === 'police' ? 7 : 6, p.role);
                }
              }
            }
          }
        }
      } else if (p.state === 'FLEE') {
        p.stateTimer -= dt;
        moving = true;
        sprinting = true;
        const dx = p.position.x - playerPos.x;
        const dz = p.position.z - playerPos.z;
        const desiredYaw = yawFromDir(dx, dz);
        p.rotationY = lerpAngle(p.rotationY, desiredYaw, damp(6, dt));
        const fx = -Math.sin(p.rotationY), fz = -Math.cos(p.rotationY);
        p.position.x = clamp(p.position.x + fx * p.runSpeed * dt, -WORLD_LIMIT, WORLD_LIMIT);
        p.position.z = clamp(p.position.z + fz * p.runSpeed * dt, -WORLD_LIMIT, WORLD_LIMIT);
        if (p.stateTimer <= 0) {
          p.ix = this.layout.nearestWalkIndex(p.position.x);
          p.iz = this.layout.nearestWalkIndex(p.position.z);
          const nbs = this.layout.walkNeighbors(p.ix, p.iz);
          const next = nbs[Math.floor(Math.random() * nbs.length)] || [p.ix, p.iz];
          p.targetIx = next[0];
          p.targetIz = next[1];
          p.state = 'WALK';
        }
      } else {
        // WALK / WAIT_CROSS along sidewalk graph
        const target = this.layout.walkPoint(p.targetIx, p.targetIz);
        const dx = target.x - p.position.x;
        const dz = target.z - p.position.z;
        const dist = Math.hypot(dx, dz);

        // If about to step onto a crosswalk, check pedestrian signal
        const crossing = this.layout.isCrossing(p.ix, p.iz, p.targetIx, p.targetIz);
        let waitAtCurb = false;
        if (crossing && dist > 14) {
          const crossAxis = Math.abs(dx) > Math.abs(dz) ? 'x' : 'z';
          // Pedestrians cross when perpendicular traffic is stopped (i.e. crossAxis light is green)
          if (this.layout.getLightState(crossAxis) === 'red') {
            waitAtCurb = true;
          }
        }

        if (!waitAtCurb) {
          moving = true;
          p.rotationY = lerpAngle(p.rotationY, yawFromDir(dx, dz), damp(8, dt));
          const fx = -Math.sin(p.rotationY), fz = -Math.cos(p.rotationY);
          p.position.x += fx * p.walkSpeed * dt;
          p.position.z += fz * p.walkSpeed * dt;

          if (dist < 1.2) {
            const prevIx = p.ix, prevIz = p.iz;
            p.ix = p.targetIx;
            p.iz = p.targetIz;
            const nbs = this.layout.walkNeighbors(p.ix, p.iz).filter(
              ([nx, nz]) => !(nx === prevIx && nz === prevIz)
            );
            const pick = nbs.length
              ? nbs[Math.floor(Math.random() * nbs.length)]
              : [prevIx, prevIz];
            p.targetIx = pick[0];
            p.targetIz = pick[1];
          }
        }
      }

      if (this.colliders) {
        const hit = this.colliders.resolveCircle(p.position, 0.36, 1.7);
        if (hit.hit && p.state === 'FLEE') {
          p.rotationY += 1.2;
        }
      }

      p.position.y = this.layout.getGroundHeight(p.position.x, p.position.z);
      p.mesh.position.copy(p.position);
      p.mesh.rotation.set(0, p.rotationY, 0);

      animateHumanoid(p.rig, dt, { moving, sprinting, aiming });
    }
  }

  recyclePedestrian(p, playerPos) {
    if (p.role === 'police') {
      this.scene.remove(p.mesh);
      const idx = this.pedestrians.indexOf(p);
      if (idx !== -1) this.pedestrians.splice(idx, 1);
      return;
    }
    const coords = this.layout.walkCoords;
    for (let attempt = 0; attempt < 12; attempt++) {
      const ix = Math.floor(Math.random() * coords.length);
      const iz = Math.floor(Math.random() * coords.length);
      const x = coords[ix], z = coords[iz];
      const d = Math.hypot(x - playerPos.x, z - playerPos.z);
      if (d < 55 || d > 155) continue;
      p.ix = ix; p.iz = iz;
      const nbs = this.layout.walkNeighbors(ix, iz);
      const next = nbs[Math.floor(Math.random() * nbs.length)] || [ix, iz];
      p.targetIx = next[0]; p.targetIz = next[1];
      p.position.set(x, this.layout.getGroundHeight(x, z), z);
      p.health = p.maxHealth;
      p.state = 'WALK';
      p.mesh.rotation.set(0, p.rotationY, 0);
      p.mesh.position.copy(p.position);
      return;
    }
  }
}
