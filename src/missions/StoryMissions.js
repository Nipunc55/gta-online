import * as THREE from 'three';
import { Mission } from './Mission.js';
import { CURB_H } from '../world/CityLayout.js';

/**
 * MISSION 1: "FRESH OUT"
 * Prologue getaway from Precinct 04 to Lamar's Downtown Safehouse (Block [4, 5]).
 */
export class Mission1_FreshOut extends Mission {
  constructor(game) {
    super(game, {
      id: 'mission_1_fresh_out',
      chapter: 'CHAPTER 1 • MISSION 1 OF 3',
      title: 'FRESH OUT',
      reward: 1500
    });
    this.midCallSent = false;
  }

  onStart() {
    this.midCallSent = false;
    const { player, playerCar } = this.game;

    if (player.inVehicle) {
      this.enterDriveStage();
    } else {
      this.stepIndex = 0;
      this.setObjective(
        'ENTER YOUR GROTTI CHEETAH GT',
        'Walk to the red supercar parked at the curb and press [F]',
        {
          x: playerCar.position.x,
          z: playerCar.position.z,
          radius: 3.5,
          color: 0x00ffff,
          label: 'CHEETAH GT'
        }
      );
      this.game.missions.showComms(
        'LAMAR DAVIS',
        '#2ecc71',
        "Yo! Hop in the red Cheetah GT before the precinct guards start asking questions!"
      );
    }
  }

  enterDriveStage() {
    this.stepIndex = 1;
    this.setObjective(
      "DRIVE TO LAMAR'S DOWNTOWN SAFEHOUSE",
      'Follow the yellow GPS route on your radar to Block [4, 5]',
      {
        x: 45.0,
        z: 104.0,
        radius: 6.5,
        color: 0xf1c40f,
        label: 'SAFEHOUSE'
      }
    );
    this.game.missions.showComms(
      'LAMAR DAVIS',
      '#2ecc71',
      "She still purrs! Cruise southeast to my Downtown Safehouse garage—we got big business to discuss."
    );
  }

  onUpdate(_dt) {
    const { player, playerCar, cutscene } = this.game;

    if (this.stepIndex === 0) {
      // Keep waypoint locked to the car in case it rolled slightly
      if (this.waypoint) {
        this.waypoint.x = playerCar.position.x;
        this.waypoint.z = playerCar.position.z;
      }
      if (player.inVehicle) {
        this.enterDriveStage();
      }
      return;
    }

    if (this.stepIndex === 1) {
      const dist = Math.hypot(player.position.x - 45.0, player.position.z - 104.0);
      if (!this.midCallSent && dist < 145) {
        this.midCallSent = true;
        this.game.missions.showComms(
          'LAMAR DAVIS',
          '#2ecc71',
          "Almost here! Pull right into the neon-green safehouse courtyard off Central Ave."
        );
      }
      if (dist < 7.2) {
        this.stepIndex = 2;
        this.waypoint = null;
        this.game.missions.syncObjectiveUI();
        cutscene.playSafehouseReunion(() => {
          this.complete();
        });
      }
    }
  }
}

/**
 * MISSION 2: "ARMED & READY"
 * Gear up with Marcus at Ammu-Nation (Block [4, 2]), then scout the Vipers' Eastside Compound (Block [6, 3]).
 */
export class Mission2_ArmedAndReady extends Mission {
  constructor(game) {
    super(game, {
      id: 'mission_2_armed_ready',
      chapter: 'CHAPTER 1 • MISSION 2 OF 3',
      title: 'ARMED & READY',
      reward: 2000
    });
  }

  onStart() {
    this.stepIndex = 0;
    this.setObjective(
      'MEET MARCUS AT AMMU-NATION',
      'Drive north to the Ammu-Nation gun shop in Block [4, 2]',
      {
        x: 45.0,
        z: -170.5,
        radius: 5.5,
        color: 0xf1c40f,
        label: 'AMMU-NATION'
      }
    );
    this.game.missions.showComms(
      'LAMAR DAVIS',
      '#2ecc71',
      "Head straight north to Ammu-Nation. Marcus has a military SMG and Kevlar armor set aside for you."
    );
  }

