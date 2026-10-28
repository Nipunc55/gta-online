# UI, HUD & Controls System

## Overview
The UI and HUD layer presents real-time gameplay feedback, including a rotating 360-degree radar minimap, vitals bars (health, armor, stamina), a dynamic cash counter, wanted level star ratings, weapon/ammo status with reload notifications, vehicle speedometer/tachometer gauges, and context-sensitive action prompts.

## Source Files
- HUD & Minimap Controller: [`src/ui/HUD.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js)
- Speedometer & Tachometer: [`src/ui/Speedometer.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/Speedometer.js)
- Radio Notification Wheel: [`src/ui/RadioWheel.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/RadioWheel.js)
- Visual Styles: [`src/ui/styles.css`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/styles.css)
- HTML Layout: [`index.html`](file:///d:/My%20Side%20Projects/GTA%20online/index.html)

---

## HUD Layout & Screen Regions

```
┌────────────────────────────────────────────────────────────────────────┐
│ [TOP LEFT]                             [TOP RIGHT]                     │
│ DOWNTOWN FINANCIAL, LOS SANTOS         ★★☆☆☆ WANTED STARS              │
│ SAN ANDREAS                            $2,500 CASH                     │
│                                        🔫 COMBAT PISTOL [12 / 120]     │
│                                                                        │
│                                                                        │
│                               [CENTER]                                 │
│                               CROSSHAIR                                │
│                              (HIT MARKER)                              │
│                                                                        │
│                                                                        │
│                           [CENTER BOTTOM]                              │
│                    PRESS [F] TO ENTER GROTTI CHEETAH                   │
│                                                                        │
│ [BOTTOM LEFT]                                          [BOTTOM RIGHT]  │
│ ┌──────────────┐                                       ┌─────────────┐ │
│ │  MINIMAP     │                                       │ SPEEDOMETER │ │
│ │  RADAR (2D)  │                                       │   84 MPH    │ │
│ └──────────────┘                                       │   GEAR 4    │ │
│ [ARMOR]   ████████████                                 └─────────────┘ │
│ [HEALTH]  ██████████████████                           GROTTI CHEETAH  │
│ [STAMINA] ████████                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

---

## Minimap Radar Specifications

Rendered directly to an HTML5 2D canvas (`#radar-canvas`, $200 \times 200$ pixels):
1. **Camera Alignment**:
   - The radar translates to player coordinates and rotates by `cameraYaw` so the player's view direction always points **UP**.
2. **Rendering Layers**:
   - Ocean blue background clipping mask.
   - Landmass boundaries and district zoning blocks.
   - Road network grid (roads: `#1b1f26`).
   - Landmark dots: Police HQ (blue), Hospital (red cross), Ammu-Nation (orange), Pay'n'Spray (turquoise).
   - Traffic vehicles: Cyan circular blips ($r = 2.4\text{px}$).
   - Hostile gang / combat NPCs: Red circular blips ($r = 2.8\text{px}$).
   - Police cruisers: Alternating blue and red pulsing beacons ($r = 4.0\text{px}$).
3. **Player Arrow Marker**:
   - Centered above the canvas, pointing in the entity's forward heading relative to the camera.

---

## Speedometer & SVG Tachometer

When the player enters any vehicle, the bottom-right HUD container appears:
- **Digital Speed Display**: Converted from forward velocity $m/s$ into miles per hour:
  $$\text{MPH} = \text{round}(|v_{\text{speed}}| \times 2.237)$$
- **Gear Indicator**: Displays active transmission state (`GEAR 1` through `GEAR 5`).
- **Circular RPM Dial**:
  - Rendered via SVG circular stroke (`stroke-dashoffset`).
  - RPM maps from 800 (idle) to 7500 (redline) into a 288-unit circumference stroke.
  - Multi-stop gradient transitions from cyan through magenta to neon red at high revs.

---

## Comprehensive Keybind Reference

| Key / Control | On-Foot Action | In-Vehicle Action |
|---|---|---|
| **W / Up Arrow** | Move Forward | Throttle / Accelerate |
| **S / Down Arrow** | Move Backward | Brake / Reverse |
| **A / Left Arrow** | Strafe Left | Steer Left |
| **D / Right Arrow** | Strafe Right | Steer Right |
| **Mouse Move** | Free Camera Look / Aim | Orbit Camera around Vehicle |
| **Left Click** | Melee Punch / Fire Weapon | — |
| **Right Click** | Aim Down Sights (ADS) | — |
| **Space** | Jump | Handbrake Drift |
| **Shift** | Sprint (drains Stamina) | — |
| **F** | Enter / Hijack Vehicle | Exit Vehicle to Left Door |
| **1, 2, 3, 4, 5** | Equip Fists / Pistol / SMG / Shotgun / Rifle | — |
| **Mouse Wheel** | Cycle Equipped Weapon | — |
| **R** | Reload Magazine | — |
| **Q** | — | Cycle In-Car Radio Station |
| **E** | — | Sound Horn / Toggle Police Siren |
| **H / L** | — | Toggle Vehicle Headlights |
| **C** | — | Toggle Chase / Hood Camera Angle |
| **Esc / P** | Pause Menu / Controls Overview | Pause Menu / Controls Overview |

---

## Implementation Status & Diff vs Code

| Feature | In Design Spec | In Code (`src/`) | Status |
|---|---|---|---|
| **Landmark Dots on Minimap** | Police HQ (blue), Hospital (red cross), Ammu-Nation (orange), Pay'n'Spray (turquoise) | Not rendered in [`HUD.renderRadar`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js#L114-L192) | ⚠️ Diff (Minimap lacks landmark icons) |
| **Radar Entities Rendering** | Ocean, blocks, roads, traffic cars, hostile NPCs, police cruisers | Implemented in [`HUD.js#L127-L188`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js#L127-L188) | ✅ Implemented |
| **Speedometer & SVG Tachometer** | Digital MPH, gear, circular gradient RPM stroke | Implemented in [`Speedometer.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/Speedometer.js) | ✅ Implemented |
| **Radio Station Wheel** | Notification pop-up banner on station switch | Implemented in [`RadioWheel.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/RadioWheel.js) | ✅ Implemented |
| **Action Prompts** | Dynamic context prompt for vehicle entry / zones | Implemented in [`HUD.js#L31-L42`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js#L31-L42) | ✅ Implemented |
| **Vitals & Wanted Stars** | Health, armor, stamina, cash counter, 1–5 stars | Implemented in [`HUD.js#L46-L100`](file:///d:/My%20Side%20Projects/GTA%20online/src/ui/HUD.js#L46-L100) | ✅ Implemented |
| **GPS Minimap Route Overlay** | Waypoint navigation polyline | Not implemented | ❌ Not implemented |

---

## TODO Items

- [ ] **Minimap Landmark Blips**: Add rendering for key facility markers (Police badge, Hospital cross, Ammu-Nation gun icon) to `HUD.renderRadar()`.
- [ ] **Mission Waypoint Indicators**: Render glowing mission destination blips and distance indicators on the 2D radar.
- [ ] **GPS Pathfinding Polyline**: Draw a dynamic colored route polyline following the road network from player position to selected waypoint.
- [ ] **Interactive Pause Settings**: Add master volume slider, mouse sensitivity slider, and resolution scale options inside the pause menu overlay.
- [ ] **Weapon Wheel UI**: Add a radial weapon selection overlay on `[Tab]` key holding as an alternative to number hotkeys.
