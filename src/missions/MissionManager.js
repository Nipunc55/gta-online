import * as THREE from 'three';
import { CURB_H } from '../world/CityLayout.js';
import { buildVehicleModel } from '../entities/VehicleModels.js';
import { WaypointMarker } from './WaypointMarker.js';
import {
  Mission1_FreshOut,
  Mission2_ArmedAndReady,
  Mission3_PaybackPursuit,
  Mission4_StreetSprint
} from './StoryMissions.js';

export class MissionManager {
  constructor(game) {
    this.game = game;
    this.marker = new WaypointMarker(game.scene);

    this.missions = [
      new Mission1_FreshOut(game),
      new Mission2_ArmedAndReady(game),
      new Mission3_PaybackPursuit(game),
      new Mission4_StreetSprint(game)
    ];

    this.currentMissionIndex = 0;
    this.activeMission = null;
    this.nextChainTimeout = null;
    this.commsTimer = 0;
    this.bannerTimer = 0;
    this.compoundSpawned = false;
    this.payNSprayCooldown = 0;

    this.buildDOMElements();
    this.bindEvents();
  }

  buildDOMElements() {
    const hudOverlay = document.getElementById('hud-overlay') || document.body;

    // 1. Top-Center Active Mission Objective Bar
    let objBox = document.getElementById('mission-objective-box');
    if (!objBox) {
      objBox = document.createElement('div');
      objBox.id = 'mission-objective-box';
      objBox.className = 'mission-objective-box mission-hidden';
      objBox.innerHTML = `
        <div class="mission-header-row">
          <span class="mission-chapter-tag" id="mission-chapter-tag">CHAPTER 1</span>
          <span class="mission-title-tag" id="mission-title-tag">FRESH OUT</span>
          <span class="mission-timer-tag" id="mission-timer-tag" style="display:none;">01:30</span>
        </div>
        <div class="mission-objective-main" id="mission-objective-main">ENTER YOUR GROTTI CHEETAH GT</div>
        <div class="mission-objective-sub" id="mission-objective-sub">Walk to the red supercar parked at the curb</div>
      `;
      hudOverlay.appendChild(objBox);
    }
    this.objBoxEl = objBox;
    this.chapterTagEl = document.getElementById('mission-chapter-tag');
    this.titleTagEl = document.getElementById('mission-title-tag');
    this.timerTagEl = document.getElementById('mission-timer-tag');
    this.objMainEl = document.getElementById('mission-objective-main');
    this.objSubEl = document.getElementById('mission-objective-sub');

    // 2. Live Radio / Comms Call Notification Box
    let commsBox = document.getElementById('mission-comms-box');
    if (!commsBox) {
      commsBox = document.createElement('div');
      commsBox.id = 'mission-comms-box';
      commsBox.className = 'mission-comms-box comms-hidden';
      commsBox.innerHTML = `
        <div class="comms-avatar">📱</div>
        <div class="comms-body">
          <div class="comms-caller" id="comms-caller">LAMAR DAVIS</div>
          <div class="comms-text" id="comms-text">Incoming encrypted call...</div>
        </div>
      `;
      hudOverlay.appendChild(commsBox);
    }
    this.commsBoxEl = commsBox;
    this.commsCallerEl = document.getElementById('comms-caller');
    this.commsTextEl = document.getElementById('comms-text');

    // 3. Big GTA "MISSION PASSED / MISSION FAILED" Celebration Banner
    let banner = document.getElementById('mission-status-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'mission-status-banner';
      banner.className = 'mission-status-banner banner-hidden';
      banner.innerHTML = `
        <div class="banner-headline" id="banner-headline">MISSION PASSED</div>
        <div class="banner-subtitle" id="banner-subtitle">FRESH OUT</div>
        <div class="banner-reward" id="banner-reward">+$1,500 • RESPECT +</div>
      `;
      const container = document.getElementById('game-container') || document.body;
      container.appendChild(banner);
    }
    this.bannerEl = banner;
    this.bannerHeadlineEl = document.getElementById('banner-headline');
    this.bannerSubtitleEl = document.getElementById('banner-subtitle');
    this.bannerRewardEl = document.getElementById('banner-reward');
  }

