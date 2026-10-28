import * as THREE from 'three';

export class WeaponSystem {
  constructor(scene, camera, character, audio, impactEffects, peds, police, traffic, playerCar = null) {
    this.scene = scene;
    this.camera = camera;
    this.character = character;
    this.audio = audio;
    this.effects = impactEffects;
    this.peds = peds;
    this.police = police;
    this.traffic = traffic;
    this.playerCar = playerCar;

    this.weapons = [
      { id: 'fists', name: 'FISTS', icon: '👊', ammo: Infinity, maxAmmo: Infinity, damage: 20, fireRate: 0.4, isAuto: false },
      { id: 'pistol', name: 'COMBAT PISTOL', icon: '🔫', ammo: 12, maxAmmo: 120, damage: 35, fireRate: 0.28, isAuto: false },
      { id: 'smg', name: 'MICRO SMG', icon: '⚡', ammo: 30, maxAmmo: 300, damage: 22, fireRate: 0.11, isAuto: true }
    ];

    this.currentIndex = 1; // Default to Combat Pistol
    this.lastFireTime = 0;
    this.raycaster = new THREE.Raycaster();

    // Muzzle flash light
    this.muzzleLight = new THREE.PointLight(0xffaa22, 0, 10);
    this.scene.add(this.muzzleLight);
    this.muzzleTimer = 0;

    this.buildWeaponModels();
    this.equipWeapon(this.currentIndex);
  }