  onUpdate(_dt) {
    const { player, cutscene } = this.game;

    if (this.stepIndex === 0) {
      const dist = Math.hypot(player.position.x - 45.0, player.position.z - -170.5);
      if (dist < 6.8) {
        this.stepIndex = 1;
        this.waypoint = null;
        this.game.missions.syncObjectiveUI();

        // Spawn preview props inside Block [6, 3] before the recon cutscene starts
        this.game.missions.spawnCompoundEnvironment();

        cutscene.playAmmuNationGearUp(() => {
          this.enterReconStage();
        });
      }
      return;
    }

    if (this.stepIndex === 2) {
      const dist = Math.hypot(player.position.x - 182.0, player.position.z - -45.0);
      if (dist < 7.8) {
        this.stepIndex = 3;
        this.waypoint = null;
        this.game.missions.syncObjectiveUI();
        cutscene.playCompoundRecon(() => {
          this.complete();
        });
      }
    }
  }

  enterReconStage() {
    this.stepIndex = 2;
    this.setObjective(
      "SCOUT THE VIPERS' EASTSIDE COMPOUND",
      'Drive east to the compound entrance at Block [6, 3]',
      {
        x: 182.0,
        z: -45.0,
        radius: 6.5,
        color: 0xf1c40f,
        label: 'VIPERS COMPOUND'
      }
    );
    this.game.missions.showComms(
      'MARCUS (AMMU-NATION)',
      '#e74c3c',
      "You're locked and loaded with the Micro SMG. Head east to the compound gate and scope out the Vipers."
    );
  }
}

/**
 * MISSION 3: "PAYBACK & PURSUIT"
 * Eliminate the 5 armed Viper Syndicate guards, seize the Armored Cash Briefcase,
 * evade the resulting 2-Star Police Pursuit, and deliver the cash to Lamar's Safehouse.
 */
export class Mission3_PaybackPursuit extends Mission {
  constructor(game) {
    super(game, {
      id: 'mission_3_payback_pursuit',
      chapter: 'CHAPTER 1 • FINALE (3 OF 3)',
      title: 'PAYBACK & PURSUIT',
      reward: 10000
    });
    this.guards = [];
    this.totalGuards = 5;
    this.briefcaseGroup = null;
  }

  onStart() {
    this.stepIndex = 0;
    this.guards = [];
    this.game.pedestrians.clearMissionActors();
    this.game.missions.spawnCompoundEnvironment();

    // Spawn glowing Armored Cash Briefcase on central crate at (225, CURB_H, -45)
    this.spawnBriefcaseProp();

    // Spawn 5 armed Viper Syndicate Enforcers guarding the compound
    const guardPosts = [
      { x: 211.5, z: -39.5, yaw: 1.57 },
      { x: 211.5, z: -50.5, yaw: 1.57 },
      { x: 222.0, z: -35.5, yaw: 0.45 },
      { x: 222.0, z: -54.5, yaw: 2.65 },
      { x: 230.5, z: -45.0, yaw: 1.57 }
    ];
    for (const post of guardPosts) {
      const g = this.game.pedestrians.spawnMissionGuard(post.x, post.z, post.yaw);
      this.guards.push(g);
    }

    this.updateGuardObjective();
    this.game.missions.showComms(
      'LAMAR DAVIS',
      '#2ecc71',
      "Weapons free! Wipe out those 5 Viper guards and grab our Armored Cash Briefcase from the center crate!"
    );
  }