  bindEvents() {
    this.game.events.on('npc:killed', ({ npc }) => {
      if (this.activeMission && this.activeMission.stage === 'active') {
        this.activeMission.onNPCKilled(npc);
      }
    });

    this.game.events.on('player:wasted', () => {
      if (this.activeMission && this.activeMission.stage === 'active') {
        const failedIdx = this.currentMissionIndex;
        this.activeMission.fail('WASTED');
        // Automatically restart the current mission after hospital respawn
        if (this.nextChainTimeout) clearTimeout(this.nextChainTimeout);
        this.nextChainTimeout = setTimeout(() => {
          this.startMission(failedIdx);
        }, 4200);
      }
    });

    this.game.events.on('mission:completed', ({ title, reward }) => {
      this.showStatusBanner('MISSION PASSED', title, `+$${reward.toLocaleString()} • RESPECT +`, true);
      this.syncObjectiveUI();

      // Automatically advance story arc to next mission after celebration
      if (this.nextChainTimeout) clearTimeout(this.nextChainTimeout);
      if (this.currentMissionIndex < 2) {
        const nextIdx = this.currentMissionIndex + 1;
        this.nextChainTimeout = setTimeout(() => {
          this.startMission(nextIdx);
        }, 4400);
      } else if (this.currentMissionIndex === 2) {
        // Story Chapter 1 Completed! Inform player about repeatable Street Race [M]
        this.nextChainTimeout = setTimeout(() => {
          this.showComms(
            'LAMAR DAVIS',
            '#00ffff',
            'Chapter 1 Complete! Press [M] anytime to launch the Neon Boulevard Street Race ($5,000) or replay missions!'
          );
        }, 4600);
      }
    });

    this.game.events.on('mission:failed', ({ title, reason }) => {
      this.showStatusBanner('MISSION FAILED', `${title} — ${reason}`, 'RETRYING SHORTLY OR PRESS [M]', false);
      this.syncObjectiveUI();
    });
  }

