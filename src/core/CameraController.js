import * as THREE from 'three';
import { clamp, lerp, lerpAngle, damp } from './MathUtils.js';

// GTA-style third-person camera:
// - FOOT: orbits player with mouse; right-shoulder zoom when aiming.
// - VEHICLE: trails behind the car with velocity lag; mouse orbit with auto-recenter after 1.5s.
// - Wall-clip prevention via StaticColliders.raycast().
// - Recoil kick + impact trauma shake.

export class CameraController {
  constructor(camera, colliders = null) {
    this.camera = camera;
    this.colliders = colliders;

    this.mode = 'FOOT'; // 'FOOT' | 'VEHICLE' | 'HOOD'
    this.yaw = 0;       // world yaw of camera orbit (0 = looking towards -Z)
    this.pitch = 0.22;  // radians above horizontal
    this.minPitch = -0.35;
    this.maxPitch = 1.05;
    this.sensitivity = 0.0022;

    this.isAiming = false;
    this.currentDist = 4.2;
    this.currentSide = 0.35;
    this.currentHeight = 1.55;
    this.pivot = new THREE.Vector3();

    // Vehicle orbit offset relative to car heading
    this.orbitOffsetYaw = 0;
    this.mouseIdleTimer = 10;

    // Recoil & shake
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.shake = 0;
  }

  setMode(mode, snapYaw = null) {
    this.mode = mode;
    if (snapYaw !== null) this.yaw = snapYaw;
    this.orbitOffsetYaw = 0;
  }

  setAiming(aim) {
    this.isAiming = aim;
  }

  addShake(amount) {
    this.shake = Math.min(1.2, this.shake + amount);
  }

  addRecoil(pitchKick, yawKick = 0) {
    this.recoilPitch += pitchKick;
    this.recoilYaw += yawKick;
    this.pitch = clamp(this.pitch + pitchKick, this.minPitch, this.maxPitch);
    this.yaw += yawKick;
  }

  handleMouseDelta(dx, dy) {
    if (dx === 0 && dy === 0) return;
    this.mouseIdleTimer = 0;
    if (this.mode === 'FOOT') {
      this.yaw -= dx * this.sensitivity;
    } else {
      this.orbitOffsetYaw -= dx * this.sensitivity;
    }
    this.pitch = clamp(this.pitch + dy * this.sensitivity, this.minPitch, this.maxPitch);
  }

  update(dt, targetPos, targetHeading = 0, speed = 0) {
    this.mouseIdleTimer += dt;
    this.shake = Math.max(0, this.shake - dt * 2.8);

    // Recover recoil gently
    const rec = damp(10, dt);
    this.recoilPitch *= (1 - rec);
    this.recoilYaw *= (1 - rec);

    const shakeVec = new THREE.Vector3(
      (Math.random() - 0.5) * 0.22 * this.shake,
      (Math.random() - 0.5) * 0.22 * this.shake,
      (Math.random() - 0.5) * 0.22 * this.shake
    );

    if (this.mode === 'FOOT') {
      const targetDist = this.isAiming ? 2.1 : 4.2;
      const targetSide = this.isAiming ? 0.58 : 0.32;
      const targetH = this.isAiming ? 1.55 : 1.5;
      const k = damp(12, dt);
      this.currentDist = lerp(this.currentDist, targetDist, k);
      this.currentSide = lerp(this.currentSide, targetSide, k);
      this.currentHeight = lerp(this.currentHeight, targetH, k);

      this.pivot.set(targetPos.x, targetPos.y + this.currentHeight, targetPos.z);
      const rightX = Math.cos(this.yaw), rightZ = -Math.sin(this.yaw);
      const ox = this.pivot.x + rightX * this.currentSide;
      const oy = this.pivot.y;
      const oz = this.pivot.z + rightZ * this.currentSide;

      const backX = Math.sin(this.yaw) * Math.cos(this.pitch);
      const backY = Math.sin(this.pitch);
      const backZ = Math.cos(this.yaw) * Math.cos(this.pitch);

      let dist = this.currentDist;
      if (this.colliders) {
        const hit = this.colliders.raycast(ox, oy, oz, backX, backY, backZ, dist + 0.3);
        if (hit && hit.t < dist + 0.3) dist = Math.max(0.5, hit.t - 0.3);
      }

      const cx = ox + backX * dist + shakeVec.x;
      const cy = Math.max(targetPos.y + 0.35, oy + backY * dist) + shakeVec.y;
      const cz = oz + backZ * dist + shakeVec.z;

      this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), damp(22, dt));

