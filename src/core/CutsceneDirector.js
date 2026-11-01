import * as THREE from 'three';
import { createHumanoid, animateHumanoid } from '../entities/HumanoidModel.js';
import { clamp, lerp } from './MathUtils.js';
import { CURB_H } from '../world/CityLayout.js';

function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * GTA-style Cinematic Cutscene Director.
 * Supports multi-shot camera splines/keyframes, widescreen 2.39:1 letterboxing,
 * title cards, speaker-tagged subtitles, actor choreography, and seamless
 * camera hand-off back to gameplay.
 */
export class CutsceneDirector {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.camera = game.camera;
    this.isPlaying = false;
    this.elapsed = 0;
    this.totalDuration = 0;
    this.shots = [];
    this.subtitles = [];
    this.cues = [];
    this.onCompleteCallback = null;

    // Temporary 3D actors & props spawned for the active cutscene
    this.tempObjects = [];
    this.guardRig = null;
    this.gateMesh = null;

    this._camPos = new THREE.Vector3();
    this._lookPos = new THREE.Vector3();

    this.buildDOMOverlay();
  }

  buildDOMOverlay() {
    let root = document.getElementById('cutscene-overlay');
    if (!root) {
      root = document.createElement('div');
      root.id = 'cutscene-overlay';
      root.className = 'cutscene-overlay cutscene-hidden';
      root.innerHTML = `
        <div class="letterbox-bar letterbox-top">
          <div class="cutscene-badge" id="cutscene-badge">CINEMATIC</div>
        </div>
        <div class="cutscene-title-card" id="cutscene-title-card">
          <div class="cutscene-title-main" id="cutscene-title-main">PRECINCT 04 PENITENTIARY</div>
          <div class="cutscene-title-sub" id="cutscene-title-sub">LEONIDA STATE DOC — RELEASE DAY, 08:00 AM</div>
        </div>
        <div class="letterbox-bar letterbox-bottom">
          <div class="cutscene-subtitle" id="cutscene-subtitle"></div>
          <div class="cutscene-skip-hint">PRESS <span>[SPACE]</span> OR <span>[ENTER]</span> TO SKIP</div>
        </div>
      `;
      const container = document.getElementById('game-container') || document.body;
      container.appendChild(root);
    }
    this.overlayEl = root;
    this.badgeEl = document.getElementById('cutscene-badge');
    this.titleCardEl = document.getElementById('cutscene-title-card');
    this.titleMainEl = document.getElementById('cutscene-title-main');
    this.titleSubEl = document.getElementById('cutscene-title-sub');
    this.subtitleEl = document.getElementById('cutscene-subtitle');
  }

  setTitleCard(mainText, subText, badgeText = 'CINEMATIC') {
    if (this.titleMainEl) this.titleMainEl.innerText = mainText;
    if (this.titleSubEl) this.titleSubEl.innerText = subText;
    if (this.badgeEl) this.badgeEl.innerText = badgeText;
  }

  cleanupTempObjects() {
    for (const obj of this.tempObjects) {
      if (obj && obj.parent) obj.parent.remove(obj);
    }
    this.tempObjects = [];
    this.guardRig = null;
    this.gateMesh = null;
  }

  /**
   * Starts the "Released from Prison / Precinct 04" opening cutscene.
   */
  playPrisonReleaseIntro(onComplete = null) {
    this.cleanupTempObjects();
    this.setTitleCard(
      'PRECINCT 04 PENITENTIARY',
      'LEONIDA STATE DOC — RELEASE DAY, 08:00 AM',
      'PROLOGUE CINEMATIC'
    );

    const { player, playerCar, cameraController, hud, speedometer, police } = this.game;

    // Ensure player is on foot, healthy, with zero wanted level
    if (player.inVehicle && player.currentVehicle) {
      player.exitVehicle();
    }
    if (police) police.clearPolice();
    speedometer.hide();
    hud.hideActionPrompt();

    // Precinct 04 / Detention Release Gate coordinates:
    // Block [2, 2]: cx = -135, front wall at z = -165.5 facing -Z (toward road at z = -180)
    const gateX = -135.0;
    const gateZ = -165.65;
    const groundY = CURB_H;

    // 1. Spawn animated sliding steel prison cell gate door in the entrance recess
    const gateGroup = new THREE.Group();
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4, metalness: 0.8 });
    const barMat = new THREE.MeshStandardMaterial({ color: 0x95a5a6, roughness: 0.35, metalness: 0.85 });
    const topRail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), frameMat);
    topRail.position.set(0, 3.3, 0);
    gateGroup.add(topRail);
    const midRail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.12, 0.14), frameMat);
    midRail.position.set(0, 1.7, 0);
    gateGroup.add(midRail);
    const botRail = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.14, 0.14), frameMat);
    botRail.position.set(0, 0.15, 0);
    gateGroup.add(botRail);

    for (let bx = -1.05; bx <= 1.05; bx += 0.3) {
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 3.3, 6), barMat);
      bar.position.set(bx, 1.7, 0);
      gateGroup.add(bar);
    }
    gateGroup.position.set(gateX, groundY, gateZ);
    this.scene.add(gateGroup);
    this.tempObjects.push(gateGroup);
    this.gateMesh = gateGroup;

    // 2. Spawn Prison Warden / Guard Officer standing watch beside the release gate
    const guardRig = createHumanoid({ role: 'police' });
    guardRig.root.position.set(gateX - 1.85, groundY, gateZ - 1.15);
    guardRig.root.rotation.y = -0.45; // angled toward player walking out
    this.scene.add(guardRig.root);
    this.tempObjects.push(guardRig.root);
    this.guardRig = guardRig;

    // Second guard officer by the cruiser/bollard on the right
    const guardRig2 = createHumanoid({ role: 'police' });
    guardRig2.root.position.set(gateX + 2.35, groundY, gateZ - 1.5);
    guardRig2.root.rotation.y = 0.32;
    this.scene.add(guardRig2.root);
    this.tempObjects.push(guardRig2.root);

    // 3. Stage the Player inside the prison vestibule behind the bars
    player.position.set(gateX, groundY, gateZ + 0.25);
    player.velocity.set(0, 0, 0);
    player.rotationY = 0; // facing -Z (out toward the street at z = -180)
    player.mesh.visible = true;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.set(0, player.rotationY, 0);

    // 4. Stage the Player's red Supercar on the avenue outside the precinct
    const carEndX = -130.8;
    const carZ = -174.6;
    const carHeading = -Math.PI / 2; // facing +X (East toward Downtown)
    playerCar.position.set(carEndX - 14.0, this.game.layout.getGroundHeight(carEndX - 14.0, carZ), carZ);
    playerCar.velocity.set(0, 0);
    playerCar.speed = 0;
    playerCar.rotationY = carHeading;
    playerCar.mesh.position.copy(playerCar.position);
    playerCar.mesh.rotation.set(0, carHeading, 0);
    playerCar.setHeadlights(false);

    // Final player resting position on sidewalk at the end of the cutscene
    const finalPlayerX = -134.2;
    const finalPlayerZ = -171.8;
    const finalPlayerYaw = -0.48; // angled toward the waiting red supercar

    // Define the 5 cinematic camera shots (total 15.0 seconds)
    this.shots = [
      // SHOT 1 (0.0s - 3.6s): High crane establishing shot descending onto Precinct 04
      {
        start: 0.0,
        end: 3.6,
        camStart: new THREE.Vector3(-152.0, 22.0, -196.0),
        camEnd: new THREE.Vector3(-140.0, 5.2, -175.5),
        lookStart: new THREE.Vector3(-135.0, 9.5, -155.0),
        lookEnd: new THREE.Vector3(-135.0, 2.2, -165.8),
        fovStart: 54,
        fovEnd: 50,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          // Slide steel prison gate open between t = 0.35 and t = 1.0
          const gateOpen = clamp((localT - 0.32) / 0.58, 0, 1);
          if (this.gateMesh) {
            this.gateMesh.position.x = gateX - easeInOutCubic(gateOpen) * 2.15;
          }
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
          animateHumanoid(guardRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },

      // SHOT 2 (3.6s - 7.3s): Low-angle tracking dolly as Player walks out past the prison bars & Warden
      {
        start: 3.6,
        end: 7.3,
        camStart: new THREE.Vector3(-133.4, 1.25, -169.6),
        camEnd: new THREE.Vector3(-133.1, 1.45, -172.8),
        lookStart: new THREE.Vector3(-135.2, 1.45, -165.8),
        lookEnd: new THREE.Vector3(-135.0, 1.48, -169.2),
        fovStart: 46,
        fovEnd: 48,
        ease: easeOutCubic,
        onUpdate: (localT, dt) => {
          if (this.gateMesh) this.gateMesh.position.x = gateX - 2.15;
          // Player steps out of prison vestibule onto the walkway
          const walkZ = lerp(gateZ + 0.1, -169.4, localT);
          player.position.set(gateX, groundY, walkZ);
          player.rotationY = 0;
          player.mesh.position.copy(player.position);
          player.mesh.rotation.y = player.rotationY;
          animateHumanoid(player.rig, dt, { moving: true, sprinting: false, aiming: false });

          // Warden turns head slightly to track the released inmate
          guardRig.head.rotation.y = lerp(0.25, -0.45, localT);
          animateHumanoid(guardRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },

      // SHOT 3 (7.3s - 10.6s): Over-the-shoulder reverse shot looking out at the sunlit street as getaway car pulls up
      {
        start: 7.3,
        end: 10.6,
        camStart: new THREE.Vector3(-136.3, 1.78, -167.6),
        camEnd: new THREE.Vector3(-135.9, 1.72, -169.9),
        lookStart: new THREE.Vector3(-133.0, 1.35, -176.0),
        lookEnd: new THREE.Vector3(-131.2, 1.15, -175.0),
        fovStart: 52,
        fovEnd: 50,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          // Player walks toward the curb and turns slightly toward the arriving car
          const walkX = lerp(gateX, finalPlayerX, localT);
          const walkZ = lerp(-169.4, finalPlayerZ, localT);
          player.position.set(walkX, groundY, walkZ);
          player.rotationY = lerp(0, finalPlayerYaw, easeInOutCubic(localT));
          player.mesh.position.copy(player.position);
          player.mesh.rotation.y = player.rotationY;
          animateHumanoid(player.rig, dt, { moving: localT < 0.88, sprinting: false, aiming: false });

          // Getaway red supercar rolls smoothly to the curb
          const carProgress = easeOutCubic(localT);
          const cx = lerp(carEndX - 14.0, carEndX, carProgress);
          playerCar.position.set(cx, this.game.layout.getGroundHeight(cx, carZ), carZ);
          playerCar.mesh.position.copy(playerCar.position);
          if (playerCar.model && playerCar.model.wheels) {
            const spin = (1 - carProgress) * dt * 14;
            for (const w of playerCar.model.wheels) w.rotation.x += spin;
          }
        }
      },

      // SHOT 4 (10.6s - 13.4s): Low hero sweep across the red Grotti Cheetah GT as headlights flash & chirp
      {
        start: 10.6,
        end: 13.4,
        camStart: new THREE.Vector3(-126.2, 0.85, -177.2),
        camEnd: new THREE.Vector3(-127.4, 1.35, -172.8),
        lookStart: new THREE.Vector3(-131.8, 0.95, -174.4),
        lookEnd: new THREE.Vector3(-133.2, 1.25, -172.6),
        fovStart: 45,
        fovEnd: 52,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          player.position.set(finalPlayerX, groundY, finalPlayerZ);
          player.rotationY = finalPlayerYaw;
          player.mesh.position.copy(player.position);
          player.mesh.rotation.y = player.rotationY;
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });

          playerCar.position.set(carEndX, this.game.layout.getGroundHeight(carEndX, carZ), carZ);
          playerCar.mesh.position.copy(playerCar.position);

          // Double headlight flash synced with key-fob chirp
          const flashOn = (localT > 0.14 && localT < 0.26) || (localT > 0.34 && localT < 0.48);
          playerCar.setHeadlights(flashOn);
        }
      },

      // SHOT 5 (13.4s - 15.0s): Seamless blend into the Player's gameplay third-person camera
      {
        start: 13.4,
        end: 15.0,
        camStart: new THREE.Vector3(-127.4, 1.35, -172.8),
        // Compute exact third-person camera target behind player facing the car
        camEnd: new THREE.Vector3(
          finalPlayerX + Math.sin(finalPlayerYaw) * 4.2 + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55 + Math.sin(0.22) * 4.2,
          finalPlayerZ + Math.cos(finalPlayerYaw) * 4.2 - Math.sin(finalPlayerYaw) * 0.35
        ),
        lookStart: new THREE.Vector3(-133.2, 1.25, -172.6),
        lookEnd: new THREE.Vector3(
          finalPlayerX + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55,
          finalPlayerZ - Math.sin(finalPlayerYaw) * 0.35
        ),
        fovStart: 52,
        fovEnd: 65,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          playerCar.setHeadlights(this.game.skyAndLighting.isNight);
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
        }
      }
    ];

    // Dialogue subtitles & sound cues
    this.subtitles = [
      {
        start: 0.5,
        end: 3.4,
        speaker: 'DISPATCH PA',
        color: '#f1c40f',
        text: ' Gate 04 cleared. Inmate #40892 — sentence served, release authorized.'
      },
      {
        start: 3.7,
        end: 7.1,
        speaker: 'WARDEN TORRES',
        color: '#5dade2',
        text: "Five years in state lockup. Keep your nose clean, or you're right back in my cellblock."
      },
      {
        start: 7.4,
        end: 10.4,
        speaker: 'YOU',
        color: '#2ecc71',
        text: 'Five years of cold concrete... Vice City still looks ripe for the taking.'
      },
      {
        start: 10.7,
        end: 14.3,
        speaker: 'LAMAR (SMS)',
        color: '#ff99cc',
        text: 'Yo! Parked your Cheetah GT right outside the precinct with a full tank & $2,500 in the glovebox.'
      }
    ];

    this.cues = [
      {
        time: 0.35,
        fired: false,
        action: () => this.game.audio.play('prisonDoor', 0.95)
      },
      {
        time: 10.95,
        fired: false,
        action: () => this.game.audio.play('carChirp', 0.9)
      }
    ];

    this.totalDuration = 15.0;
    this.elapsed = 0;
    this.isPlaying = true;

    // Show letterbox overlay and hide standard HUD
    this.overlayEl.classList.remove('cutscene-hidden');
    const hudEl = document.getElementById('hud-overlay');
    if (hudEl) hudEl.style.opacity = '0';

    // Sync gameplay CameraController so when cutscene finishes there is zero snap
    cameraController.setMode('FOOT', finalPlayerYaw);
    cameraController.pitch = 0.22;
    cameraController.pivot.set(finalPlayerX, groundY + 1.55, finalPlayerZ);

    this.onCompleteCallback = () => {
      // Ensure final positions are locked in even if skipped early
      player.position.set(finalPlayerX, groundY, finalPlayerZ);
      player.velocity.set(0, 0, 0);
      player.rotationY = finalPlayerYaw;
      player.mesh.position.copy(player.position);
      player.mesh.rotation.set(0, finalPlayerYaw, 0);

      playerCar.position.set(carEndX, this.game.layout.getGroundHeight(carEndX, carZ), carZ);
      playerCar.velocity.set(0, 0);
      playerCar.speed = 0;
      playerCar.rotationY = carHeading;
      playerCar.mesh.position.copy(playerCar.position);
      playerCar.mesh.rotation.set(0, carHeading, 0);
      playerCar.setHeadlights(this.game.skyAndLighting.isNight);

      if (this.gateMesh) {
        this.gateMesh.position.x = gateX - 2.15;
      }

      this.camera.fov = 65;
      this.camera.updateProjectionMatrix();
      cameraController.setMode('FOOT', finalPlayerYaw);
      cameraController.pitch = 0.22;
      cameraController.pivot.set(finalPlayerX, groundY + 1.55, finalPlayerZ);
      cameraController.update(0.016, player.position, player.rotationY, 0);

      if (hudEl) hudEl.style.opacity = '1';
      this.overlayEl.classList.add('cutscene-hidden');

      if (onComplete) onComplete();
    };

    // Perform initial frame evaluation immediately
    this.update(0);
  }

  /**
   * Mission 1 Finale / Mission 2 Intro: "The Safehouse Reunion" at Lamar's Downtown Garage (Block [4, 5]).
   */
  playSafehouseReunion(onComplete = null) {
    this.cleanupTempObjects();
    this.setTitleCard(
      "LAMAR'S AUTO & SAFEHOUSE",
      'DOWNTOWN VICE CITY — SAFEHOUSE LOT',
      'STORY CUTSCENE'
    );

    const { player, playerCar, cameraController, hud, speedometer, police } = this.game;
    const activeCar = (player.inVehicle && player.currentVehicle) ? player.currentVehicle : playerCar;

    if (player.inVehicle && player.currentVehicle) {
      player.exitVehicle();
    }
    if (police) police.clearPolice();
    speedometer.hide();
    hud.hideActionPrompt();
    this.game.audio.updateEngine(0, 0, false);
    this.game.audio.updateTires(0);

    const groundY = CURB_H;
    // Stage vehicle parked outside the safehouse bay
    const carX = 41.2;
    const carZ = 102.2;
    const carYaw = -2.45;
    activeCar.position.set(carX, this.game.layout.getGroundHeight(carX, carZ), carZ);
    activeCar.velocity.set(0, 0);
    activeCar.speed = 0;
    activeCar.rotationY = carYaw;
    activeCar.mesh.position.copy(activeCar.position);
    activeCar.mesh.rotation.set(0, carYaw, 0);

    // Spawn Lamar actor in signature emerald street jacket
    const lamarRig = createHumanoid({
      role: 'civilian',
      shirtColor: 0x2ecc71,
      pantsColor: 0x1e272e,
      skinColor: 0x8d5524
    });
    const lamarX = 46.2;
    const lamarZ = 106.4;
    lamarRig.root.position.set(lamarX, groundY, lamarZ);
    lamarRig.root.rotation.y = 0.55; // facing toward player (-X, -Z)
    this.scene.add(lamarRig.root);
    this.tempObjects.push(lamarRig.root);

    const startPlayerX = 43.0;
    const startPlayerZ = 102.6;
    const endPlayerX = 44.8;
    const endPlayerZ = 105.0;
    const talkYaw = Math.PI + 0.55; // facing Lamar (+X, +Z)
    const finalPlayerYaw = 0.35;    // facing North-West toward the street & car

    player.position.set(startPlayerX, groundY, startPlayerZ);
    player.velocity.set(0, 0, 0);
    player.rotationY = talkYaw;
    player.mesh.visible = true;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.set(0, talkYaw, 0);

    this.shots = [
      // SHOT 1 (0.0s - 3.6s): Crane descent onto Lamar's Safehouse & parked supercar
      {
        start: 0.0,
        end: 3.6,
        camStart: new THREE.Vector3(32.0, 12.5, 92.0),
        camEnd: new THREE.Vector3(38.5, 3.2, 98.5),
        lookStart: new THREE.Vector3(46.0, 3.5, 108.0),
        lookEnd: new THREE.Vector3(44.8, 1.5, 105.2),
        fovStart: 54,
        fovEnd: 48,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          const px = lerp(startPlayerX, endPlayerX, localT);
          const pz = lerp(startPlayerZ, endPlayerZ, localT);
          player.position.set(px, groundY, pz);
          player.rotationY = talkYaw;
          player.mesh.position.copy(player.position);
          player.mesh.rotation.y = talkYaw;
          animateHumanoid(player.rig, dt, { moving: localT < 0.9, sprinting: false, aiming: false });
          animateHumanoid(lamarRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },
      // SHOT 2 (3.6s - 7.8s): Two-shot dialogue framing Lamar and Player
      {
        start: 3.6,
        end: 7.8,
        camStart: new THREE.Vector3(48.4, 1.68, 103.2),
        camEnd: new THREE.Vector3(47.8, 1.65, 102.6),
        lookStart: new THREE.Vector3(45.2, 1.48, 105.6),
        lookEnd: new THREE.Vector3(45.5, 1.52, 105.8),
        fovStart: 44,
        fovEnd: 42,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          player.position.set(endPlayerX, groundY, endPlayerZ);
          player.mesh.position.copy(player.position);
          lamarRig.head.rotation.y = Math.sin(localT * Math.PI * 2) * 0.14;
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
          animateHumanoid(lamarRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },
      // SHOT 3 (7.8s - 11.4s): Reverse over-the-shoulder shot as Lamar briefs on the Vipers & Ammu-Nation
      {
        start: 7.8,
        end: 11.4,
        camStart: new THREE.Vector3(43.4, 1.72, 103.6),
        camEnd: new THREE.Vector3(43.8, 1.78, 104.0),
        lookStart: new THREE.Vector3(46.5, 1.52, 106.8),
        lookEnd: new THREE.Vector3(46.2, 1.55, 106.4),
        fovStart: 45,
        fovEnd: 48,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
          animateHumanoid(lamarRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },
      // SHOT 4 (11.4s - 12.8s): Blend into gameplay third-person camera
      {
        start: 11.4,
        end: 12.8,
        camStart: new THREE.Vector3(43.8, 1.78, 104.0),
        camEnd: new THREE.Vector3(
          endPlayerX + Math.sin(finalPlayerYaw) * 4.2 + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55 + Math.sin(0.22) * 4.2,
          endPlayerZ + Math.cos(finalPlayerYaw) * 4.2 - Math.sin(finalPlayerYaw) * 0.35
        ),
        lookStart: new THREE.Vector3(46.2, 1.55, 106.4),
        lookEnd: new THREE.Vector3(
          endPlayerX + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55,
          endPlayerZ - Math.sin(finalPlayerYaw) * 0.35
        ),
        fovStart: 48,
        fovEnd: 65,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          player.rotationY = lerp(talkYaw - Math.PI * 2, finalPlayerYaw, easeInOutCubic(localT));
          player.mesh.rotation.y = player.rotationY;
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
        }
      }
    ];

    this.subtitles = [
      {
        start: 0.4,
        end: 3.5,
        speaker: 'LAMAR',
        color: '#2ecc71',
        text: "Look who's back on the asphalt! Welcome home to the Downtown Safehouse, partner."
      },
      {
        start: 3.7,
        end: 7.7,
        speaker: 'LAMAR',
        color: '#2ecc71',
        text: 'While you were locked up in Precinct 04, the Vipers Syndicate raided our stash and took $50K.'
      },
      {
        start: 7.9,
        end: 11.8,
        speaker: 'LAMAR',
        color: '#2ecc71',
        text: "Go see Marcus at Ammu-Nation on North Ave. He's holding Kevlar armor and a Micro SMG for you."
      }
    ];

    this.cues = [
      { time: 0.3, fired: false, action: () => this.game.audio.play('carChirp', 0.85) },
      { time: 3.7, fired: false, action: () => this.game.audio.play('radioComms', 0.85) }
    ];

    this._startSequence(12.8, endPlayerX, groundY, endPlayerZ, finalPlayerYaw, onComplete);
  }

  /**
   * Mission 2 Mid-Cutscene: "Armed & Ready" — Meeting Marcus at Ammu-Nation (Block [4, 2]).
   */
  playAmmuNationGearUp(onComplete = null) {
    this.cleanupTempObjects();
    this.setTitleCard(
      'AMMU-NATION ARSENAL',
      'NORTH MIDTOWN — UNDERGROUND ARMS DROP',
      'STORY CUTSCENE'
    );

    const { player, cameraController, hud, speedometer } = this.game;
    if (player.inVehicle && player.currentVehicle) {
      player.exitVehicle();
    }
    speedometer.hide();
    hud.hideActionPrompt();
    this.game.audio.updateEngine(0, 0, false);
    this.game.audio.updateTires(0);

    const groundY = CURB_H;
    // Ammu-Nation front entrance is at (45, CURB_H, -167.5) facing North (-Z)
    const marcusRig = createHumanoid({
      role: 'gang',
      shirtColor: 0xc0392b,
      pantsColor: 0x2c3e50,
      skinColor: 0xd1a384
    });
    marcusRig.root.position.set(45.0, groundY, -168.4);
    marcusRig.root.rotation.y = 0; // facing -Z toward street
    this.scene.add(marcusRig.root);
    this.tempObjects.push(marcusRig.root);

    // Spawn military tactical weapon crate between Marcus and Player
    const crateGroup = new THREE.Group();
    const crateBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 0.75, 0.7),
      new THREE.MeshStandardMaterial({ color: 0x3b4d3b, roughness: 0.6, metalness: 0.3 })
    );
    crateBox.position.y = 0.38;
    const trimBox = new THREE.Mesh(
      new THREE.BoxGeometry(1.34, 0.12, 0.74),
      new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.4, metalness: 0.6 })
    );
    trimBox.position.y = 0.68;
    crateGroup.add(crateBox, trimBox);
    crateGroup.position.set(45.0, groundY, -169.35);
    this.scene.add(crateGroup);
    this.tempObjects.push(crateGroup);

    const playerX = 45.0;
    const playerZ = -170.5;
    const talkYaw = Math.PI; // facing +Z toward Marcus & Ammu-Nation sign
    const finalPlayerYaw = -Math.PI / 2; // facing East (+X) toward the Vipers' compound

    player.position.set(playerX, groundY, playerZ);
    player.velocity.set(0, 0, 0);
    player.rotationY = talkYaw;
    player.mesh.visible = true;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.set(0, talkYaw, 0);

    this.shots = [
      // SHOT 1 (0.0s - 3.5s): Low hero tilt from AMMU-NATION neon sign down to Marcus & tactical crate
      {
        start: 0.0,
        end: 3.5,
        camStart: new THREE.Vector3(41.5, 4.4, -175.2),
        camEnd: new THREE.Vector3(42.8, 1.75, -172.0),
        lookStart: new THREE.Vector3(45.0, 4.8, -167.5),
        lookEnd: new THREE.Vector3(45.0, 1.35, -169.0),
        fovStart: 50,
        fovEnd: 45,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
          animateHumanoid(marcusRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },
      // SHOT 2 (3.5s - 7.5s): Close-up across the tactical crate as player equips Micro SMG
      {
        start: 3.5,
        end: 7.5,
        camStart: new THREE.Vector3(46.8, 1.55, -169.8),
        camEnd: new THREE.Vector3(46.4, 1.62, -168.9),
        lookStart: new THREE.Vector3(44.8, 1.35, -169.2),
        lookEnd: new THREE.Vector3(44.9, 1.48, -170.2),
        fovStart: 42,
        fovEnd: 46,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: localT > 0.35 });
          animateHumanoid(marcusRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },
      // SHOT 3 (7.5s - 9.0s): Smooth blend to gameplay camera facing East
      {
        start: 7.5,
        end: 9.0,
        camStart: new THREE.Vector3(46.4, 1.62, -168.9),
        camEnd: new THREE.Vector3(
          playerX + Math.sin(finalPlayerYaw) * 4.2 + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55 + Math.sin(0.22) * 4.2,
          playerZ + Math.cos(finalPlayerYaw) * 4.2 - Math.sin(finalPlayerYaw) * 0.35
        ),
        lookStart: new THREE.Vector3(44.9, 1.48, -170.2),
        lookEnd: new THREE.Vector3(
          playerX + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55,
          playerZ - Math.sin(finalPlayerYaw) * 0.35
        ),
        fovStart: 46,
        fovEnd: 65,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          player.rotationY = lerp( -Math.PI, finalPlayerYaw, easeInOutCubic(localT));
          player.mesh.rotation.y = player.rotationY;
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
        }
      }
    ];

    this.subtitles = [
      {
        start: 0.3,
        end: 3.4,
        speaker: 'MARCUS (AMMU-NATION)',
        color: '#e74c3c',
        text: "Lamar called ahead. Military Kevlar vest, full-auto Micro SMG, and hollow-point mags—all untraceable."
      },
      {
        start: 3.6,
        end: 8.2,
        speaker: 'MARCUS (AMMU-NATION)',
        color: '#e74c3c',
        text: "The Vipers are holed up at the Eastside Compound two blocks east. Scout the lot before you strike."
      }
    ];

    this.cues = [
      {
        time: 3.6,
        fired: false,
        action: () => {
          this.game.audio.play('reload', 1.0);
          this.game.weapons.refillAllAmmo();
          this.game.weapons.equipWeapon(2); // Equip Micro SMG
          this.game.player.health = this.game.player.maxHealth;
          this.game.player.armor = this.game.player.maxArmor;
        }
      }
    ];

    this._startSequence(9.0, playerX, groundY, playerZ, finalPlayerYaw, () => {
      this.game.weapons.refillAllAmmo();
      this.game.weapons.equipWeapon(2);
      this.game.player.health = this.game.player.maxHealth;
      this.game.player.armor = this.game.player.maxArmor;
      if (onComplete) onComplete();
    });
  }

  /**
   * Mission 2 Finale / Mission 3 Intro: "Casing the Stash" at Vipers Eastside Compound (Block [6, 3]).
   */
  playCompoundRecon(onComplete = null) {
    this.cleanupTempObjects();
    this.setTitleCard(
      'EASTSIDE INDUSTRIAL LOT',
      'VIPERS SYNDICATE STRONGHOLD — TARGET RECON',
      'TACTICAL BRIEFING'
    );

    const { player, hud, speedometer } = this.game;
    if (player.inVehicle && player.currentVehicle) {
      player.exitVehicle();
    }
    speedometer.hide();
    hud.hideActionPrompt();
    this.game.audio.updateEngine(0, 0, false);
    this.game.audio.updateTires(0);

    const groundY = CURB_H;
    const playerX = 186.0;
    const playerZ = -45.0;
    const finalPlayerYaw = -Math.PI / 2; // facing East (+X) directly into Block [6, 3] (`cx = 225, cz = -45`)

    player.position.set(playerX, groundY, playerZ);
    player.velocity.set(0, 0, 0);
    player.rotationY = finalPlayerYaw;
    player.mesh.visible = true;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.set(0, finalPlayerYaw, 0);

    this.shots = [
      // SHOT 1 (0.0s - 3.6s): High drone sweep from West entrance into the Vipers Compound
      {
        start: 0.0,
        end: 3.6,
        camStart: new THREE.Vector3(178.0, 12.0, -56.0),
        camEnd: new THREE.Vector3(204.0, 5.5, -52.0),
        lookStart: new THREE.Vector3(225.0, 2.0, -45.0),
        lookEnd: new THREE.Vector3(225.0, 1.4, -45.0),
        fovStart: 52,
        fovEnd: 40,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: true });
        }
      },
      // SHOT 2 (3.6s - 7.4s): Telephoto zoom orbiting the Armored Cash Briefcase & Syndicate guards
      {
        start: 3.6,
        end: 7.4,
        camStart: new THREE.Vector3(214.0, 2.2, -37.0),
        camEnd: new THREE.Vector3(216.0, 1.85, -52.0),
        lookStart: new THREE.Vector3(225.0, 1.2, -45.0),
        lookEnd: new THREE.Vector3(225.0, 1.1, -45.0),
        fovStart: 36,
        fovEnd: 34,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: true });
        }
      },
      // SHOT 3 (7.4s - 9.2s): Pull back behind the Player locking and loading at the compound entrance
      {
        start: 7.4,
        end: 9.2,
        camStart: new THREE.Vector3(192.0, 1.8, -42.0),
        camEnd: new THREE.Vector3(
          playerX + Math.sin(finalPlayerYaw) * 4.2 + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55 + Math.sin(0.22) * 4.2,
          playerZ + Math.cos(finalPlayerYaw) * 4.2 - Math.sin(finalPlayerYaw) * 0.35
        ),
        lookStart: new THREE.Vector3(225.0, 1.4, -45.0),
        lookEnd: new THREE.Vector3(
          playerX + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55,
          playerZ - Math.sin(finalPlayerYaw) * 0.35
        ),
        fovStart: 44,
        fovEnd: 65,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: true });
        }
      }
    ];

    this.subtitles = [
      {
        start: 0.3,
        end: 3.5,
        speaker: 'LAMAR (COMMS)',
        color: '#2ecc71',
        text: "Eyes on target! Five Viper enforcers guarding the black SUVs and our armored cash case in the center."
      },
      {
        start: 3.7,
        end: 8.5,
        speaker: 'YOU',
        color: '#00ffff',
        text: "Once I start shooting, Vice City PD will swarm the block. Let's hit 'em fast and grab the case."
      }
    ];

    this.cues = [
      { time: 0.3, fired: false, action: () => this.game.audio.play('radioComms', 0.9) },
      { time: 7.4, fired: false, action: () => this.game.audio.play('reload', 0.9) }
    ];

    this._startSequence(9.2, playerX, groundY, playerZ, finalPlayerYaw, onComplete);
  }

  /**
   * Mission 3 Finale ("Out on Bail" Chapter 1 Complete): Delivering the Briefcase to Lamar.
   */
  playChapterFinale(onComplete = null) {
    this.cleanupTempObjects();
    this.setTitleCard(
      'CHAPTER 1: OUT ON BAIL',
      'VICE CITY KINGPINS — THE SCORE IS SETTLED',
      'FINALE CINEMATIC'
    );

    const { player, playerCar, hud, speedometer, police } = this.game;
    const activeCar = (player.inVehicle && player.currentVehicle) ? player.currentVehicle : playerCar;

    if (player.inVehicle && player.currentVehicle) {
      player.exitVehicle();
    }
    if (police) police.clearPolice();
    speedometer.hide();
    hud.hideActionPrompt();
    this.game.audio.updateEngine(0, 0, false);
    this.game.audio.updateTires(0);

    const groundY = CURB_H;
    activeCar.position.set(41.2, this.game.layout.getGroundHeight(41.2, 102.2), 102.2);
    activeCar.velocity.set(0, 0);
    activeCar.speed = 0;
    activeCar.rotationY = -2.45;
    activeCar.mesh.position.copy(activeCar.position);
    activeCar.mesh.rotation.set(0, -2.45, 0);

    const lamarRig = createHumanoid({
      role: 'civilian',
      shirtColor: 0x2ecc71,
      pantsColor: 0x1e272e,
      skinColor: 0x8d5524
    });
    lamarRig.root.position.set(46.2, groundY, 106.4);
    lamarRig.root.rotation.y = 0.55;
    this.scene.add(lamarRig.root);
    this.tempObjects.push(lamarRig.root);

    // Golden Armored Cash Briefcase at Lamar's feet
    const caseMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.65, 0.35, 0.45),
      new THREE.MeshStandardMaterial({ color: 0xf1c40f, emissive: 0x7d6608, metalness: 0.7, roughness: 0.25 })
    );
    caseMesh.position.set(45.5, groundY + 0.2, 105.7);
    this.scene.add(caseMesh);
    this.tempObjects.push(caseMesh);

    const playerX = 44.8;
    const playerZ = 105.0;
    const talkYaw = Math.PI + 0.55;
    const finalPlayerYaw = 0.0;

    player.position.set(playerX, groundY, playerZ);
    player.velocity.set(0, 0, 0);
    player.rotationY = talkYaw;
    player.mesh.visible = true;
    player.mesh.position.copy(player.position);
    player.mesh.rotation.set(0, talkYaw, 0);

    this.shots = [
      // SHOT 1 (0.0s - 4.0s): Low close-up on the recovered Golden Briefcase tilting up to Lamar & Player
      {
        start: 0.0,
        end: 4.0,
        camStart: new THREE.Vector3(44.2, 0.75, 106.8),
        camEnd: new THREE.Vector3(43.5, 1.65, 106.2),
        lookStart: new THREE.Vector3(45.5, 0.35, 105.7),
        lookEnd: new THREE.Vector3(45.6, 1.48, 105.8),
        fovStart: 42,
        fovEnd: 46,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          caseMesh.rotation.y += dt * 1.2;
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
          animateHumanoid(lamarRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },
      // SHOT 2 (4.0s - 8.2s): Hero crane shot rising high above Downtown Vice City skyline
      {
        start: 4.0,
        end: 8.2,
        camStart: new THREE.Vector3(42.0, 2.2, 99.0),
        camEnd: new THREE.Vector3(26.0, 18.0, 82.0),
        lookStart: new THREE.Vector3(45.5, 1.5, 105.5),
        lookEnd: new THREE.Vector3(45.0, 6.0, 115.0),
        fovStart: 48,
        fovEnd: 56,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
          animateHumanoid(lamarRig, dt, { moving: false, sprinting: false, aiming: false });
        }
      },
      // SHOT 3 (8.2s - 9.6s): Return to gameplay camera
      {
        start: 8.2,
        end: 9.6,
        camStart: new THREE.Vector3(26.0, 18.0, 82.0),
        camEnd: new THREE.Vector3(
          playerX + Math.sin(finalPlayerYaw) * 4.2 + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55 + Math.sin(0.22) * 4.2,
          playerZ + Math.cos(finalPlayerYaw) * 4.2 - Math.sin(finalPlayerYaw) * 0.35
        ),
        lookStart: new THREE.Vector3(45.0, 6.0, 115.0),
        lookEnd: new THREE.Vector3(
          playerX + Math.cos(finalPlayerYaw) * 0.35,
          groundY + 1.55,
          playerZ - Math.sin(finalPlayerYaw) * 0.35
        ),
        fovStart: 56,
        fovEnd: 65,
        ease: easeInOutCubic,
        onUpdate: (localT, dt) => {
          player.rotationY = lerp(talkYaw - Math.PI * 2, finalPlayerYaw, easeInOutCubic(localT));
          player.mesh.rotation.y = player.rotationY;
          animateHumanoid(player.rig, dt, { moving: false, sprinting: false, aiming: false });
        }
      }
    ];

    this.subtitles = [
      {
        start: 0.3,
        end: 3.9,
        speaker: 'LAMAR',
        color: '#2ecc71',
        text: "Unbelievable! You smoked the Vipers, shook Vice City PD, and brought every dollar back intact!"
      },
      {
        start: 4.1,
        end: 9.0,
        speaker: 'YOU',
        color: '#00ffff',
        text: "Tell the whole state we're back in business. This city is ours for the taking."
      }
    ];

    this.cues = [
      { time: 0.25, fired: false, action: () => this.game.audio.play('cratePickup', 1.0) },
      { time: 4.1, fired: false, action: () => this.game.audio.play('missionPassed', 1.0) }
    ];

    this._startSequence(9.6, playerX, groundY, playerZ, finalPlayerYaw, onComplete);
  }

  _startSequence(duration, finalPlayerX, groundY, finalPlayerZ, finalPlayerYaw, onComplete) {
    const { player, cameraController } = this.game;
    this.totalDuration = duration;
    this.elapsed = 0;
    this.isPlaying = true;

    this.overlayEl.classList.remove('cutscene-hidden');
    const hudEl = document.getElementById('hud-overlay');
    if (hudEl) hudEl.style.opacity = '0';

    cameraController.setMode('FOOT', finalPlayerYaw);
    cameraController.pitch = 0.22;
    cameraController.pivot.set(finalPlayerX, groundY + 1.55, finalPlayerZ);

    this.onCompleteCallback = () => {
      this.cleanupTempObjects();

      player.position.set(finalPlayerX, groundY, finalPlayerZ);
      player.velocity.set(0, 0, 0);
      player.rotationY = finalPlayerYaw;
      player.mesh.position.copy(player.position);
      player.mesh.rotation.set(0, finalPlayerYaw, 0);

      this.camera.fov = 65;
      this.camera.updateProjectionMatrix();
      cameraController.setMode('FOOT', finalPlayerYaw);
      cameraController.pitch = 0.22;
      cameraController.pivot.set(finalPlayerX, groundY + 1.55, finalPlayerZ);
      cameraController.update(0.016, player.position, player.rotationY, 0);

      if (hudEl) hudEl.style.opacity = '1';
      this.overlayEl.classList.add('cutscene-hidden');

      if (onComplete) onComplete();
    };

    this.update(0);
  }

  skip() {
    if (!this.isPlaying) return;
    this.isPlaying = false;
    if (this.onCompleteCallback) {
      const cb = this.onCompleteCallback;
      this.onCompleteCallback = null;
      cb();
    }
  }

  update(dt) {
    if (!this.isPlaying) return;

    // Allow player to skip with Space or Enter (after 0.35s debounce)
    if (this.elapsed > 0.35) {
      const input = this.game.input;
      if (input.wasKeyJustPressed('Space') || input.wasKeyJustPressed('Enter')) {
        this.skip();
        return;
      }
    }

    this.elapsed += dt;

    // Trigger one-shot audio/event cues
    for (const cue of this.cues) {
      if (!cue.fired && this.elapsed >= cue.time) {
        cue.fired = true;
        cue.action();
      }
    }

    // Title card visibility (shown during Shot 1: 0.4s -> 3.3s)
    if (this.titleCardEl) {
      const showTitle = this.elapsed >= 0.35 && this.elapsed <= 3.35;
      this.titleCardEl.classList.toggle('visible', showTitle);
    }

    // Subtitle update
    if (this.subtitleEl) {
      const activeSub = this.subtitles.find((s) => this.elapsed >= s.start && this.elapsed <= s.end);
      if (activeSub) {
        this.subtitleEl.innerHTML = `<span class="cutscene-speaker" style="color:${activeSub.color}">${activeSub.speaker}:</span> ${activeSub.text}`;
        this.subtitleEl.classList.add('visible');
      } else {
        this.subtitleEl.classList.remove('visible');
      }
    }

    // Evaluate active camera shot
    const shot =
      this.shots.find((s) => this.elapsed >= s.start && this.elapsed <= s.end) ||
      this.shots[this.shots.length - 1];

    if (shot) {
      const span = Math.max(0.001, shot.end - shot.start);
      const rawT = clamp((this.elapsed - shot.start) / span, 0, 1);
      const easedT = shot.ease ? shot.ease(rawT) : rawT;

      this._camPos.lerpVectors(shot.camStart, shot.camEnd, easedT);
      this._lookPos.lerpVectors(shot.lookStart, shot.lookEnd, easedT);

      // Subtle handheld cinematic breathing motion
      const breathe = shot === this.shots[this.shots.length - 1] ? 1 - rawT : 1.0;
      this._camPos.y += Math.sin(this.elapsed * 2.1) * 0.025 * breathe;

      this.camera.position.copy(this._camPos);
      this.camera.lookAt(this._lookPos);

      const fov = lerp(shot.fovStart ?? 55, shot.fovEnd ?? 55, easedT);
      if (Math.abs(this.camera.fov - fov) > 0.05) {
        this.camera.fov = fov;
        this.camera.updateProjectionMatrix();
      }

      if (shot.onUpdate) {
        shot.onUpdate(rawT, dt);
      }
    }

    if (this.elapsed >= this.totalDuration) {
      this.skip();
    }
  }
}