  spawnBriefcaseProp() {
    const group = new THREE.Group();
    group.position.set(225.0, CURB_H, -45.0);

    // Base military crate
    const crate = new THREE.Mesh(
      new THREE.BoxGeometry(1.6, 0.85, 1.1),
      new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.7, metalness: 0.3 })
    );
    crate.position.y = 0.425;
    group.add(crate);

    // Floating golden armored cash briefcase
    const briefcase = new THREE.Mesh(
      new THREE.BoxGeometry(0.72, 0.42, 0.52),
      new THREE.MeshStandardMaterial({
        color: 0xf1c40f,
        emissive: 0x9a7d0a,
        emissiveIntensity: 0.8,
        metalness: 0.75,
        roughness: 0.2
      })
    );
    briefcase.position.y = 1.25;
    group.add(briefcase);

    // Handle bar
    const handle = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.1, 0.08),
      new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.9 })
    );
    handle.position.y = 1.5;
    group.add(handle);

    this.briefcaseMesh = briefcase;
    this.briefcaseGroup = this.addTempMesh(group);
  }

  getLivingGuardCount() {
    return this.guards.filter((g) => g && g.state !== 'DEAD').length;
  }

  updateGuardObjective() {
    const alive = this.getLivingGuardCount();
    const killed = this.totalGuards - alive;
    this.setObjective(
      `ELIMINATE VIPER SYNDICATE ENFORCERS (${killed} / ${this.totalGuards})`,
      'Use [Right-Click] to aim and [Left-Click] to fire • Red diamonds mark targets',
      {
        x: 225.0,
        z: -45.0,
        radius: 3.5,
        color: 0xff1744,
        label: 'VIPER STRONGHOLD'
      }
    );
  }

  onNPCKilled(npc) {
    if (this.stage !== 'active') return;
    if (this.stepIndex === 0 && npc.isMissionActor) {
      const alive = this.getLivingGuardCount();
      if (alive <= 0) {
        this.enterBriefcasePickupStage();
      } else {
        this.updateGuardObjective();
      }
    }
  }

  enterBriefcasePickupStage() {
    this.stepIndex = 1;
    this.setObjective(
      'COLLECT THE ARMORED CASH BRIEFCASE',
      'Walk up to the golden crate in the center of the compound',
      {
        x: 225.0,
        z: -45.0,
        radius: 2.8,
        color: 0x2ecc71,
        label: 'CASH BRIEFCASE'
      }
    );
    this.game.missions.showComms(
      'LAMAR DAVIS',
      '#2ecc71',
      "All Viper guards are down! Grab the Armored Cash Briefcase before the cops roll up!"
    );
  }

  enterPursuitStage() {
    this.stepIndex = 2;
    if (this.briefcaseGroup && this.briefcaseGroup.parent) {
      this.briefcaseGroup.parent.remove(this.briefcaseGroup);
    }
    this.game.player.addCash(5000);
    this.game.audio.play('cratePickup', 1.0);

    // Ensure at least a 2-Star Police Pursuit is active
    if (this.game.police.wantedLevel < 2) {
      this.game.police.addCrime(4);
    }

    this.setObjective(
      'LOSE THE COPS — EVADE THE POLICE PURSUIT',
      "Break line-of-sight (>62m) or drive through Westside Pay'n'Spray (Block [1, 2])",
      {
        x: -225.0,
        z: -163.5,
        radius: 5.5,
        color: 0x00ffff,
        label: "PAY 'N' SPRAY"
      }
    );
    this.game.missions.showComms(
      'LAMAR DAVIS',
      '#2ecc71',
      "You got the $50K case! Vice City PD is swarming—outdrive them or hit the Westside Pay'n'Spray to clear your heat!"
    );
  }

  enterReturnStage() {
    this.stepIndex = 3;
    this.setObjective(
      "DELIVER THE BRIEFCASE TO LAMAR'S SAFEHOUSE",
      'Drive back to the Downtown Safehouse in Block [4, 5]',
      {
        x: 45.0,
        z: 104.0,
        radius: 6.5,
        color: 0x2ecc71,
        label: 'SAFEHOUSE DROP-OFF'
      }
    );
    this.game.missions.showComms(
      'LAMAR DAVIS',
      '#2ecc71',
      "Cops lost your trail! Bring that cash briefcase back to the Downtown Safehouse!"
    );
  }

  onUpdate(dt) {
    const { player, police, cutscene } = this.game;

    if (this.briefcaseMesh) {
      this.briefcaseMesh.rotation.y += dt * 2.2;
      this.briefcaseMesh.position.y = 1.25 + Math.sin(performance.now() * 0.005) * 0.1;
    }

    // Step 0: Guard elimination check
    if (this.stepIndex === 0) {
      if (this.getLivingGuardCount() <= 0) {
        this.enterBriefcasePickupStage();
        return;
      }
      // Also allow bold players to snatch the briefcase directly if they reach the crate on foot
      const distToCase = Math.hypot(player.position.x - 225.0, player.position.z - -45.0);
      if (distToCase < 2.6 && !player.inVehicle && this.getLivingGuardCount() <= 2) {
        this.enterPursuitStage();
      }
      return;
    }

    // Step 1: Collect the briefcase
    if (this.stepIndex === 1) {
      const dist = Math.hypot(player.position.x - 225.0, player.position.z - -45.0);
      if (dist < 3.4) {
        this.enterPursuitStage();
      }
      return;
    }

    // Step 2: Evade police pursuit
    if (this.stepIndex === 2) {
      if (police.wantedLevel === 0) {
        this.enterReturnStage();
      }
      return;
    }

    // Step 3: Return to Lamar's Safehouse (if cops spot player again, must lose them first)
    if (this.stepIndex === 3) {
      if (police.wantedLevel > 0) {
        this.stepIndex = 2;
        this.setObjective(
          'LOSE THE COPS BEFORE ENTERING THE SAFEHOUSE',
          "Evade police pursuit or use the Westside Pay'n'Spray",
          {
            x: -225.0,
            z: -163.5,
            radius: 5.5,
            color: 0x00ffff,
            label: "PAY 'N' SPRAY"
          }
        );
        return;
      }

      const dist = Math.hypot(player.position.x - 45.0, player.position.z - 104.0);
      if (dist < 7.2) {
        this.stepIndex = 4;
        this.waypoint = null;
        this.game.missions.syncObjectiveUI();
        cutscene.playChapterFinale(() => {
          this.complete();
        });
      }
    }
  }
}

