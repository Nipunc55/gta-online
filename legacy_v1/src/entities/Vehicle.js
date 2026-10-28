import * as THREE from 'three';

export class Vehicle {
  constructor(scene, city, audioManager, x = 110, z = 15, isPolice = false) {
    this.scene = scene;
    this.city = city;
    this.audio = audioManager;
    this.isPolice = isPolice;

    this.position = new THREE.Vector3(x, 0.45, z);
    this.rotationY = 0;
    this.speed = 0; // forward speed in m/s
    this.angularVelocity = 0;

    // Vertical physics
    this.verticalVelocity = 0;
    this.isAirborne = false;
    this.gravity = -24.0;

    // Vehicle registry for collision checks
    if (!Vehicle.allVehicles) {
      Vehicle.allVehicles = [];
    }
    Vehicle.allVehicles.push(this);

    // Vehicle tuning parameters
    this.maxSpeed = isPolice ? 38 : 46;
    this.reverseSpeed = -14;
    this.acceleration = 24.0;
    this.braking = 32.0;
    this.drag = 3.5;
    this.steerSpeed = 2.4;
    this.maxSteerAngle = 0.58;

    // Drifting
    this.isHandbraking = false;
    this.driftSlip = 0;

    // Engine & Gear simulation
    this.rpm = 800; // 800 to 7500
    this.gear = 1;
    this.gearRatios = [0.2, 0.4, 0.65, 0.85, 1.0];

    // Interactive features
    this.headlightsOn = true;
    this.isOccupied = false;
    this.sirenOn = false;

    // Mesh elements
    this.wheels = [];
    this.frontWheelGroupL = null;
    this.frontWheelGroupR = null;

    this.buildVehicleMesh();
  }

