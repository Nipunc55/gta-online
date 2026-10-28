# Developer & Autonomous Agent Architecture Guide

## Overview
This document serves as the high-level technical entry point for developers and autonomous AI agents working on the codebase. It details system dependencies, the central tick loop, event communication, and direct links to sub-system technical specifications.

---

## Technical Documentation Index

Detailed specifications are organized by domain in the [`docs/`](file:///d:/My%20Side%20Projects/GTA%20online/docs/) directory:

| Document | Domain | Key Systems Covered |
|---|---|---|
| [**`character.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/character.md) | Character & Traversal | Humanoid rig, WASD movement, sprint stamina, curb step-up, ADS aim strafe, vitals & hospital respawn |
| [**`vehicles.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/vehicles.md) | Vehicle Physics & Driving | 2D velocity vector mechanics, drift grip decay, 5 vehicle classes, 5-speed auto transmission, pairwise collisions & explosions |
| [**`weapons.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/weapons.md) | Combat & Weapons | 5 weapons, magazine clips, reload `[R]`, spread cones, camera recoil, building occlusion raycasting, headshots, tracers |
| [**`npc.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/npc.md) | Living City NPCs & AI | Civilian, gang & police roles, sidewalk graph traversal, traffic-light crosswalks, panic flee, gang combat, ragdoll physics, cash drops |
| [**`police.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/police.md) | Police & Wanted Levels | Crime scoring, 0–5 star levels, BFS road navigation, vehicle pursuit physics, tactical officer dismounts, evasion |
| [**`maps.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/maps.md) | World Architecture & Maps | 8×8 block grid, 4-lane avenues, Downtown/Midtown/Residential zoning, landmarks, 1-draw-call block batching, instanced props |
| [**`weather.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/weather.md) | Day/Night Cycle & Weather | Periodic 24h diurnal cycle, sun/moon orbit, procedural night stars, auto night headlights, instanced street lamps, `CLEAR`/`OVERCAST`/`RAIN` weather & 3D rain particles |
| [**`missions.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/missions.md) | Missions & Economy | Wallet balance, cash drop economy, interactive zone triggers, Mission class blueprint, checkpoint races, taxi fares, heists |
| [**`audio.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/audio.md) | Audio Synthesizer | 100% procedural Web Audio, engine RPM synth, tire skids, gunfire, dual-tone horn, distance-attenuated sirens, 3 radio stations |
| [**`ui.md`**](file:///d:/My%20Side%20Projects/GTA%20online/docs/ui.md) | UI, HUD & Controls | Rotating minimap radar, vitals gradient bars, cash readout, wanted stars, SVG tachometer / speedometer, action prompts, keybinds |

---

## Global Implementation Status & Roadmap

| Subsystem Spec | Implementation Status | Key Differences / Pending Work |
|---|---|---|
| **[Missions & Economy](file:///d:/My%20Side%20Projects/GTA%20online/docs/missions.md)** | ⚠️ **Partial** (Foundations only) | `Mission` base class & 3 archetypes (Races, Taxi, Heists) not yet written in `src/`; Ammu-Nation & Hospital are free |
| **[Police & Wanted Levels](file:///d:/My%20Side%20Projects/GTA%20online/docs/police.md)** | ✅ **Mostly Complete** (90%) | Evasion timer is 10.0s in code vs 12s in early draft; roadblocks, spike strips, SWAT vans & helicopters pending |
| **[UI, HUD & Controls](file:///d:/My%20Side%20Projects/GTA%20online/docs/ui.md)** | ✅ **Mostly Complete** (85%) | Minimap radar does not render landmark icon blips (Police, Hospital, Ammu-Nation) or GPS path polyline |
| **[Vehicle Physics](file:///d:/My%20Side%20Projects/GTA%20online/docs/vehicles.md)** | ✅ **Complete** (90%) | All physics & 5 classes work; drive-by shooting and 2-wheeled vehicles (motorcycles) pending |
| **[Combat & Weapons](file:///d:/My%20Side%20Projects/GTA%20online/docs/weapons.md)** | ✅ **Complete** (90%) | Raycast occlusion & 5 weapons work; throwables (grenades) and enemy weapon drops pending |
| **[NPCs & Pedestrian AI](file:///d:/My%20Side%20Projects/GTA%20online/docs/npc.md)** | ✅ **Complete** (90%) | Full FSM & ragdoll work; armed NPCs only wield pistol, ambient pedestrian voice SFX pending |
| **[World Maps & Props](file:///d:/My%20Side%20Projects/GTA%20online/docs/maps.md)** | ✅ **Complete** (90%) | Geometry & instanced props work; dynamic day/night cycle, rain weather, and destructible props pending |
| **[Audio Synthesis](file:///d:/My%20Side%20Projects/GTA%20online/docs/audio.md)** | ✅ **Complete** (90%) | Procedural engine, sirens, guns & radio work; 3D PannerNode spatialization and footsteps pending |
| **[Character & Traversal](file:///d:/My%20Side%20Projects/GTA%20online/docs/character.md)** | ✅ **Complete** (90%) | Locomotion, stamina, curbs, vitals work; ocean swimming buoyancy and mantling pending |

---

## Core System Architecture & Tick Order

The game loop runs inside `Game.animate()` in [`src/main.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/main.js) clamped to $\Delta t \le 0.05\text{s}$:

```mermaid
sequenceDiagram
    autonumber
    participant Loop as Main Loop (60 FPS)
    participant World as CityLayout & Props
    participant Input as InputManager & Camera
    participant Player as Player & Active Vehicle
    participant Combat as WeaponSystem & Effects
    participant AI as Traffic, Police & Pedestrians
    participant UI as HUD & Speedometer
    participant Render as Three.js WebGLRenderer

    Loop->>World: layout.update(dt) & props.updateTrafficLights()
    Loop->>Input: cameraController.handleMouseDelta()
    Loop->>Player: handleVehicleTransitions() & checkInteractiveZones()
    Loop->>Player: Update Player (or Player Car with updatePlayer)
    Loop->>Combat: weapons.update(dt, input, allCars) & effects.update(dt)
    Loop->>AI: traffic.update(dt) & police.update(dt)
    Loop->>AI: Vehicle.resolveVehiclePairs(allCars)
    Loop->>AI: pedestrians.update(dt, player, allCars, onVehicleHitPed)
    Loop->>UI: hud.update() & speedometer.update()
    Loop->>Render: renderer.render(scene, camera)
```

---

## Inter-System Decoupling via EventBus

Gameplay systems communicate via the shared `EventBus` (`src/core/EventBus.js`):

| Event | Emitted By | Payload | Handled By |
|---|---|---|---|
| `player:damaged` | `Player.takeDamage` | `{ amount, source }` | Camera screen shake, audio trauma |
| `player:wasted` | `Player.die` | — | HUD Wasted banner, hospital respawn timer, wanted clear |
| `npc:killed` | `PedestrianSystem.killPedestrian` | `{ npc }` | Police crime score, mission objectives |
| `mission:started` | `Mission.start` | `{ id }` | HUD mission prompt, radar objective blips |
| `mission:completed`| `Mission.complete` | `{ id, reward }` | Player cash reward, audio fanfare, HUD banner |
| `mission:failed` | `Mission.fail` | `{ id, reason }` | HUD failure notification |

---

## Golden Rules for AI Agents Modifying Code

1. **Maintain Zero-Asset Architecture**: All models, textures, and sounds must remain procedural. Do not import external `.gltf`, `.obj`, `.png`, or `.mp3` files.
2. **Respect Heading Conventions**: `yaw = 0` points along world `-Z`. Use `yawFromDir(dx, dz)` and `wrapAngle()` from `MathUtils.js` for rotational calculations.
3. **Avoid Frame Allocations**: Do not instantiate `new THREE.Vector3()` or `new THREE.BufferGeometry()` inside inner frame loops; reuse temporary scratch vectors.
4. **Preserve Spatial Hash Efficiency**: Static colliders must be registered into `StaticColliders` rather than performing naive global array distance searches.