/**
 * BONUS SIDE CONTRACT: "MIDNIGHT STREET SPRINT"
 * Repeatable high-speed checkpoint race across the Vice City boulevards.
 */
export class Mission4_StreetSprint extends Mission {
  constructor(game) {
    super(game, {
      id: 'mission_4_street_sprint',
      chapter: 'SIDE CONTRACT • STREET RACE',
      title: 'NEON BOULEVARD SPRINT',
      reward: 5000
    });
    this.checkpoints = [
      { x: 0.0, z: 90.0, label: 'CHECKPOINT 1/6 — CENTRAL AVE' },
      { x: -180.0, z: 90.0, label: 'CHECKPOINT 2/6 — WEST BOULEVARD' },
      { x: -180.0, z: -180.0, label: 'CHECKPOINT 3/6 — PRECINCT CORNER' },
      { x: 90.0, z: -180.0, label: 'CHECKPOINT 4/6 — NORTH AMMU STRIP' },
      { x: 180.0, z: 0.0, label: 'CHECKPOINT 5/6 — EASTSIDE OVERPASS' },
      { x: 45.0, z: 104.0, label: 'FINISH LINE — DOWNTOWN SAFEHOUSE' }
    ];
    this.cpIndex = 0;
  }

  onStart() {
    this.cpIndex = 0;
    this.timer = 95.0;
    this.syncCheckpoint();
    this.game.missions.showComms(
      'LAMAR DAVIS',
      '#00ffff',
      "Street race time! Hit all 6 glowing cyan checkpoints across Vice City before the 95-second clock runs out!"
    );
  }

  syncCheckpoint() {
    const cp = this.checkpoints[this.cpIndex];
    this.setObjective(
      `RACE THROUGH ${cp.label}`,
      `Checkpoints Cleared: ${this.cpIndex} / ${this.checkpoints.length} • Keep your speed up!`,
      {
        x: cp.x,
        z: cp.z,
        radius: 8.5,
        color: 0x00ffff,
        label: `CP ${this.cpIndex + 1}`
      }
    );
  }

  onUpdate(_dt) {
    const { player } = this.game;
    const cp = this.checkpoints[this.cpIndex];
    if (!cp) return;

    const dist = Math.hypot(player.position.x - cp.x, player.position.z - cp.z);
    if (dist < 10.5) {
      this.game.audio.play('pickup', 0.95);
      this.cpIndex++;
      if (this.cpIndex >= this.checkpoints.length) {
        this.complete();
      } else {
        this.syncCheckpoint();
      }
    }
  }
}
