import * as THREE from 'three';

export class Character {
  constructor(scene, city) {
    this.scene = scene;
    this.city = city;

    this.position = new THREE.Vector3(110, 0, 30);
    this.velocity = new THREE.Vector3();
    this.rotationY = 0;

    // Movement attributes
    this.walkSpeed = 4.5;
    this.runSpeed = 9.0;
    this.jumpForce = 7.5;
    this.gravity = -20.0;
    this.isGrounded = true;

    // Vitals
    this.health = 100;
    this.maxHealth = 100;
    this.armor = 100;
    this.maxArmor = 100;
    this.stamina = 100;
    this.maxStamina = 100;

    // States
    this.isAlive = true;
    this.inVehicle = false;
    this.currentVehicle = null;
    this.isAiming = false;
    this.isPunching = false;
    this.punchTimer = 0;

    // Animation state
    this.animTime = 0;
    this.isMoving = false;
    this.isSprinting = false;

    this.buildCharacterMesh();
  }

  buildCharacterMesh() {
    this.mesh = new THREE.Group();

    // Materials
    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd99b7b, roughness: 0.7 });
    const hairMat = new THREE.MeshStandardMaterial({ color: 0x241711, roughness: 0.8 });
    const shirtMat = new THREE.MeshStandardMaterial({ color: 0x00ccbb, roughness: 0.6 }); // Miami teal top
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1e2738, roughness: 0.8 }); // Dark cargo pants
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });

    // Torso & Hips
    this.torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), shirtMat);
    this.torso.position.y = 1.15;
    this.torso.castShadow = true;
    this.mesh.add(this.torso);

    // Head & Hair
    this.head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.3), skinMat);
    this.head.position.set(0, 0.52, 0);
    this.head.castShadow = true;
    this.torso.add(this.head);

    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.18, 0.34), hairMat);
    hair.position.set(0, 0.12, -0.02);
    this.head.add(hair);

    // Sunglasses
    const glasses = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.08, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.9 })
    );
    glasses.position.set(0, 0.02, 0.14);
    this.head.add(glasses);

    // Left Arm
    this.leftArm = new THREE.Group();
    this.leftArm.position.set(-0.35, 0.25, 0);
    const leftArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), skinMat);
    leftArmMesh.position.y = -0.3;
    leftArmMesh.castShadow = true;
    this.leftArm.add(leftArmMesh);
    this.torso.add(this.leftArm);

    // Right Arm (Weapon Hand)
    this.rightArm = new THREE.Group();
    this.rightArm.position.set(0.35, 0.25, 0);
    const rightArmMesh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.6, 0.16), skinMat);
    rightArmMesh.position.y = -0.3;
    rightArmMesh.castShadow = true;
    this.rightArm.add(rightArmMesh);
    this.torso.add(this.rightArm);

    // Weapon Attachment Socket
    this.weaponSocket = new THREE.Group();
    this.weaponSocket.position.set(0, -0.55, 0.1);
    this.rightArm.add(this.weaponSocket);

    // Left Leg
    this.leftLeg = new THREE.Group();
    this.leftLeg.position.set(-0.16, 0.8, 0);
    const leftLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), pantsMat);
    leftLegMesh.position.y = -0.35;
    leftLegMesh.castShadow = true;
    this.leftLeg.add(leftLegMesh);
    const leftShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), shoeMat);
    leftShoe.position.set(0, -0.72, 0.05);
    leftShoe.castShadow = true;
    this.leftLeg.add(leftShoe);
    this.mesh.add(this.leftLeg);

    // Right Leg
    this.rightLeg = new THREE.Group();
    this.rightLeg.position.set(0.16, 0.8, 0);
    const rightLegMesh = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.2), pantsMat);
    rightLegMesh.position.y = -0.35;
    rightLegMesh.castShadow = true;
    this.rightLeg.add(rightLegMesh);
    const rightShoe = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.3), shoeMat);
    rightShoe.position.set(0, -0.72, 0.05);
    rightShoe.castShadow = true;
    this.rightLeg.add(rightShoe);
    this.mesh.add(this.rightLeg);

    this.mesh.position.copy(this.position);
    this.scene.add(this.mesh);
  }

  update(delta, input, cameraYaw, cameraPitch) {
    if (this.inVehicle || !this.isAlive) {
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;

    // Movement Direction from WASD relative to camera yaw
    let fwd = 0;
    let right = 0;
    if (input.isKeyDown('KeyW')) fwd += 1;
    if (input.isKeyDown('KeyS')) fwd -= 1;
    if (input.isKeyDown('KeyA')) right -= 1;
    if (input.isKeyDown('KeyD')) right += 1;

    const hasInput = fwd !== 0 || right !== 0;
    this.isMoving = hasInput;

    const isSprintKey = input.isKeyDown('ShiftLeft') || input.isKeyDown('ShiftRight');
    this.isSprinting = isSprintKey && hasInput && this.stamina > 5;

    // Stamina regen or drain
    if (this.isSprinting) {
      this.stamina = Math.max(0, this.stamina - delta * 15);
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + delta * 20);
    }

    const currentSpeed = this.isSprinting ? this.runSpeed : this.walkSpeed;

    if (hasInput) {
      const len = Math.hypot(fwd, right);
      const normFwd = fwd / len;
      const normRight = right / len;

      // Camera view vectors projected onto XZ plane
      const camFwdX = -Math.sin(cameraYaw);
      const camFwdZ = -Math.cos(cameraYaw);
      const camRightX = Math.cos(cameraYaw);
      const camRightZ = -Math.sin(cameraYaw);

      const moveDirX = camFwdX * normFwd + camRightX * normRight;
      const moveDirZ = camFwdZ * normFwd + camRightZ * normRight;

      this.velocity.x = moveDirX * currentSpeed;
      this.velocity.z = moveDirZ * currentSpeed;

      // Smooth character rotation towards movement direction
      if (!this.isAiming) {
        const targetYaw = Math.atan2(moveDirX, moveDirZ);
        let diff = targetYaw - this.rotationY;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        this.rotationY += diff * delta * 14;
      }
    } else {
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, 0, delta * 12);
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, 0, delta * 12);
    }

    // Aiming orientation overrides movement facing (aligns with camera crosshair)
    if (this.isAiming) {
      this.rotationY = cameraYaw + Math.PI;
    }

    // Jumping
    if (input.wasKeyJustPressed('Space') && this.isGrounded) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
    }

    // Raycast / Query ground surface elevation (accounting for bridges at y = 1.2 and sidewalks at y = 0.25)
    const groundLevel = this.getGroundHeight(this.position.x, this.position.z);

    // Gravity & Ground Check
    this.velocity.y += this.gravity * delta;
    this.position.y += this.velocity.y * delta;

    if (this.position.y <= groundLevel) {
      this.position.y = groundLevel;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else if (this.position.y > groundLevel + 0.1) {
      this.isGrounded = false;
    }

    // Step-up assistance for small curbs / bridge ramps
    if (this.isGrounded && this.position.y < groundLevel && (groundLevel - this.position.y) <= 0.4) {
      this.position.y = groundLevel;
    }

    // City building collision test
    const nextPosX = this.position.x + this.velocity.x * delta;
    const nextPosZ = this.position.z + this.velocity.z * delta;
    const testY = this.position.y + 1.0;

    if (!this.city.checkCollision(new THREE.Vector3(nextPosX, testY, this.position.z), 0.5).collided) {
      this.position.x = nextPosX;
    }
    if (!this.city.checkCollision(new THREE.Vector3(this.position.x, testY, nextPosZ), 0.5).collided) {
      this.position.z = nextPosZ;
    }

    this.mesh.position.copy(this.position);
    this.mesh.rotation.y = this.rotationY;

    // Procedural skeletal animations
    this.updateAnimations(delta, currentSpeed, cameraPitch);
  }

  updateAnimations(delta, speed, cameraPitch) {
    if (this.isMoving && this.isGrounded) {
      const animFreq = this.isSprinting ? 12 : 7;
      this.animTime += delta * animFreq;

      const legSwing = Math.sin(this.animTime) * 0.7;
      this.leftLeg.rotation.x = legSwing;
      this.rightLeg.rotation.x = -legSwing;

      if (!this.isAiming && !this.isPunching) {
        this.leftArm.rotation.x = -legSwing * 0.8;
        this.rightArm.rotation.x = legSwing * 0.8;
      }

      this.torso.position.y = 1.15 + Math.abs(Math.sin(this.animTime)) * 0.06;
    } else {
      // Idle breathing
      const idle = Math.sin(performance.now() * 0.003) * 0.02;
      this.torso.position.y = 1.15 + idle;
      this.leftLeg.rotation.x = THREE.MathUtils.lerp(this.leftLeg.rotation.x, 0, delta * 8);
      this.rightLeg.rotation.x = THREE.MathUtils.lerp(this.rightLeg.rotation.x, 0, delta * 8);

      if (!this.isAiming && !this.isPunching) {
        this.leftArm.rotation.x = THREE.MathUtils.lerp(this.leftArm.rotation.x, 0, delta * 8);
        this.rightArm.rotation.x = THREE.MathUtils.lerp(this.rightArm.rotation.x, 0, delta * 8);
      }
    }

    // Aiming pose
    if (this.isAiming) {
      this.rightArm.rotation.x = -Math.PI / 2 + (cameraPitch || 0);
      this.rightArm.rotation.y = -0.2;
      this.leftArm.rotation.x = -Math.PI / 2.3;
      this.leftArm.rotation.y = 0.4;
    }

    // Punch animation
    if (this.punchTimer > 0) {
      this.punchTimer -= delta * 5;
      const punchProgress = Math.sin(this.punchTimer * Math.PI);
      this.rightArm.rotation.x = -punchProgress * 1.5;
      this.rightArm.position.z = punchProgress * 0.3;
      if (this.punchTimer <= 0) {
        this.isPunching = false;
        this.rightArm.position.z = 0;
      }
    }
  }

  triggerPunch() {
    this.isPunching = true;
    this.punchTimer = 1.0;
  }

  takeDamage(amount) {
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, amount);
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.health = Math.max(0, this.health - amount);
    if (this.health <= 0) {
      this.die();
    }
  }

  die() {
    this.isAlive = false;
    setTimeout(() => this.respawn(), 3000);
  }

  enterVehicle(vehicle) {
    this.inVehicle = true;
    this.currentVehicle = vehicle;
    this.mesh.visible = false;
    this.position.copy(vehicle.position);
    this.velocity.set(0, 0, 0);
  }

  getGroundHeight(x, z) {
    if (this.city && typeof this.city.getGroundHeight === 'function') {
      const h = this.city.getGroundHeight(x, z);
      if (typeof h === 'number' && !isNaN(h)) return h;
    }
    // Fallback raycast / surface elevation accounting for bridges at y = 1.2 and sidewalks at y = 0.25
    // Bridges over waterways connecting Mainland -> Starfish Island -> Vice Beach
    // Bridge decks at z = -60 and z = 40 (width 16 -> z: [-68, -52] and [32, 48], deck top y = 1.2)
    // Bridge A: Mainland to Starfish Island (x: -180 to -90)
    // Bridge B: Starfish Island to Vice Beach (x: 0 to 40)
    for (const bz of [-60, 40]) {
      if (Math.abs(z - bz) <= 8.5) {
        if ((x >= -180 && x <= -90) || (x >= 0 && x <= 40)) {
          return 1.2;
        }
      }
    }
    // Sidewalks on NS roads (height 0.25)
    const nsRoads = [-340, -260, -180, -45, 40, 110];
    for (const rx of nsRoads) {
      if ((Math.abs(x - (rx - 9.5)) <= 1.6 || Math.abs(x - (rx + 9.5)) <= 1.6) && z >= -300 && z <= 300) {
        return 0.25;
      }
    }
    return 0;
  }

  exitVehicle(exitPos) {
    this.inVehicle = false;
    this.currentVehicle = null;
    const groundLvl = this.getGroundHeight(exitPos.x, exitPos.z);
    exitPos.y = Math.max(exitPos.y - 0.45, groundLvl);
    this.position.copy(exitPos);
    this.mesh.position.copy(exitPos);
    this.mesh.visible = true;
    this.velocity.set(0, 0, 0);
  }

  respawn() {
    this.health = 100;
    this.armor = 50;
    this.stamina = 100;
    this.isAlive = true;
    this.mesh.visible = true;
    const groundLvl = this.getGroundHeight(110, 30);
    this.position.set(110, groundLvl, 30);
    this.velocity.set(0, 0, 0);
  }
}
