# World Architecture, Maps & District Layout

## Overview
The open-world environment is a procedural 3D map spanning over $1\text{ km} \times 1\text{ km}$. It consists of an $8 \times 8$ grid of city blocks, a 4-lane avenue network, elevated sidewalks, distinct thematic districts, and an outer sand shoreline dipping into an animated procedural ocean.

## Source Files
- Road & Block Graph Model: [`src/world/CityLayout.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/CityLayout.js)
- Procedural Meshes & Districts: [`src/world/CityGenerator.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/CityGenerator.js)
- Spatial Hash Collisions: [`src/world/Collision.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/Collision.js)
- Instanced Street Props: [`src/world/Props.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/Props.js)
- Geometry Batcher: [`src/world/GeoBuilder.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/GeoBuilder.js)
- Sky, Fog & Ocean Shaders: [`src/world/SkyAndLighting.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/SkyAndLighting.js)

---

## Coordinate System & Dimensions

```
                           +Z (South)
                               ▲
                               │
            ┌──────────────────┼──────────────────┐
            │   Vespucci       │      Beach       │
            │                  │                  │
            │    ┌─────────────┼─────────────┐    │
            │    │  Residential│  Midtown    │    │
            │    │  Blocks     │  (Pillbox)  │    │
            │    │             │             │    │
 ───────────┼────┼─────────────┼─────────────┼────┼───────────► +X (East)
 -X (West)  │    │  Downtown   │  Legion Sq  │    │
            │    │  Skyscrapers│  Park       │    │
            │    │             │             │    │
            │    └─────────────┼─────────────┘    │
            │                  │                  │
            │   Ocean Shoreline│                  │
            └──────────────────┼──────────────────┘
                               │
                               ▼
                           -Z (North)
```

| Parameter | Metric Value | Description |
|---|---|---|
| `GRID` | 8 blocks | Total blocks per axis ($8 \times 8 = 64$ blocks) |
| `PITCH` | 90 meters | Distance between road centerlines |
| `ROAD_HALF` | 8.0 meters | Half-width of roadways (total width = 16m, 4 lanes) |
| `SIDEWALK_W` | 3.0 meters | Elevated concrete sidewalk width along each curb |
| `CITY_HALF` | 360 meters | Boundary of the outermost road centerlines |
| `ROAD_EXTENT` | 368 meters | Edge of paved asphalt road surface |
| `LAND_HALF` | 410 meters | Perimeter of flat green landmass |
| `BEACH_HALF` | 460 meters | Sloped sandy beach transitioning into ocean water |
| `WORLD_LIMIT` | 478 meters | Hard bounding boundary for entity physics |
| `CURB_H` | 0.15 meters | Height step of sidewalk curbs and building slabs |

---

## District Zoning & Key Landmarks

Districts are assigned algorithmically using distance rings from city center with dedicated landmark blocks:

### 1. Downtown Financial District (Center / Inner Ring)
- **Visuals**: Towering glass skyscrapers (up to 160m high) with reflective cyan/navy tones, multi-tiered setbacks, rooftop helipads, telecommunication spires, and red obstruction beacons.
- **Plazas**: Ground-level paved public squares with raised planter boxes, benches, and shade trees.

### 2. Midtown & Commercial Districts (Middle Ring)
- **Visuals**: 3- to 6-story commercial buildings, department stores, retail shops, street-level storefront display windows, and colorful decorative canvas awnings overhanging sidewalks.
- **Features**: Rooftop HVAC chiller units, water towers, and back-alley delivery lanes.

### 3. Residential Suburbs (Outer Ring)
- **Visuals**: Low-density single-family homes with Spanish tile hip roofs, pastel stucco facades, front yards, palm trees, and fenced backyards featuring private swimming pools.

### 4. Legion Square Park (`Block [2, 5]`, `[5, 1]`, `[6, 6]`)
- **Visuals**: Expansive paved pedestrian corridors intersecting at a large circular stone fountain, lush palm canopies, flowering bushes, and park benches.

### 5. Interactive Facilities & Landmarks
- **Mission Row Police Department (`Block [2, 2]`)**:
  - Fortified building with blue architectural trim and high-contrast illuminated signage.
  - Rear gated motor-pool parking dedicated to LSPD cruiser spawns.
- **Pillbox Hill Medical Center (`Block [5, 5]`)**:
  - White concrete hospital with red cross rooftop signage and rooftop trauma helipad.
  - Default respawn location when the player is "WASTED".
