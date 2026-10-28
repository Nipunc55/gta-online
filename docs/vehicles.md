# Vehicle Physics & Driving System

## Overview
The vehicle system provides a full 2D velocity-vector driving simulation with decoupled forward acceleration and lateral slip. This enables true handbrake power-slides, oversteer dynamics, vehicle-to-vehicle collision impulses, procedural body roll/pitch suspension reactions, automatic 5-speed gearboxes, and vehicle damage culminating in explosions.

## Source Files
- Vehicle Physics Engine: [`src/entities/Vehicle.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Vehicle.js)
- 3D Vehicle Models & Archetypes: [`src/entities/VehicleModels.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/VehicleModels.js)
- Vehicle Entry/Exit Logic: [`src/main.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/main.js)
- Speedometer & Gauges: [`src/ui/Speedometer.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/Speedometer.js)

---

## Vehicle Archetypes & Tuning Specs

Vehicles are defined in `VEHICLE_TYPES` in [`src/entities/VehicleModels.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/VehicleModels.js):

| Type ID | Display Name | Top Speed ($m/s$ / $mph$) | Accel ($m/s^2$) | Braking ($m/s^2$) | Grip (Norm / Drift) | Max Health | Notes |
|---|---|---|---|---|---|---|---|
| `sport` | **Grotti Cheetah GT** | 44 / 98 | 25.0 | 34.0 | 10.5 / 2.6 | 260 | High acceleration, ducktail spoiler, low clearance |
| `sedan` | **Tailgater Sedan** | 33 / 74 | 17.0 | 28.0 | 9.5 / 3.0 | 300 | Balanced everyday city handling |
| `suv` | **Baller SUV** | 30 / 67 | 15.0 | 25.0 | 9.0 / 3.2 | 420 | High durability, elevated chassis |
| `pickup` | **Bravado Bison** | 31 / 69 | 16.0 | 26.0 | 8.8 / 2.8 | 400 | Extended bed, higher roll inertia |
| `police` | **LSPD Interceptor** | 40 / 90 | 23.0 | 32.0 | 10.2 / 2.9 | 360 | Flashing roof lightbar, high pursuit top speed |

---

## 2D Velocity Vector Physics Formulation

Instead of moving directly along the vehicle's heading, velocity is maintained as a 2D world vector $\mathbf{v} = (v_x, v_z)$ and decomposed each frame against the car's local orthonormal basis:

$$\mathbf{f} = \begin{pmatrix} -\sin(\theta) \\ -\cos(\theta) \end{pmatrix}, \quad \mathbf{r} = \begin{pmatrix} \cos(\theta) \\ -\sin(\theta) \end{pmatrix}$$

1. **Local Velocities**:
   $$v_{\text{fwd}} = \mathbf{v} \cdot \mathbf{f}, \quad v_{\text{lat}} = \mathbf{v} \cdot \mathbf{r}$$

2. **Drivetrain & Drag**:
   - Forward propulsion applies up to `maxSpeed`:
     $$v_{\text{fwd}} \leftarrow v_{\text{fwd}} + a \cdot \Delta t$$
   - Rolling resistance & aerodynamic drag:
     $$\text{drag} = 2.8 + |v_{\text{fwd}}| \cdot 0.04$$

3. **Steering & Angular Yaw Rate**:
   - High-speed authority taper prevents instant spinouts:
     $$\delta_{\text{max}} = \text{lerp}(0.56, 0.24, \text{speedRatio} \times 0.85)$$
   - Yaw rate uses bicycle model kinematics with oversteer multiplier when handbraking:
     $$\dot{\theta} = \delta_{\text{steer}} \times \text{steerSpeed} \times (1 - 0.32 \cdot \text{speedRatio}) \times \text{turnAuthority} \times \text{driftMultiplier}$$

4. **Drift Mechanics & Lateral Friction**:
   - Lateral velocity scrub decays exponentially:
     $$v_{\text{lat}} \leftarrow v_{\text{lat}} \cdot e^{-\mu \cdot \Delta t}$$
   - When handbraking (`Space`), $\mu$ transitions from `grip` (9.0–10.5) down to `driftGrip` (2.6–3.2).
   - This preserves forward momentum while the vehicle rotates sideways, generating realistic counter-steering drift lines.

5. **Recomposition**:
   $$\mathbf{v}_{\text{new}} = v_{\text{fwd}} \mathbf{f} + v_{\text{lat}} \mathbf{r}$$

---

## Dynamic Suspensions & Visual Feedback

- **Chassis Body Roll**: Tilts away from steering direction and lateral slip:
  $$\text{roll} = -\delta_{\text{steer}} \cdot \text{speedRatio} \cdot 0.095 - (v_{\text{lat}} \cdot 0.012)$$
- **Chassis Pitch**:
  - Throttle acceleration causes squat ($-0.028\text{ rad}$).
  - Hard braking causes nose dive ($+0.045\text{ rad}$).
- **Wheel Spinning**:
  $$\Delta\phi = \frac{v_{\text{fwd}}}{R_{\text{wheel}}} \cdot \Delta t$$
- **Tire Smoke & Squeal**:
  - Drift slip ratio: $\text{slip} = \frac{|v_{\text{lat}}|}{\max(4, |v_{\text{fwd}}|)}$.
  - When $\text{slip} > 0.35$ and $|v_{\text{fwd}}| > 5\text{ m/s}$, white tire smoke particles emit from the rear axle and procedural tire squeal synthesizer opens.

---

## Transmission & Automatic Gearbox

Gears shift automatically based on velocity fraction $r = \frac{|v_{\text{fwd}}|}{\text{maxSpeed}}$:
- **Gear 1**: $0.00 \le r < 0.18$ $\rightarrow$ 900 to 5300 RPM
- **Gear 2**: $0.18 \le r < 0.38$ $\rightarrow$ 2200 to 6700 RPM
- **Gear 3**: $0.38 \le r < 0.60$ $\rightarrow$ 2500 to 7100 RPM
- **Gear 4**: $0.60 \le r < 0.82$ $\rightarrow$ 2800 to 7300 RPM
- **Gear 5**: $0.82 \le r \le 1.00$ $\rightarrow$ 3100 to 7500 RPM

---

## Collisions & Vehicle Destruction

### 1. Wall Collisions
Calls `colliders.resolveCircle(pos, halfW, 1.6)`. Upon impact:
- Reflects velocity against contact normal: $\mathbf{v} \leftarrow \mathbf{v} - 1.35(\mathbf{v} \cdot \mathbf{n})\mathbf{n}$.
- If impact speed $> 6\text{ m/s}$, takes damage proportional to velocity and triggers crash audio and impact spark bursts.

### 2. Vehicle-to-Vehicle Collisions (`resolveVehiclePairs`)
- Computes overlap distance between all vehicles and distributes separation evenly.
- Exchanges relative momentum impulses:
  $$J = -(\mathbf{v}_{\text{rel}} \cdot \mathbf{n}) \times 0.65$$
- Both vehicles absorb damage and spark at contact midpoint.

### 3. Damage & Explosion Sequence
- Health $< 45\%$: Engine compartment starts emitting dark gray smoke.
- Health $\le 0$:
  - Triggers `explode()`.
  - Body material changes to charred matte black.
  - Upward impulse flings vehicle into the air ($v_y = 8.5\text{ m/s}$).
  - Spawns multi-tiered fireball and shockwave debris particles.
  - Nearby entities take radial blast damage up to 9 meters.

---

## Implementation Status & Diff vs Code

| Feature | In Design Spec | In Code (`src/`) | Status |
|---|---|---|---|
| **2D Velocity Vector Physics** | Longitudinal and lateral decoupling, drift grip decay | Implemented in [`Vehicle.js#L140-L240`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Vehicle.js#L140-L240) | ✅ Implemented |
| **5 Vehicle Archetypes** | Sport, Sedan, SUV, Pickup, Police Interceptor | Implemented in [`VehicleModels.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/VehicleModels.js) | ✅ Implemented |
| **5-Speed Automatic Transmission** | Velocity fraction ratio mapping to RPM & gear | Implemented in [`Vehicle.js#L95-L125`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Vehicle.js#L95-L125) | ✅ Implemented |
| **Body Roll & Pitch Suspensions** | Dynamic lean on turning and squat/dive on accel/brake | Implemented in [`Vehicle.js#L260-L280`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Vehicle.js#L260-L280) | ✅ Implemented |
| **Vehicle Damage & Explosions** | Smoke below 45% HP, upward fling and blast at 0 HP | Implemented in [`Vehicle.js#L290-L340`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Vehicle.js#L290-L340) | ✅ Implemented |
| **Pairwise Vehicle-to-Vehicle Physics** | `Vehicle.resolveVehiclePairs()` impulse exchange | Implemented in [`Vehicle.js#L350-L400`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Vehicle.js#L350-L400) | ✅ Implemented |
| **Vehicle Headlights Projection** | Forward Three.js `SpotLight`, volumetric beam cones & road surface light pool (`[H]` toggle) | Implemented in [`VehicleModels.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/VehicleModels.js) & [`Vehicle.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/entities/Vehicle.js) | ✅ Implemented |
| **Drive-By Shooting** | Firing sidearm from driver seat | Not supported; shooting locked while driving in [`main.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/main.js) | ❌ Not implemented |
| **Two-Wheeled Vehicles** | Motorcycles / Scooters / Bicycles | Only 4-wheeled car classes exist | ❌ Not implemented |

---

## TODO Items

- [ ] **Drive-By Shooting**: Allow player to aim and fire equipped pistol/SMG out of car window while driving using `[Mouse 1]`.
- [ ] **Motorcycle Archetype**: Create 2-wheeled physics profile with rider leaning animation and balance stabilization.
- [x] **Vehicle Headlights Projection**: Add forward Three.js `SpotLight` / projector on vehicles illuminating roads and obstacles at night.
- [ ] **Tire Puncture Physics**: Support flat/punctured tire state upon gunshot or spike strip damage, introducing heavy drag and pulling steer to one side.
- [ ] **Vehicle Horn Customization**: Unique acoustic frequencies for different archetypes (e.g., air horn for pickup/SUV, high-pitch horn for sport).
