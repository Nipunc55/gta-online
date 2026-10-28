import * as THREE from 'three';
import { Vehicle } from './Vehicle.js';

export class TrafficSystem {
  constructor(scene, city, audioManager) {
    this.scene = scene;
    this.city = city;
    this.audio = audioManager;
    this.vehicles = [];
    this.maxTraffic = 20;

    this.carColors = [0x00f0ff, 0xffd700, 0xff3366, 0x9933ff, 0xffffff, 0x22cc55, 0xff8800, 0x00ffaa];
    this.initTraffic();
  }

  initTraffic() {
    const roadXPositions = [-340, -260, -180, 40, 110];

    for (let i = 0; i < this.maxTraffic; i++) {
      const roadX = roadXPositions[i % roadXPositions.length];
      const laneOffset = (i % 2 === 0) ? -3.8 : 3.8;
      const x = roadX + laneOffset;
      const z = -250 + (i * 26);

      const car = new Vehicle(this.scene, this.city, null, x, z, false);
      car.chassis.material.color.setHex(this.carColors[i % this.carColors.length]);
      car.isAI = true;
      car.targetSpeed = (i % 2 === 0) ? 14 : -14;
      car.speed = car.targetSpeed;
      car.rotationY = (i % 2 === 0) ? Math.PI : 0;
      car.laneX = x;

      this.vehicles.push(car);
    }
  }

  update(delta, playerPos, playerVehicle) {
    for (let i = 0; i < this.vehicles.length; i++) {
      const car = this.vehicles[i];
      if (car.isOccupied) {
        // Player is driving this vehicle, skip AI logic
        continue;
      }

      // Check distance to player or other cars ahead
      let slowDown = false;
      const forwardDir = car.speed >= 0 ? -1 : 1;

      // Distance to player
      if (playerPos) {
        const dist = car.position.distanceTo(playerPos);
        if (dist < 8.0) {
          slowDown = true;
        }
      }

      // Distance to other cars
      for (let j = 0; j < this.vehicles.length; j++) {
        if (i === j) continue;
        const other = this.vehicles[j];
        if (Math.abs(car.position.x - other.position.x) < 3.0) {
          const zDiff = (other.position.z - car.position.z);
          if (car.speed > 0 && zDiff > 0 && zDiff < 10.0) slowDown = true;
          if (car.speed < 0 && zDiff < 0 && zDiff > -10.0) slowDown = true;
        }
      }

      if (slowDown) {
        car.speed = THREE.MathUtils.lerp(car.speed, 0, delta * 6);
      } else {
        car.speed = THREE.MathUtils.lerp(car.speed, car.targetSpeed, delta * 2);
      }

      // Move car forward in its lane
      car.position.z += car.speed * delta;

      // Wrap around city boundaries
      if (car.position.z > 280) car.position.z = -280;
      if (car.position.z < -280) car.position.z = 280;

      // Vehicle-to-vehicle collision detection
      if (typeof car.resolveVehicleCollisions === 'function') {
        car.resolveVehicleCollisions();
      }

      // Ground elevation
      const groundH = (this.city && typeof this.city.getGroundHeight === 'function')
        ? this.city.getGroundHeight(car.position.x, car.position.z)
        : (car.getGroundHeight ? car.getGroundHeight(car.position.x, car.position.z) : 0);
      car.position.y = groundH + 0.45;

      // Spin wheels
      const wheelRotSpeed = (car.speed / 0.38) * delta;
      car.wheels.forEach(w => {
        w.tire.rotation.x += wheelRotSpeed;
      });

      car.mesh.position.copy(car.position);
      car.mesh.rotation.y = car.rotationY;
    }
  }

  getNearestVehicle(pos, maxDist = 4.0) {
    let nearest = null;
    let minDist = maxDist;

    for (let i = 0; i < this.vehicles.length; i++) {
      const v = this.vehicles[i];
      const d = pos.distanceTo(v.position);
      if (d < minDist) {
        minDist = d;
        nearest = v;
      }
    }
    return nearest;
  }
}