- **Ammu-Nation Gun Shop (`Block [4, 2]`)**:
  - Dedicated retail gun store with red neon marquee.
  - Interactive zone: Standing near the entrance immediately restores 100 Health, 100 Armor, and refills all weapon magazines and reserves.
- **Public Parking Lots (`Block [4, 5]`, `[1, 2]`, `[6, 3]`)**:
  - Striped asphalt parking bays where civilian vehicles spawn in parked states.

---

## Draw-Call Optimization & Performance

To guarantee constant 60 FPS in browsers:
1. **Block Mesh Merging (`GeoBuilder`)**:
   Instead of thousands of separate mesh nodes, each city block's sidewalks, curbs, walls, roofs, windows, and decorative cornices are baked into **a single combined BufferGeometry with per-vertex colors**.
2. **Instanced Prop Rendering (`Props`)**:
   All 800+ street lamps, trees, palms, hydrants, benches, and traffic lights are drawn via **InstancedMesh**, requiring only one draw call per prop type.
3. **Dynamic Traffic Light Synchronization**:
   Traffic light lens colors and vertical offsets update via `instanceColor` and `instanceMatrix` without recreating geometry buffers.

---

## Collision Spatial Hash

Static collisions are managed by `StaticColliders` ([`src/world/Collision.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/Collision.js)) with cell size = $16m$:
- **Box Registration**: Buildings and non-destructible props register 3D AABBs into overlapping 2D spatial buckets using integer bit-mixing keys:
  $$\text{key} = (c_x \times 73856093) \oplus (c_z \times 19349663)$$
- **Queries**: Narrow-phase checks query only adjacent cells, reducing collision complexity from $O(N)$ down to $O(1)$.

---

## Implementation Status & Diff vs Code

| Feature | In Design Spec | In Code (`src/`) | Status |
|---|---|---|---|
| **$8 \times 8$ Grid Dimensions** | 90m pitch, 16m road, 4-lane avenues | Implemented in [`CityLayout.js#L10-L50`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/CityLayout.js#L10-L50) | ✅ Implemented |
| **District Zoning & Landmarks** | Downtown, Midtown, Residential, Parks, Police, Hospital, Ammu-Nation | Implemented in [`CityGenerator.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/CityGenerator.js) | ✅ Implemented |
| **Merged BufferGeometry Batching** | 1 draw call per city block via `GeoBuilder` | Implemented in [`GeoBuilder.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/GeoBuilder.js) | ✅ Implemented |
| **Instanced Props & Traffic Lights** | `InstancedMesh` for 800+ props with synchronized signal lights | Implemented in [`Props.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/Props.js) | ✅ Implemented |
| **16m Spatial Hash Grid** | AABB boxes, circle resolve, DDA raycast | Implemented in [`Collision.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/Collision.js) | ✅ Implemented |
| **Day / Night Lighting Cycle** | Sun and moon movement, night lighting, street lamps | Implemented in [`SkyAndLighting.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/SkyAndLighting.js) & [`Props.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/Props.js) (see [`weather.md`](file:///d:/My%20Side%20Projects/GTA%20online/docs/weather.md)) | ✅ Implemented |
| **Weather & Rain FX** | Rainy weather, 3D rain streaks, wet asphalt grip | Implemented in [`SkyAndLighting.js`](file:///d:/My%20Side%20Projects/GTA%20online/src/world/SkyAndLighting.js) (see [`weather.md`](file:///d:/My%20Side%20Projects/GTA%20online/docs/weather.md)) | ✅ Implemented |
| **Enterable Building Interiors** | Ammu-Nation / Hospital interior spaces | Buildings are solid exterior geometry | ❌ Not implemented |
| **Destructible Props** | Fire hydrants, trash bins toppling on impact | Props are rigid static colliders | ❌ Not implemented |

---

## TODO Items

- [x] **Day / Night Cycle**: Implement a dynamic diurnal cycle that orbits the sun/moon light and turns on street lamps and vehicle headlights at night.
- [x] **Weather System**: Add rain particle drops and wet road grip modulation.
- [ ] **Destructible Street Props**: Allow fire hydrants to shear off upon vehicle impact and spout a vertical water particle geyser.
- [ ] **Enterable Storefronts**: Create interior low-poly rooms for Ammu-Nation gun counter and Hospital emergency room.
- [ ] **Underground Subways / Tunnels**: Add subterranean roadway tunnel segments beneath the Downtown financial skyscrapers.
