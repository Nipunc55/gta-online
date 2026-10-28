import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';

export class PoliceSystem {
  constructor(scene, city, audioManager) {
    this.scene = scene;
    this.city = city;
    this.audio = audioManager;

    this.wantedLevel = 0; // 0 to 5
    this.policeCars = [];
    this.maxPoliceCars = 4;
    this.evasionTimer = 0;
    this.isEvading = false;

    // Siren sound loop manager
    this.sirenActive = false;
  }

  addCrime(severity = 1) {
    const oldLevel = this.wantedLevel;
    this.wantedLevel = Math.min(5, this.wantedLevel + severity);
    this.evasionTimer = 0;
    this.isEvading = false;

    if (this.wantedLevel > 0 && oldLevel === 0) {
      this.spawnCruisers();
      if (this.audio) this.audio.setSiren(true);
      this.sirenActive = true;
    }
  }

  spawnCruisers() {
    // Clear dead / old cruisers
    this.policeCars.forEach(c => {
      if (typeof c.destroy === 'function') c.destroy();
      else this.scene.remove(c.mesh);
    });
    this.policeCars = [];

    const numToSpawn = Math.min(this.wantedLevel, this.maxPoliceCars);
    for (let i = 0; i < numToSpawn; i++) {
      const spawnX = (i % 2 === 0) ? -30 : 40;
      const spawnZ = (i < 2) ? -120 : 120;

      const cruiser = new Vehicle(this.scene, this.city, this.audio, spawnX, spawnZ, true);
      cruiser.sirenOn = true;
      cruiser.speed = 18;
      this.policeCars.push(cruiser);
    }
  }

  update(delta, playerPos, playerInCar) {
    if (this.wantedLevel === 0) {
      if (this.sirenActive) {
        if (this.audio) this.audio.setSiren(false);
        this.sirenActive = false;
      }
      return;
    }

    let nearestDist = Infinity;

    for (let i = 0; i < this.policeCars.length; i++) {
      const cruiser = this.policeCars[i];
      const dist = cruiser.position.distanceTo(playerPos);
      if (dist < nearestDist) nearestDist = dist;

      // Pursuit steering towards player
      const angleToPlayer = Math.atan2(
        -(playerPos.x - cruiser.position.x),
        -(playerPos.z - cruiser.position.z)
      );

      let angleDiff = angleToPlayer - cruiser.rotationY;
      while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
      while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;

      cruiser.rotationY += THREE.MathUtils.clamp(angleDiff, -0.6, 0.6) * delta * 2.8;

      // Speed control
      const targetSpeed = (dist > 15) ? 32 : (dist > 5 ? 22 : 12);
      cruiser.speed = THREE.MathUtils.lerp(cruiser.speed, targetSpeed, delta * 3.0);

      // Move cruiser with obstacle detection and deflection
      const forwardX = -Math.sin(cruiser.rotationY);
      const forwardZ = -Math.cos(cruiser.rotationY);
      const nextX = cruiser.position.x + forwardX * cruiser.speed * delta;
      const nextZ = cruiser.position.z + forwardZ * cruiser.speed * delta;

      // Check collision against city obstacles
      const coll = this.city.checkCollision(new THREE.Vector3(nextX, 0.8, nextZ), 1.6);
      if (!coll.collided) {
        cruiser.position.x = nextX;
        cruiser.position.z = nextZ;
      } else {
        // Building collision! Deflect / steer around obstruction rather than phasing through
        const collX = this.city.checkCollision(new THREE.Vector3(nextX, 0.8, cruiser.position.z), 1.6);
        const collZ = this.city.checkCollision(new THREE.Vector3(cruiser.position.x, 0.8, nextZ), 1.6);

        if (!collX.collided) {
          cruiser.position.x = nextX;
        } else if (!collZ.collided) {
          cruiser.position.z = nextZ;
        }

        // Steer away from obstacle: probe left vs right
        const probeDist = 4.0;
        const leftProbe = new THREE.Vector3(
          cruiser.position.x - Math.sin(cruiser.rotationY - 0.7) * probeDist,
          0.8,
          cruiser.position.z - Math.cos(cruiser.rotationY - 0.7) * probeDist
        );
        const rightProbe = new THREE.Vector3(
          cruiser.position.x - Math.sin(cruiser.rotationY + 0.7) * probeDist,
          0.8,
          cruiser.position.z - Math.cos(cruiser.rotationY + 0.7) * probeDist
        );

        const leftOpen = !this.city.checkCollision(leftProbe, 1.2).collided;
        const rightOpen = !this.city.checkCollision(rightProbe, 1.2).collided;

        if (leftOpen && !rightOpen) {
          cruiser.rotationY -= 2.4 * delta;
        } else if (rightOpen && !leftOpen) {
          cruiser.rotationY += 2.4 * delta;
        } else if (coll.box) {
          const center = new THREE.Vector3();
          coll.box.getCenter(center);
          const toCruiserX = cruiser.position.x - center.x;
          const toCruiserZ = cruiser.position.z - center.z;
          const cross = forwardX * toCruiserZ - forwardZ * toCruiserX;
          cruiser.rotationY += (cross >= 0 ? 1 : -1) * 2.5 * delta;
        } else {
          cruiser.rotationY += (Math.random() > 0.5 ? 1 : -1) * 2.0 * delta;
        }

        cruiser.speed = Math.max(cruiser.speed * 0.6, 6.0);
      }

      // Check vehicle-to-vehicle collision detection
      if (typeof cruiser.resolveVehicleCollisions === 'function') {
        cruiser.resolveVehicleCollisions();
      }

      // Query ground elevation
      const gHeight = (this.city && typeof this.city.getGroundHeight === 'function')
        ? this.city.getGroundHeight(cruiser.position.x, cruiser.position.z)
        : (cruiser.getGroundHeight ? cruiser.getGroundHeight(cruiser.position.x, cruiser.position.z) : 0);
      cruiser.position.y = 0.45 + (gHeight || 0);

      // Spin wheels
      const wheelRot = (cruiser.speed / 0.38) * delta;
      cruiser.wheels.forEach(w => w.tire.rotation.x += wheelRot);

      cruiser.mesh.position.copy(cruiser.position);
      cruiser.mesh.rotation.y = cruiser.rotationY;

      // Flashing lightbar
      if (cruiser.isPolice) {
        const flash = (Math.floor(performance.now() * 0.01) % 2 === 0);
        cruiser.policeRed.material.color.setHex(flash ? 0xff0022 : 0x220000);
        cruiser.policeBlue.material.color.setHex(flash ? 0x001133 : 0x0088ff);
      }
    }

    // Evasion logic
    if (nearestDist > 45) {
      this.isEvading = true;
      this.evasionTimer += delta;
      if (this.evasionTimer > 10.0) {
        // Cooldown star
        this.wantedLevel = Math.max(0, this.wantedLevel - 1);
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

  clearPolice() {
    this.policeCars.forEach(c => {
      if (typeof c.destroy === 'function') c.destroy();
      else this.scene.remove(c.mesh);
    });
    this.policeCars = [];
    if (this.audio) this.audio.setSiren(false);
    this.sirenActive = false;
  }
}
