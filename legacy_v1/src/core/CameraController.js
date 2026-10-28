import * as THREE from 'three';

export class CameraController {
  constructor(camera, canvas) {
    this.camera = camera;
    this.canvas = canvas;

    this.mode = 'FOOT'; // 'FOOT' | 'VEHICLE' | 'CINEMATIC'
    this.target = new THREE.Vector3(0, 1.5, 0);

    // Angles in radians
    this.yaw = 0;
    this.pitch = 0.2;

    // Pitch limits
    this.minPitch = -Math.PI / 4;
    this.maxPitch = Math.PI / 2.5;

    // Distances
    this.footDistance = 4.0;
    this.footHeight = 1.6;
    this.aimDistance = 2.2;
    this.aimOffset = new THREE.Vector3(0.5, 1.5, 0);

    this.vehicleDistance = 7.0;
    this.vehicleHeight = 2.5;

    this.currentDistance = this.footDistance;
    this.currentPosition = new THREE.Vector3();

    this.mouseSensitivity = 0.0022;
    this.isAiming = false;

    // Vehicle chase smoothing
    this.vehicleYaw = 0;

    // Camera shake
    this.shakeIntensity = 0;
  }

  setMode(mode) {
    this.mode = mode;
    if (mode === 'VEHICLE') {
      this.currentDistance = this.vehicleDistance;
      this.pitch = 0.25;
    } else if (mode === 'FOOT') {
      this.currentDistance = this.footDistance;
      this.pitch = 0.2;
    }
  }

  setAiming(aiming) {
    this.isAiming = aiming;
  }

  addShake(amount) {
    this.shakeIntensity = Math.min(this.shakeIntensity + amount, 1.0);
  }

  update(delta, targetPos, targetRotationY, vehicleSpeed = 0, obstacles = []) {
    // Decay shake
    this.shakeIntensity = Math.max(0, this.shakeIntensity - delta * 3.0);
    const shakeOffset = new THREE.Vector3(
      (Math.random() - 0.5) * 0.15 * this.shakeIntensity,
      (Math.random() - 0.5) * 0.15 * this.shakeIntensity,
      (Math.random() - 0.5) * 0.15 * this.shakeIntensity
    );

    if (this.mode === 'FOOT') {
      const targetDist = this.isAiming ? this.aimDistance : this.footDistance;
      this.currentDistance = THREE.MathUtils.lerp(this.currentDistance, targetDist, delta * 10);

      // Desired camera target (chest/head height)
      this.target.copy(targetPos).add(new THREE.Vector3(0, this.footHeight, 0));

      // Right shoulder aim offset when aiming
      const rightVector = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
      const lookOffset = this.isAiming ? rightVector.clone().multiplyScalar(0.4) : new THREE.Vector3(0, 0, 0);

      // Spherical coordinates around target
      const cx = this.target.x + lookOffset.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.currentDistance;
      const cy = this.target.y + Math.sin(this.pitch) * this.currentDistance;
      const cz = this.target.z + lookOffset.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.currentDistance;

      const desiredPos = new THREE.Vector3(cx, cy, cz).add(shakeOffset);

      // Ground collision prevention
      if (desiredPos.y < 0.5) desiredPos.y = 0.5;

      this.camera.position.lerp(desiredPos, delta * 20);
      this.camera.lookAt(this.target.clone().add(lookOffset));

      // Normal FOV vs Aim FOV
      const targetFov = this.isAiming ? 50 : 65;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 12);
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'VEHICLE') {
      // Follow vehicle with smooth orientation lag
      this.target.copy(targetPos).add(new THREE.Vector3(0, 1.2, 0));

      // Blend mouse yaw or auto-follow rear of car
      const rearYaw = targetRotationY;
      this.vehicleYaw = THREE.MathUtils.lerp(this.vehicleYaw, rearYaw, delta * 4.0);

      const combinedYaw = this.vehicleYaw + this.yaw;

      const speedFactor = Math.min(vehicleSpeed / 35, 1.0);
      const dynamicDist = this.vehicleDistance + speedFactor * 1.5;
      const dynamicHeight = this.vehicleHeight + speedFactor * 0.4;

      const cx = this.target.x + Math.sin(combinedYaw) * Math.cos(this.pitch) * dynamicDist;
      const cy = this.target.y + dynamicHeight + Math.sin(this.pitch) * dynamicDist * 0.5;
      const cz = this.target.z + Math.cos(combinedYaw) * Math.cos(this.pitch) * dynamicDist;

      const desiredPos = new THREE.Vector3(cx, cy, cz).add(shakeOffset);
      if (desiredPos.y < 0.6) desiredPos.y = 0.6;

      this.camera.position.lerp(desiredPos, delta * 14);
      
      // Look slightly ahead of the car when driving fast
      const forwardVec = new THREE.Vector3(-Math.sin(targetRotationY), 0, -Math.cos(targetRotationY));
      const lookTarget = this.target.clone().add(forwardVec.multiplyScalar(speedFactor * 3.0));
      this.camera.lookAt(lookTarget);

      // Dynamic FOV based on speed
      const targetFov = 65 + speedFactor * 18;
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 6);
      this.camera.updateProjectionMatrix();

    } else if (this.mode === 'CINEMATIC') {
      // Low wheel angle dramatic shot
      const sideVec = new THREE.Vector3(Math.cos(targetRotationY), 0, -Math.sin(targetRotationY));
      const desiredPos = targetPos.clone().add(sideVec.multiplyScalar(3.2)).add(new THREE.Vector3(0, 0.4, 0));
      this.camera.position.lerp(desiredPos, delta * 10);
      this.camera.lookAt(targetPos.clone().add(new THREE.Vector3(0, 1.0, 0)));
    }
  }

  handleMouseDelta(deltaX, deltaY) {
    this.yaw -= deltaX * this.mouseSensitivity;
    this.pitch += deltaY * this.mouseSensitivity;

    // Clamp pitch
    this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));

    // Keep yaw normalized between -PI and PI
    while (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    while (this.yaw < -Math.PI) this.yaw += Math.PI * 2;
  }
}
