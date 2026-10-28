import * as THREE from 'three';
import { GameRenderer } from './core/Renderer.js';
import { CameraController } from './core/CameraController.js';
import { InputManager } from './core/InputManager.js';
import { AudioManager } from './core/AudioManager.js';
import { EventBus } from './core/EventBus.js';

import { CityLayout } from './world/CityLayout.js';
import { StaticColliders } from './world/Collision.js';
import { Props } from './world/Props.js';
import { CityGenerator } from './world/CityGenerator.js';
import { SkyAndLighting } from './world/SkyAndLighting.js';

import { Player } from './entities/Player.js';
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
    this.camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1100);

    this.renderer = new GameRenderer(this.canvas, this.camera);
    this.input = new InputManager(this.canvas);
    this.audio = new AudioManager();
    this.events = new EventBus();

    // Open-world Los Santos city data + spatial collider hash + instanced props + merged block geometry
    this.layout = new CityLayout(2026);
    this.colliders = new StaticColliders(16);
    this.props = new Props(this.scene, this.colliders);
    this.cityGen = new CityGenerator(this.scene, this.layout, this.colliders, this.props);
    this.props.build();
    this.skyAndLighting = new SkyAndLighting(this.scene);

    this.cameraController = new CameraController(this.camera, this.colliders);

    // Player & signature supercar parked on the street right next to the player
    this.player = new Player(this.scene, this.layout, this.colliders, this.events);
    this.playerCar = new Vehicle(
      this.scene,
      this.layout,
      this.colliders,
      this.audio,
      'sport',
      3.5,
      14,
      0,
      0xe74c3c
    );

    // AI Systems
    this.traffic = new TrafficSystem(
      this.scene,
      this.layout,
      this.colliders,
      this.audio,
      this.cityGen.parkingSpots
    );
    this.pedestrians = new PedestrianSystem(
      this.scene,
      this.layout,
      this.colliders,
      this.audio,
      this.events
    );
    this.police = new PoliceSystem(
      this.scene,
      this.layout,
      this.colliders,
      this.audio,
      this.pedestrians
    );

    // Combat & FX
    this.effects = new ImpactEffects(this.scene);
    this.weapons = new WeaponSystem(
      this.scene,
      this.camera,
      this.cameraController,
      this.player,
      this.colliders,
      this.audio,
      this.effects,
      this.pedestrians,
      this.police,
      this.traffic
    );

    // UI
    this.hud = new HUD(this.player, this.police, this.weapons, this.layout);
    this.speedometer = new Speedometer();
    this.radioWheel = new RadioWheel(this.audio);

    this.isRunning = false;
    this.isPaused = false;
    this.clock = new THREE.Clock();

    this.bindEvents();
    this.initUIEvents();

    // Render initial preview frame behind the start screen
    this.cameraController.update(0.016, this.player.position, this.player.rotationY, 0);
    this.skyAndLighting.update(0.016, this.player.position);
    this.renderer.render(this.scene, this.camera);
  }

  bindEvents() {
    this.events.on('player:damaged', () => {
      this.cameraController.addShake(0.22);
    });

    this.events.on('player:wasted', () => {
      this.speedometer.hide();
      this.audio.updateEngine(0, 0, false);
      this.cameraController.setMode('FOOT');
      setTimeout(() => {
        const hosp = this.cityGen.zones.hospital || { x: 9.5, z: 20 };
        this.police.clearPolice();
        this.player.respawn(hosp);
      }, 3000);
    });
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
      if (!this.isRunning) {
        this.isRunning = true;
        this.clock.start();
        this.animate();
      }
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
          if (this.isPaused) this.input.exitPointerLock();
          else this.input.requestPointerLock();
        }
      }
    });
  }

  findClosestEnterableVehicle(maxDist = 4.6) {
    let best = null;
    let bestD = maxDist;
    const candidates = [this.playerCar, ...this.traffic.vehicles, ...this.police.policeCars];
    for (const car of candidates) {
      if (!car || car.isDestroyed) continue;
      const d = this.player.position.distanceTo(car.position);
      if (d < bestD) {
        bestD = d;
        best = car;
      }
    }
    return best;
  }

  handleVehicleTransitions() {
    if (!this.player.isAlive) return;

    if (this.input.wasKeyJustPressed('KeyF')) {
      if (this.player.inVehicle && this.player.currentVehicle) {
        this.player.exitVehicle();
        this.cameraController.setMode('FOOT', this.player.rotationY);
        this.speedometer.hide();
        this.audio.updateEngine(0, 0, false);
        this.audio.updateTires(0);
      } else {
        const targetCar = this.findClosestEnterableVehicle(4.8);
        if (targetCar) {
          const wasHijack = targetCar.driver === 'traffic' || targetCar.driver === 'police';
          this.player.enterVehicle(targetCar, this.skyAndLighting.isNight);
          this.cameraController.setMode('VEHICLE', targetCar.rotationY);
          this.speedometer.show(targetCar.modelName);
          this.hud.hideActionPrompt();
          if (wasHijack) {
            this.police.addCrime(targetCar.isPolice ? 3 : 1);
            this.pedestrians.alertGunshot(targetCar.position, 22);
          }
        }
      }
    }

    // In-vehicle hotkeys: Radio [Q], Horn/Siren [E], Headlights [H], Camera [C]
    if (this.player.inVehicle && this.player.currentVehicle) {
      const car = this.player.currentVehicle;
      if (this.input.wasKeyJustPressed('KeyQ')) {
        this.radioWheel.cycleStation();
      }
      if (this.input.wasKeyJustPressed('KeyE')) {
        if (car.isPolice) {
          car.sirenOn = !car.sirenOn;
          this.audio.setSiren(car.sirenOn);
        } else {
          this.audio.play('horn', 1.0);
        }
      }
      if (this.input.wasKeyJustPressed('KeyH') || this.input.wasKeyJustPressed('KeyL')) {
        car.toggleHeadlights();
      }
      if (this.input.wasKeyJustPressed('KeyC')) {
        const nextMode = this.cameraController.mode === 'VEHICLE' ? 'HOOD' : 'VEHICLE';
        this.cameraController.setMode(nextMode, car.rotationY);
      }
    }
  }

  updateInteractiveZonesAndPrompts() {
    if (!this.player.isAlive) {
      this.hud.hideActionPrompt();
      return;
    }

    const ammu = this.cityGen.zones.ammu;
    if (ammu && !this.player.inVehicle) {
      const d = Math.hypot(this.player.position.x - ammu.x, this.player.position.z - ammu.z);
      if (d < 5.5) {
        this.player.health = this.player.maxHealth;
        this.player.armor = this.player.maxArmor;
        this.weapons.refillAllAmmo();
        this.hud.showActionPrompt('AMMU-NATION: HEALTH, ARMOR & ALL WEAPONS REFILLED!');
        return;
      }
    }

    if (this.player.inVehicle && this.player.currentVehicle) {
      this.hud.showActionPrompt('PRESS [F] TO EXIT VEHICLE');
      return;
    }

    const nearest = this.findClosestEnterableVehicle(4.8);
    if (nearest) {
      const action = nearest.driver ? 'HIJACK' : 'ENTER';
      this.hud.showActionPrompt(`PRESS [F] TO ${action} ${nearest.modelName}`);
    } else {
      this.hud.hideActionPrompt();
    }
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    if (!this.isRunning || this.isPaused) return;

    const dt = Math.min(this.clock.getDelta(), 0.05);

    // 1. Traffic lights, street lamps & time/weather hotkey [T]
    if (this.input.wasKeyJustPressed('KeyT')) {
      this.skyAndLighting.cycleTimeAndWeather();
    }
    this.layout.update(dt);
    this.props.updateTrafficLights((axis) => this.layout.getLightState(axis));
    this.props.updateNightLights(this.skyAndLighting.isNight, this.skyAndLighting.nightFactor);
    this.cityGen.updateNightLights(this.skyAndLighting.nightFactor);

    // 2. Camera mouse look
    const mouseDelta = this.input.consumeMouseDelta();
    this.cameraController.handleMouseDelta(mouseDelta.x, mouseDelta.y);

    // 3. Enter / exit vehicles & prompts
    this.handleVehicleTransitions();
    this.updateInteractiveZonesAndPrompts();

    // 4. All active vehicles list + auto night headlights & wet-road grip sync
    const allCars = [this.playerCar];
    for (const c of this.traffic.vehicles) if (c !== this.playerCar) allCars.push(c);
    for (const c of this.police.policeCars) if (c !== this.playerCar) allCars.push(c);

    const isNight = this.skyAndLighting.isNight;
    const weatherGrip = this.skyAndLighting.getWeatherGripMultiplier();
    for (let i = 0; i < allCars.length; i++) {
      allCars[i].weatherGrip = weatherGrip;
      allCars[i].updateAutoHeadlights(isNight);
    }

    // 5. Update Player or Player-driven Vehicle
    if (this.player.inVehicle && this.player.currentVehicle) {
      const car = this.player.currentVehicle;
      car.updatePlayer(dt, this.input, this.effects);
      this.player.update(dt, this.input, this.cameraController.yaw, this.cameraController.pitch);
      this.speedometer.update(car);
      this.cameraController.update(dt, car.position, car.rotationY, car.speed);
    } else {
      this.player.update(dt, this.input, this.cameraController.yaw, this.cameraController.pitch);
      this.cameraController.setAiming(this.player.isAiming);
      this.cameraController.update(dt, this.player.position, this.player.rotationY, 0);
    }

    // Coast player's supercar if unoccupied
    if (this.playerCar.driver !== 'player') {
      this.playerCar.stepPhysics(dt, null, this.effects);
    }

    // 6. Combat & FX
    this.weapons.update(dt, this.input, allCars);
    this.effects.update(dt);

    // 7. Traffic, Pedestrians, Police, Props & Vehicle-to-Vehicle Collisions
    const focusPos = this.player.position;
    this.props.update(dt, focusPos, this.skyAndLighting.isNight, this.skyAndLighting.nightFactor);
    this.traffic.update(dt, focusPos, allCars, this.effects);
    this.police.update(dt, this.player, this.effects);
    Vehicle.resolveVehiclePairs(allCars, this.audio, this.effects);

    this.pedestrians.update(dt, this.player, allCars, this.effects, (ped, car) => {
      this.effects.createBloodSplatter(ped.position);
      if (car.driver === 'player') {
        this.cameraController.addShake(0.3);
        this.police.addCrime(2);
        this.weapons.triggerHitMarkerUI();
        this.audio.play('crash', 0.55, 0.7);
      }
    });

    // 8. Sky & Ocean follow
    this.skyAndLighting.update(dt, focusPos);

    // 9. HUD & Radar
    const activeRotY = (this.player.inVehicle && this.player.currentVehicle)
      ? this.player.currentVehicle.rotationY
      : this.player.rotationY;
    this.hud.update(
      focusPos,
      activeRotY,
      this.cameraController.yaw,
      allCars,
      this.police.policeCars,
      this.pedestrians.pedestrians,
      this.skyAndLighting
    );

    // 10. Render frame
    this.renderer.render(this.scene, this.camera);
    this.input.resetFrame();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});
