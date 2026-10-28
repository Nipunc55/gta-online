import * as THREE from 'three';
import { buildVehicleModel, VEHICLE_TYPES } from './VehicleModels.js';
import { clamp, lerp, damp } from '../core/MathUtils.js';
import { WORLD_LIMIT } from '../world/CityLayout.js';

// Full 2D velocity-vector vehicle simulation:
// - Separate forward speed and lateral slip velocity -> real handbrake drifts & oversteer
// - 5-speed automatic transmission & RPM curve
// - Static building collision push-out + vehicle-to-vehicle impulse exchange
// - Health, smoke / fire states, and explosion trigger

export class Vehicle {
  constructor(scene, layout, colliders, audio, typeKey = 'sedan', x = 0, z = 0, heading = 0, colorHex = null) {
    this.scene = scene;
    this.layout = layout;
    this.colliders = colliders;
    this.audio = audio;
    this.typeKey = typeKey;
    this.spec = VEHICLE_TYPES[typeKey] || VEHICLE_TYPES.sedan;
    this.isPolice = !!this.spec.isPolice;
    this.modelName = this.spec.name;

    this.model = buildVehicleModel(typeKey, colorHex);
    this.mesh = this.model.root;
    this.chassis = this.model.chassis;

    this.position = new THREE.Vector3(x, layout.getGroundHeight(x, z), z);
    this.velocity = new THREE.Vector2(0, 0); // (vx, vz) in world space
    this.rotationY = heading;
    this.speed = 0;        // signed forward speed (m/s)
    this.lateralSpeed = 0; // signed right-hand slip speed (m/s)
    this.steerAngle = 0;
    this.driftSlip = 0;
    this.isHandbraking = false;

    this.verticalVelocity = 0;
    this.isAirborne = false;

    // Drivetrain
    this.rpm = 850;
    this.gear = 1;

    // Health & states
    this.maxHealth = this.spec.maxHealth;
    this.health = this.maxHealth;
    this.isDestroyed = false;
    this.isOccupied = false;
    this.driver = null; // 'player' | 'traffic' | 'police' | null
    this.sirenOn = this.isPolice && false;
    this.headlightsOn = false;
    this.useSpotLight = true;
    this.autoHeadlightEligible = true;
    this._lastAutoNight = null;
    this.weatherGrip = 1.0;
    this.crashCooldown = 0;

    this.radius = Math.max(this.spec.width, this.spec.length) * 0.44;
    this.halfW = this.spec.width * 0.5;
    this.halfL = this.spec.length * 0.5;

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotationY;
    this.scene.add(this.mesh);
    this.setHeadlights(false);
  }

  setHeadlights(enabled) {
    this.headlightsOn = !!enabled && !this.isDestroyed;
    if (this.model.headlightMat) {
      this.model.headlightMat.color.setHex(this.headlightsOn ? 0xfff8d6 : 0x2c3038);
    }
    if (this.model.headlightGroup) {
      this.model.headlightGroup.visible = this.headlightsOn;
    }
    if (this.model.groundPool) {
      this.model.groundPool.visible = this.headlightsOn && !this.isAirborne;
    }
    if (this.model.spotLight) {
      this.model.spotLight.visible = this.headlightsOn && (this.useSpotLight || this.driver === 'player');
    }
  }

  toggleHeadlights() {
    this.setHeadlights(!this.headlightsOn);
    return this.headlightsOn;
  }

  /** Automatically turn headlights ON when night falls and OFF at daybreak. */
  updateAutoHeadlights(isNight) {
    if (this.isDestroyed) return;
    const activeCar = this.driver !== null || this.autoHeadlightEligible;
    if (!activeCar) return;
    if (this._lastAutoNight !== isNight) {
      this._lastAutoNight = isNight;
      this.setHeadlights(isNight);
    }
  }

  destroy() {
    if (this.mesh && this.mesh.parent) this.mesh.parent.remove(this.mesh);
  }

