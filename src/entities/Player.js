import * as THREE from 'three';
import { createHumanoid, animateHumanoid } from './HumanoidModel.js';
import { clamp, lerpAngle, damp, yawFromDir } from '../core/MathUtils.js';
import { WORLD_LIMIT } from '../world/CityLayout.js';

export class Player {
  constructor(scene, layout, colliders, events) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.events = events;

    // Spawn on central sidewalk near Legion Square
    this.position = new THREE.Vector3(9.5, layout.getGroundHeight(9.5, 20), 20);
    this.velocity = new THREE.Vector3();
    this.rotationY = 0; // 0 = facing -Z
    this.radius = 0.42;

    this.walkSpeed = 4.8;
    this.runSpeed = 8.8;
    this.aimSpeed = 3.2;
    this.jumpSpeed = 7.4;
    this.gravity = -22.0;
    this.isGrounded = true;

    // Vitals & economy
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 100;
    this.maxArmor = 100;
    this.stamina = 100;
    this.maxStamina = 100;
    this.cash = 2500;

    // States
    this.isAlive = true;
    this.inVehicle = false;
    this.currentVehicle = null;
    this.isAiming = false;
    this.isFiring = false;
    this.isMoving = false;
    this.isSprinting = false;
    this.punchTimer = 0;
    this.hurtFlash = 0;

    this.rig = createHumanoid({ role: 'player' });
    this.mesh = this.rig.root;
    this.weaponSocket = this.rig.weaponSocket;
    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  get inCombatStance() {
    return this.isAiming || this.isFiring;
  }

  triggerPunch() {
    this.punchTimer = 1.0;
  }

  addCash(amount) {
    this.cash = Math.max(0, this.cash + Math.round(amount));
  }

  takeDamage(amount, source = 'unknown') {
    if (!this.isAlive) return;
    this.hurtFlash = 1.0;
    if (this.armor > 0) {
      const absorb = Math.min(this.armor, amount * 0.7);
      this.armor -= absorb;
      amount -= absorb;
    }
    this.health = Math.max(0, this.health - amount);
    if (this.events) this.events.emit('player:damaged', { amount, source });
    if (this.health <= 0) this.die();
  }

  die() {
    if (!this.isAlive) return;
    this.isAlive = false;
    if (this.inVehicle && this.currentVehicle) {
      this.currentVehicle.isOccupied = false;
      this.currentVehicle.driver = null;
      this.inVehicle = false;
      this.currentVehicle = null;
    }
    this.mesh.visible = true;
    this.mesh.rotation.x = -Math.PI / 2;
    if (this.events) this.events.emit('player:wasted');
  }

  respawn(spawnPos) {
    this.health = 100;
    this.armor = 50;
    this.stamina = 100;
    this.isAlive = true;
    this.inVehicle = false;
    this.currentVehicle = null;
    this.mesh.rotation.set(0, this.rotationY, 0);
    this.mesh.visible = true;
    const x = spawnPos ? spawnPos.x : 9.5;
    const z = spawnPos ? spawnPos.z : 20;
    const y = this.layout.getGroundHeight(x, z);
    this.position.set(x, y, z);
    this.velocity.set(0, 0, 0);
    this.mesh.position.copy(this.position);
  }

  enterVehicle(vehicle, isNight = false) {
    this.inVehicle = true;
    this.currentVehicle = vehicle;
    vehicle.isOccupied = true;
    vehicle.driver = 'player';
    vehicle.useSpotLight = true;
    vehicle.autoHeadlightEligible = true;
    vehicle._lastAutoNight = isNight;
    if (isNight && !vehicle.headlightsOn) {
      vehicle.setHeadlights(true);
    } else {
      vehicle.setHeadlights(vehicle.headlightsOn);
    }
    this.mesh.visible = false;
    this.position.copy(vehicle.position);
    this.velocity.set(0, 0, 0);
  }

