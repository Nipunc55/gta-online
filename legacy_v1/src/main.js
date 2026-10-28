import * as THREE from 'three';
import { GameRenderer } from './core/Renderer.js';
import { CameraController } from './core/CameraController.js';
import { InputManager } from './core/InputManager.js';
import { AudioManager } from './core/AudioManager.js';

import { SkyAndLighting } from './world/SkyAndLighting.js';
import { Ocean } from './world/Ocean.js';
import { EnvironmentProps } from './world/EnvironmentProps.js';
import { CityBuilder } from './world/CityBuilder.js';

import { Character } from './entities/Character.js';
import { Vehicle } from './entities/Vehicle.js';
import { TrafficSystem } from './entities/TrafficSystem.js';
import { PedestrianSystem } from './entities/PedestrianSystem.js';
import { PoliceSystem } from './entities/PoliceSystem.js';

import { ImpactEffects } from './combat/ImpactEffects.js';
import { WeaponSystem } from './combat/WeaponSystem.js';

import { HUD } from './ui/HUD.js';
import { Speedometer } from './ui/Speedometer.js';
import { RadioWheel } from './ui/RadioWheel.js';

class Game {
  constructor() {
    this.canvas = document.getElementById('webgl-canvas');
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);

    this.renderer = new GameRenderer(this.canvas);
    this.input = new InputManager(this.canvas);
    this.cameraController = new CameraController(this.camera, this.canvas);
    this.audio = new AudioManager();

    // World
    this.skyAndLighting = new SkyAndLighting(this.scene);
    this.ocean = new Ocean(this.scene);
    this.envProps = new EnvironmentProps(this.scene);
    this.city = new CityBuilder(this.scene, this.envProps);

    // Entities
    this.character = new Character(this.scene, this.city);
    // Player's primary supercar parked right on Ocean Drive
    this.playerCar = new Vehicle(this.scene, this.city, this.audio, 110, 20, false);

    // Systems
    this.traffic = new TrafficSystem(this.scene, this.city, this.audio);
    this.pedestrians = new PedestrianSystem(this.scene, this.city, this.audio);
    this.police = new PoliceSystem(this.scene, this.city, this.audio);

    // Combat
    this.effects = new ImpactEffects(this.scene);
    this.weapons = new WeaponSystem(
      this.scene,
      this.camera,
      this.character,
      this.audio,
      this.effects,
      this.pedestrians,
      this.police,
      this.traffic
    );

    // UI
    this.hud = new HUD(this.character, this.police, this.weapons);
    this.speedometer = new Speedometer();
    this.radioWheel = new RadioWheel(this.audio);

    // State
    this.isRunning = false;
    this.isPaused = false;
    this.activeVehicle = null;
    this.clock = new THREE.Clock();

