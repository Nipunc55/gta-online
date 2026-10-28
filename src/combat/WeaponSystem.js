import * as THREE from 'three';

// 5-weapon GTA arsenal with magazine capacity, reserve ammo, reload ([R]),
// spread & camera recoil, bullet tracers, and occluded raycasting against
// buildings, NPCs (with headshot bonus), and vehicles.

export class WeaponSystem {
  constructor(scene, camera, cameraController, player, colliders, audio, effects, pedestrians, police, traffic) {
    this.scene = scene;
    this.camera = camera;
    this.cameraController = cameraController;
    this.player = player;
    this.colliders = colliders;
    this.audio = audio;
    this.effects = effects;
    this.pedestrians = pedestrians;
    this.police = police;
    this.traffic = traffic;

    this.weapons = [
      {
        id: 'fists',
        name: 'UNARMED',
        icon: '👊',
        damage: 34,
        range: 2.3,
        fireRate: 0.42,
        spread: 0,
        pellets: 1,
        recoil: 0,
        magSize: Infinity,
        clip: Infinity,
        reserve: Infinity,
        reloadTime: 0,
        isAuto: false
      },
      {
        id: 'pistol',
        name: 'COMBAT PISTOL',
        icon: '🔫',
        damage: 38,
        range: 95,
        fireRate: 0.22,
        spread: 0.012,
        pellets: 1,
        recoil: 0.016,
        magSize: 12,
        clip: 12,
        reserve: 120,
        reloadTime: 1.1,
        isAuto: false
      },
      {
        id: 'smg',
        name: 'MICRO SMG',
        icon: '⚡',
        damage: 24,
        range: 80,
        fireRate: 0.095,
        spread: 0.028,
        pellets: 1,
        recoil: 0.011,
        magSize: 30,
        clip: 30,
        reserve: 240,
        reloadTime: 1.35,
        isAuto: true
      },
      {
        id: 'shotgun',
        name: 'PUMP SHOTGUN',
        icon: '💥',
        damage: 18,
        range: 42,
        fireRate: 0.78,
        spread: 0.068,
        pellets: 7,
        recoil: 0.045,
        magSize: 8,
        clip: 8,
        reserve: 64,
        reloadTime: 1.6,
        isAuto: false
      },
      {
        id: 'rifle',
        name: 'CARBINE RIFLE',
        icon: '🎯',
        damage: 34,
        range: 135,
        fireRate: 0.11,
        spread: 0.015,
        pellets: 1,
        recoil: 0.015,
        magSize: 30,
        clip: 30,
        reserve: 270,
        reloadTime: 1.5,
        isAuto: true
      }
    ];

    this.currentIndex = 1; // Combat Pistol by default
    this.cooldown = 0;
    this.reloadTimer = 0;
    this.isReloading = false;

    this.weaponMeshes = {};
    this.buildWeaponMeshes();
    this.equipWeapon(1);

    this.muzzleLight = new THREE.PointLight(0xffaa33, 0, 7);
    this.scene.add(this.muzzleLight);
    this.muzzleTimer = 0;
  }

