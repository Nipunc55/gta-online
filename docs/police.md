# Police Pursuit, Wanted Level & Law Enforcement

## Overview
The Police and Law Enforcement system handles crime detection, 0-to-5-star wanted levels, emergency cruiser dispatch with siren audio and flashing lightbars, BFS road network pursuit pathfinding, tactical officer dismounts, and distance/line-of-sight evasion mechanics.

## Source Files
- Police Logic & Cruiser Dispatch: [`src/entities/PoliceSystem.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PoliceSystem.js)
- Police Cruiser Vehicle Archetype: [`src/entities/VehicleModels.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/VehicleModels.js)
- Officer Humanoid Rig: [`src/entities/HumanoidModel.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/HumanoidModel.js), [`src/entities/PedestrianSystem.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PedestrianSystem.js)
- Wanted Stars HUD Display: [`src/ui/HUD.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js)

---

## Wanted Level Progression & Crime Scoring

Crimes add points to `crimePoints`, which dynamically scales `wantedLevel` (1 to 5 stars):

| Crime Action | Crime Points | Typical Wanted Stars Triggered |
|---|---|---|
| Firing a weapon in public | +1 point | ★☆☆☆☆ |
| Hijacking a civilian vehicle | +1 point | ★☆☆☆☆ |
| Assaulting / striking a pedestrian | +1 point | ★☆☆☆☆ |
| Vehicular manslaughter (running over pedestrian) | +2 points | ★★☆☆☆ |
| Eliminating a gang member | +2 points | ★★☆☆☆ |
| Hijacking a police interceptor | +3 points | ★★★☆☆ |
| Detonating a vehicle explosion | +3 points | ★★★☆☆ |
| Eliminating a police officer | +4 points | ★★★★☆ to ★★★★★ |

### Wanted Star Tiers
- **0 Stars (Clean)**: No police presence; sirens muted.
- **1 Star (Infraction)**: 1 Cruiser dispatched to investigate last reported position.
- **2 Stars (Misdemeanor)**: 2 Cruisers in active pursuit; officers engage with sidearms.
- **3 Stars (Felony)**: 3 Cruisers deployed; aggressive vehicle ramming; rapid path recalculation.
- **4–5 Stars (Maximum Threat)**: 4 Cruisers actively hunt player; continuous officer reinforcement; relentless pursuit.

---

## AI Cruiser Navigation & Pathfinding

Unlike simple linear chasing, police cruisers drive according to true vehicle physics and adhere to the city's road network:

```mermaid
flowchart TD
    A[Wanted Level > 0] --> B[Sample Cruiser Distance to Player]
    B -->|Dist > 36m| C[Run BFS on CityLayout Node Graph]
    C --> D[Extract Intermediate Road Waypoints]
    D --> E[Compute Steering Angle via yawFromDir]
    B -->|Dist <= 36m| F[Direct Visual Intercept Route]
    F --> E
    E --> G[Apply Throttle & Counter-Steer via Vehicle.stepPhysics]
    G --> H{Player on Foot & Dist < 15.5m?}
    H -->|Yes| I[Cruiser Brakes & Dismounts Officer]
    H -->|No| J[Cruiser Continues Vehicle Pursuit]
```

### 1. BFS Road Graph Pathfinding
When cruisers are further than 36 meters away, they compute the shortest path across intersection nodes (`layout.findPath(fromId, toId)`) rather than driving into solid skyscraper walls.

### 2. Vehicle-Based Pursuit Physics
Cruisers use `Vehicle.stepPhysics()` with:
- `throttle`: Up to $0.95$ on open straightaways.
- `steer`: Clamped angle differential $\text{clamp}(\Delta\theta \times 2.1, -1, 1)$.
- `handbrake`: Automatically pulled if angle delta $> 1.35\text{ rad}$ while traveling faster than $14\text{ m/s}$ to whip the cruiser around tight corners.
- `antiStuck`: If cruiser speed stays below $1.2\text{ m/s}$ for $> 1.1\text{s}$, the AI automatically reverses and counter-steers to back out of obstacles.

### 3. Tactical Officer Dismount
If the player is on foot and a cruiser closes to within $15.5\text{ meters}$:
1. The cruiser locks its handbrake.
2. The driver seat empties.
3. An armed Police Officer NPC spawns on the driver-side door ($x_{\text{door}}, z_{\text{door}}$).
4. The officer immediately enters `COMBAT` state, drawing a service pistol, tracking line-of-sight, and coordinating fire with other units.

---

## Evasion & Search Radius

- **Pursuit Range**: Police maintain active search while within 62 meters of the player.
- **Evasion State**:
  - When the player breaks line-of-sight and exceeds a distance of 62 meters from all active cruisers and officers, the HUD stars start flashing blue/gray, indicating the police have lost contact.
  - If the player remains outside the search radius for **10 seconds** (code implementation: `evasionTimer >= 10.0s`), the wanted level decrements by 1 star and removes 5 crime points.
  - When stars reach 0, all pursuing cruisers are recalled and the search is cancelled.

---

## Implementation Status & Diff vs Code

| Feature | In Design Spec | In Code (`src/`) | Status |
|---|---|---|---|
| **Evasion Timer Duration** | Stated as 12 seconds in early draft | Implemented as `10.0` seconds in [`PoliceSystem.js#L222`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PoliceSystem.js#L222) | ⚠️ Diff (10s in code vs 12s in draft) |
| **Cruiser AI & BFS Pathfinding** | BFS road-graph navigation & vehicle physics | Implemented in [`PoliceSystem.js#L140-L210`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PoliceSystem.js#L140-L210) | ✅ Implemented |
| **Tactical Dismounts** | Cruisers brake and deploy armed foot officers | Implemented in [`PoliceSystem.js#L155-L167`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PoliceSystem.js#L155-L167) | ✅ Implemented |
| **Crime Scoring & 1–5 Stars** | Crimes scale stars from 1 to 5 | Implemented in [`PoliceSystem.js#L27-L40`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PoliceSystem.js#L27-L40) | ✅ Implemented |
| **Cruiser Fleet Scaling** | Up to 4 active cruisers pursuing player | Implemented in [`PoliceSystem.js#L72`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/PoliceSystem.js#L72) | ✅ Implemented |
| **Roadblocks & Spike Strips** | Mentioned in high-level pursuit designs | Not implemented in cruiser AI | ❌ Not implemented |
| **SWAT / Enforcer Heavy Vans** | Mentioned in high-tier pursuits | Cruisers only spawn standard LSPD Interceptors | ❌ Not implemented |
| **Air Support (Police Helicopter)** | Mentioned in 5-star response | No air units or searchlights implemented | ❌ Not implemented |

---

## TODO Items

- [ ] **Evasion Timing Synchronization**: Keep code at 10.0s and ensure documentation aligns.
- [ ] **Police Roadblocks**: Implement barricade cruiser spawns across major avenue intersections at 3+ Wanted Stars.
- [ ] **Tire Spike Strips**: Deploy deployable spike strips that burst tires and severely degrade vehicle handling.
- [ ] **SWAT Enforcer Heavy Van**: Add armored tactical van archetype deployed at 4 Wanted Stars with heavy armored officers.
- [ ] **Police Surveillance Helicopter**: Add airborne chopper with moving searchlight spotlighting player at 5 Wanted Stars.
- [ ] **Arrest / Busted Mechanic**: Trigger "BUSTED" state if unmounted police surround an on-foot player with low health or zero escape velocity.