  takeDamage(amount, effects = null, onExplode = null) {
    if (this.isDestroyed) return;
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.explode(effects, onExplode);
    }
  }

  explode(effects = null, onExplode = null) {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.health = 0;
    this.sirenOn = false;
    this.setHeadlights(false);
    this.model.bodyMat.color.setHex(0x1f1f1f);
    this.model.bodyMat.roughness = 0.95;
    this.model.bodyMat.metalness = 0.1;
    this.verticalVelocity = 8.5;
    this.isAirborne = true;
    if (this.audio) this.audio.play('explosion', 1.0);
    if (effects) effects.spawnExplosion(this.position);
    if (typeof onExplode === 'function') onExplode(this);
  }

  /**
   * Step vehicle physics with explicit control inputs:
   * controls = { throttle: -1..1, steer: -1..1 (left=+1, right=-1), handbrake: bool }
   */
  stepPhysics(dt, controls = null, effects = null) {
    if (this.crashCooldown > 0) this.crashCooldown -= dt;

    let throttle = 0, steerInput = 0, handbrake = false, braking = false;
    if (!this.isDestroyed && controls) {
      throttle = clamp(controls.throttle || 0, -1, 1);
      steerInput = clamp(controls.steer || 0, -1, 1);
      handbrake = !!controls.handbrake;
    }
    this.isHandbraking = handbrake;

    // Local basis vectors on XZ plane (forward = (-sin, -cos), right = (cos, -sin))
    const fwdX = -Math.sin(this.rotationY);
    const fwdZ = -Math.cos(this.rotationY);
    const rightX = Math.cos(this.rotationY);
    const rightZ = -Math.sin(this.rotationY);

    // Decompose current world velocity into forward and lateral components
    let vFwd = this.velocity.x * fwdX + this.velocity.y * fwdZ;
    let vLat = this.velocity.x * rightX + this.velocity.y * rightZ;

    const baseSurfaceGrip = this.layout ? this.layout.getSurfaceGrip(this.position.x, this.position.z) : 1.0;
    const surfaceGrip = baseSurfaceGrip * (this.weatherGrip || 1.0);

    // Acceleration / braking / reverse
    if (throttle > 0) {
      if (vFwd < -0.5) {
        braking = true;
        vFwd = Math.min(0, vFwd + this.spec.braking * dt);
      } else {
        const top = this.spec.maxSpeed * (surfaceGrip < 0.8 ? 0.78 : 1.0);
        const accelFactor = 1.0 - clamp(vFwd / top, 0, 0.92) * 0.45;
        vFwd = Math.min(top, vFwd + this.spec.acceleration * accelFactor * throttle * dt);
      }
    } else if (throttle < 0) {
      if (vFwd > 0.8) {
        braking = true;
        vFwd = Math.max(0, vFwd - this.spec.braking * Math.abs(throttle) * dt);
      } else {
        const revMax = -this.spec.maxSpeed * 0.34;
        vFwd = Math.max(revMax, vFwd + this.spec.acceleration * 0.65 * throttle * dt);
      }
    } else {
      // Rolling resistance + aerodynamic drag
      const drag = 2.8 + Math.abs(vFwd) * 0.04;
      if (Math.abs(vFwd) <= drag * dt) vFwd = 0;
      else vFwd -= Math.sign(vFwd) * drag * dt;
    }

    if (handbrake) {
      braking = true;
      const hbDecel = this.spec.braking * 0.65 * dt;
      if (Math.abs(vFwd) <= hbDecel) vFwd = 0;
      else vFwd -= Math.sign(vFwd) * hbDecel;
    }

    // Steering angle smoothed with speed-sensitive authority
    const speedRatio = clamp(Math.abs(vFwd) / this.spec.maxSpeed, 0, 1);
    const maxSteer = lerp(0.56, 0.24, speedRatio * 0.85);
    const targetSteer = steerInput * maxSteer;
    this.steerAngle = lerp(this.steerAngle, targetSteer, damp(12, dt));

    if (this.model.frontL) this.model.frontL.rotation.y = this.steerAngle;
    if (this.model.frontR) this.model.frontR.rotation.y = this.steerAngle;

    // Angular yaw rate from bicycle kinematics + handbrake oversteer boost
    const turnAuthority = clamp(Math.abs(vFwd) / 3.2, 0, 1) * (vFwd >= 0 ? 1 : -1);
    const hbOversteer = handbrake && Math.abs(vFwd) > 5 ? 1.45 : 1.0;
    const airFactor = this.isAirborne ? 0.25 : 1.0;
    const yawRate = steerInput * this.spec.steerSpeed * (1 - speedRatio * 0.32) * turnAuthority * hbOversteer * airFactor;
    this.rotationY += yawRate * dt;

    // Inject mild centrifugal lateral velocity when cornering hard
    vLat -= yawRate * vFwd * 0.18 * dt;

    // Lateral tire grip (low when handbraking -> car slides sideways!)
    const latGrip = (handbrake ? this.spec.driftGrip : this.spec.grip) * surfaceGrip;
    vLat *= Math.exp(-latGrip * dt);

    // Reconstruct world velocity with updated heading
    const nFwdX = -Math.sin(this.rotationY);
    const nFwdZ = -Math.cos(this.rotationY);
    const nRightX = Math.cos(this.rotationY);
    const nRightZ = -Math.sin(this.rotationY);

    this.velocity.x = nFwdX * vFwd + nRightX * vLat;
    this.velocity.y = nFwdZ * vFwd + nRightZ * vLat;
    this.speed = vFwd;
    this.lateralSpeed = vLat;

    // Compute normalized drift slip for tire squeal & smoke
    const slip = Math.abs(vLat) / Math.max(4, Math.abs(vFwd));
    this.driftSlip = clamp(slip + (handbrake && Math.abs(vFwd) > 6 ? 0.45 : 0), 0, 1);

    // Advance position
    this.position.x = clamp(this.position.x + this.velocity.x * dt, -WORLD_LIMIT, WORLD_LIMIT);
    this.position.z = clamp(this.position.z + this.velocity.y * dt, -WORLD_LIMIT, WORLD_LIMIT);

    // Static building/prop collision check (2 sample circles: front & rear axle)
    if (this.colliders) {
      const hit = this.colliders.resolveCircle(this.position, this.halfW * 1.05, 1.6);
      if (hit.hit) {
        // Reflect velocity along normal and damp speed
        const vn = this.velocity.x * hit.nx + this.velocity.y * hit.nz;
        if (vn < 0) {
          const impactSpeed = -vn;
          this.velocity.x -= (1.35 * vn) * hit.nx;
          this.velocity.y -= (1.35 * vn) * hit.nz;
          this.speed *= 0.45;
          if (impactSpeed > 6 && this.crashCooldown <= 0) {
            this.crashCooldown = 0.28;
            this.takeDamage(impactSpeed * 1.4, effects);
            if (this.audio && (this.driver === 'player' || impactSpeed > 11)) {
              this.audio.play('crash', clamp(impactSpeed / 22, 0.25, 1.0), clamp(impactSpeed / 18, 0.4, 1.5));
            }
            if (effects) {
              effects.createImpactSparks(new THREE.Vector3(
                this.position.x - hit.nx * this.halfW,
                this.position.y + 0.6,
                this.position.z - hit.nz * this.halfW
              ));
            }
          }
        }
      }
    }

    // Ground height & vertical gravity
    const groundY = Math.max(-0.4, this.layout ? this.layout.getGroundHeight(this.position.x, this.position.z) : 0);
    if (this.isAirborne || this.position.y > groundY + 0.06) {
      this.isAirborne = true;
      this.verticalVelocity -= 24.0 * dt;
      this.position.y += this.verticalVelocity * dt;
      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.verticalVelocity = 0;
        this.isAirborne = false;
      }
    } else {
      this.position.y = lerp(this.position.y, groundY, damp(20, dt));
    }

    // Wheel spin
    const spinDelta = (this.speed / this.spec.wheelRadius) * dt;
    for (let i = 0; i < this.model.wheels.length; i++) {
      this.model.wheels[i].spin.rotation.x += spinDelta;
    }

    // Chassis roll & pitch
    const targetRoll = clamp(-steerInput * speedRatio * 0.095 - (vLat * 0.012), -0.14, 0.14);
    const targetPitch = throttle > 0 ? -0.028 : (braking ? 0.045 : 0);
    this.model.bodyGroup.rotation.z = lerp(this.model.bodyGroup.rotation.z, targetRoll, damp(10, dt));
    this.model.bodyGroup.rotation.x = lerp(this.model.bodyGroup.rotation.x, targetPitch, damp(10, dt));

    // Brake lights glow & headlight projection sync
    if (this.model.brakeMat) {
      this.model.brakeMat.color.setHex(braking ? 0xff1122 : 0x66000a);
    }
    const hlActive = this.headlightsOn && !this.isDestroyed;
    if (this.model.headlightGroup) {
      this.model.headlightGroup.visible = hlActive;
    }
    if (this.model.groundPool) {
      this.model.groundPool.visible = hlActive && !this.isAirborne;
    }
    if (this.model.spotLight) {
      this.model.spotLight.visible = hlActive && (this.useSpotLight || this.driver === 'player');
    }

    // Driver visibility
    if (this.model.driverGroup) {
      this.model.driverGroup.visible = this.isOccupied && !this.isDestroyed;
    }

    // Police lightbar flash
    if (this.isPolice && this.model.policeRed && this.model.policeBlue) {
      if (this.sirenOn) {
        const f = Math.floor(performance.now() * 0.01) % 2 === 0;
        this.model.policeRed.material.color.setHex(f ? 0xff1122 : 0x2a0005);
        this.model.policeBlue.material.color.setHex(f ? 0x05152a : 0x1188ff);
      } else {
        this.model.policeRed.material.color.setHex(0x440008);
        this.model.policeBlue.material.color.setHex(0x081844);
      }
    }

    // Tire smoke when drifting or burning out, damage smoke when low health
    if (effects) {
      if (!this.isAirborne && this.driftSlip > 0.35 && Math.abs(this.speed) > 5 && Math.random() < 0.55) {
        effects.createTireSmoke(new THREE.Vector3(
          this.position.x - nFwdX * (this.halfL * 0.7),
          this.position.y + 0.15,
          this.position.z - nFwdZ * (this.halfL * 0.7)
        ));
      }
      if (!this.isDestroyed && this.health < this.maxHealth * 0.45 && Math.random() < 0.35) {
        effects.createTireSmoke(new THREE.Vector3(
          this.position.x + nFwdX * (this.halfL * 0.7),
          this.position.y + 0.85,
          this.position.z + nFwdZ * (this.halfL * 0.7)
        ));
      }
    }

    // Engine RPM & audio for player-driven car
    this.calculateRPM();
    if (this.driver === 'player' && this.audio) {
      this.audio.updateEngine((this.rpm - 800) / 6700, Math.abs(throttle), true);
      this.audio.updateTires(this.driftSlip);
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotationY;
  }

  /** Player-input wrapper around stepPhysics. */
  updatePlayer(dt, input, effects = null) {
    let throttle = 0, steer = 0, handbrake = false;
    if (input) {
      if (input.isKeyDown('KeyW') || input.isKeyDown('ArrowUp')) throttle += 1;
      if (input.isKeyDown('KeyS') || input.isKeyDown('ArrowDown')) throttle -= 1;
      if (input.isKeyDown('KeyA') || input.isKeyDown('ArrowLeft')) steer += 1;
      if (input.isKeyDown('KeyD') || input.isKeyDown('ArrowRight')) steer -= 1;
      if (input.isKeyDown('Space')) handbrake = true;
    }
    this.stepPhysics(dt, { throttle, steer, handbrake }, effects);
  }

  /** Resolve pairwise collisions across a list of vehicles. */
  static resolveVehiclePairs(vehicles, audio = null, effects = null) {
    const n = vehicles.length;
    for (let i = 0; i < n; i++) {
      const a = vehicles[i];
      if (!a || !a.mesh.visible) continue;
      for (let j = i + 1; j < n; j++) {
        const b = vehicles[j];
        if (!b || !b.mesh.visible) continue;
        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const minDist = (a.halfW + b.halfW) * 1.35;
        const d2 = dx * dx + dz * dz;
        if (d2 >= minDist * minDist || d2 < 1e-6) continue;

        const d = Math.sqrt(d2);
        const nx = dx / d, nz = dz / d;
        const overlap = (minDist - d) * 0.52;
        a.position.x -= nx * overlap;
        a.position.z -= nz * overlap;
        b.position.x += nx * overlap;
        b.position.z += nz * overlap;
        a.mesh.position.copy(a.position);
        b.mesh.position.copy(b.position);

        // Relative velocity along collision normal
        const rvx = b.velocity.x - a.velocity.x;
        const rvz = b.velocity.y - a.velocity.y;
        const relN = rvx * nx + rvz * nz;
        if (relN < 0) {
          const jImp = -relN * 0.65;
          a.velocity.x -= nx * jImp;
          a.velocity.y -= nz * jImp;
          b.velocity.x += nx * jImp;
          b.velocity.y += nz * jImp;

          const impact = -relN;
          if (impact > 5) {
            a.takeDamage(impact * 0.85, effects);
            b.takeDamage(impact * 0.85, effects);
            if (audio && (a.driver === 'player' || b.driver === 'player') && a.crashCooldown <= 0) {
              a.crashCooldown = 0.25;
              audio.play('crash', clamp(impact / 20, 0.3, 1.0), clamp(impact / 16, 0.4, 1.4));
            }
            if (effects) {
              effects.createImpactSparks(new THREE.Vector3(
                (a.position.x + b.position.x) * 0.5,
                a.position.y + 0.6,
                (a.position.z + b.position.z) * 0.5
              ));
            }
          }
        }
      }
    }
  }

  calculateRPM() {
    const abs = Math.abs(this.speed);
    const max = this.spec.maxSpeed;
    const r = clamp(abs / max, 0, 1);
    if (r < 0.18) { this.gear = 1; this.rpm = 900 + (r / 0.18) * 4400; }
    else if (r < 0.38) { this.gear = 2; this.rpm = 2200 + ((r - 0.18) / 0.20) * 4500; }
    else if (r < 0.60) { this.gear = 3; this.rpm = 2500 + ((r - 0.38) / 0.22) * 4600; }
    else if (r < 0.82) { this.gear = 4; this.rpm = 2800 + ((r - 0.60) / 0.22) * 4500; }
    else { this.gear = 5; this.rpm = 3100 + ((r - 0.82) / 0.18) * 4400; }
  }

  getSpeedMPH() {
    return Math.round(Math.abs(this.speed) * 2.237);
  }
}