  exitVehicle() {
    const v = this.currentVehicle;
    if (!v) return;
    v.isOccupied = false;
    v.driver = null;
    this.inVehicle = false;
    this.currentVehicle = null;

    // Exit to left door (local -X of vehicle)
    const leftX = -Math.cos(v.rotationY);
    const leftZ = Math.sin(v.rotationY);
    const ex = v.position.x + leftX * 2.1;
    const ez = v.position.z + leftZ * 2.1;
    const ey = this.layout.getGroundHeight(ex, ez);
    this.position.set(ex, ey, ez);
    if (this.colliders) this.colliders.resolveCircle(this.position, this.radius, 1.8);
    this.rotationY = v.rotationY;
    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, this.rotationY, 0);
    this.mesh.visible = true;
    this.velocity.set(0, 0, 0);
  }

  update(dt, input, cameraYaw, cameraPitch) {
    this.hurtFlash = Math.max(0, this.hurtFlash - dt * 2.5);
    if (!this.isAlive) return;
    if (this.inVehicle && this.currentVehicle) {
      this.mesh.visible = false;
      this.position.copy(this.currentVehicle.position);
      return;
    }
    this.mesh.visible = true;

    let fwd = 0, right = 0;
    if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) fwd += 1;
    if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) fwd -= 1;
    if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) right += 1;
    if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) right -= 1;

    const hasInput = fwd !== 0 || right !== 0;
    this.isMoving = hasInput;

    const wantSprint = (input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight')) && !this.inCombatStance;
    this.isSprinting = wantSprint && hasInput && this.stamina > 4;

    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - dt * 14);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + dt * 18);
    }

    const speed = this.inCombatStance ? this.aimSpeed : (this.isSprinting ? this.runSpeed : this.walkSpeed);

    if (hasInput) {
      const len = Math.hypot(fwd, right);
      const nf = fwd / len, nr = right / len;
      const camFwdX = -Math.sin(cameraYaw), camFwdZ = -Math.cos(cameraYaw);
      const camRightX = Math.cos(cameraYaw), camRightZ = -Math.sin(cameraYaw);
      const mx = camFwdX * nf + camRightX * nr;
      const mz = camFwdZ * nf + camRightZ * nr;
      this.velocity.x = mx * speed;
      this.velocity.z = mz * speed;

      if (!this.inCombatStance) {
        const targetYaw = yawFromDir(mx, mz);
        this.rotationY = lerpAngle(this.rotationY, targetYaw, damp(14, dt));
      }
    } else {
      const k = damp(14, dt);
      this.velocity.x *= (1 - k);
      this.velocity.z *= (1 - k);
    }

    if (this.inCombatStance) {
      this.rotationY = cameraYaw;
    }

    if (input.wasKeyJustPressed('Space') && this.isGrounded) {
      this.velocity.y = this.jumpSpeed;
      this.isGrounded = false;
    }

    // Apply horizontal motion + smooth collision slide
    this.position.x = clamp(this.position.x + this.velocity.x * dt, -WORLD_LIMIT, WORLD_LIMIT);
    this.position.z = clamp(this.position.z + this.velocity.z * dt, -WORLD_LIMIT, WORLD_LIMIT);

    if (this.colliders) {
      this.colliders.resolveCircle(this.position, this.radius, 1.8);
    }

    // Vertical physics + curb step-up
    const groundY = Math.max(-0.35, this.layout.getGroundHeight(this.position.x, this.position.z));
    this.velocity.y += this.gravity * dt;
    this.position.y += this.velocity.y * dt;

    if (this.position.y <= groundY) {
      this.position.y = groundY;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (this.isGrounded && groundY - this.position.y > -0.25 && this.velocity.y <= 0) {
      this.position.y = groundY;
      this.velocity.y = 0;
    }

    if (this.punchTimer > 0) this.punchTimer = Math.max(0, this.punchTimer - dt * 4.2);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotationY;

    animateHumanoid(this.rig, dt, {
      moving: this.isMoving && this.isGrounded,
      sprinting: this.isSprinting,
      aiming: this.inCombatStance,
      aimPitch: cameraPitch,
      punchTimer: this.punchTimer
    });
  }
}
