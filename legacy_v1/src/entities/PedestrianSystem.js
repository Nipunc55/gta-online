import * as THREE from 'three';

export class PedestrianSystem {
  constructor(scene, city, audioManager) {
    this.scene = scene;
    this.city = city;
    this.audio = audioManager;
    this.pedestrians = [];
    this.maxPeds = 36;

    this.initPedestrians();
  }

  initPedestrians() {
    const sidewalkXPositions = [
      -349.5, -330.5, -269.5, -250.5, -189.5, -170.5, // Mainland Downtown
      -54.5, -35.5,                                   // Starfish Island
      30.5, 49.5, 100.5, 119.5                        // Vice Beach & Ocean Drive
    ];
    const shirtColors = [0xff66cc, 0xffaa00, 0x00ccff, 0xff3333, 0x33ff88, 0xffeeaa, 0x9933ff, 0xff7744];

    for (let i = 0; i < this.maxPeds; i++) {
      const swX = sidewalkXPositions[i % sidewalkXPositions.length];
      const z = -260 + (i * 15) + (Math.random() * 6);

      const ped = this.createPedestrianMesh(shirtColors[i % shirtColors.length]);
      ped.position.set(swX, 0, z);
      ped.rotation.y = Math.random() > 0.5 ? 0 : Math.PI;

      this.scene.add(ped);

      this.pedestrians.push({
        mesh: ped,
        position: ped.position,
        velocity: new THREE.Vector3(),
        rotationY: ped.rotation.y,
        speed: 1.8 + Math.random() * 0.8,
        direction: Math.random() > 0.5 ? 1 : -1,
        state: 'WALKING', // 'WALKING' | 'FLEEING' | 'HIT' | 'DOWN'
        fleeTimer: 0,
        health: 40,
        animTime: Math.random() * 10,
        leftLeg: ped.userData.leftLeg,
        rightLeg: ped.userData.rightLeg,
        leftArm: ped.userData.leftArm,
        rightArm: ped.userData.rightArm,
        torso: ped.userData.torso
      });
    }
  }