      // Look forward from the shoulder pivot along (-backX, -backY, -backZ)
      const lookX = ox - backX * 30;
      const lookY = oy - backY * 30;
      const lookZ = oz - backZ * 30;
      this.camera.lookAt(lookX, lookY, lookZ);

      const targetFov = this.isAiming ? 48 : 65;
      this.camera.fov = lerp(this.camera.fov, targetFov, damp(12, dt));
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'VEHICLE') {
      // Auto-recenter mouse orbit when player stops moving mouse
      if (this.mouseIdleTimer > 1.4 && Math.abs(speed) > 1.5) {
        this.orbitOffsetYaw = lerpAngle(this.orbitOffsetYaw, 0, damp(3.5, dt));
        this.pitch = lerp(this.pitch, 0.24, damp(3.0, dt));
      }
      const desiredYaw = targetHeading + (speed < -2 ? Math.PI : 0);
      this.yaw = lerpAngle(this.yaw, desiredYaw, damp(5.5, dt));
      const totalYaw = this.yaw + this.orbitOffsetYaw;

      const speedFactor = clamp(Math.abs(speed) / 38, 0, 1);
      const distTarget = 6.8 + speedFactor * 1.8;
      const heightTarget = 1.65 + speedFactor * 0.35;

      this.pivot.set(targetPos.x, targetPos.y + 1.15, targetPos.z);

      const backX = Math.sin(totalYaw) * Math.cos(this.pitch);
      const backY = Math.sin(this.pitch);
      const backZ = Math.cos(totalYaw) * Math.cos(this.pitch);

      let dist = distTarget;
      if (this.colliders) {
        const hit = this.colliders.raycast(this.pivot.x, this.pivot.y, this.pivot.z, backX, backY, backZ, dist + 0.4);
        if (hit && hit.t < dist + 0.4) dist = Math.max(1.8, hit.t - 0.4);
      }

      const cx = this.pivot.x + backX * dist + shakeVec.x;
      const cy = Math.max(targetPos.y + 0.6, targetPos.y + heightTarget + backY * dist * 0.65) + shakeVec.y;
      const cz = this.pivot.z + backZ * dist + shakeVec.z;

      this.camera.position.lerp(new THREE.Vector3(cx, cy, cz), damp(16, dt));

      const fwdX = -Math.sin(targetHeading), fwdZ = -Math.cos(targetHeading);
      this.camera.lookAt(
        this.pivot.x + fwdX * speedFactor * 2.5,
        this.pivot.y + 0.15,
        this.pivot.z + fwdZ * speedFactor * 2.5
      );

      const targetFov = 65 + speedFactor * 15;
      this.camera.fov = lerp(this.camera.fov, targetFov, damp(6, dt));
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'HOOD') {
      const fwdX = -Math.sin(targetHeading), fwdZ = -Math.cos(targetHeading);
      this.camera.position.set(
        targetPos.x + fwdX * 0.4 + shakeVec.x,
        targetPos.y + 1.35 + shakeVec.y,
        targetPos.z + fwdZ * 0.4 + shakeVec.z
      );
      this.camera.lookAt(targetPos.x + fwdX * 30, targetPos.y + 1.2, targetPos.z + fwdZ * 30);
    }
  }
}
