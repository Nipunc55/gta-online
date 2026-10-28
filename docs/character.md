# Character & Traversal System

## Overview
The Character and Player system handles the humanoid representation, camera-relative third-person movement, sprint stamina mechanics, jumping and gravity physics, vehicle entry/exit transitions, and player vitals (health, armor, cash, and death/respawn states).

## Source Files
- Implementation: [`src/entities/Player.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js)
- Shared Rig & Animation: [`src/entities/HumanoidModel.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/HumanoidModel.js)
- Controller & Inputs: [`src/core/InputManager.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/core/InputManager.js), [`src/core/CameraController.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/core/CameraController.js)

---

## Architecture & Rig Specifications

### 1. Humanoid Skeletal Hierarchy
Humanoids are low-poly procedural composite hierarchies built without external GLTF/FBX models.
```
root (THREE.Group)
├── torso (Mesh, pivot at y = 1.12)
│   ├── hips (Mesh, y = -0.32)
│   ├── head (Mesh, y = 0.46)
│   │   ├── hair / cap (Mesh, y = 0.14)
│   │   └── glasses (Mesh, optional)
│   ├── leftArm (Group, pivot at x = -0.31, y = 0.22)
│   │   └── armMesh (Mesh)
│   └── rightArm (Group, pivot at x = 0.31, y = 0.22)
│       ├── armMesh (Mesh)
│       └── weaponSocket (Group, position [0, -0.50, -0.06])
├── leftLeg (Group, pivot at x = -0.13, y = 0.76)
│   ├── legMesh (Mesh)
│   └── shoeMesh (Mesh)
└── rightLeg (Group, pivot at x = 0.13, y = 0.76)
    ├── legMesh (Mesh)
    └── shoeMesh (Mesh)
```

### 2. Forward Axis & Rotation Convention
- **Coordinate System**: Three.js standard (Right-handed, Y-up).
- **Forward Heading**: World `-Z` axis when `rotationY = 0`.
- **Direction vector conversion**:
  $$\text{fwdX} = -\sin(\text{rotationY}), \quad \text{fwdZ} = -\cos(\text{rotationY})$$
- **Yaw calculation from movement vector $(dx, dz)$**:
  $$\text{yaw} = \text{atan2}(-dx, -dz)$$

---

## Movement & Physics

### Speed Configurations
| State | Speed ($m/s$) | Conditions |
|---|---|---|
| **Walk** | 4.8 | Standard WASD keys active |
| **Sprint** | 8.8 | `Shift` held + moving + stamina > 4 + not aiming |
| **Combat ADS Strafe** | 3.2 | Right mouse button held / firing |
| **Jump Velocity** | 7.4 ($m/s$) | `Space` pressed while grounded |
| **Gravity** | -22.0 ($m/s^2$) | Constantly applied while airborne |

### Stamina Mechanics
- While sprinting: Depletes at $14.0\text{ units}/s$.
- While walking/idle: Regenerates at $18.0\text{ units}/s$ up to max (100).
- Minimum stamina threshold to trigger sprint: 4 units.

### Ground & Curb Step-Up
1. Ground surface elevation is sampled from the spatial grid via `layout.getGroundHeight(x, z)`.
2. Roads rest at $y = 0.0$; sidewalks and city blocks elevate to $y = 0.15$ (`CURB_H`).
3. If the vertical distance from ground level to player feet is $\le 0.25m$ while falling or moving, the player steps up onto the curb without tripping or getting caught in seams.

### Wall Collisions
Horizontal sliding resolution uses the spatial hash system:
```javascript
this.colliders.resolveCircle(this.position, this.radius, 1.8);
```
Radius is $0.42m$, cylinder height is $1.8m$.

---

## Combat & Aiming States

- **Normal Exploration**: Character orientation smoothly yaws toward the movement vector using shortest-path interpolation:
  $$\Delta\theta = \text{wrapAngle}(\theta_{\text{target}} - \theta_{\text{current}})$$