    this.initUIEvents();
  }

  initUIEvents() {
    const startBtn = document.getElementById('start-btn');
    const startScreen = document.getElementById('start-screen');
    const pauseScreen = document.getElementById('pause-screen');
    const resumeBtn = document.getElementById('resume-btn');
    const qualitySelect = document.getElementById('quality-select');

    startBtn.addEventListener('click', () => {
      this.audio.init();
      this.audio.resume();
      this.input.requestPointerLock();
      startScreen.style.display = 'none';
      this.isRunning = true;
      this.clock.start();
      this.animate();
    });

    resumeBtn.addEventListener('click', () => {
      this.isPaused = false;
      pauseScreen.style.display = 'none';
      this.input.requestPointerLock();
    });

    qualitySelect.addEventListener('change', (e) => {
      this.renderer.setQuality(e.target.value);
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'KeyP') {
        if (this.isRunning) {
          this.isPaused = !this.isPaused;
          pauseScreen.style.display = this.isPaused ? 'flex' : 'none';
          if (this.isPaused) {
            this.input.exitPointerLock();
          } else {
            this.input.requestPointerLock();
          }
        }
      }
    });
  }

  handleVehicleTransitions() {
    if (this.input.wasKeyJustPressed('KeyF')) {
      if (this.character.inVehicle && this.activeVehicle) {
        // Exit vehicle to the driver's side (left)
        const exitPos = this.activeVehicle.position.clone().add(
          new THREE.Vector3(
            -Math.cos(this.activeVehicle.rotationY) * 2.2,
            0,
            Math.sin(this.activeVehicle.rotationY) * 2.2
          )
        );
        this.activeVehicle.isOccupied = false;
        this.character.exitVehicle(exitPos);
        this.activeVehicle = null;

        this.cameraController.setMode('FOOT');
        this.speedometer.hide();
        this.audio.updateEngine(0, 0, false);
      } else {
        // Check for nearest vehicle (Player supercar, Traffic, or Police cruisers)
        let targetCar = null;
        if (this.character.position.distanceTo(this.playerCar.position) < 4.5) {
          targetCar = this.playerCar;
        } else {
          targetCar = this.traffic.getNearestVehicle(this.character.position, 4.5);
          if (!targetCar && this.police.policeCars && this.police.policeCars.length > 0) {
            let minD = 4.5;
            for (const cruiser of this.police.policeCars) {
              const d = this.character.position.distanceTo(cruiser.position);
              if (d < minD) {
                minD = d;
                targetCar = cruiser;
              }
            }
          }
        }

        if (targetCar) {
          this.activeVehicle = targetCar;
          targetCar.isOccupied = true;
          this.character.enterVehicle(targetCar);

          this.cameraController.setMode('VEHICLE');
          this.speedometer.show(targetCar.isPolice ? 'VCPD INTERCEPTOR' : 'GROTTI CHEETAH GT');
          this.hud.hideActionPrompt();
        }
      }
    }

    // Vehicle specific shortcuts
    if (this.activeVehicle && this.character.inVehicle) {
      if (this.input.wasKeyJustPressed('KeyQ')) {
        this.radioWheel.cycleStation();
      }
      if (this.input.wasKeyJustPressed('KeyE')) {
        if (!this.activeVehicle.isPolice && this.audio && typeof this.audio.playHorn === 'function') {
          this.audio.playHorn();
        }
      }
    }

    // Camera angle toggle
    if (this.input.wasKeyJustPressed('KeyC')) {
      if (this.character.inVehicle) {
        const nextMode = this.cameraController.mode === 'VEHICLE' ? 'CINEMATIC' : 'VEHICLE';
        this.cameraController.setMode(nextMode);
      }
    }
  }

  checkPrompts() {
    this.checkInteractiveZones();

    if (this.character.inVehicle) {
      const pnsPos = new THREE.Vector3(118, 0, -120);
      if (this.activeVehicle.position.distanceTo(pnsPos) < 7.0) {
        this.hud.showActionPrompt("PAY 'N' SPRAY: REPAIRED & WANTED CLEARED!");
      } else {
        this.hud.showActionPrompt('PRESS [F] TO EXIT VEHICLE');
      }
    } else {
      const distToPlayerCar = this.character.position.distanceTo(this.playerCar.position);
      const nearestTraffic = this.traffic.getNearestVehicle(this.character.position, 4.5);
      let nearestPolice = null;
      if (this.police.policeCars) {
        for (const c of this.police.policeCars) {
          if (this.character.position.distanceTo(c.position) < 4.5) {
            nearestPolice = c;
            break;
          }
        }
      }
      const ammuPos = new THREE.Vector3(120, 0, 50);

      if (this.character.position.distanceTo(ammuPos) < 4.0) {
        this.hud.showActionPrompt("AMMU-NATION: HEALTH, ARMOR & AMMO REFILLED!");
      } else if (distToPlayerCar < 4.5) {
        this.hud.showActionPrompt('PRESS [F] TO ENTER GROTTI CHEETAH');
      } else if (nearestPolice) {
        this.hud.showActionPrompt('PRESS [F] TO HIJACK VCPD INTERCEPTOR');
      } else if (nearestTraffic) {
        this.hud.showActionPrompt('PRESS [F] TO HIJACK VEHICLE');
      } else {
        this.hud.hideActionPrompt();
      }
    }
  }

  checkInteractiveZones() {
    const playerPos = this.character.inVehicle && this.activeVehicle ? this.activeVehicle.position : this.character.position;

    // Dynamic District Title on Top Left HUD
    const locNameElem = document.getElementById('location-name');
    if (locNameElem) {
      if (playerPos.x > 0) {
        locNameElem.innerText = "OCEAN BEACH, VICE CITY";
      } else if (playerPos.x >= -90 && playerPos.x <= 0) {
        locNameElem.innerText = "STARFISH ISLAND, VICE CITY";
      } else if (playerPos.x < -90 && playerPos.z < -180) {
        locNameElem.innerText = "VICE PORT INDUSTRIAL, VICE CITY";
      } else {
        locNameElem.innerText = "DOWNTOWN FINANCIAL, VICE CITY";
      }
    }

    // Pay 'n' Spray Auto Repair & Respray (with 2-second debounce)
    const now = performance.now();
    const pnsPos = new THREE.Vector3(118, 0, -120);
    if (this.character.inVehicle && this.activeVehicle) {
      if (this.activeVehicle.position.distanceTo(pnsPos) < 7.0) {
        if (!this.lastPnsTime || now - this.lastPnsTime > 2000) {
          this.lastPnsTime = now;
          if (this.police.wantedLevel > 0) {
            this.police.wantedLevel = 0;
            this.police.clearPolice();
          }
          const colors = [0xff0044, 0x00f0ff, 0xffd700, 0x9900ff, 0x00ff66, 0xff5500, 0xffffff];
          this.activeVehicle.chassis.material.color.setHex(colors[Math.floor(Math.random() * colors.length)]);
          if (this.audio && typeof this.audio.playHorn === 'function') {
            this.audio.playHorn();
          }
        }
      }
    }

    // Ammu-Nation Refill
    const ammuPos = new THREE.Vector3(120, 0, 50);
    if (!this.character.inVehicle && this.character.position.distanceTo(ammuPos) < 4.0) {
      this.character.health = 100;
      this.character.armor = 100;
      this.weapons.weapons.forEach(w => {
        if (w.maxAmmo !== Infinity) w.ammo = w.maxAmmo;
      });
    }

    // Stunt Ramps Airborne Airtime Launch
    if (this.character.inVehicle && this.activeVehicle) {
      const v = this.activeVehicle;
      const d1 = v.position.distanceTo(new THREE.Vector3(-92, 0, -60));
      const d2 = v.position.distanceTo(new THREE.Vector3(2, 0, 40));
      if ((d1 < 6.5 || d2 < 6.5) && Math.abs(v.speed) > 14.0 && !v.isAirborne) {
        if (typeof v.applyJumpImpulse === 'function') {
          v.applyJumpImpulse(14.5, 1.2);
        } else {
          v.speed = Math.min(v.speed * 1.15, 48);
        }
        this.cameraController.addShake(0.4);
      }
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    if (!this.isRunning || this.isPaused) return;

    let delta = this.clock.getDelta();
    // Clamp delta to avoid physics explosion during tab out
    delta = Math.min(delta, 0.05);

    // Mouse camera look
    const mouseDelta = this.input.consumeMouseDelta();
    this.cameraController.handleMouseDelta(mouseDelta.x, mouseDelta.y);

    // Enter / Exit vehicle
    this.handleVehicleTransitions();
    this.checkPrompts();

    // Update Player & Vehicles
    if (this.character.inVehicle && this.activeVehicle) {
      this.character.mesh.visible = false;
      this.character.position.copy(this.activeVehicle.position);
      this.activeVehicle.update(delta, this.input);
      this.speedometer.update(this.activeVehicle);

      // Camera follows vehicle
      this.cameraController.update(
        delta,
        this.activeVehicle.position,
        this.activeVehicle.rotationY,
        this.activeVehicle.speed
      );
      this.skyAndLighting.updateFollow(this.activeVehicle.position);
    } else {
      this.character.update(delta, this.input, this.cameraController.yaw, this.cameraController.pitch);
      this.cameraController.setAiming(this.character.isAiming);
      this.cameraController.update(delta, this.character.position, this.character.rotationY, 0);
      this.skyAndLighting.updateFollow(this.character.position);
    }

    // Update Player Car if not occupied
    if (!this.playerCar.isOccupied) {
      this.playerCar.update(delta, null);
    }

    // Weapons & Combat
    this.weapons.update(delta, this.input);
    this.effects.update(delta);

    // Traffic & Pedestrians AI (with vehicle collision physics)
    const allCars = [...this.traffic.vehicles, this.playerCar, ...this.police.policeCars];
    const currentTargetPos = this.character.inVehicle ? this.activeVehicle.position : this.character.position;
    this.traffic.update(delta, currentTargetPos, this.activeVehicle);
    this.pedestrians.update(delta, currentTargetPos, allCars, (ped, car, damage) => {
      this.effects.createImpactSparks(ped.position);
      if (car.isOccupied) {
        this.cameraController.addShake(0.35);
        this.police.addCrime(2);
        this.weapons.triggerHitMarkerUI();
      }
    });
    this.police.update(delta, currentTargetPos, this.character.inVehicle);

    // World animation
    this.ocean.update(delta);
    this.envProps.update(delta);

    // UI Updates
    const currentRotY = (this.character.inVehicle && this.activeVehicle) ? this.activeVehicle.rotationY : this.character.rotationY;
    this.hud.update(
      currentTargetPos,
      currentRotY,
      this.cameraController.yaw,
      allCars,
      this.police.policeCars
    );

    // Render WebGL frame
    this.renderer.render(this.scene, this.camera);

    this.input.resetFrame();
  }
}

// Instantiate game on page load
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