  buildWeaponMeshes() {
    const gunMetal = new THREE.MeshStandardMaterial({ color: 0x22262b, metalness: 0.8, roughness: 0.3 });
    const darkGrip = new THREE.MeshStandardMaterial({ color: 0x121316, roughness: 0.85 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6e4225, roughness: 0.7 });

    // Local -Z is forward out of the hand
    const pistol = new THREE.Group();
    const pSlide = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.26), gunMetal);
    pSlide.position.set(0, 0.04, -0.10);
    const pGrip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.14, 0.07), darkGrip);
    pGrip.position.set(0, -0.04, -0.02);
    pGrip.rotation.x = -0.2;
    pistol.add(pSlide, pGrip);
    this.weaponMeshes.pistol = pistol;

    const smg = new THREE.Group();
    const sBody = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.10, 0.34), gunMetal);
    sBody.position.set(0, 0.04, -0.12);
    const sMag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.20, 0.06), darkGrip);
    sMag.position.set(0, -0.09, -0.12);
    smg.add(sBody, sMag);
    this.weaponMeshes.smg = smg;

    const shotgun = new THREE.Group();
    const shBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.68), gunMetal);
    shBarrel.position.set(0, 0.04, -0.28);
    const shPump = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.065, 0.22), woodMat);
    shPump.position.set(0, 0.01, -0.32);
    const shStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.11, 0.22), woodMat);
    shStock.position.set(0, -0.01, 0.04);
    shotgun.add(shBarrel, shPump, shStock);
    this.weaponMeshes.shotgun = shotgun;

    const rifle = new THREE.Group();
    const rBody = new THREE.Mesh(new THREE.BoxGeometry(0.065, 0.10, 0.62), gunMetal);
    rBody.position.set(0, 0.04, -0.24);
    const rMag = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.18, 0.075), darkGrip);
    rMag.position.set(0, -0.08, -0.20);
    rMag.rotation.x = 0.2;
    const rStock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.10, 0.20), darkGrip);
    rStock.position.set(0, 0.02, 0.05);
    rifle.add(rBody, rMag, rStock);
    this.weaponMeshes.rifle = rifle;

    Object.values(this.weaponMeshes).forEach((m) => {
      m.visible = false;
      this.player.weaponSocket.add(m);
    });
  }

  equipWeapon(index) {
    if (index < 0 || index >= this.weapons.length) return;
    this.currentIndex = index;
    this.isReloading = false;
    this.reloadTimer = 0;
    const w = this.weapons[index];
    Object.keys(this.weaponMeshes).forEach((k) => {
      this.weaponMeshes[k].visible = k === w.id;
    });
  }

  getCurrentWeapon() {
    return this.weapons[this.currentIndex];
  }

  refillAllAmmo() {
    for (const w of this.weapons) {
      if (w.magSize !== Infinity) {
        w.clip = w.magSize;
        w.reserve = w.magSize * 10;
      }
    }
  }

  startReload() {
    const w = this.getCurrentWeapon();
    if (w.magSize === Infinity || this.isReloading) return;
    if (w.clip >= w.magSize || w.reserve <= 0) return;
    this.isReloading = true;
    this.reloadTimer = w.reloadTime;
    if (this.audio) this.audio.play('reload', 0.9);
  }

  update(dt, input, allCars = []) {
    if (this.cooldown > 0) this.cooldown -= dt;
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= dt;
      if (this.muzzleTimer <= 0) this.muzzleLight.intensity = 0;
    }

    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        const w = this.getCurrentWeapon();
        const needed = w.magSize - w.clip;
        const take = Math.min(needed, w.reserve);
        w.clip += take;
        w.reserve -= take;
        this.isReloading = false;
      }
    }

    if (this.player.inVehicle || !this.player.isAlive) {
      this.player.isAiming = false;
      this.player.isFiring = false;
      return;
    }

    // Hotkeys 1..5 & scroll wheel
    if (input.wasKeyJustPressed('Digit1')) this.equipWeapon(0);
    if (input.wasKeyJustPressed('Digit2')) this.equipWeapon(1);
    if (input.wasKeyJustPressed('Digit3')) this.equipWeapon(2);
    if (input.wasKeyJustPressed('Digit4')) this.equipWeapon(3);
    if (input.wasKeyJustPressed('Digit5')) this.equipWeapon(4);
    if (input.wasKeyJustPressed('KeyR')) this.startReload();

    const wheel = input.consumeWheelDelta();
    if (wheel !== 0) {
      const next = (this.currentIndex + wheel + this.weapons.length) % this.weapons.length;
      this.equipWeapon(next);
    }

    const wep = this.getCurrentWeapon();
    const rightClick = input.isMouseButtonDown(2);
    const leftDown = input.isMouseButtonDown(0);
    const leftJust = input.wasMouseJustPressed(0);

    this.player.isAiming = rightClick && wep.id !== 'fists';
    const wantFire = wep.isAuto ? leftDown : leftJust;
    this.player.isFiring = leftDown && wep.id !== 'fists' && !this.isReloading;

    if (wantFire && this.cooldown <= 0 && !this.isReloading) {
      this.fire(wep, allCars);
      this.cooldown = wep.fireRate;
    }
  }

  fire(wep, allCars) {
    if (wep.id === 'fists') {
      this.player.triggerPunch();
      if (this.audio) this.audio.play('punch', 0.9);
      this.performMeleeHit(wep);
      return;
    }

    if (wep.clip <= 0) {
      if (wep.reserve > 0) {
        this.startReload();
      } else if (this.audio) {
        this.audio.play('empty', 0.8);
      }
      return;
    }

    wep.clip--;
    if (wep.clip === 0 && wep.reserve > 0) {
      // Auto-reload when magazine empties
      setTimeout(() => this.startReload(), 160);
    }

    if (this.audio) this.audio.play('gunshot', 1.0, wep.isAuto);

    // Muzzle flash at player hand
    const muzzleWorld = new THREE.Vector3();
    this.player.weaponSocket.getWorldPosition(muzzleWorld);
    this.muzzleLight.position.copy(muzzleWorld);
    this.muzzleLight.intensity = 4.5;
    this.muzzleTimer = 0.055;

    // Alert nearby pedestrians and police
    if (this.pedestrians) this.pedestrians.alertGunshot(this.player.position, 42);
    if (this.police) this.police.addCrime(1);

    // Camera recoil kick
    if (this.cameraController && wep.recoil > 0) {
      this.cameraController.addRecoil(wep.recoil, (Math.random() - 0.5) * wep.recoil * 0.7);
      this.cameraController.addShake(wep.id === 'shotgun' ? 0.25 : 0.08);
    }

    // Fire pellet(s) from camera center with spread cone
    const camPos = this.camera.position;
    const baseDir = new THREE.Vector3();
    this.camera.getWorldDirection(baseDir);

    let confirmedHit = false;
    for (let p = 0; p < wep.pellets; p++) {
      const dir = baseDir.clone();
      if (wep.spread > 0) {
        dir.x += (Math.random() - 0.5) * wep.spread;
        dir.y += (Math.random() - 0.5) * wep.spread;
        dir.z += (Math.random() - 0.5) * wep.spread;
        dir.normalize();
      }
      if (this.castBulletRay(camPos, dir, muzzleWorld, wep.range, wep.damage, allCars)) {
        confirmedHit = true;
      }
    }

    if (confirmedHit) {
      this.triggerHitMarkerUI();
      if (this.audio) this.audio.play('hit', 0.8);
    }
  }

  performMeleeHit(wep) {
    const fx = -Math.sin(this.player.rotationY);
    const fz = -Math.cos(this.player.rotationY);
    const hitCenter = new THREE.Vector3(
      this.player.position.x + fx * 1.15,
      this.player.position.y + 1.0,
      this.player.position.z + fz * 1.15
    );
    if (!this.pedestrians) return;
    for (const ped of this.pedestrians.pedestrians) {
      if (ped.state === 'DEAD') continue;
      if (ped.position.distanceTo(hitCenter) < 1.55) {
        const killed = this.pedestrians.damagePedestrian(ped, wep.damage, { x: fx, z: fz }, this.effects);
        this.triggerHitMarkerUI();
        if (this.audio) this.audio.play('hit', 0.8);
        if (this.police) this.police.addCrime(killed ? 2 : 1);
        break;
      }
    }
  }

  /**
   * Raycast a single bullet against:
   * 1) Static buildings/props (via spatial hash DDA)
   * 2) All living NPC cylinders (with headshot detection)
   * 3) All vehicles (bounding sphere/box test)
   * Applies effect solely to the closest intersection so walls block bullets!
   */
  castBulletRay(origin, dir, muzzleWorld, maxDist, damage, allCars) {
    let bestT = maxDist;
    let bestType = null; // 'world' | 'ped' | 'car'
    let bestTarget = null;
    let isHeadshot = false;

    // 1. World geometry
    if (this.colliders) {
      const worldHit = this.colliders.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, maxDist);
      if (worldHit && worldHit.t < bestT) {
        bestT = worldHit.t;
        bestType = 'world';
      }
    }
    // Ground plane intersection
    if (dir.y < -1e-4) {
      const tGround = (0 - origin.y) / dir.y;
      if (tGround > 0 && tGround < bestT) {
        bestT = tGround;
        bestType = 'world';
      }
    }

    // 2. Pedestrians (vertical capsule/cylinder check)
    if (this.pedestrians) {
      for (let i = 0; i < this.pedestrians.pedestrians.length; i++) {
        const ped = this.pedestrians.pedestrians[i];
        if (ped.state === 'DEAD') continue;
        // Closest approach of ray to pedestrian vertical axis in XZ
        const rx = ped.position.x - origin.x;
        const rz = ped.position.z - origin.z;
        const tProj = rx * dir.x + rz * dir.z;
        if (tProj < 1.0 || tProj >= bestT) continue;
        const hitX = origin.x + dir.x * tProj;
        const hitY = origin.y + dir.y * tProj;
        const hitZ = origin.z + dir.z * tProj;
        const d2 = (hitX - ped.position.x) ** 2 + (hitZ - ped.position.z) ** 2;
        if (d2 <= 0.42 * 0.42 && hitY >= ped.position.y && hitY <= ped.position.y + 1.85) {
          bestT = tProj;
          bestType = 'ped';
          bestTarget = ped;
          isHeadshot = hitY >= ped.position.y + 1.38;
        }
      }
    }

    // 3. Vehicles
    if (allCars) {
      for (let i = 0; i < allCars.length; i++) {
        const car = allCars[i];
        if (car.driver === 'player') continue;
        const cx = car.position.x - origin.x;
        const cy = (car.position.y + 0.75) - origin.y;
        const cz = car.position.z - origin.z;
        const tProj = cx * dir.x + cy * dir.y + cz * dir.z;
        if (tProj < 1.2 || tProj >= bestT) continue;
        const hx = origin.x + dir.x * tProj;
        const hy = origin.y + dir.y * tProj;
        const hz = origin.z + dir.z * tProj;
        if (
          Math.abs(hx - car.position.x) < car.halfW * 1.15 &&
          Math.abs(hz - car.position.z) < car.halfL * 1.05 &&
          hy >= car.position.y &&
          hy <= car.position.y + 1.65
        ) {
          bestT = tProj;
          bestType = 'car';
          bestTarget = car;
        }
      }
    }

    const hitPos = new THREE.Vector3(
      origin.x + dir.x * bestT,
      origin.y + dir.y * bestT,
      origin.z + dir.z * bestT
    );

    if (this.effects) {
      this.effects.spawnTracer(muzzleWorld, hitPos);
    }

    if (bestType === 'ped' && bestTarget) {
      const finalDmg = isHeadshot ? damage * 2.2 : damage;
      const killed = this.pedestrians.damagePedestrian(bestTarget, finalDmg, dir, this.effects);
      if (this.police && killed) {
        this.police.addCrime(bestTarget.role === 'police' ? 4 : 2);
      }
      return true;
    }

    if (bestType === 'car' && bestTarget) {
      if (this.effects) this.effects.createImpactSparks(hitPos);
      bestTarget.takeDamage(damage, this.effects, (explodedCar) => {
        this.handleExplosionSplash(explodedCar.position, allCars);
      });
      return true;
    }

    if (bestType === 'world' && this.effects) {
      this.effects.createImpactSparks(hitPos);
    }
    return false;
  }

  handleExplosionSplash(center, allCars) {
    if (this.cameraController) this.cameraController.addShake(0.8);
    if (this.police) this.police.addCrime(3);
    if (this.pedestrians) {
      this.pedestrians.alertGunshot(center, 60);
      for (const ped of this.pedestrians.pedestrians) {
        const d = ped.position.distanceTo(center);
        if (d < 9) {
          this.pedestrians.damagePedestrian(ped, (10 - d) * 25, null, this.effects);
        }
      }
    }
    const dp = this.player.position.distanceTo(center);
    if (dp < 9) {
      this.player.takeDamage((9 - dp) * 10, 'explosion');
    }
  }

  triggerHitMarkerUI() {
    const hm = document.getElementById('hit-marker');
    if (hm) {
      hm.classList.add('active');
      clearTimeout(this._hmTimeout);
      this._hmTimeout = setTimeout(() => hm.classList.remove('active'), 110);
    }
  }
}
