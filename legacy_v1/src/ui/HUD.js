export class HUD {
  constructor(character, police, weaponSystem) {
    this.character = character;
    this.police = police;
    this.weapons = weaponSystem;

    // Elements
    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;
    this.healthFill = document.getElementById('health-fill');
    this.armorFill = document.getElementById('armor-fill');
    this.staminaFill = document.getElementById('stamina-fill');
    this.actionPrompt = document.getElementById('action-prompt');
    this.promptText = this.actionPrompt ? this.actionPrompt.querySelector('.prompt-text') : null;
    this.crosshair = document.getElementById('crosshair');

    // Weapon elements
    this.weaponIcon = document.getElementById('weapon-icon');
    this.weaponName = document.getElementById('weapon-name');
    this.weaponAmmo = document.getElementById('weapon-ammo');

    // Wanted stars
    this.stars = document.querySelectorAll('.wanted-star');
    this.playerMarker = document.getElementById('radar-player-marker');
  }

  showActionPrompt(text) {
    if (this.actionPrompt && this.promptText) {
      this.promptText.innerText = text;
      this.actionPrompt.style.display = 'flex';
    }
  }

  hideActionPrompt() {
    if (this.actionPrompt) {
      this.actionPrompt.style.display = 'none';
    }
  }

  update(playerPos, playerRotationY, cameraYaw, trafficCars, policeCars) {
    // 1. Update Vitals
    if (this.healthFill) {
      this.healthFill.style.width = `${(this.character.health / this.character.maxHealth) * 100}%`;
    }
    if (this.armorFill) {
      this.armorFill.style.width = `${(this.character.armor / this.character.maxArmor) * 100}%`;
    }
    if (this.staminaFill) {
      this.staminaFill.style.width = `${(this.character.stamina / this.character.maxStamina) * 100}%`;
    }

    // 2. Update Wanted Stars
    const wanted = this.police.wantedLevel;
    const isPursuit = !this.police.isEvading && wanted > 0;
    this.stars.forEach((star, index) => {
      if (index < wanted) {
        star.classList.add('active');
        if (isPursuit) {
          star.classList.add('pursuit');
        } else {
          star.classList.remove('pursuit');
        }
      } else {
        star.classList.remove('active', 'pursuit');
      }
    });

    // 3. Update Weapon HUD
    if (this.weapons) {
      const wep = this.weapons.getCurrentWeapon();
      if (this.weaponIcon) this.weaponIcon.innerText = wep.icon;
      if (this.weaponName) this.weaponName.innerText = wep.name;
      if (this.weaponAmmo) {
        if (wep.ammo === Infinity) {
          this.weaponAmmo.innerHTML = `<span>∞</span>`;
        } else {
          this.weaponAmmo.innerHTML = `<span>${wep.ammo}</span> / ${wep.maxAmmo}`;
        }
      }

      // Crosshair display (visible when aiming or with gun out on foot)
      if (this.crosshair) {
        const showCrosshair = !this.character.inVehicle && (this.character.isAiming || wep.id !== 'fists');
        if (showCrosshair) {
          this.crosshair.classList.remove('crosshair-hidden');
        } else {
          this.crosshair.classList.add('crosshair-hidden');
        }
      }
    }

    // 4. Render Rotating Radar Minimap & update player marker rotation
    if (this.playerMarker) {
      // In car, vehicle faces -Z when rotY = 0, on foot character faces +Z when rotY = 0
      const baseAngle = this.character.inVehicle ? (playerRotationY - cameraYaw) : (playerRotationY - (cameraYaw + Math.PI));
      const deg = baseAngle * (180 / Math.PI);
      this.playerMarker.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
    }
    this.renderRadar(playerPos, cameraYaw, trafficCars, policeCars);
  }

  renderRadar(playerPos, cameraYaw, trafficCars, policeCars) {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const size = 200;
    const center = size / 2;
    const scale = 0.38; // meters to radar pixels

    ctx.clearRect(0, 0, size, size);

    ctx.save();
    // Clip circular radar
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.clip();

    // Deep water background (Canals & Ocean)
    ctx.fillStyle = '#061d36';
    ctx.fillRect(0, 0, size, size);

    // Rotate radar so camera look direction points UP
    ctx.translate(center, center);
    ctx.rotate(-cameraYaw);
    ctx.translate(-playerPos.x * scale, -playerPos.z * scale);

    // 1. Draw Landmass Islands
    // Mainland Downtown (West)
    ctx.fillStyle = '#111726';
    ctx.fillRect(-400 * scale, -350 * scale, 250 * scale, 700 * scale);

    // Starfish Island (Center)
    ctx.fillStyle = '#162e1a';
    ctx.fillRect(-90 * scale, -110 * scale, 90 * scale, 220 * scale);

    // Vice Beach Island (East)
    ctx.fillStyle = '#111726';
    ctx.fillRect(0 * scale, -350 * scale, 180 * scale, 700 * scale);

    // Sandy Shoreline
    ctx.fillStyle = '#8f774e';
    ctx.fillRect(180 * scale, -350 * scale, 60 * scale, 700 * scale);

    // Pier
    ctx.fillStyle = '#3a2d22';
    ctx.fillRect(240 * scale, 104 * scale, 100 * scale, 12 * scale);

    // 2. Draw Bridges across canals
    ctx.fillStyle = '#2c3547';
    [-60, 40].forEach(bz => {
      ctx.fillRect(-150 * scale, (bz - 8) * scale, 150 * scale, 16 * scale);
    });

    // 3. Draw Road Grid
    ctx.fillStyle = '#252c3d';
    // North-South Roads
    [-340, -260, -180, 40, 110].forEach(x => {
      ctx.fillRect((x - 7) * scale, -350 * scale, 14 * scale, 700 * scale);
    });
    // Starfish Island Road
    ctx.fillRect((-45 - 7) * scale, -90 * scale, 14 * scale, 180 * scale);

    // East-West Roads
    [-250, -160, -60, 40, 140, 250].forEach(z => {
      ctx.fillRect(-360 * scale, (z - 7) * scale, 480 * scale, 14 * scale);
    });

    // 4. Special Landmark Icons
    // Pay 'n' Spray (Green)
    ctx.fillStyle = '#00ffcc';
    ctx.beginPath();
    ctx.arc(118 * scale, -120 * scale, 5, 0, Math.PI * 2);
    ctx.fill();

    // Ammu-Nation (Red)
    ctx.fillStyle = '#ff3300';
    ctx.beginPath();
    ctx.arc(120 * scale, 50 * scale, 5, 0, Math.PI * 2);
    ctx.fill();

    // Malibu Club (Pink)
    ctx.fillStyle = '#ff007f';
    ctx.beginPath();
    ctx.arc(138 * scale, -30 * scale, 5, 0, Math.PI * 2);
    ctx.fill();

    // VCPD HQ (Blue)
    ctx.fillStyle = '#0077ff';
    ctx.beginPath();
    ctx.arc(-220 * scale, 250 * scale, 5, 0, Math.PI * 2);
    ctx.fill();

    // 5. Draw Traffic Car blips (cyan dots)
    if (trafficCars) {
      trafficCars.forEach(car => {
        if (!car.isOccupied) {
          ctx.fillStyle = '#00e5ff';
          ctx.beginPath();
          ctx.arc(car.position.x * scale, car.position.z * scale, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 6. Draw Police Car blips (flashing red and blue)
    if (policeCars) {
      const flash = (Math.floor(performance.now() * 0.008) % 2 === 0);
      policeCars.forEach(cruiser => {
        ctx.fillStyle = flash ? '#ff0055' : '#0066ff';
        ctx.beginPath();
        ctx.arc(cruiser.position.x * scale, cruiser.position.z * scale, 4.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.restore();
  }
}
