# 🌴 GRAND THEFT AUTO VI: VICE CITY WEB EDITION
## Autonomous Agent Codebase Analysis & Engineering Audit Report (`AGENT.md`)

> **Document Version:** 1.0.0  
> **Target Project:** `gta-6-web` (`d:\My Side Projects\GTA online`)  
> **Tech Stack:** Three.js (r170), Vite 6, Web Audio API, Canvas 2D / WebGL 2.0, Modern ES Modules  

---

## 📋 Table of Contents
1. [Executive Summary](#1-executive-summary)
2. [Detailed Works Done (Component Breakdown)](#2-detailed-works-done-component-breakdown)
   - 2.1 [Core Systems & Engine](#21-core-systems--engine)
   - 2.2 [World Building & Environment](#22-world-building--environment)
   - 2.3 [Vehicle & Driving Simulation](#23-vehicle--driving-simulation)
   - 2.4 [Character & On-Foot Mechanics](#24-character--on-foot-mechanics)
   - 2.5 [Combat, Weapons & Particle FX](#25-combat-weapons--particle-fx)
   - 2.6 [Living City AI (Traffic, Pedestrians, Police)](#26-living-city-ai-traffic-pedestrians-police)
   - 2.7 [Audio Synthesis Engine](#27-audio-synthesis-engine)
   - 2.8 [UI / HUD & Visual Design](#28-ui--hud--visual-design)
3. [Identified Issues, Bugs & Technical Debt](#3-identified-issues-bugs--technical-debt)
   - 3.1 [Critical Gameplay & Physics Bugs](#31-critical-gameplay--physics-bugs)
   - 3.2 [Combat & Hit Detection Flaws](#32-combat--hit-detection-flaws)
   - 3.3 [AI & Traffic Pathing Gaps](#33-ai--traffic-pathing-gaps)
   - 3.4 [Rendering, Camera & UI Glitches](#34-rendering-camera--ui-glitches)
   - 3.5 [Audio Manager Deficiencies](#35-audio-manager-deficiencies)
4. [What Was Missed (Gap Analysis vs. Full GTA / Online Experience)](#4-what-was-missed-gap-analysis-vs-full-gta--online-experience)
   - 4.1 [Multiplayer & Networking ("GTA Online")](#41-multiplayer--networking-gta-online)
   - 4.2 [Missions, Jobs & Progression Economy](#42-missions-jobs--progression-economy)
   - 4.3 [Vehicle Mechanics & Roster](#43-vehicle-mechanics--roster)
   - 4.4 [Combat Depth & Weapon Arsenal](#44-combat-depth--weapon-arsenal)
   - 4.5 [World Dynamics & Weather](#45-world-dynamics--weather)
   - 4.6 [Water Physics & Swimming](#46-water-physics--swimming)
   - 4.7 [Mobile / Gamepad Support](#47-mobile--gamepad-support)
5. [Actionable Implementation Roadmap](#5-actionable-implementation-roadmap)

---

## 1. Executive Summary

This project is a 3D browser-based open-world action and driving game inspired by **Grand Theft Auto VI** set in Vice City / Leonida State. The application runs entirely client-side using **Three.js (0.170)** and **Vite**, leveraging procedural 3D modeling, synthetic procedural Web Audio, and custom canvas/SVG HUD elements to achieve a zero-asset footprint (no external GLTF models or MP3 files required to load the game).

The current build features a complete 3-island map (Mainland Downtown, Starfish Island, Vice Beach / Ocean Drive) with working driving physics, third-person on-foot traversal, dynamic chase/aiming cameras, procedural pedestrian and traffic simulation, a 5-star police response system, raycasted gunplay with muzzle flashes, and a rich Miami Vice-inspired UI.

However, several critical bugs (such as ghost vehicles passing through each other, police phasing through skyscrapers, broken car vertical jump physics, lack of player damage reception, and missing SVG gradients) and significant feature gaps (such as lack of any multiplayer networking despite the folder name, absence of missions, missing weapon varieties, and static water physics) must be addressed to elevate this into a complete game.

---

## 2. Detailed Works Done (Component Breakdown)

### 2.1 Core Systems & Engine
* **`src/core/Renderer.js` (`GameRenderer`)**:
  - Initialized `THREE.WebGLRenderer` configured with ACES Filmic Tone Mapping (`toneMappingExposure = 1.15`).
  - Enabled PCF Soft Shadow Maps (`THREE.PCFSoftShadowMap`).
  - Created 3-tier runtime graphics presets:
    - **Low**: Shadows disabled, pixel ratio clamped to 1.0.
    - **Medium**: `BasicShadowMap`, pixel ratio clamped to 1.25.
    - **High**: Soft shadows, 2048x2048 shadow maps, pixel ratio up to 1.75.
* **`src/core/CameraController.js` (`CameraController`)**:
  - Implemented 3 camera states:
    - `FOOT`: Third-person over-the-shoulder follow with smooth interpolation; shifts to tight right-shoulder view when aiming down sights (FOV drops from 65° to 50°).
    - `VEHICLE`: Rear chase camera with orientation lag (`lerp`), dynamic distance/height scaling based on vehicle speed, and dynamic FOV expansion (up to 83°) at high velocity.
    - `CINEMATIC`: Low wheel-angle dramatic perspective.
  - Procedural camera shake system with exponential decay for impacts and high-speed stunt jumps.
  - Ground collision clamp to prevent the camera from clipping below surface height.
* **`src/core/InputManager.js` (`InputManager`)**:
  - HTML5 Pointer Lock API integration for free mouse look.
  - Keyboard key state tracking (`isKeyDown`) and single-frame edge triggers (`wasKeyJustPressed`).
  - Mouse button tracking for Left Click (attack/shoot) and Right Click (aim down sights).
  - Mouse wheel delta consumption for cycling weapons.

---

### 2.2 World Building & Environment
* **`src/world/CityBuilder.js` (`CityBuilder`)**:
  - Constructed a massive multi-island world map spanning ~700m × 700m:
    - **Mainland / Downtown (West, X: -360 to -140)**: Financial center with 15+ towering skyscrapers (reaching up to 160m with spires, red aircraft warning beacons, helipads, and neon billboards), industrial shipping port with silos and container yards, and the VCPD Headquarters precinct.
    - **Starfish Island (Center, X: -90 to 0)**: Luxury enclave featuring Spanish-style stucco villas with red-tiled roofs, swimming pools, and private palm courtyards.
    - **Vice Beach / Ocean Drive (East, X: 40 to 240)**: Pastel Art Deco hotels (The Colonade, Cleavelander, Tropicana, Neon Palms, Ocean View) with neon marquee signage, coastal promenade, and a 120m wide sandy beach.
    - **Ocean Beach Marina Pier (X: 240, Z: 110)**: 100m wooden pier extending into the water with supporting pylons and moored luxury yachts.
  - **Road & Highway Network**:
    - 6 north-south avenues and 6 east-west intersecting boulevards.
    - Procedural asphalt road canvas texture with asphalt noise grain, double yellow center dividers, and white shoulder lane markers.
    - Elevated concrete sidewalk curbs on all roadways.
    - Concrete arched bridges crossing canals between islands with glowing cyan neon guardrails.
  - **Interactive District Locations**:
    - **Ammu-Nation** (`[120, 0, 50]`): Gun shop with exterior neon sign and glowing red interaction ring.
    - **Pay 'n' Spray** (`[118, 0, -120]`): Garage with glowing turquoise ring.
    - **Malibu Club** (`[138, 8, -30]`): Neon nightclub marquee.
    - **VCPD Precinct** (`[-220, 0, 250]`): Downtown police station.
* **`src/world/Ocean.js` (`Ocean`)**:
  - 1600m × 1600m procedural water plane with custom GLSL vertex and fragment shaders.
  - Dual sine wave displacement with dynamic normal recalculation.
  - Sun specular highlight reflections and Fresnel edge transparency.
* **`src/world/SkyAndLighting.js` (`SkyAndLighting`)**:
  - Procedural sky dome shader with 3-stop Miami twilight gradient (deep purple twilight top, vibrant neon pink horizon, golden sunset orange base).
  - Directional sunlight casting shadows with dynamic frustum (`updateFollow`) tracking the player across the map.
  - Cyan ambient fill light simulating coastal ocean reflections.
  - Exponential distance fog (`FogExp2`) blending the city skyline into the sunset.
* **`src/world/EnvironmentProps.js` (`EnvironmentProps`)**:
  - Procedural curved trunk palm trees with 8-frond canopy swaying in the sea breeze.
  - Single-arm street lights with emissive yellow lamps.
  - Cantilever traffic signal gantries with red, yellow, and green lenses.
  - Lifeguard towers in turquoise and pink along the coastline.
  - Beach umbrellas with alternating color canopies.
  - Yellow and black hazard striped stunt jump ramps.
  - Canvas-rendered brand billboards (e.g. SPRUNK).
  - Detailed luxury yachts with lower hull, trim, tinted glass cabins, and radar arches.

---

### 2.3 Vehicle & Driving Simulation
* **`src/entities/Vehicle.js` (`Vehicle`)**:
  - **3D Procedural Supercar Model ("Grotti Cheetah GT")**:
    - Aerodynamic wedge chassis, sloped hood, tinted glass cabin, roof shell, rear ducktail spoiler.
    - Interior driver figure with steering wheel visible through the glass when occupied.
    - 4 individual wheels with low-profile tires, brake calipers, and chrome rims.
    - Working front headlights with a forward-projecting 45m `THREE.SpotLight` cone and red rear taillights.
    - Police Interceptor variant with black body paint, white doors, and functional red/blue flashing roof lightbar.
  - **Physics & Drivetrain**:
    - Forward acceleration, braking, reverse gear, and coasting aerodynamic drag.
    - Front wheel steering geometry with visual wheel turn angles.
    - Handbrake drift mechanics (`Space`) triggering lateral slide, velocity scrubbing, and tire slip friction.
    - Body roll on aggressive turns and chassis pitch (squat on throttle, dive on braking).
    - 5-speed simulated transmission with dynamic engine RPM calculation (800 to 7500 RPM).
    - Speedometer conversion to MPH (`getSpeedMPH()`).
    - Collision bounce recoil against registered city obstacles.

---

### 2.4 Character & On-Foot Mechanics
* **`src/entities/Character.js` (`Character`)**:
  - Modular procedural humanoid figure with Miami Vice styling (sunglasses, dark hair, teal top, dark cargo pants, white sneakers, weapon attachment hand socket).
  - WASD movement relative to current camera yaw.
  - Sprinting mechanic with stamina depletion and regeneration.
  - Jump physics with gravitational acceleration and ground contact.
  - Procedural skeletal limb animations:
    - Arm and leg swing cycles synchronized to walk/sprint frequency.
    - Idle breathing vertical oscillation.
    - Right-arm firearm aiming stance aligned with camera pitch.
    - Melee punch arm extension animation.
  - Vitals tracking: Health (100), Armor (100), Stamina (100).
  - Vehicle entry and exit state transitions (hiding character model, attaching camera to car, repositioning character to driver-side door upon exit).
  - Death state and automatic 3-second hospital respawn logic.

---

### 2.5 Combat, Weapons & Particle FX
* **`src/combat/WeaponSystem.js` (`WeaponSystem`)**:
  - 3 weapon inventory slots:
    - **Fists (`[1]`)**: Melee punch with forward sphere collision check, knockback audio, and hit confirmation.
    - **Combat Pistol (`[2]`)**: Semi-automatic sidearm (35 dmg, 12-round mag, 120 max ammo).
    - **Micro SMG (`[3]`)**: Fully automatic rapid-fire submachine gun (22 dmg, 30-round mag, 300 max ammo, 0.11s fire rate).
  - Procedurally modeled 3D weapon meshes attached to character hand socket (slides, grips, magazine clips).
  - Center-screen raycasting aligned with camera crosshair.
  - Dynamic muzzle flash light illuminating the character and immediate surroundings.
  - Crosshair hit marker animation and hit chirp audio on successful impacts.
  - Weapon switching via hotkeys (`1`, `2`, `3`) or mouse wheel scrolling.
* **`src/combat/ImpactEffects.js` (`ImpactEffects`)**:
  - Particle sparks generated on bullet impacts with surface-normal velocity reflection and gravitational falloff.
  - Tire burnout / drift smoke puffs generated during high-slip cornering.

---

### 2.6 Living City AI (Traffic, Pedestrians, Police)
* **`src/entities/TrafficSystem.js` (`TrafficSystem`)**:
  - Manages 20 ambient AI vehicles populated across major avenues.
  - Vehicles drive in designated lanes with randomized paint finishes.
  - Proximity speed throttling when trailing behind other traffic or approaching the player.
  - Map boundary wrapping to keep traffic continuously flowing.
  - Car hijacking detection (`getNearestVehicle`).
* **`src/entities/PedestrianSystem.js` (`PedestrianSystem`)**:
  - Manages 36 ambient pedestrians with procedural meshes and randomized colorful tropical clothing.
  - State machine: `WALKING`, `FLEEING`, `HIT`, `DOWN`.
  - Alert system: gunshots within 35m cause pedestrians to panic and sprint away.
  - **Full Vehicle-Pedestrian Ragdoll Impact Physics**:
    - High-speed collisions fling pedestrians into the air with momentum proportional to vehicle velocity.
    - Ragdoll tumbling rotation in mid-air.
    - Damage calculation, screen shake, hit marker, crime reporting, and ground recovery/respawn timers.
* **`src/entities/PoliceSystem.js` (`PoliceSystem`)**:
  - 0 to 5-star wanted level system.
  - Spawns up to 4 VCPD cruisers with active emergency sirens and flashing lightbars upon committing crimes (shooting, assaulting pedestrians, vehicular manslaughter).
  - Cruiser pursuit AI calculating intercept angles and throttle control.
  - Evasion mechanic: breaking a 45m line-of-sight for 10 seconds reduces wanted stars and calls off pursuit.

---

### 2.7 Audio Synthesis Engine
* **`src/core/AudioManager.js` (`AudioManager`)**:
  - **100% Procedural Web Audio API implementation (Zero external sound files)**:
    - **Engine Synthesizer**: Dual-oscillator (sawtooth + triangle) pitch-shifted from 50 Hz to 280 Hz mapped to engine RPM, with a biquad lowpass filter dynamically opening from 350 Hz to 2150 Hz based on throttle input.
    - **Tire Squeal**: Looping white noise buffer routed through a 1100 Hz bandpass filter modulated by vehicle drift slip.
    - **Gunfire Sound**: High-frequency bandpass noise burst paired with an exponential frequency-dropping sine wave (140 Hz → 30 Hz) simulating acoustic muzzle crack and bass thump.
    - **Hit Marker**: High-pitch frequency chirp (800 Hz → 1200 Hz).
    - **Police Siren**: Modulated sawtooth oscillator alternating between 650 Hz and 950 Hz.
    - **Procedural Radio Stations**:
      - *Flash FM 102.9* (Synthwave): Procedural retro chord progressions with sawtooth plucks and 4-on-the-floor kick generator.
      - *Vice Wave 98.4* (Chillwave): Ambient sine pad chords.
      - *Leonida Trap 105.1* (808 Trap): Sub-bass 808 slides.
      - *Radio Off*: Mutes playback.

---

### 2.8 UI / HUD & Visual Design
* **`src/ui/HUD.js` & `src/ui/styles.css`**:
  - **Minimap Radar**:
    - Rotating circular canvas display centered on player coordinates.
    - Rotates with camera yaw so current view direction points UP.
    - Renders islands, road network, bridges, and key landmark blips (Pay 'n' Spray, Ammu-Nation, Malibu Club, VCPD HQ).
    - Displays traffic blips (cyan) and pursuit police cruisers (flashing blue/red).
    - Dynamic player directional marker.
  - **Speedometer (`src/ui/Speedometer.js`)**:
    - Digital speed readout in MPH with current gear indicator.
    - Circular SVG tachometer displaying active engine RPM.
  - **Vitals HUD**: Custom styled gradient bars for Armor (Cyan), Health (Pink), and Stamina (Gold).
  - **Wanted Stars**: 5-star header with active pulse and pursuit emergency strobe animations.
  - **Interactive Action Prompts**: Context-sensitive floating prompts (`[F] ENTER VEHICLE`, `[F] HIJACK VEHICLE`, `[F] EXIT VEHICLE`, Ammu-Nation refill, Pay 'n' Spray respray).
  - **Radio Banner (`src/ui/RadioWheel.js`)**: Animated neon slide-down notification showing station and track metadata when cycled with `[Q]`.
  - **Start Screen & Pause Menu**: Overlay with keybind documentation and graphics quality switcher.

---

## 3. Identified Issues, Bugs & Technical Debt

### 3.1 Critical Gameplay & Physics Bugs

1. **No Vehicle-to-Vehicle Collision Detection (`Vehicle.js` / `main.js`)**:
   - *Problem:* `Vehicle.update()` only calls `this.city.checkCollision()` (which only checks static building AABBs).
   - *Result:* The player's supercar drives right through traffic cars and police cruisers like a phantom with zero collision response or collision damage.
2. **Police Cruisers Phasing Through Skyscrapers (`PoliceSystem.js:83-86`)**:
   - *Problem:* Police pursuit code directly updates `cruiser.position.x` and `cruiser.position.z` towards the player without calling `this.city.checkCollision()`.
   - *Result:* Police cruisers drive straight through solid skyscrapers, mansions, and walls.
3. **Cannot Hijack Police Cars (`main.js:141-148`)**:
   - *Problem:* The vehicle entry logic on line 142 only checks `this.playerCar` and `this.traffic.getNearestVehicle()`. `this.police.policeCars` is never checked.
   - *Result:* Pressing `[F]` next to a police cruiser does nothing, even though the speedometer and vehicle systems have explicit code for `VCPD INTERCEPTOR`.
4. **Vehicles Glued to Flat Ground (Stunt Ramps Non-Functional) (`Vehicle.js` / `main.js:243-252`)**:
   - *Problem:* `Vehicle.position.y` is hardcoded to `0.45` and never updated by velocity or gravity.
   - *Result:* Hitting a stunt ramp merely adds camera shake and slight speed; the car never gets airborne.
5. **No Ground Height Raycasting for Player (`Character.js:201-209`)**:
   - *Problem:* On-foot ground check is hardcoded to `if (this.position.y <= 0)`.
   - *Result:* When crossing bridges (deck height `y = 0.6`) or elevated sidewalks (`y = 0.25`), the player character sinks through the deck or walks at sea level.
6. **Immortal Player (Zero Incoming Damage) (`Character.js:283-294`)**:
   - *Problem:* While `Character.takeDamage()` exists, it is **never called** anywhere in the entire codebase.
   - *Result:* The player cannot be harmed, shot, or run over by cars or police.
7. **Broken Traffic Post-Hijack Logic (`TrafficSystem.js:74-79`)**:
   - *Problem:* When a player exits a hijacked traffic vehicle, `car.isOccupied` becomes `false`. The AI loop immediately resumes updating `car.position.z += car.speed * delta`.
   - *Result:* If the player parked the car facing East-West, the car slides sideways along the Z-axis.
8. **Rapid Strobe Color Flickering at Pay 'n' Spray (`main.js:223-230`)**:
   - *Problem:* Inside `checkInteractiveZones()`, if the player is within 7m of Pay 'n' Spray, `this.activeVehicle.chassis.material.color.setHex()` runs on **every single animation frame**.
   - *Result:* At 60 FPS, the car flickers wildly through random colors 60 times a second without debounce or delay.

---

### 3.2 Combat & Hit Detection Flaws

1. **Shooting Pedestrians Through Solid Buildings (`WeaponSystem.js:183-201`)**:
   - *Problem:* Pedestrian raycast distance is checked **before** building mesh intersections.
   - *Result:* Firing at a pedestrian hidden behind a skyscraper damages and kills them straight through the building.
2. **Bullets Pass Through Vehicles (`WeaponSystem.js:157-215`)**:
   - *Problem:* `WeaponSystem` receives `traffic` and `police` in its constructor, but never includes vehicle meshes in its raycast tests.
   - *Result:* Shooting a car causes no sparks, no damage, no tire popping, and no alarm.
3. **No Recoil, Bullet Spread, or Magazine Mechanics (`WeaponSystem.js`)**:
   - *Problem:* Every shot raycasts to exact `(0, 0)` screen center with pinpoint laser accuracy. There is no camera climb, recoil recovery, or spread cone. There is also no reload mechanic (`R`), only raw decrements from a single ammo counter.

---

### 3.3 AI & Traffic Pathing Gaps

1. **Pedestrians Fleeing Through Walls Forever (`PedestrianSystem.js:262-265`)**:
   - *Problem:* Pedestrians in `FLEEING` state move in a straight line without collision checks with buildings or water, and without an expiration timer.
   - *Result:* Panicked pedestrians run through walls and walk across the ocean floor indefinitely.
2. **Traffic Locked to North-South Axis (`TrafficSystem.js:17-34`)**:
   - *Problem:* Traffic only spawns on North-South roads and only moves along `Z`. They never traverse East-West streets, never make turns at intersections, and never cross bridges.
3. **Police Never Exit Cruisers or Fire Weapons (`PoliceSystem.js`)**:
   - *Problem:* Police only exist as cars that chase the player. If the player is on foot, police cruisers ram forward but no officers emerge to arrest or shoot at the player.

---

### 3.4 Rendering, Camera & UI Glitches

1. **Broken Speedometer RPM SVG Gradient (`styles.css:344` vs `index.html:85-90`)**:
   - *Problem:* `styles.css` specifies `stroke: url(#speedoGradient);`, but `index.html` does not define `<defs><linearGradient id="speedoGradient">...`.
   - *Result:* The RPM circular dial stroke fails to render or falls back to black.
2. **Window Resize Aspect Ratio Distortion (`Renderer.js:41-45`)**:
   - *Problem:* `GameRenderer.onWindowResize()` calls `this.renderer.setSize(width, height)`, but fails to update the camera's aspect ratio or invoke `camera.updateProjectionMatrix()`.
   - *Result:* Resizing the browser window squashes or stretches the 3D scene.
3. **Sparks BufferGeometry Memory Churn (`ImpactEffects.js:26-64`)**:
   - *Problem:* `createImpactSparks()` instantiates a new `THREE.BufferGeometry` and `THREE.PointsMaterial` for every single bullet hit and pedestrian collision.
   - *Result:* Rapid fire causes high GC (Garbage Collection) pauses and frame stutters. A pre-allocated particle pool should be used instead.
4. **Non-Collidable World Props (`CityBuilder.js` / `EnvironmentProps.js`)**:
   - *Problem:* Stacks of shipping containers, palm trees, street lamps, traffic lights, and bridge guardrails are never added to `CityBuilder.colliders`.
   - *Result:* Cars and characters pass right through all trees, lamp posts, and shipping containers.

---

### 3.5 Audio Manager Deficiencies

1. **Civilian Car Horn Missing**: Keybind hints specify `[E]` for Car Horn / Police Siren, but pressing `[E]` in a civilian vehicle does nothing.
2. **Punch Sound Used for Car Crashes (`Vehicle.js:318`)**: High-speed car collisions trigger `playPunch()`, sounding like a fist punch rather than a metal crunch.
3. **No 3D Positional Audio**: Police sirens and gunshots are played via 2D master gain, sounding at identical volume whether 2 meters or 200 meters away.
4. **Zero Vocal/Foley SFX**: No pedestrian screams, footstep sounds, car door latches, or weapon dry fire clicks.

---

## 4. What Was Missed (Gap Analysis vs. Full GTA / Online Experience)

### 4.1 Multiplayer & Networking ("GTA Online")
Despite the project directory being named `GTA online`:
* **Zero Network Infrastructure:** There is no server (Node.js/Express/WebSocket/WebRTC), no socket handlers, and no client-server networking protocol.
* **No Remote Entity Sync:** No interpolation/extrapolation for remote players, remote vehicles, or projectile broadcasts.
* **No Lobby / Session System:** No matchmaking, session rooms, player lobbies, player list (TAB), or chat box.

### 4.2 Missions, Jobs & Progression Economy
* **Static Decorative Cash:** The `$1,250,480` on the HUD is hardcoded text in `index.html`. Cash is never earned, spent, or dropped by pedestrians.
* **Zero Mission / Quest Engine:** No mission markers, objective waypoints, timers, heist targets, or courier delivery jobs.
* **Malibu Club Interior:** A neon exterior mesh exists, but there is no enterable interior, dance floor, music zone, or NPC bartenders.

### 4.3 Vehicle Mechanics & Roster
* **Single Vehicle Chassis:** Only one car model exists ("Grotti Cheetah GT", with a black police reskin). Missing motorcycles, vans, delivery trucks, supercars, muscle cars, and helicopters.
* **No Vehicle Destruction:** Cars cannot catch fire, smoke at low health, lose body panels/bumpers, or explode.
* **Non-Drivable Boats:** Moored yachts at the marina are static scenery props.

### 4.4 Combat Depth & Weapon Arsenal
* **Missing GTA Staple Weapons:** Shotguns, assault rifles (AK/M4), sniper rifles with zoom scopes, RPG rocket launchers, and thrown explosives (grenades/Molotovs).
* **No Cover System:** No leaning against walls or crouching behind low barriers.
* **No Pedestrian Aggression:** Pedestrians only walk or flee; none are armed or fight back.

### 4.5 World Dynamics & Weather
* **Static Sunset Time of Day:** The sun light and sky shader are locked to twilight sunset. There is no real-time 24-hour day/night cycle.
* **No Weather Conditions:** No tropical rainstorms, thunder/lightning flashes, wet road puddles, or dynamic fog.

### 4.6 Water Physics & Swimming
* **Water is Non-Physical:** The ocean is a visual shader plane. Stepping into the canal allows the player to walk along the seabed under water. There are no buoyancy forces, splash effects, swimming strokes, or drowning timers.

### 4.7 Mobile / Gamepad Support
* The game requires a physical keyboard and mouse with pointer lock. There is no virtual on-screen joystick for mobile devices and no HTML5 Gamepad API integration for Xbox/PlayStation controllers.

---

## 5. Actionable Implementation Roadmap

```
  PHASE 1: Core Physics & Critical Bugs Fixes (Immediate)
  ├── 1.1 Fix vehicle-to-vehicle collision physics (OBB / sphere checks)
  ├── 1.2 Add building collision tests to PoliceSystem cruisers
  ├── 1.3 Implement vertical jump / airtime physics in Vehicle.js
  ├── 1.4 Raycast terrain height in Character.js (fix bridge & sidewalk sinking)
  ├── 1.5 Enable police cruiser hijacking in main.js
  ├── 1.6 Fix Pay 'n' Spray color strobe with debounce timer
  ├── 1.7 Add <defs> #speedoGradient SVG definition in index.html
  └── 1.8 Fix window resize camera aspect ratio in Renderer.js

  PHASE 2: Combat, Damage & Vehicle Depth
  ├── 2.1 Integrate player damage reception (police shooting, vehicle impacts)
  ├── 2.2 Add vehicle damage system (deformation, smoke, engine fire, explosions)
  ├── 2.3 Raycast vehicles in WeaponSystem (bullet impacts, tire popping)
  ├── 2.4 Add building occlusion check before pedestrian hit detection
  ├── 2.5 Expand arsenal: Shotgun and Assault Rifle with reload mechanics
  └── 2.6 Pre-allocate particle pool for ImpactEffects to eliminate GC stutter

  PHASE 3: Living World & Audio Realism
  ├── 3.1 Implement dynamic 24-hour Day/Night cycle in SkyAndLighting.js
  ├── 3.2 Add rain & wet road reflection shader mode
  ├── 3.3 Add water buoyancy, splash effects, and player swimming/drowning
  ├── 3.4 Add props collision boxes (shipping containers, lamp posts, palm trees)
  ├── 3.5 Add car horn sound on [E] and metal crunch collision audio
  └── 3.6 Implement Web Audio PannerNode for 3D spatial sirens and gunfire

  PHASE 4: Gameplay Loop, Economy & Missions
  ├── 4.1 Dynamic Cash System (wallet balance, cash drops from pedestrians)
  ├── 4.2 Interactive Ammu-Nation & Pay 'n' Spray purchase transactions
  ├── 4.3 Mission Dispatcher (Taxi fare jobs, checkpoint street races, courier delivery)
  └── 4.4 Enterable Malibu Club interior with synthwave dance floor

  PHASE 5: Multiplayer Foundation ("GTA Online")
  ├── 5.1 Node.js + WebSocket / Geckos.io server infrastructure
  ├── 5.2 Client-server player transform synchronization with interpolation
  ├── 5.3 Remote vehicle synchronization and horn/siren states
  ├── 5.4 Synchronized weapon firing and damage verification
  └── 5.5 In-game chat box and player leaderboard (TAB)
```

---
*Report generated autonomously by Antigravity Agent for the `gta-6-web` codebase.*
