# Architecture & System Design (`ARCHITECTURE.md`)

## 1. Overview
This project is a 3D low-poly open-world action & driving game inspired by **Grand Theft Auto V** running entirely in the browser via **Three.js (r170)**, **Vite 6**, and procedural **Web Audio API** synthesis. All 3D models, textures, and sound effects are generated procedurally in code (zero external asset dependencies).

## 2. Directory & Module Structure

```
src/
├── main.js                      # Game bootstrap, main loop, vehicle entry/exit, interactive zones
├── core/
│   ├── MathUtils.js             # Seeded RNG, angle wrapping, exponential damping, 2D helpers
│   ├── EventBus.js              # Lightweight pub/sub for gameplay events (damage, wasted, kills)
│   ├── InputManager.js          # Keyboard, mouse buttons, pointer lock, wheel delta & per-frame edges
│   ├── CameraController.js      # Third-person FOOT / VEHICLE / HOOD camera with wall-clip raycast & recoil
│   ├── Renderer.js              # WebGLRenderer with ACES tone mapping, soft shadows & quality presets
│   └── AudioManager.js          # Procedural Web Audio synth (engine RPM, tire squeal, guns, sirens, radio, explosions)
├── world/
│   ├── CityLayout.js            # 8×8 city block grid, district zoning, 4-lane road graph, BFS pathfinding, traffic light cycle, sidewalk graph
│   ├── Collision.js             # Spatial-hash AABB collider world with circle push-out & 2D DDA raycasting
│   ├── GeoBuilder.js            # Vertex-colored BufferGeometry batch builder (1 draw call per city block)
│   ├── Props.js                 # InstancedMesh street furniture & vegetation (lamps, traffic lights, palms, trees, hydrants, fountains)
│   ├── CityGenerator.js         # Generates ground, road markings, skyscrapers, midtown storefronts, houses, parks, police HQ, hospital, Ammu-Nation
│   ├── SkyAndLighting.js        # Day/night cycle, sky dome + stars, sun/moon light, weather & rain, animated ocean shader
│   └── LightBeamMaterial.js     # Soft volumetric light-beam shader (street lamps & headlights)
├── entities/
│   ├── HumanoidModel.js         # Shared articulated low-poly character rig + walk/sprint/aim/punch animations
│   ├── Player.js                # On-foot movement, sprint stamina, jump/curb physics, health/armor/cash, vehicle entry/exit
│   ├── VehicleModels.js         # 5 distinct low-poly vehicle classes (Sport, Sedan, SUV, Pickup, Police Interceptor)
│   ├── Vehicle.js               # 2D velocity-vector physics (forward + lateral slip), handbrake drifting, 5-speed gears, vehicle-to-vehicle collisions, damage & explosions
│   ├── TrafficSystem.js         # Lane-following AI vehicles obeying traffic lights & spacing + parked cars
│   ├── PedestrianSystem.js      # Sidewalk-walking civilians, armed gang NPCs, police officers, ragdoll vehicle impacts, cash drops
│   └── PoliceSystem.js          # 5-star wanted level, BFS road-pathfinding cruisers, dismounting foot officers, line-of-sight evasion
├── combat/
│   ├── WeaponSystem.js          # 5 weapons (Fists, Pistol, Micro SMG, Pump Shotgun, Carbine Rifle), magazines & reload [R], spread, recoil, occluded raycasting
│   └── ImpactEffects.js         # Sparks, blood splatter, bullet tracers, drift/damage smoke, vehicle explosion fireballs
└── ui/
    ├── HUD.js                   # Rotating minimap radar, vitals bars, cash counter, weapon/ammo display, wanted stars, wasted banner
    ├── Speedometer.js           # SVG RPM dial, digital MPH readout, gear indicator
    ├── RadioWheel.js            # Radio station banner notification
    └── styles.css               # HUD & overlay styling
```

## 3. Coordinate & Orientation Conventions
- **World Forward (`yaw = 0`)**: `-Z` axis (`forward = (-sin(yaw), 0, -cos(yaw))`, `right = (cos(yaw), 0, -sin(yaw))`).
- **Ground Heights**:
  - Roads: `y = 0.0`
  - Sidewalks & city blocks: `y = 0.15` (`CURB_H`)
  - Outer sandy beach: slopes from `y = 0.0` at `410m` down into the ocean (`y = -0.55`).
- **Collision System**: `StaticColliders` uses a `16m` spatial hash grid. Characters and vehicles resolve collisions via `resolveCircle()`, while bullets, NPC line-of-sight, and the camera boom use `raycast()`.