  /**
   * Builds the static props inside Block [6, 3] (Eastside Vipers Compound):
   * 2 blacked-out Syndicate SUVs and tactical cargo crates for cover.
   */
  spawnCompoundEnvironment() {
    if (this.compoundSpawned) return;
    this.compoundSpawned = true;

    const group = new THREE.Group();
    const crateMat = new THREE.MeshStandardMaterial({ color: 0x5d4037, roughness: 0.85 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x37474f, roughness: 0.5, metalness: 0.5 });

    // Two blacked-out Viper Syndicate SUVs parked at defensive angles
    const suv1 = buildVehicleModel('suv', 0x14171a);
    suv1.root.position.set(215.5, CURB_H, -38.5);
    suv1.root.rotation.y = 0.42;
    group.add(suv1.root);
    this.game.colliders.addBox(215.5 - 2.2, 0, -38.5 - 2.2, 215.5 + 2.2, 2.2, -38.5 + 2.2, 'prop');

    const suv2 = buildVehicleModel('suv', 0x14171a);
    suv2.root.position.set(215.5, CURB_H, -51.5);
    suv2.root.rotation.y = -0.42;
    group.add(suv2.root);
    this.game.colliders.addBox(215.5 - 2.2, 0, -51.5 - 2.2, 215.5 + 2.2, 2.2, -51.5 + 2.2, 'prop');

    // Tactical cover crates around the compound perimeter
    const crates = [
      { x: 205.0, z: -41.5, w: 2.2, h: 1.5, d: 1.4, mat: crateMat },
      { x: 205.0, z: -48.5, w: 2.2, h: 1.5, d: 1.4, mat: crateMat },
      { x: 221.0, z: -33.0, w: 2.8, h: 1.8, d: 1.8, mat: steelMat },
      { x: 221.0, z: -57.0, w: 2.8, h: 1.8, d: 1.8, mat: steelMat },
      { x: 233.5, z: -45.0, w: 2.4, h: 1.7, d: 3.2, mat: steelMat }
    ];
    for (const c of crates) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(c.w, c.h, c.d), c.mat);
      m.position.set(c.x, CURB_H + c.h / 2, c.z);
      m.castShadow = true;
      m.receiveShadow = true;
      group.add(m);
      this.game.colliders.addBox(
        c.x - c.w / 2,
        0,
        c.z - c.d / 2,
        c.x + c.w / 2,
        CURB_H + c.h,
        c.z + c.d / 2,
        'prop'
      );
    }

    this.game.scene.add(group);
  }

  startStoryFromBeginning() {
    this.startMission(0);
  }

  startMission(index) {
    if (this.nextChainTimeout) {
      clearTimeout(this.nextChainTimeout);
      this.nextChainTimeout = null;
    }
    if (this.activeMission) {
      this.activeMission.cleanup();
    }

    this.currentMissionIndex = ((index % this.missions.length) + this.missions.length) % this.missions.length;
    this.activeMission = this.missions[this.currentMissionIndex];
    this.activeMission.start();
    this.syncObjectiveUI();
  }

  cycleMission() {
    if (!this.activeMission || this.activeMission.stage !== 'active') {
      const nextIdx = (this.currentMissionIndex + 1) % this.missions.length;
      this.startMission(nextIdx);
    } else {
      const nextIdx = (this.currentMissionIndex + 1) % this.missions.length;
      this.startMission(nextIdx);
    }
  }

  showComms(caller, colorHex, text, duration = 6.2) {
    if (!this.commsBoxEl) return;
    this.commsCallerEl.innerText = caller;
    this.commsCallerEl.style.color = colorHex || '#2ecc71';
    this.commsTextEl.innerText = text;
    this.commsBoxEl.classList.remove('comms-hidden');
    this.commsTimer = duration;
    this.game.audio.play('radioComms', 0.85);
  }

  showStatusBanner(headline, subtitle, rewardText, isSuccess = true) {
    if (!this.bannerEl) return;
    this.bannerHeadlineEl.innerText = headline;
    this.bannerHeadlineEl.style.color = isSuccess ? '#f1c40f' : '#e74c3c';
    this.bannerSubtitleEl.innerText = subtitle;
    this.bannerRewardEl.innerText = rewardText;
    this.bannerEl.classList.remove('banner-hidden');
    this.bannerTimer = 3.8;
  }

  syncObjectiveUI() {
    if (!this.objBoxEl) return;
    const m = this.activeMission;
    if (!m || m.stage !== 'active' || !m.objectiveText) {
      this.objBoxEl.classList.add('mission-hidden');
      this.marker.hide();
      return;
    }

    this.objBoxEl.classList.remove('mission-hidden');
    this.chapterTagEl.innerText = m.chapter;
    this.titleTagEl.innerText = m.title;
    this.objMainEl.innerText = m.objectiveText;
    this.objSubEl.innerText = m.subText || '';

    if (m.waypoint) {
      const gy = this.game.layout.getGroundHeight(m.waypoint.x, m.waypoint.z);
      this.marker.show(
        m.waypoint.x,
        gy,
        m.waypoint.z,
        m.waypoint.color || 0xf1c40f,
        m.waypoint.radius || 2.5
      );
    } else {
      this.marker.hide();
    }
  }

  getActiveWaypoint() {
    if (this.activeMission && this.activeMission.stage === 'active') {
      return this.activeMission.waypoint;
    }
    return null;
  }

  update(dt) {
    // 1. Hotkey [M] to cycle / launch story & side missions anytime
    if (this.game.input.wasKeyJustPressed('KeyM')) {
      this.cycleMission();
    }

    // 2. Update Pay'n'Spray Auto Shop (Block [1, 2], x = -225, z = -163.5)
    if (this.payNSprayCooldown > 0) this.payNSprayCooldown -= dt;
    const pPos = this.game.player.position;
    const distPNS = Math.hypot(pPos.x - -225.0, pPos.z - -163.5);
    if (distPNS < 5.8 && this.payNSprayCooldown <= 0) {
      const car = this.game.player.currentVehicle || this.game.playerCar;
      const hadHeat = this.game.police.wantedLevel > 0;
      const neededRepair = car && car.health < car.maxHealth;
      if (hadHeat || neededRepair) {
        this.payNSprayCooldown = 8.0;
        if (car) car.health = car.maxHealth;
        this.game.police.clearPolice();
        this.game.audio.play('carChirp', 1.0);
        this.game.hud.showActionPrompt("PAY 'N' SPRAY: VEHICLE REPAIRED & WANTED LEVEL CLEARED!");
      }
    }

    // 3. Update active mission & timer readout
    if (this.activeMission && this.activeMission.stage === 'active') {
      this.activeMission.update(dt);

      if (this.activeMission && this.activeMission.timer !== null && this.timerTagEl) {
        this.timerTagEl.style.display = 'inline-block';
        const sec = Math.max(0, Math.ceil(this.activeMission.timer));
        const mins = Math.floor(sec / 60);
        const rem = sec % 60;
        this.timerTagEl.innerText = `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
      } else if (this.timerTagEl) {
        this.timerTagEl.style.display = 'none';
      }

      // Keep 3D marker synced if waypoint moved (e.g. moving car in Mission 1 Step 0)
      if (this.activeMission && this.activeMission.waypoint) {
        const wp = this.activeMission.waypoint;
        const gy = this.game.layout.getGroundHeight(wp.x, wp.z);
        this.marker.group.position.set(wp.x, gy, wp.z);
      }
    }

    // 4. Update 3D waypoint animation
    this.marker.update(dt);

    // 5. Update Comms & Banner timers
    if (this.commsTimer > 0) {
      this.commsTimer -= dt;
      if (this.commsTimer <= 0 && this.commsBoxEl) {
        this.commsBoxEl.classList.add('comms-hidden');
      }
    }

    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0 && this.bannerEl) {
        this.bannerEl.classList.add('banner-hidden');
      }
    }
  }
}