  buildVehicleMesh() {
    this.mesh = new THREE.Group();

    // Body Colors
    let bodyColor = 0xff0044; // Vibrant Miami crimson
    if (this.isPolice) {
      bodyColor = 0x111111;
    }

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyColor,
      metalness: 0.85,
      roughness: 0.25
    });

    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x111115,
      metalness: 0.2,
      roughness: 0.8
    });

    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x1a2233,
      metalness: 0.9,
      roughness: 0.1,
      transparent: true,
      opacity: 0.75
    });

    // Lower Chassis Wedge
    const chassisGeo = new THREE.BoxGeometry(2.1, 0.55, 4.6);
    this.chassis = new THREE.Mesh(chassisGeo, bodyMat);
    this.chassis.position.y = 0.45;
    this.chassis.castShadow = true;
    this.chassis.receiveShadow = true;
    this.mesh.add(this.chassis);

    // Aerodynamic Nose / Hood Slope
    const hoodGeo = new THREE.BoxGeometry(2.0, 0.25, 1.6);
    const hood = new THREE.Mesh(hoodGeo, bodyMat);
    hood.position.set(0, 0.55, -1.5);
    hood.rotation.x = 0.08;
    hood.castShadow = true;
    this.mesh.add(hood);

    // Cabin / Roof
    const cabinGeo = new THREE.BoxGeometry(1.65, 0.55, 2.0);
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 0.95, 0.1);
    cabin.castShadow = true;
    this.mesh.add(cabin);

    // Roof Top Shell
    const roofGeo = new THREE.BoxGeometry(1.5, 0.08, 1.6);
    const roof = new THREE.Mesh(roofGeo, bodyMat);
    roof.position.set(0, 1.25, 0.1);
    roof.castShadow = true;
    this.mesh.add(roof);

    // Seated Driver Mesh (Visible through windows when car is occupied)
    this.driverMesh = new THREE.Group();
    const driverShirtMat = new THREE.MeshStandardMaterial({
      color: this.isPolice ? 0x1a2538 : 0x00ccbb,
      roughness: 0.6
    });
    const driverSkinMat = new THREE.MeshStandardMaterial({ color: 0xd99b7b, roughness: 0.7 });

    const driverTorso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.44, 0.28), driverShirtMat);
    driverTorso.position.set(-0.35, 0.76, 0.05);
    this.driverMesh.add(driverTorso);

    const driverHead = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), driverSkinMat);
    driverHead.position.set(-0.35, 1.06, 0.05);
    this.driverMesh.add(driverHead);

    const driverHair = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), new THREE.MeshStandardMaterial({ color: 0x241711 }));
    driverHair.position.set(-0.35, 1.16, 0.03);
    this.driverMesh.add(driverHair);

    const glasses = new THREE.Mesh(
      new THREE.BoxGeometry(0.22, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 })
    );
    glasses.position.set(-0.35, 1.06, -0.09);
    this.driverMesh.add(glasses);

    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.4, roughness: 0.5 });
    const steeringWheel = new THREE.Mesh(new THREE.TorusGeometry(0.14, 0.025, 8, 16), wheelMat);
    steeringWheel.position.set(-0.35, 0.82, -0.22);
    steeringWheel.rotation.x = -0.4;
    this.driverMesh.add(steeringWheel);

    this.driverMesh.visible = false;
    this.mesh.add(this.driverMesh);

    // Rear Ducktail Spoiler
    const spoilerGeo = new THREE.BoxGeometry(1.9, 0.08, 0.35);
    const spoiler = new THREE.Mesh(spoilerGeo, trimMat);
    spoiler.position.set(0, 0.9, 2.15);
    this.mesh.add(spoiler);

    // Wheels Construction
    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 16);
    wheelGeo.rotateZ(Math.PI / 2);
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x1c1c1f, roughness: 0.85 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9, roughness: 0.2 });

    const wheelPositions = [
      { x: -1.05, y: 0.38, z: -1.4, isFront: true, isLeft: true },
      { x: 1.05,  y: 0.38, z: -1.4, isFront: true, isLeft: false },
      { x: -1.05, y: 0.38, z: 1.4,  isFront: false, isLeft: true },
      { x: 1.05,  y: 0.38, z: 1.4,  isFront: false, isLeft: false }
    ];

    wheelPositions.forEach((wp) => {
      const wheelGroup = new THREE.Group();
      wheelGroup.position.set(wp.x, wp.y, wp.z);

      const tire = new THREE.Mesh(wheelGeo, tireMat);
      tire.castShadow = true;
      wheelGroup.add(tire);

      const rimGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 8);
      rimGeo.rotateZ(Math.PI / 2);
      const rim = new THREE.Mesh(rimGeo, rimMat);
      wheelGroup.add(rim);

      this.mesh.add(wheelGroup);
      this.wheels.push({ group: wheelGroup, tire, isFront: wp.isFront, isLeft: wp.isLeft });

      if (wp.isFront && wp.isLeft) this.frontWheelGroupL = wheelGroup;
      if (wp.isFront && !wp.isLeft) this.frontWheelGroupR = wheelGroup;
    });

    // Headlights (Meshes & SpotLight)
    const headlightMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    [-0.75, 0.75].forEach(hx => {
      const hl = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.12, 0.05), headlightMat);
      hl.position.set(hx, 0.55, -2.31);
      this.mesh.add(hl);
    });

    this.headlightSpot = new THREE.SpotLight(0xfffae6, 3.5, 45, Math.PI / 6, 0.4, 1.2);
    this.headlightSpot.position.set(0, 0.6, -2.4);
    this.headlightTarget = new THREE.Object3D();
    this.headlightTarget.position.set(0, 0, -20);
    this.mesh.add(this.headlightTarget);
    this.headlightSpot.target = this.headlightTarget;
    this.mesh.add(this.headlightSpot);

    // Taillights
    const tailMat = new THREE.MeshBasicMaterial({ color: 0xff0022 });
    [-0.75, 0.75].forEach(hx => {
      const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.05), tailMat);
      tl.position.set(hx, 0.6, 2.31);
      this.mesh.add(tl);
    });

    // Police Cruiser Elements (Lightbar & White Doors)
    if (this.isPolice) {
      // White door decals
      const doorMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
      const leftDoor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 1.6), doorMat);
      leftDoor.position.set(-1.06, 0.45, 0);
      this.mesh.add(leftDoor);

      const rightDoor = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.5, 1.6), doorMat);
      rightDoor.position.set(1.06, 0.45, 0);
      this.mesh.add(rightDoor);

      // Lightbar on Roof
      const lbGeo = new THREE.BoxGeometry(1.2, 0.14, 0.28);
      const lbMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
      const lightbar = new THREE.Mesh(lbGeo, lbMat);
      lightbar.position.set(0, 1.34, 0.1);
      this.mesh.add(lightbar);

      // Red & Blue LED lenses
      this.policeRed = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.12, 0.24),
        new THREE.MeshBasicMaterial({ color: 0xff0022 })
      );
      this.policeRed.position.set(-0.35, 1.35, 0.1);
      this.mesh.add(this.policeRed);

      this.policeBlue = new THREE.Mesh(
        new THREE.BoxGeometry(0.45, 0.12, 0.24),
        new THREE.MeshBasicMaterial({ color: 0x0077ff })
      );
      this.policeBlue.position.set(0.35, 1.35, 0.1);
      this.mesh.add(this.policeBlue);
    }

    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  destroy() {
    if (Vehicle.allVehicles) {
      const idx = Vehicle.allVehicles.indexOf(this);
      if (idx !== -1) {
        Vehicle.allVehicles.splice(idx, 1);
      }
    }
    if (this.mesh && this.mesh.parent) {
      this.mesh.parent.remove(this.mesh);
    }
  }

  applyJumpImpulse(upwardSpeed = 14.0, forwardBoost = 6.0) {
    this.verticalVelocity = upwardSpeed;
    this.isAirborne = true;
    this.position.y += 0.25;
    const dirSign = Math.sign(this.speed) || 1;
    this.speed += forwardBoost * dirSign;
    if (this.audio && this.isOccupied) {
      this.audio.playPunch();
    }
  }

  getGroundHeight(x, z) {
    if (this.city && typeof this.city.getGroundHeight === 'function') {
      const h = this.city.getGroundHeight(x, z);
      if (typeof h === 'number' && !isNaN(h)) return h;
    }
    // Fallback: Bridge deck top elevation is at y = 1.2
    for (const bz of [-60, 40]) {
      if (Math.abs(z - bz) <= 8.5) {
        if ((x >= -180 && x <= -90) || (x >= 0 && x <= 40)) {
          return 1.2;
        }
      }
    }
    return 0;
  }

  resolveVehicleCollisions(otherCars) {
    const list = otherCars || Vehicle.allVehicles;
    if (!list || list.length === 0) return;

    if (!this._box) this._box = new THREE.Box3();
    this._box.setFromObject(this.chassis || this.mesh);

    for (let i = 0; i < list.length; i++) {
      const other = list[i];
      if (!other || other === this) continue;
      if (other.mesh && !other.mesh.parent) continue;

      const dx = other.position.x - this.position.x;
      const dz = other.position.z - this.position.z;
      const distSq = dx * dx + dz * dz;

      // Check center distance < 3.2
      if (distSq < 3.2 * 3.2) {
        const dist = Math.sqrt(distSq);

        if (!other._box) other._box = new THREE.Box3();
        other._box.setFromObject(other.chassis || other.mesh);

        // Check bounding box overlap
        if (this._box.intersectsBox(other._box)) {
          // Push cars apart
          const safeDist = 3.2;
          const overlap = safeDist - dist;
          const nx = dist > 0.0001 ? dx / dist : 1;
          const nz = dist > 0.0001 ? dz / dist : 0;

          const pushAmount = Math.max(overlap * 0.5, 0.12);
          this.position.x -= nx * pushAmount;
          this.position.z -= nz * pushAmount;
          other.position.x += nx * pushAmount;
          other.position.z += nz * pushAmount;

          this.mesh.position.copy(this.position);
          other.mesh.position.copy(other.position);

          // Update bounding boxes
          this._box.setFromObject(this.chassis || this.mesh);
          other._box.setFromObject(other.chassis || other.mesh);

          // Bounce speeds (speed *= -0.4)
          this.speed *= -0.4;
          other.speed *= -0.4;

          // Play punch/crash sound
          if (this.audio) {
            this.audio.playPunch();
          } else if (other.audio) {
            other.audio.playPunch();
          }
        }
      }
    }
  }

  update(delta, input, otherCars = null) {
    let throttle = 0;
    let steer = 0;
    let handbrake = false;

    if (this.isOccupied && input) {
      if (input.isKeyDown('KeyW')) throttle += 1;
      if (input.isKeyDown('KeyS')) throttle -= 1;
      if (input.isKeyDown('KeyA')) steer += 1;
      if (input.isKeyDown('KeyD')) steer -= 1;
      if (input.isKeyDown('Space')) handbrake = true;
      if (input.wasKeyJustPressed('KeyH')) this.toggleHeadlights();
      if (input.wasKeyJustPressed('KeyE')) {
        this.sirenOn = !this.sirenOn;
        if (this.audio) this.audio.setSiren(this.sirenOn);
      }
    }

    this.isHandbraking = handbrake;

    // Steering Angle
    const targetSteerAngle = steer * this.maxSteerAngle;
    if (this.frontWheelGroupL) this.frontWheelGroupL.rotation.y = targetSteerAngle;
    if (this.frontWheelGroupR) this.frontWheelGroupR.rotation.y = targetSteerAngle;

    // Acceleration & Braking
    if (throttle > 0) {
      this.speed = Math.min(this.speed + this.acceleration * delta, this.maxSpeed);
    } else if (throttle < 0) {
      if (this.speed > 0.5) {
        // Braking
        this.speed = Math.max(0, this.speed - this.braking * delta);
      } else {
        // Reversing
        this.speed = Math.max(this.speed - this.acceleration * 0.6 * delta, this.reverseSpeed);
      }
    } else {
      // Coasting drag
      if (this.speed > 0) {
        this.speed = Math.max(0, this.speed - this.drag * delta);
      } else if (this.speed < 0) {
        this.speed = Math.min(0, this.speed + this.drag * delta);
      }
    }

    // Handbrake physics: reduce speed and introduce drift rotation
    if (handbrake && Math.abs(this.speed) > 2) {
      this.speed *= (1 - delta * 0.8);
      this.driftSlip = THREE.MathUtils.lerp(this.driftSlip, 0.85, delta * 5);
    } else {
      this.driftSlip = THREE.MathUtils.lerp(this.driftSlip, 0, delta * 6);
    }

    // Angular turning based on speed and steer angle (reduced authority when airborne)
    const turnFactor = Math.min(Math.abs(this.speed) / 6.0, 1.0) * Math.sign(this.speed);
    const driftMultiplier = 1.0 + this.driftSlip * 1.5;
    const airSteerFactor = this.isAirborne ? 0.35 : 1.0;

    this.rotationY += steer * this.steerSpeed * turnFactor * driftMultiplier * airSteerFactor * delta;

    // Forward motion vector
    const forwardX = -Math.sin(this.rotationY);
    const forwardZ = -Math.cos(this.rotationY);

    const nextX = this.position.x + forwardX * this.speed * delta;
    const nextZ = this.position.z + forwardZ * this.speed * delta;

    // Collision check against city obstacles
    const testY = Math.max(0.8, this.position.y);
    const coll = this.city.checkCollision(new THREE.Vector3(nextX, testY, nextZ), 1.6);
    if (!coll.collided) {
      this.position.x = nextX;
      this.position.z = nextZ;
    } else {
      // Bounce recoil and lose speed
      this.speed = -this.speed * 0.3;
      if (this.audio) this.audio.playPunch();
    }

    // Vertical physics & Gravity
    this.position.y += this.verticalVelocity * delta;

    const groundH = this.getGroundHeight(this.position.x, this.position.z);
    const targetGroundY = groundH + 0.45;

    if (this.position.y > targetGroundY + 0.05) {
      this.isAirborne = true;
      this.verticalVelocity += this.gravity * delta;
    } else {
      if (this.isAirborne) {
        // Landing smoothly from jump
        if (Math.abs(this.verticalVelocity) > 8.0 && this.audio && this.isOccupied) {
          this.audio.playPunch();
        }
      }
      this.position.y = targetGroundY;
      this.verticalVelocity = 0;
      this.isAirborne = false;
    }

    // Check stunt ramp triggers
    if (!this.isAirborne && Math.abs(this.speed) > 10.0) {
      const rampPositions = [
        new THREE.Vector3(-92, 0, -60),
        new THREE.Vector3(2, 0, 40)
      ];
      if (this.city && this.city.stuntRamps) {
        this.city.stuntRamps.forEach(r => {
          if (r && r.position && !rampPositions.some(p => p.distanceTo(r.position) < 2)) {
            rampPositions.push(r.position);
          }
        });
      }

      for (const rPos of rampPositions) {
        if (this.position.distanceTo(rPos) < 5.5) {
          const upward = Math.min(12.0 + Math.abs(this.speed) * 0.28, 22.0);
          const boost = 5.0;
          this.applyJumpImpulse(upward, boost);
          break;
        }
      }
    }

    // Vehicle-to-vehicle collision detection
    this.resolveVehicleCollisions(otherCars);

    // Update wheel spinning
    const wheelRotSpeed = (this.speed / 0.38) * delta;
    this.wheels.forEach(w => {
      w.tire.rotation.x += wheelRotSpeed;
    });

    // Body roll and pitch simulation
    const rollAngle = -steer * (this.speed / this.maxSpeed) * 0.08;
    let pitchAngle = (throttle > 0 ? -0.03 : (throttle < 0 ? 0.05 : 0));
    if (this.isAirborne) {
      // Dynamic airborne pitch: slight nose-up during rise, nose-down during fall
      pitchAngle = THREE.MathUtils.clamp(-this.verticalVelocity * 0.025, -0.35, 0.25);
    }
    this.chassis.rotation.z = THREE.MathUtils.lerp(this.chassis.rotation.z, rollAngle, delta * 8);
    this.chassis.rotation.x = THREE.MathUtils.lerp(this.chassis.rotation.x, pitchAngle, delta * 8);

    // Sync mesh transform
    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotationY;

    // Driver visibility
    if (this.driverMesh) {
      this.driverMesh.visible = this.isOccupied;
    }

    // Audio RPM update
    if (this.isOccupied && this.audio) {
      this.calculateRPM();
      this.audio.updateEngine(this.rpm / 7500, Math.abs(throttle), true);
      this.audio.updateTires(this.driftSlip);
    }

    // Police lights flashing
    if (this.isPolice && this.sirenOn) {
      const flash = (Math.floor(performance.now() * 0.008) % 2 === 0);
      this.policeRed.material.color.setHex(flash ? 0xff0022 : 0x220000);
      this.policeBlue.material.color.setHex(flash ? 0x002244 : 0x0077ff);
    }
  }

  calculateRPM() {
    const absSpeed = Math.abs(this.speed);
    if (absSpeed < 8) {
      this.gear = 1;
      this.rpm = 900 + (absSpeed / 8) * 4500;
    } else if (absSpeed < 17) {
      this.gear = 2;
      this.rpm = 2200 + ((absSpeed - 8) / 9) * 4500;
    } else if (absSpeed < 27) {
      this.gear = 3;
      this.rpm = 2500 + ((absSpeed - 17) / 10) * 4600;
    } else if (absSpeed < 37) {
      this.gear = 4;
      this.rpm = 2800 + ((absSpeed - 27) / 10) * 4400;
    } else {
      this.gear = 5;
      this.rpm = 3200 + Math.min((absSpeed - 37) / 10, 1.0) * 4300;
    }
  }

  toggleHeadlights() {
    this.headlightsOn = !this.headlightsOn;
    if (this.headlightSpot) {
      this.headlightSpot.visible = this.headlightsOn;
    }
  }

  getSpeedMPH() {
    return Math.round(Math.abs(this.speed) * 2.237);
  }
}
