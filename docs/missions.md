# Missions, Economy & Activity Systems

## Overview
This document specifies the mission structure, progression loops, financial economy, dynamic side-activities, and integration interfaces for developing scripted quests, delivery contracts, checkpoint races, and crime jobs within the open world.

## Source Files & Hooks
- Economy & Cash State: [`src/entities/Player.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js)
- Global Event Bus: [`src/core/EventBus.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/core/EventBus.js)
- Map Landmarks & Zones: [`src/world/CityLayout.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/CityLayout.js), [`src/world/CityGenerator.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/CityGenerator.js)
- HUD & Action Prompts: [`src/ui/HUD.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js)

---

## Economy Architecture

```
                   ┌─────────────────────────────┐
                   │    Player Wallet Balance    │
                   │   ($2,500 Starting Cash)    │
                   └──────────────┬──────────────┘
                                  │
          ▲ Inflow                │ Outflow ▼
          │                       │
┌──────────────────────┐    ┌──────────────────────┐
│ Cash Drops from NPCs │    │ Ammu-Nation Arsenal  │
│  (Civilians: $45)    │    │  (Weapons & Ammo)    │
│  (Gangsters: $120)   │    └──────────────────────┘
└──────────────────────┘    ┌──────────────────────┐
┌──────────────────────┐    │ Vehicle Repairs &    │
│ Mission Rewards      │    │ Resprays (Pay'n'Spray│
│  (Taxi, Heists, Race)│    └──────────────────────┘
└──────────────────────┘    ┌──────────────────────┐
┌──────────────────────┐    │ Hospital Bills on    │
│ Bounties & Hijacking │    │ "WASTED" Respawn     │
└──────────────────────┘    └──────────────────────┘
```

---

## Interactive World Locations & Triggers

Locations are registered in `CityGenerator.zones` and checked in `main.js`:

### 1. Ammu-Nation (`Block [4, 2]`, coordinates $[x = 9.5, z = -72]$)
- **Trigger**: Player walks within 5.5 meters on foot.
- **Action**: Restores 100 Health, 100 Armor, and refills all weapon magazine clips and reserve ammo pools to maximum capacity.
- **HUD Prompt**: `"AMMU-NATION: HEALTH, ARMOR & ALL WEAPONS REFILLED!"`

### 2. Pillbox Hill Medical Center (`Block [5, 5]`, coordinates $[x = 9.5, z = 20]$)
- **Trigger**: Automatic upon player health depletion (`health <= 0`).
- **Action**: Repositions player outside hospital emergency bay, restores health, and clears active wanted stars.

---

## Mission Types & Blueprint Architecture

Missions are decoupled from core gameplay using `EventBus`:

### Mission Interface Template
```javascript
export class Mission {
  constructor(game, config) {
    this.game = game;
    this.id = config.id;
    this.title = config.title;
    this.reward = config.reward;
    this.stage = 'inactive'; // 'inactive' | 'active' | 'completed' | 'failed'
    this.timer = config.timeLimit || null;
    this.waypoints = config.waypoints || [];
    this.currentWaypointIndex = 0;
  }

  start() {
    this.stage = 'active';
    this.game.hud.showActionPrompt(`MISSION STARTED: ${this.title}`);
    this.game.events.emit('mission:started', { id: this.id });
  }

  update(dt) {
    if (this.stage !== 'active') return;
    if (this.timer !== null) {
      this.timer -= dt;
      if (this.timer <= 0) this.fail('Time expired');
    }
  }

  complete() {
    this.stage = 'completed';
    this.game.player.addCash(this.reward);
    this.game.audio.play('pickup', 1.0);
    this.game.hud.showActionPrompt(`MISSION COMPLETE! +$${this.reward.toLocaleString()}`);
    this.game.events.emit('mission:completed', { id: this.id, reward: this.reward });
  }

  fail(reason) {
    this.stage = 'failed';
    this.game.hud.showActionPrompt(`MISSION FAILED: ${reason}`);
    this.game.events.emit('mission:failed', { id: this.id, reason });
  }
}
```

### Core Mission Archetypes

1. **Checkpoint Street Race (Timed Driving)**:
   - **Objective**: Drive through a series of glowing cylindrical ring waypoints across Downtown and Midtown avenues within a time limit.
   - **Verification**: Collision check against waypoint center:
     $$\text{dist}(\text{car.position}, \text{waypoint.position}) < 5.0\text{ meters}$$
   - **Reward**: \$1,500 – \$5,000 based on completion time.

2. **Taxi Courier / Fare Dispatch**:
   - **Objective**: Pick up an NPC waiting on a sidewalk curb and transport them to a target district (e.g. Legion Square to Pillbox Hospital) without destroying the vehicle.
   - **Vehicle Damage Penalty**: Fares dock tip rewards if the car sustains collision impacts.

3. **Gang Stronghold Heist (Combat Elimination)**:
   - **Objective**: Infiltrate an alleyway or parking structure occupied by armed gang NPCs, eliminate hostile targets, and retrieve a high-value contraband package.
   - **Triggers Wanted Level**: Gunfire alerts nearby police, requiring a post-heist vehicle escape to evade pursuit and cash in the reward.

---

## Implementation Status & Diff vs Code

| Feature | In Design Spec | In Code (`src/`) | Status |
|---|---|---|---|
| **Mission Class Interface** | Documented base class template | Not implemented (`src/missions/` does not exist) | ❌ Blueprint Only |
| **Mission Archetypes** | Street Race, Taxi Dispatch, Gang Heist | Not implemented | ❌ Blueprint Only |
| **Ammu-Nation Pricing** | Outflow cost for health/armor/ammo refills | Completely free refill in [`main.js#L248-L250`](file:///d:/My%20Side%20Projects/GTA%20online/src/main.js#L248-L250) | ⚠️ Diff (No cost charged) |
| **Hospital Respawn Fee** | Hospital bill deducted on "WASTED" | Free respawn with \$0 deducted in [`main.js#L128-L132`](file:///d:/My%20Side%20Projects/GTA%20online/src/main.js#L128-L132) | ⚠️ Diff (No fee deducted) |
| **Pay'n'Spray Repairs** | Vehicle repair and respray money sink | Not integrated into active generator or game loop | ❌ Not implemented |
| **Cash Wallet & Starting Balance** | \$2,500 starting cash | Implemented in [`Player.js#L33`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js#L33) | ✅ Implemented |
| **NPC Cash Drops** | \$45 Civilians / \$120 Gangsters | Implemented in [`PedestrianSystem.js#L139-L166`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PedestrianSystem.js#L139-L166) | ✅ Implemented |
| **Interactive World Triggers** | Ammu-Nation & Hospital trigger zones | Implemented in [`main.js#L244-L254`](file:///d:/My%20Side%20Projects/GTA%20online/src/main.js#L244-L254) | ✅ Implemented |
| **HUD Action Prompts & EventBus** | Prompts and lifecycle event broadcast | Implemented in [`HUD.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js) & [`EventBus.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/core/EventBus.js) | ✅ Implemented |

---

## TODO Items

- [ ] **Core Mission Engine**: Create `src/missions/Mission.js` base class and `src/missions/MissionManager.js`.
- [ ] **Street Race Mission**: Implement timed checkpoint race through glowing cylindrical 3D waypoints with timer HUD and cash payouts.
- [ ] **Taxi Courier Mission**: Implement passenger pick-up spots, destination waypoints, and vehicle collision tip deductions.
- [ ] **Gang Stronghold Heist**: Implement contraband package pickup, wave combat against armed gang NPCs, and post-heist police pursuit evasion.
- [ ] **Ammu-Nation Economy**: Charge a balanced cash fee (\$250 to \$750) for health, armor, and ammo refills.
- [ ] **Hospital Respawn Bill**: Deduct medical fee (\$500 or 10% of balance) upon player death respawn.
- [ ] **Pay'n'Spray Auto Shop**: Add an active repair & respray garage zone in `CityGenerator.js` that restores vehicle health and clears wanted stars for \$500.