  buildWeaponModels() {
    // Pistol Model
    this.pistolMesh = new THREE.Group();
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x1f232b, metalness: 0.85, roughness: 0.25 });
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.1, 0.32), gunMat);
    slide.position.set(0, 0.05, -0.06);
    this.pistolMesh.add(slide);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.1), gunMat);
    grip.position.set(0, -0.08, 0.04);
    grip.rotation.x = -0.2;
    this.pistolMesh.add(grip);

    // SMG Model
    this.smgMesh = new THREE.Group();
    const smgBody = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.14, 0.42), gunMat);
    smgBody.position.set(0, 0.05, -0.1);
    this.smgMesh.add(smgBody);
    const smgGrip = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.1), gunMat);
    smgGrip.position.set(0, -0.1, 0.02);
    smgGrip.rotation.x = -0.2;
    this.smgMesh.add(smgGrip);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.25, 0.08), gunMat);
    mag.position.set(0, -0.18, -0.08);
    this.smgMesh.add(mag);
  }

  equipWeapon(index) {
    this.currentIndex = index;
    const currentWep = this.weapons[this.currentIndex];

    // Clear weapon socket
    while (this.character.weaponSocket.children.length > 0) {
      this.character.weaponSocket.remove(this.character.weaponSocket.children[0]);
    }

    if (currentWep.id === 'pistol') {
      this.character.weaponSocket.add(this.pistolMesh);
    } else if (currentWep.id === 'smg') {
      this.character.weaponSocket.add(this.smgMesh);
    }
  }

  nextWeapon() {
    const nextIdx = (this.currentIndex + 1) % this.weapons.length;
    this.equipWeapon(nextIdx);
  }

  prevWeapon() {
    const prevIdx = (this.currentIndex - 1 + this.weapons.length) % this.weapons.length;
    this.equipWeapon(prevIdx);
  }

  getCurrentWeapon() {
    return this.weapons[this.currentIndex];
  }

  update(delta, input) {
    if (this.character.inVehicle) return;

    // Number keys 1, 2, 3
    if (input.wasKeyJustPressed('Digit1')) this.equipWeapon(0);
    if (input.wasKeyJustPressed('Digit2')) this.equipWeapon(1);
    if (input.wasKeyJustPressed('Digit3')) this.equipWeapon(2);

    const wheel = input.consumeWheelDelta();
    if (wheel > 0) this.nextWeapon();
    if (wheel < 0) this.prevWeapon();

    const wep = this.getCurrentWeapon();
    const now = performance.now() * 0.001;

    // Aiming state
    const isAiming = input.isMouseButtonDown(2); // Right mouse button
    this.character.isAiming = isAiming;

    // Firing
    const wantsToFire = wep.isAuto ? input.isMouseButtonDown(0) : input.mouseButtons[0];
    if (wantsToFire && (now - this.lastFireTime) >= wep.fireRate) {
      if (wep.id === 'fists') {
        this.punch();
      } else {
        this.shoot();
      }
      this.lastFireTime = now;
      if (!wep.isAuto) {
        input.mouseButtons[0] = false; // consume single click
      }
    }

    // Muzzle flash decay
    if (this.muzzleTimer > 0) {
      this.muzzleTimer -= delta;
      if (this.muzzleTimer <= 0) {
        this.muzzleLight.intensity = 0;
      }
    }
  }

  punch() {
    this.character.triggerPunch();
    if (this.audio) this.audio.playPunch();

    // Check melee hit range in front of character
    const punchPos = this.character.position.clone().add(
      new THREE.Vector3(
        Math.sin(this.character.rotationY) * 1.5,
        1.2,
        Math.cos(this.character.rotationY) * 1.5
      )
    );

    for (let i = 0; i < this.peds.pedestrians.length; i++) {
      const p = this.peds.pedestrians[i];
      if (p.state !== 'DOWN' && p.position.distanceTo(punchPos) < 2.0) {
        this.peds.takeDamage(p, 25, () => {
          this.police.addCrime(1);
        });
        if (this.audio) this.audio.playHitMarker();
        this.triggerHitMarkerUI();
        break;
      }
    }
  }

  shoot() {
    const wep = this.getCurrentWeapon();
    if (wep.ammo <= 0) return;
    wep.ammo--;

    // Audio
    if (this.audio) {
      this.audio.playGunshot(wep.isAuto);
    }

    // Alert pedestrians and police
    if (this.peds && typeof this.peds.alertNearby === 'function') {
      this.peds.alertNearby(this.character.position, 35.0);
    }
    if (this.police && typeof this.police.addCrime === 'function') {
      this.police.addCrime(1);
    }

    // Muzzle Flash
    const muzzlePos = new THREE.Vector3();
    this.character.weaponSocket.getWorldPosition(muzzlePos);
    this.muzzleLight.position.copy(muzzlePos);
    this.muzzleLight.intensity = 4.0;
    this.muzzleTimer = 0.06;

    // Raycast from Camera center (screen crosshair)
    this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);

    // 1. Building occlusion check FIRST: determine nearest building intersection distance
    let buildingHitDist = Infinity;
    let buildingHit = null;

    const buildingMeshes = (this.character.city && this.character.city.buildingMeshes) ? this.character.city.buildingMeshes : [];
    if (buildingMeshes.length > 0) {
      const bIntersects = this.raycaster.intersectObjects(buildingMeshes, false);
      if (bIntersects.length > 0) {
        buildingHit = bIntersects[0];
        buildingHitDist = buildingHit.distance;
      }
    }

    // 2. Target check: Pedestrians (only register hit if pedDist < buildingHitDist!)
    let nearestPed = null;
    let nearestPedDist = Infinity;
    let nearestPedPos = null;

    if (this.peds && this.peds.pedestrians) {
      for (let i = 0; i < this.peds.pedestrians.length; i++) {
        const p = this.peds.pedestrians[i];
        if (p.state === 'DOWN') continue;

        const pPos = p.position.clone().add(new THREE.Vector3(0, 1.0, 0));
        const distToRay = this.raycaster.ray.distanceToPoint(pPos);
        const distFromCam = this.camera.position.distanceTo(pPos);

        if (distToRay < 0.8 && distFromCam < 90.0 && distFromCam < buildingHitDist) {
          if (distFromCam < nearestPedDist) {
            nearestPedDist = distFromCam;
            nearestPed = p;
            nearestPedPos = pPos;
          }
        }
      }
    }

    // 3. Target check: Vehicles (traffic, police, and player car if not inside)
    const candidateVehicles = [];
    if (this.traffic && this.traffic.vehicles) {
      for (let i = 0; i < this.traffic.vehicles.length; i++) {
        const v = this.traffic.vehicles[i];
        if (v && v.mesh) candidateVehicles.push(v);
      }
    }
    if (this.police && this.police.policeCars) {
      for (let i = 0; i < this.police.policeCars.length; i++) {
        const v = this.police.policeCars[i];
        if (v && v.mesh) candidateVehicles.push(v);
      }
    }
    if (!this.character.inVehicle) {
      const pCar = this.getPlayerCar();
      if (pCar && pCar.mesh && !candidateVehicles.includes(pCar)) {
        candidateVehicles.push(pCar);
      }
    }

    let nearestVehicleHit = null;
    let nearestVehicle = null;
    let nearestVehicleDist = Infinity;

    for (let i = 0; i < candidateVehicles.length; i++) {
      const v = candidateVehicles[i];
      const vPos = v.position || v.mesh.position;

      // Distance culling before detailed mesh raycasting
      const distCam = this.camera.position.distanceTo(vPos);
      if (distCam > 120.0 || distCam > buildingHitDist + 6.0) continue;

      const distToRay = this.raycaster.ray.distanceToPoint(vPos);
      if (distToRay > 6.0) continue;

      const vIntersects = this.raycaster.intersectObject(v.mesh, true);
      if (vIntersects.length > 0) {
        const hit = vIntersects[0];
        if (hit.distance < buildingHitDist && hit.distance < nearestVehicleDist) {
          nearestVehicleDist = hit.distance;
          nearestVehicleHit = hit;
          nearestVehicle = v;
        }
      }
    }

    // 4. Resolve hit priority based on nearest distance
    if (nearestPed && nearestPedDist < nearestVehicleDist) {
      // Hit Pedestrian
      this.peds.takeDamage(nearestPed, wep.damage, () => {
        if (this.police) this.police.addCrime(2);
      });
      if (this.effects) {
        this.effects.createImpactSparks(nearestPedPos);
      }
      if (this.audio) this.audio.playHitMarker();
      this.triggerHitMarkerUI();
    } else if (nearestVehicle && nearestVehicleDist <= nearestPedDist) {
      // Hit Vehicle before building
      let sparkNormal = null;
      if (nearestVehicleHit.face) {
        sparkNormal = nearestVehicleHit.face.normal.clone();
        sparkNormal.transformDirection(nearestVehicleHit.object.matrixWorld);
      }
      if (this.effects) {
        this.effects.createImpactSparks(nearestVehicleHit.point, sparkNormal);
      }

      // Hit marker sound & UI
      if (this.audio) this.audio.playHitMarker();
      this.triggerHitMarkerUI();

      // Metal impact audio
      this.playMetalImpactAudio();

      // Vehicle impulse / recoil & tire pop
      this.applyVehicleImpact(nearestVehicle, nearestVehicleHit);

      // Crime check: add wanted crime if civilian or police car
      const isPlayerCar = (nearestVehicle === this.playerCar) || (nearestVehicle.isPlayerCar === true);
      if (!isPlayerCar && this.police) {
        this.police.addCrime(1);
      }
    } else if (buildingHit && buildingHitDist < 120.0) {
      // Hit Building
      if (this.effects) {
        this.effects.createImpactSparks(buildingHit.point, buildingHit.face ? buildingHit.face.normal : null);
      }
    }
  }

  applyVehicleImpact(vehicle, hit) {
    if (!vehicle) return;

    // Check if a wheel / tire was hit
    if (vehicle.wheels && Array.isArray(vehicle.wheels)) {
      for (let i = 0; i < vehicle.wheels.length; i++) {
        const w = vehicle.wheels[i];
        if (!w) continue;
        if (w.tire === hit.object || w.group === hit.object || hit.object.parent === w.group) {
          if (w.tire) {
            w.tire.scale.set(0.65, 0.65, 0.65); // Deflate tire
          }
          if (this.effects && typeof this.effects.createTireSmoke === 'function') {
            this.effects.createTireSmoke(hit.point);
          }
          if (typeof vehicle.maxSpeed === 'number') {
            vehicle.maxSpeed = Math.max(8, vehicle.maxSpeed * 0.75);
          }
          if (typeof vehicle.speed === 'number') {
            vehicle.speed *= 0.65;
          }
          break;
        }
      }
    }

    // Apply impulse along shot direction
    const shotDir = this.raycaster.ray.direction;
    if (vehicle.position) {
      vehicle.position.x += shotDir.x * 0.08;
      vehicle.position.z += shotDir.z * 0.08;
    }
    if (typeof vehicle.speed === 'number') {
      const rot = vehicle.rotationY || 0;
      const forwardX = -Math.sin(rot);
      const forwardZ = -Math.cos(rot);
      const dot = shotDir.x * forwardX + shotDir.z * forwardZ;
      vehicle.speed += dot * 1.5;
    }
    if (vehicle.chassis) {
      vehicle.chassis.rotation.z += (Math.random() - 0.5) * 0.06;
      vehicle.chassis.rotation.x += (Math.random() - 0.5) * 0.06;
    }
  }

  playMetalImpactAudio() {
    if (!this.audio) return;
    if (typeof this.audio.playMetalImpact === 'function') {
      this.audio.playMetalImpact();
      return;
    }
    // Synthesize metallic bullet ricochet / clank via Web Audio API
    if (!this.audio.ctx) return;
    try {
      const ctx = this.audio.ctx;
      const t = ctx.currentTime;

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(1800, t);
      osc.frequency.exponentialRampToValueAtTime(320, t + 0.09);

      const filter = ctx.createBiquadFilter();
      filter.type = 'highpass';
      filter.frequency.setValueAtTime(900, t);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.audio.masterGain || ctx.destination);

      osc.start(t);
      osc.stop(t + 0.11);
    } catch (e) {
      // AudioContext state check
    }
  }

  getPlayerCar() {
    if (this.playerCar) return this.playerCar;
    if (this.character && this.character.currentVehicle) {
      this.playerCar = this.character.currentVehicle;
      return this.playerCar;
    }
    if (this.scene) {
      const trafficMeshes = new Set(this.traffic && this.traffic.vehicles ? this.traffic.vehicles.map(v => v.mesh) : []);
      const policeMeshes = new Set(this.police && this.police.policeCars ? this.police.policeCars.map(v => v.mesh) : []);

      for (let i = 0; i < this.scene.children.length; i++) {
        const obj = this.scene.children[i];
        if (obj && obj.isGroup && !trafficMeshes.has(obj) && !policeMeshes.has(obj) && obj !== this.character.mesh && (!this.effects || obj !== this.effects.sparkGroup)) {
          const hasChassis = obj.children && obj.children.some(c => c.isMesh && c.geometry && c.geometry.type === 'BoxGeometry' && c.geometry.parameters && Math.abs(c.geometry.parameters.width - 2.1) < 0.2);
          if (hasChassis) {
            return {
              mesh: obj,
              position: obj.position,
              rotationY: obj.rotation.y,
              isPlayerCar: true
            };
          }
        }
      }
    }
    return null;
  }

  triggerHitMarkerUI() {
    const marker = document.getElementById('hit-marker');
    if (marker) {
      marker.classList.add('active');
      setTimeout(() => marker.classList.remove('active'), 120);
    }
  }
}
