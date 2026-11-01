import { ROADS, ROAD_HALF, ROAD_EXTENT, LAND_HALF } from '../world/CityLayout.js';

export class HUD {
  constructor(player, police, weaponSystem, layout) {
    this.player = player;
    this.police = police;
    this.weapons = weaponSystem;
    this.layout = layout;

    this.radarCanvas = document.getElementById('radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;
    this.healthFill = document.getElementById('health-fill');
    this.armorFill = document.getElementById('armor-fill');
    this.staminaFill = document.getElementById('stamina-fill');
    this.cashDisplay = document.getElementById('cash-display');
    this.locationName = document.getElementById('location-name');
    this.locationSub = document.getElementById('location-sub');
    this.actionPrompt = document.getElementById('action-prompt');
    this.promptText = this.actionPrompt ? this.actionPrompt.querySelector('.prompt-text') : null;
    this.crosshair = document.getElementById('crosshair');
    this.wastedBanner = document.getElementById('wasted-banner');
    this.hurtVignette = document.getElementById('hurt-vignette');

    this.weaponIcon = document.getElementById('weapon-icon');
    this.weaponName = document.getElementById('weapon-name');
    this.weaponAmmo = document.getElementById('weapon-ammo');

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

  update(playerPos, playerRotationY, cameraYaw, trafficCars, policeCars, pedestrians = [], skyAndLighting = null, activeWaypoint = null) {
    // 1. Vitals & Cash
    if (this.healthFill) {
      this.healthFill.style.width = `${(this.player.health / this.player.maxHealth) * 100}%`;
    }
    if (this.armorFill) {
      this.armorFill.style.width = `${(this.player.armor / this.player.maxArmor) * 100}%`;
    }
    if (this.staminaFill) {
      this.staminaFill.style.width = `${(this.player.stamina / this.player.maxStamina) * 100}%`;
    }
    if (this.cashDisplay) {
      this.cashDisplay.innerText = `$${this.player.cash.toLocaleString()}`;
    }

    // Hurt vignette & Wasted overlay
    if (this.hurtVignette) {
      this.hurtVignette.style.opacity = (this.player.hurtFlash * 0.55).toFixed(2);
    }
    if (this.wastedBanner) {
      this.wastedBanner.style.display = this.player.isAlive ? 'none' : 'flex';
    }

    // District title & live time/weather readout
    if (this.locationName && this.layout) {
      this.locationName.innerText = this.layout.getAreaName(playerPos.x, playerPos.z).toUpperCase();
    }
    if (this.locationSub && skyAndLighting) {
      this.locationSub.innerText = `LEONIDA STATE • ${skyAndLighting.getPhaseLabel()}`;
    }

    // 2. Wanted Stars
    const wanted = this.police.wantedLevel;
    const isPursuit = !this.police.isEvading && wanted > 0;
    this.stars.forEach((star, index) => {
      if (index < wanted) {
        star.classList.add('active');
        if (isPursuit) star.classList.add('pursuit');
        else star.classList.remove('pursuit');
      } else {
        star.classList.remove('active', 'pursuit');
      }
    });

    // 3. Weapon & Reload status
    if (this.weapons) {
      const wep = this.weapons.getCurrentWeapon();
      if (this.weaponIcon) this.weaponIcon.innerText = wep.icon;
      if (this.weaponName) {
        this.weaponName.innerText = this.weapons.isReloading ? `${wep.name} (RELOADING...)` : wep.name;
      }
      if (this.weaponAmmo) {
        if (wep.magSize === Infinity) {
          this.weaponAmmo.innerHTML = `<span>∞</span>`;
        } else {
          this.weaponAmmo.innerHTML = `<span>${wep.clip}</span> / ${wep.reserve}`;
        }
      }
      if (this.crosshair) {
        const show = !this.player.inVehicle && this.player.isAlive && (this.player.isAiming || wep.id !== 'fists');
        if (show) this.crosshair.classList.remove('crosshair-hidden');
        else this.crosshair.classList.add('crosshair-hidden');
      }
    }

    // 4. Radar player marker & minimap
    if (this.playerMarker) {
      const deg = (cameraYaw - playerRotationY) * (180 / Math.PI);
      this.playerMarker.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
    }
    this.renderRadar(playerPos, cameraYaw, trafficCars, policeCars, pedestrians, activeWaypoint);
  }

  renderRadar(playerPos, cameraYaw, trafficCars, policeCars, pedestrians, activeWaypoint = null) {
    if (!this.radarCtx) return;
    const ctx = this.radarCtx;
    const size = 200;
    const center = size / 2;
    const scale = 0.42;

    ctx.clearRect(0, 0, size, size);
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, center - 2, 0, Math.PI * 2);
    ctx.clip();

    // Ocean background
    ctx.fillStyle = '#0c3b5e';
    ctx.fillRect(0, 0, size, size);

    ctx.translate(center, center);
    ctx.rotate(cameraYaw);
    ctx.translate(-playerPos.x * scale, -playerPos.z * scale);

    // Sandy beach & landmass
    ctx.fillStyle = '#c8b482';
    ctx.fillRect(-460 * scale, -460 * scale, 920 * scale, 920 * scale);
    ctx.fillStyle = '#2d3a2e';
    ctx.fillRect(-LAND_HALF * scale, -LAND_HALF * scale, LAND_HALF * 2 * scale, LAND_HALF * 2 * scale);

    // City blocks
    if (this.layout) {
      for (const b of this.layout.blocks) {
        ctx.fillStyle = b.type === 'park' ? '#2e6b34' : (b.type === 'downtown' ? '#3a4659' : '#323842');
        ctx.fillRect(b.x0 * scale, b.z0 * scale, (b.x1 - b.x0) * scale, (b.z1 - b.z0) * scale);
      }
    }

    // Road grid
    ctx.fillStyle = '#1b1f26';
    for (const r of ROADS) {
      ctx.fillRect((r - ROAD_HALF) * scale, -ROAD_EXTENT * scale, ROAD_HALF * 2 * scale, ROAD_EXTENT * 2 * scale);
      ctx.fillRect(-ROAD_EXTENT * scale, (r - ROAD_HALF) * scale, ROAD_EXTENT * 2 * scale, ROAD_HALF * 2 * scale);
    }

    // GPS Route Line to Active Mission Waypoint
    if (activeWaypoint && this.layout) {
      const hex = activeWaypoint.color
        ? `#${activeWaypoint.color.toString(16).padStart(6, '0')}`
        : '#f1c40f';
      const nFrom = this.layout.nearestNode(playerPos.x, playerPos.z);
      const nTo = this.layout.nearestNode(activeWaypoint.x, activeWaypoint.z);
      const path = nFrom && nTo ? this.layout.findPath(nFrom.id, nTo.id) : [];

      ctx.strokeStyle = hex;
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(playerPos.x * scale, playerPos.z * scale);
      for (const nid of path) {
        const node = this.layout.getNode(nid);
        if (node) ctx.lineTo(node.x * scale, node.z * scale);
      }
      ctx.lineTo(activeWaypoint.x * scale, activeWaypoint.z * scale);
      ctx.stroke();
    }

    // Traffic blips
    if (trafficCars) {
      ctx.fillStyle = '#4dd0e1';
      for (const car of trafficCars) {
        if (car.driver === 'player' || car.isDestroyed) continue;
        ctx.beginPath();
        ctx.arc(car.position.x * scale, car.position.z * scale, 2.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Hostile / combat / mission target NPC blips
    if (pedestrians) {
      for (const p of pedestrians) {
        if (p.state === 'DEAD') continue;
        if (p.state !== 'COMBAT' && !p.isMissionTarget) continue;
        ctx.fillStyle = p.role === 'police' ? '#3399ff' : '#ff1744';
        ctx.beginPath();
        ctx.arc(p.position.x * scale, p.position.z * scale, p.isMissionTarget ? 3.5 : 2.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Police cruisers
    if (policeCars) {
      const flash = Math.floor(performance.now() * 0.01) % 2 === 0;
      for (const cruiser of policeCars) {
        if (cruiser.isDestroyed) continue;
        ctx.fillStyle = flash ? '#ff1744' : '#2979ff';
        ctx.beginPath();
        ctx.arc(cruiser.position.x * scale, cruiser.position.z * scale, 4.0, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    ctx.restore();

    // Draw Active Mission Waypoint Blip (clamped to radar edge if outside view radius)
    if (activeWaypoint) {
      ctx.save();
      ctx.translate(center, center);
      ctx.rotate(cameraYaw);

      const dx = (activeWaypoint.x - playerPos.x) * scale;
      const dz = (activeWaypoint.z - playerPos.z) * scale;
      const dist = Math.hypot(dx, dz);
      const maxR = center - 10;
      const bx = dist > maxR ? (dx / dist) * maxR : dx;
      const bz = dist > maxR ? (dz / dist) * maxR : dz;

      const hex = activeWaypoint.color
        ? `#${activeWaypoint.color.toString(16).padStart(6, '0')}`
        : '#f1c40f';
      const pulse = 5.2 + Math.sin(performance.now() * 0.008) * 1.4;

      ctx.fillStyle = hex;
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 2.0;
      ctx.beginPath();
      ctx.arc(bx, bz, pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }
}