  createPedestrianMesh(shirtColorHex) {
    const ped = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd29d7d, roughness: 0.7 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColorHex, roughness: 0.6 });
    const shortsMat = new THREE.MeshStandardMaterial({ color: 0x222a35, roughness: 0.8 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.58, 0.28), shirtMat);
    torso.position.y = 1.1;
    torso.castShadow = true;
    ped.add(torso);
    ped.userData.torso = torso;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skinMat);
    head.position.y = 0.45;
    torso.add(head);

    // Arms
    const armGeo = new THREE.BoxGeometry(0.14, 0.5, 0.14);
    const leftArm = new THREE.Mesh(armGeo, skinMat);
    leftArm.position.set(-0.32, -0.22, 0);
    torso.add(leftArm);
    ped.userData.leftArm = leftArm;

    const rightArm = new THREE.Mesh(armGeo, skinMat);
    rightArm.position.set(0.32, -0.22, 0);
    torso.add(rightArm);
    ped.userData.rightArm = rightArm;

    // Legs
    const legGeo = new THREE.BoxGeometry(0.18, 0.65, 0.18);
    const leftLeg = new THREE.Mesh(legGeo, shortsMat);
    leftLeg.position.set(-0.14, 0.38, 0);
    ped.add(leftLeg);
    ped.userData.leftLeg = leftLeg;

    const rightLeg = new THREE.Mesh(legGeo, shortsMat);
    rightLeg.position.set(0.14, 0.38, 0);
    ped.add(rightLeg);
    ped.userData.rightLeg = rightLeg;

    return ped;
  }

  alertNearby(pos, radius = 25.0) {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];
      if (p.state === 'DOWN' || p.state === 'HIT') continue;
      if (p.position.distanceTo(pos) < radius) {
        p.state = 'FLEEING';
        p.fleeTimer = 6.0;
        p.speed = 5.2;
        const angle = Math.atan2(p.position.x - pos.x, p.position.z - pos.z);
        p.rotationY = angle;
      }
    }
  }

  takeDamage(ped, damage, onKilledCallback) {
    if (ped.state === 'DOWN') return;
    ped.health -= damage;
    ped.state = 'FLEEING';
    ped.fleeTimer = 6.0;
    ped.speed = 5.5;

    if (ped.health <= 0) {
      ped.state = 'DOWN';
      ped.mesh.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2);
      ped.mesh.position.y = 0.2;
      if (onKilledCallback) onKilledCallback();

      // Respawn after 12s
      setTimeout(() => {
        ped.health = 40;
        ped.state = 'WALKING';
        ped.speed = 2.0;
        ped.mesh.rotation.set(0, 0, 0);
        ped.mesh.position.y = 0;
      }, 12000);
    }
  }

  update(delta, playerPos, vehicles = [], onVehicleHitPed = null) {
    for (let i = 0; i < this.pedestrians.length; i++) {
      const p = this.pedestrians[i];

      // 1. Handle flying / tumbling ragdoll state when hit by a car
      if (p.state === 'HIT') {
        p.velocity.y -= 26.0 * delta; // Gravity
        p.position.x += p.velocity.x * delta;
        p.position.y += p.velocity.y * delta;
        p.position.z += p.velocity.z * delta;

        // Tumbling mid-air rotations
        p.mesh.rotation.x += delta * 9.0;
        p.mesh.rotation.z += delta * 7.0;

        // Ground contact
        if (p.position.y <= 0.2) {
          p.position.y = 0.2;
          p.velocity.set(0, 0, 0);
          p.state = 'DOWN';
          p.mesh.rotation.set(Math.PI / 2, 0, Math.random() * Math.PI * 2);

          if (p.health <= 0) {
            // Eliminated - respawn after delay
            setTimeout(() => {
              p.health = 40;
              p.state = 'WALKING';
              p.speed = 2.0;
              p.mesh.rotation.set(0, 0, 0);
              p.mesh.position.y = 0;
            }, 12000);
          } else {
            // Recover and flee after 4 seconds
            setTimeout(() => {
              if (p.state === 'DOWN') {
                p.state = 'FLEEING';
                p.fleeTimer = 6.0;
                p.speed = 4.2;
                p.mesh.rotation.set(0, p.rotationY, 0);
                p.mesh.position.y = 0;
              }
            }, 4000);
          }
        }

        p.mesh.position.copy(p.position);
        continue;
      }

      if (p.state === 'DOWN') continue;

      // 2. Check collisions with vehicles
      if (vehicles && vehicles.length > 0) {
        let wasHit = false;
        for (let v = 0; v < vehicles.length; v++) {
          const car = vehicles[v];
          if (!car) continue;

          const dx = p.position.x - car.position.x;
          const dz = p.position.z - car.position.z;

          // Quick distance check
          if (dx * dx + dz * dz > 25) continue;

          const carSpeed = Math.abs(car.speed);

          // Panic and flee if car approaches at speed
          if (p.state === 'WALKING' && carSpeed > 3.0) {
            p.state = 'FLEEING';
            p.fleeTimer = 6.0;
            p.speed = 5.2;
            p.rotationY = Math.atan2(dx, dz);
          }

          // Transform to car's local coordinates
          const cos = Math.cos(-car.rotationY);
          const sin = Math.sin(-car.rotationY);
          const localX = dx * cos - dz * sin;
          const localZ = dx * sin + dz * cos;

          // OBB check against car boundaries (width ~2.2, length ~4.6)
          if (Math.abs(localX) < 1.35 && Math.abs(localZ) < 2.45) {
            if (carSpeed > 1.2) {
              // High-speed impact: fling pedestrian!
              const dirSign = Math.sign(car.speed) || 1;
              const fwdX = -Math.sin(car.rotationY) * dirSign;
              const fwdZ = -Math.cos(car.rotationY) * dirSign;
              const sideX = Math.cos(car.rotationY);
              const sideZ = -Math.sin(car.rotationY);

              const flingPower = carSpeed * 0.85 + 4.0;
              const sidePower = (localX >= 0 ? 1 : -1) * (carSpeed * 0.3 + 2.5);
              const liftPower = Math.min(carSpeed * 0.35 + 3.0, 9.5);

              p.velocity.set(
                fwdX * flingPower + sideX * sidePower,
                liftPower,
                fwdZ * flingPower + sideZ * sidePower
              );

              p.state = 'HIT';
              const damage = Math.max(35, carSpeed * 5.5);
              p.health -= damage;

              if (this.audio) this.audio.playPunch();

              if (onVehicleHitPed) {
                onVehicleHitPed(p, car, damage);
              }

              car.speed *= 0.82; // vehicle impact resistance
              wasHit = true;
              break;
            } else {
              // Low-speed nudge: push pedestrian outside car footprint
              const pushX = (localX >= 0 ? 1 : -1) * (1.4 - Math.abs(localX));
              p.position.x += pushX * cos;
              p.position.z -= pushX * sin;
              p.state = 'FLEEING';
              p.fleeTimer = 6.0;
              p.speed = 4.5;
            }
          }
        }
        if (wasHit) {
          p.mesh.position.copy(p.position);
          continue;
        }
      }

      // 3. Move pedestrian
      if (p.state === 'WALKING') {
        p.position.z += p.direction * p.speed * delta;
        if (p.position.z > 220) { p.direction = -1; p.rotationY = Math.PI; }
        if (p.position.z < -220) { p.direction = 1; p.rotationY = 0; }
      } else if (p.state === 'FLEEING') {
        // Flee timeout: calm down and return to WALKING state after 6 seconds
        if (typeof p.fleeTimer !== 'number') p.fleeTimer = 6.0;
        p.fleeTimer -= delta;

        if (p.fleeTimer <= 0) {
          p.state = 'WALKING';
          p.fleeTimer = 0;
          p.speed = 1.8 + Math.random() * 0.8;
          p.direction = Math.random() > 0.5 ? 1 : -1;
          p.rotationY = p.direction === 1 ? 0 : Math.PI;
        } else {
          // Check collision against city obstacles so they don't run through buildings
          const moveX = Math.sin(p.rotationY) * p.speed * delta;
          const moveZ = Math.cos(p.rotationY) * p.speed * delta;
          const nextX = p.position.x + moveX;
          const nextZ = p.position.z + moveZ;

          const coll = this.city.checkCollision(new THREE.Vector3(nextX, 0.8, nextZ), 0.45);
          if (!coll.collided) {
            p.position.x = nextX;
            p.position.z = nextZ;
          } else {
            // Deflect / slide along unblocked axes
            const collX = this.city.checkCollision(new THREE.Vector3(nextX, 0.8, p.position.z), 0.45);
            const collZ = this.city.checkCollision(new THREE.Vector3(p.position.x, 0.8, nextZ), 0.45);

            if (!collX.collided) {
              p.position.x = nextX;
            } else if (!collZ.collided) {
              p.position.z = nextZ;
            } else {
              // Obstacle in front: turn away
              p.rotationY += (Math.random() > 0.5 ? 1 : -1) * (Math.PI * 0.5 + Math.random() * 0.4);
            }
          }

          // Boundary checks: prevent fleeing across the ocean forever
          if (p.position.x > 260) {
            p.position.x = 260;
            p.rotationY = Math.PI * 1.5;
          } else if (p.position.x < -360) {
            p.position.x = -360;
            p.rotationY = Math.PI * 0.5;
          }
          if (p.position.z > 290) {
            p.position.z = 290;
            p.rotationY = Math.PI;
          } else if (p.position.z < -290) {
            p.position.z = -290;
            p.rotationY = 0;
          }
        }
      }

      // Ground elevation
      if (p.state !== 'HIT' && p.state !== 'DOWN') {
        const pedGroundY = (this.city && typeof this.city.getGroundHeight === 'function')
          ? this.city.getGroundHeight(p.position.x, p.position.z)
          : 0;
        p.position.y = pedGroundY;
      }

      p.mesh.position.copy(p.position);
      p.mesh.rotation.y = p.rotationY;

      // Walk / Run leg & arm swing animation
      p.animTime += delta * (p.state === 'FLEEING' ? 14 : 7);
      const swing = Math.sin(p.animTime) * 0.6;
      p.leftLeg.rotation.x = swing;
      p.rightLeg.rotation.x = -swing;
      p.leftArm.rotation.x = -swing * 0.7;
      p.rightArm.rotation.x = swing * 0.7;
    }
  }
}