- **Aim Down Sights (ADS)**:
  - Triggered by `Mouse Button 2` (Right Click).
  - Character immediately locks `rotationY` to match `cameraController.yaw`.
  - Right arm raises to $90^\circ$ ($+\pi/2$ around local X) minus `cameraPitch`.
  - Camera shifts into right-shoulder framing with field-of-view tightening from $65^\circ$ down to $48^\circ$.

---

## Vitals, Economy & Respawn Loop

1. **Health & Armor**:
   - Max Health: 100, Max Armor: 100.
   - Incoming damage absorbs 70% from Armor first; remainder hits Health.
   - When damaged, `hurtFlash` sets screen vignette intensity and `cameraController.addShake(0.22)` triggers trauma.
2. **Death / "WASTED" State**:
   - When Health reaches 0, `isAlive = false`.
   - Character drops into ragdoll prone orientation (`mesh.rotation.x = -Math.PI / 2`).
   - If in vehicle, player is evicted immediately.
   - Triggers `player:wasted` event on `EventBus`.
   - After a 3-second death screen, player respawns at Pillbox Hill Medical Center ($x = 9.5, z = 20$) with 100 Health, 50 Armor, and cleared wanted level.
3. **Cash / Wallet**:
   - Starting balance: \$2,500.
   - Updated dynamically when picking up dropped cash bundles from dead NPCs.

---

## Implementation Status & Diff vs Code

| Feature | In Design Spec | In Code (`src/`) | Status |
|---|---|---|---|
| **Humanoid Procedural Rig** | Articulated limb groups without external GLTF | Implemented in [`HumanoidModel.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/HumanoidModel.js) | ✅ Implemented |
| **Walk, Sprint & ADS Speeds** | Walk (4.8 m/s), Sprint (8.8 m/s), ADS (3.2 m/s) | Implemented in [`Player.js#L19-L23`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js#L19-L23) | ✅ Implemented |
| **Stamina Depletion & Regen** | -14/s sprint, +18/s regen | Implemented in [`Player.js#L160-L175`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js#L160-L175) | ✅ Implemented |
| **Curb Step-Up (0.25m)** | Smooth elevation change without collision snags | Implemented in [`Player.js#L210-L222`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js#L210-L222) | ✅ Implemented |
| **Vitals & Hospital Respawn** | 100 HP, 100 Armor, 3s death delay, respawn at Pillbox | Implemented in [`Player.js#L92-L107`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js#L92-L107) | ✅ Implemented |
| **Vehicle Enter / Exit Door Transition** | Eviction to left door position | Implemented in [`Player.js#L119-L140`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Player.js#L119-L140) | ✅ Implemented |
| **Swimming & Water Physics** | Water buoyancy when walking into ocean | Player continues walking under water | ❌ Not implemented |
| **Mantle & Vaulting** | Climbing over low obstacles and walls | Only vertical jump is supported | ❌ Not implemented |
| **Crouch / Stealth Stance** | Sneak movement reducing visibility | Stances limited to upright and ADS | ❌ Not implemented |

---

## TODO Items

- [ ] **Swimming & Ocean Buoyancy**: Implement swimming stroke animation and surface floating physics when entering ocean water ($y < 0$ or distance $> 410\text{m}$).
- [ ] **Obstacle Mantling / Vaulting**: Add parkour vault animation when pressing `[Space]` against low walls ($\le 1.2\text{m}$).
- [ ] **Crouch & Sneak Stance**: Add `[C]` or `[Ctrl]` crouch toggle that reduces player height to $1.1\text{m}$, halves footstep noise, and tightens weapon spread.
- [ ] **Player Customization**: Allow changing shirt, pants, hair colors, and accessories from a character selection menu.
- [ ] **Parachute Traversal**: Implement deployable parachute when falling from skyscraper rooftops ($y > 40\text{m}$).
