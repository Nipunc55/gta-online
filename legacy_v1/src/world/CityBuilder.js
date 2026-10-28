import * as THREE from 'three';

export class CityBuilder {
  constructor(scene, envProps) {
    this.scene = scene;
    this.envProps = envProps;
    this.colliders = [];
    if (this.envProps) {
      this.envProps.colliders = this.colliders;
    }
    this.roadSegments = [];
    this.buildingMeshes = [];
    this.spawnPoints = [];
    this.stuntRamps = [];
    this.interactiveZones = [];

    // Bridge segments elevation bounds (deck top height at y = 1.2)
    // Bridges at Z: -60 and Z: 40 spanning X: -180 to -90 and X: 0 to 40 (deck width 16)
    this.bridges = [
      { xMin: -180, xMax: -90, z: -60, height: 1.2, halfWidth: 8.5 },
      { xMin: -180, xMax: -90, z: 40,  height: 1.2, halfWidth: 8.5 },
      { xMin: 0,    xMax: 40,  z: -60, height: 1.2, halfWidth: 8.5 },
      { xMin: 0,    xMax: 40,  z: 40,  height: 1.2, halfWidth: 8.5 }
    ];

    this.initTextures();
    this.buildCity();
  }

  initTextures() {
    // 1. Procedural Asphalt Road Texture
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#1c1e22';
    ctx.fillRect(0, 0, 512, 512);

    // Noise grain
    for (let i = 0; i < 6000; i++) {
      const g = Math.floor(Math.random() * 25 + 20);
      ctx.fillStyle = `rgb(${g},${g},${g})`;
      ctx.fillRect(Math.random() * 512, Math.random() * 512, 2, 2);
    }

    // Double yellow center stripes
    ctx.strokeStyle = '#ffbb00';
    ctx.lineWidth = 6;
    ctx.setLineDash([30, 20]);
    ctx.beginPath();
    ctx.moveTo(250, 0);
    ctx.lineTo(250, 512);
    ctx.moveTo(262, 0);
    ctx.lineTo(262, 512);
    ctx.stroke();

    // White outer edge lines
    ctx.strokeStyle = '#ffffff';
    ctx.setLineDash([]);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(35, 0);
    ctx.lineTo(35, 512);
    ctx.moveTo(477, 0);
    ctx.lineTo(477, 512);
    ctx.stroke();

    this.roadTexture = new THREE.CanvasTexture(canvas);
    this.roadTexture.wrapS = THREE.RepeatWrapping;
    this.roadTexture.wrapT = THREE.RepeatWrapping;

    // 2. Window Grid Texture for Modern Glass Skyscrapers
    const winCanvas = document.createElement('canvas');
    winCanvas.width = 256;
    winCanvas.height = 256;
    const winCtx = winCanvas.getContext('2d');
    winCtx.fillStyle = '#0e1422';
    winCtx.fillRect(0, 0, 256, 256);

    for (let y = 6; y < 256; y += 22) {
      for (let x = 6; x < 256; x += 15) {
        const lit = Math.random() > 0.4;
        if (lit) {
          const warm = Math.random() > 0.35;
          winCtx.fillStyle = warm ? '#ffd275' : (Math.random() > 0.5 ? '#00f0ff' : '#ff007f');
          winCtx.fillRect(x, y, 9, 13);
        }
      }
    }
    this.windowTexture = new THREE.CanvasTexture(winCanvas);
    this.windowTexture.wrapS = THREE.RepeatWrapping;
    this.windowTexture.wrapT = THREE.RepeatWrapping;
  }

  buildCity() {
    this.buildTerrainAndIslands();
    this.buildRoadNetwork();
    this.buildBridges();
    this.buildDowntownSkyscrapers();
    this.buildOceanDriveArtDeco();
    this.buildStarfishIslandMansions();
    this.buildIndustrialPort();
    this.buildInteractiveVenues();
    this.buildBeachPromenadeAndPier();
    this.buildStreetDetails();
  }

  buildTerrainAndIslands() {
    const terrainMat = new THREE.MeshStandardMaterial({ color: 0x181c24, roughness: 0.9 });
    const grassMat = new THREE.MeshStandardMaterial({ color: 0x224422, roughness: 0.85 });

    // Mainland / Downtown Ground (West)
    const mainlandGeo = new THREE.BoxGeometry(260, 2, 700);
    const mainland = new THREE.Mesh(mainlandGeo, terrainMat);
    mainland.position.set(-270, -0.95, 0);
    mainland.receiveShadow = true;
    this.scene.add(mainland);

    // Starfish Island Ground (Center)
    const starfishGeo = new THREE.BoxGeometry(90, 2, 220);
    const starfish = new THREE.Mesh(starfishGeo, grassMat);
    starfish.position.set(-45, -0.95, 0);
    starfish.receiveShadow = true;
    this.scene.add(starfish);

    // Vice Beach Island Ground (East)
    const beachIslandGeo = new THREE.BoxGeometry(180, 2, 700);
    const beachIsland = new THREE.Mesh(beachIslandGeo, terrainMat);
    beachIsland.position.set(90, -0.95, 0);
    beachIsland.receiveShadow = true;
    this.scene.add(beachIsland);

    // Sandy Beach on East Edge (X: 180 to 280)
    const beachGeo = new THREE.PlaneGeometry(120, 700);
    beachGeo.rotateX(-Math.PI / 2);
    const beachMat = new THREE.MeshStandardMaterial({ color: 0xe8c78c, roughness: 0.95 });
    const beach = new THREE.Mesh(beachGeo, beachMat);
    beach.position.set(240, 0.04, 0);
    beach.receiveShadow = true;
    this.scene.add(beach);
  }

  buildRoadNetwork() {
    const roadMat = new THREE.MeshStandardMaterial({
      map: this.roadTexture,
      roughness: 0.7,
      metalness: 0.2
    });

    const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x5a5e66, roughness: 0.8 });

    // North-South Roads across all islands
    // Mainland: -340, -260, -180 | Starfish: -45 | Beach: 40, 110
    const nsRoads = [
      { x: -340, zMin: -300, zMax: 300 },
      { x: -260, zMin: -300, zMax: 300 },
      { x: -180, zMin: -300, zMax: 300 },
      { x: -45,  zMin: -90,  zMax: 90  }, // Starfish island avenue
      { x: 40,   zMin: -300, zMax: 300 },
      { x: 110,  zMin: -300, zMax: 300 }  // Ocean Drive
    ];

    nsRoads.forEach(r => {
      const len = r.zMax - r.zMin;
      const centerZ = (r.zMin + r.zMax) / 2;

      const roadGeo = new THREE.PlaneGeometry(16, len);
      roadGeo.rotateX(-Math.PI / 2);

      const mapClone = this.roadTexture.clone();
      mapClone.repeat.set(1, Math.round(len / 16));
      mapClone.needsUpdate = true;
      const mat = roadMat.clone();
      mat.map = mapClone;

      const road = new THREE.Mesh(roadGeo, mat);
      road.position.set(r.x, 0.05, centerZ);
      road.receiveShadow = true;
      this.scene.add(road);

      this.roadSegments.push({
        start: new THREE.Vector3(r.x, 0, r.zMin),
        end: new THREE.Vector3(r.x, 0, r.zMax),
        width: 16,
        isNS: true
      });

      // Sidewalks on both sides
      [-9.5, 9.5].forEach(sideOffset => {
        const swGeo = new THREE.BoxGeometry(3, 0.25, len);
        const sw = new THREE.Mesh(swGeo, sidewalkMat);
        sw.position.set(r.x + sideOffset, 0.12, centerZ);
        sw.receiveShadow = true;
        this.scene.add(sw);
      });
    });

    // East-West Connecting Avenues
    const ewRoads = [
      { z: -250, xMin: -360, xMax: 130 },
      { z: -160, xMin: -360, xMax: 130 },
      { z: -60,  xMin: -360, xMax: 130 },
      { z: 40,   xMin: -360, xMax: 130 },
      { z: 140,  xMin: -360, xMax: 130 },
      { z: 250,  xMin: -360, xMax: 130 }
    ];

    ewRoads.forEach(r => {
      const len = r.xMax - r.xMin;
      const centerX = (r.xMin + r.xMax) / 2;

      const roadGeo = new THREE.PlaneGeometry(len, 16);
      roadGeo.rotateX(-Math.PI / 2);

      const mapClone = this.roadTexture.clone();
      mapClone.repeat.set(Math.round(len / 16), 1);
      mapClone.needsUpdate = true;
      const mat = roadMat.clone();
      mat.map = mapClone;

      const road = new THREE.Mesh(roadGeo, mat);
      road.rotation.y = Math.PI / 2;
      road.position.set(centerX, 0.06, r.z);
      road.receiveShadow = true;
      this.scene.add(road);

      this.roadSegments.push({
        start: new THREE.Vector3(r.xMin, 0, r.z),
        end: new THREE.Vector3(r.xMax, 0, r.z),
        width: 16,
        isNS: false
      });
    });
  }

  buildBridges() {
    // Bridges over waterways connecting Mainland -> Starfish Island -> Vice Beach
    const bridgeZCoords = [-60, 40];
    const bridgeMat = new THREE.MeshStandardMaterial({ color: 0x3a424e, roughness: 0.6, metalness: 0.5 });
    const railMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3, metalness: 0.8 });

    bridgeZCoords.forEach(z => {
      // Bridge A: Mainland to Starfish Island (X: -180 to -90)
      this.createBridgeSegment(-135, z, 90, bridgeMat, railMat);

      // Bridge B: Starfish Island to Vice Beach (X: 0 to 40)
      this.createBridgeSegment(20, z, 40, bridgeMat, railMat);
    });

    // Stunt Jump Ramps over the canal bank!
    const ramp1 = this.envProps.createStuntRamp(-92, -60, -Math.PI / 2, 7, 3.2, 8.5);
    const ramp2 = this.envProps.createStuntRamp(2, 40, Math.PI / 2, 7, 3.2, 8.5);
    this.stuntRamps.push(ramp1, ramp2);
    [ramp1, ramp2].forEach(ramp => {
      if (ramp && ramp.colliderBox && !this.colliders.some(item => item.box === ramp.colliderBox)) {
        this.colliders.push({ box: ramp.colliderBox, type: 'ramp' });
      }
    });
  }

  createBridgeSegment(centerX, centerZ, length, bridgeMat, railMat) {
    const bridge = new THREE.Group();

    // Road Deck
    const deckGeo = new THREE.BoxGeometry(length, 1.2, 16);
    const deck = new THREE.Mesh(deckGeo, bridgeMat);
    deck.position.y = 0.6;
    deck.receiveShadow = true;
    bridge.add(deck);

    // Glowing Cyan Neon Guardrails
    [-8.2, 8.2].forEach(offsetZ => {
      const railGeo = new THREE.BoxGeometry(length, 1.0, 0.4);
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(0, 1.4, offsetZ);
      bridge.add(rail);
    });

    // Concrete Arched Pylons in the water
    const pylonGeo = new THREE.CylinderGeometry(2.0, 2.5, 6, 8);
    const pylon1 = new THREE.Mesh(pylonGeo, bridgeMat);
    pylon1.position.set(-length * 0.3, -2.5, 0);
    bridge.add(pylon1);

    const pylon2 = new THREE.Mesh(pylonGeo, bridgeMat);
    pylon2.position.set(length * 0.3, -2.5, 0);
    bridge.add(pylon2);

    bridge.position.set(centerX, 0, centerZ);
    this.scene.add(bridge);
  }

  buildDowntownSkyscrapers() {
    const glassColors = [0x162238, 0x121a28, 0x221832, 0x142834, 0x241d2d];

    // Grid of 20+ towering commercial skyscrapers in Downtown Mainland
    const towers = [
      { x: -300, z: -200, w: 55, d: 55, h: 95 },
      { x: -300, z: -110, w: 50, d: 65, h: 125, name: 'MAZE TOWER' },
      { x: -300, z: -10,  w: 55, d: 60, h: 110 },
      { x: -300, z: 90,   w: 50, d: 55, h: 140, name: 'LEONIDA FINANCIAL' },
      { x: -300, z: 190,  w: 55, d: 60, h: 85 },

      { x: -220, z: -200, w: 45, d: 55, h: 80 },
      { x: -220, z: -110, w: 50, d: 55, h: 115 },
      { x: -220, z: -10,  w: 55, d: 65, h: 160, name: 'VICE LIFE PLAZA' }, // Tallest central spire
      { x: -220, z: 90,   w: 48, d: 55, h: 105 },
      { x: -220, z: 190,  w: 50, d: 55, h: 90 },

      { x: -140, z: -200, w: 45, d: 55, h: 70 },
      { x: -140, z: -110, w: 45, d: 50, h: 95 },
      { x: -140, z: -10,  w: 45, d: 55, h: 85 },
      { x: -140, z: 90,   w: 45, d: 50, h: 75 },
      { x: -140, z: 190,  w: 45, d: 55, h: 65 }
    ];

    towers.forEach((t, idx) => {
      const geo = new THREE.BoxGeometry(t.w, t.h, t.d);
      const mat = new THREE.MeshStandardMaterial({
        color: glassColors[idx % glassColors.length],
        map: this.windowTexture,
        roughness: 0.25,
        metalness: 0.8
      });

      const bldg = new THREE.Mesh(geo, mat);
      bldg.position.set(t.x, t.h / 2, t.z);
      bldg.castShadow = true;
      bldg.receiveShadow = true;
      this.scene.add(bldg);
      this.buildingMeshes.push(bldg);

      const box = new THREE.Box3().setFromObject(bldg);
      this.colliders.push({ box, type: 'building' });

      // Rooftop Helipads, Antennas & Spire Lighting
      if (t.h > 90) {
        const roofCap = new THREE.Mesh(
          new THREE.CylinderGeometry(t.w * 0.25, t.w * 0.3, 3, 16),
          new THREE.MeshStandardMaterial({ color: 0x22262d })
        );
        roofCap.position.set(t.x, t.h + 1.5, t.z);
        this.scene.add(roofCap);

        const spire = new THREE.Mesh(
          new THREE.CylinderGeometry(0.2, 0.4, 18, 8),
          new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.9 })
        );
        spire.position.set(t.x, t.h + 12, t.z);
        this.scene.add(spire);

        const beacon = new THREE.Mesh(
          new THREE.SphereGeometry(1.0, 8, 8),
          new THREE.MeshBasicMaterial({ color: 0xff0044 })
        );
        beacon.position.set(t.x, t.h + 21, t.z);
        this.scene.add(beacon);
      }

      // Neon Brand Billboard on Top
      if (t.name) {
        this.envProps.createBillboard(t.x, t.h - 10, t.z + t.d / 2 + 0.5, t.name, 0x00f0ff, 0);
      }
    });

    // VCPD Downtown Headquarters
    this.buildPolicePrecinct(-220, 250);
  }

  buildPolicePrecinct(x, z) {
    const bldg = new THREE.Group();
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a3344, roughness: 0.5 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(45, 18, 40), wallMat);
    body.position.y = 9;
    bldg.add(body);

    // VCPD Neon Sign
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 256;
    signCanvas.height = 64;
    const sctx = signCanvas.getContext('2d');
    sctx.fillStyle = '#0a101d';
    sctx.fillRect(0, 0, 256, 64);
    sctx.fillStyle = '#0077ff';
    sctx.font = '900 28px Montserrat, sans-serif';
    sctx.textAlign = 'center';
    sctx.textBaseline = 'middle';
    sctx.fillText('★ VCPD HEADQUARTERS ★', 128, 32);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(16, 4), new THREE.MeshBasicMaterial({ map: signTex }));
    sign.position.set(0, 14, 20.2);
    bldg.add(sign);

    bldg.position.set(x, 0, z);
    this.scene.add(bldg);
    this.colliders.push({ box: new THREE.Box3().setFromObject(bldg), type: 'building' });

    // Mark as interactive police zone
    this.interactiveZones.push({ type: 'police_hq', position: new THREE.Vector3(x, 0, z + 25), radius: 10 });
  }

  buildOceanDriveArtDeco() {
    // Pastel Art Deco hotels along Ocean Drive (X: 130 to 145)
    const hotelColors = [0xff7597, 0x75d5ff, 0xffd075, 0xa675ff, 0x75ffaa, 0xff8866, 0xe066ff];
    const hotelNames = [
      "OCEAN VIEW",
      "THE COLONADE",
      "CLEAVELANDER",
      "TROPICANA",
      "NEON PALMS",
      "SUNSET COVE",
      "CORAL REEF"
    ];

    for (let i = 0; i < hotelNames.length; i++) {
      const z = -220 + i * 65;
      const hotelGroup = new THREE.Group();

      const mainGeo = new THREE.BoxGeometry(18, 24, 45);
      const mat = new THREE.MeshStandardMaterial({
        color: hotelColors[i % hotelColors.length],
        roughness: 0.5
      });
      const hotel = new THREE.Mesh(mainGeo, mat);
      hotel.position.set(135, 12, z);
      hotel.castShadow = true;
      hotel.receiveShadow = true;
      hotelGroup.add(hotel);

      // Art Deco Canopy
      const canopy = new THREE.Mesh(
        new THREE.BoxGeometry(6, 1, 16),
        new THREE.MeshStandardMaterial({ color: 0x1f1f24 })
      );
      canopy.position.set(124, 4.5, z);
      hotelGroup.add(canopy);

      // Glowing Neon Signboard
      const signCanvas = document.createElement('canvas');
      signCanvas.width = 256;
      signCanvas.height = 64;
      const sctx = signCanvas.getContext('2d');
      sctx.fillStyle = '#080511';
      sctx.fillRect(0, 0, 256, 64);
      sctx.fillStyle = '#ff007f';
      sctx.font = 'bold 26px Montserrat, sans-serif';
      sctx.textAlign = 'center';
      sctx.textBaseline = 'middle';
      sctx.fillText(hotelNames[i], 128, 32);

      const sign = new THREE.Mesh(
        new THREE.PlaneGeometry(12, 3),
        new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(signCanvas) })
      );
      sign.rotateY(-Math.PI / 2);
      sign.position.set(125.8, 18, z);
      hotelGroup.add(sign);

      this.scene.add(hotelGroup);
      this.colliders.push({ box: new THREE.Box3().setFromObject(hotel), type: 'building' });
      this.buildingMeshes.push(hotel);
    }
  }

  buildStarfishIslandMansions() {
    // 4 Luxury Spanish-style stucco mansions with red tile roofs & pools
    const mansionPositions = [
      { x: -55, z: -50 },
      { x: -35, z: -50 },
      { x: -55, z: 30 },
      { x: -35, z: 30 }
    ];

    const stuccoMat = new THREE.MeshStandardMaterial({ color: 0xffedd6, roughness: 0.8 });
    const tileMat = new THREE.MeshStandardMaterial({ color: 0xd95a32, roughness: 0.6 });
    const poolMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });

    mansionPositions.forEach((mp, idx) => {
      const villa = new THREE.Group();

      // Main Villa Body
      const body = new THREE.Mesh(new THREE.BoxGeometry(22, 10, 28), stuccoMat);
      body.position.y = 5;
      body.castShadow = true;
      villa.add(body);

      // Red Tiled Roof
      const roof = new THREE.Mesh(new THREE.ConeGeometry(18, 4, 4), tileMat);
      roof.position.y = 12;
      roof.rotation.y = Math.PI / 4;
      roof.castShadow = true;
      villa.add(roof);

      // Swimming Pool
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(10, 16), poolMat);
      pool.rotateX(-Math.PI / 2);
      pool.position.set(0, 0.08, 20);
      villa.add(pool);

      villa.position.set(mp.x, 0, mp.z);
      this.scene.add(villa);

      this.colliders.push({ box: new THREE.Box3().setFromObject(body), type: 'building' });
      this.buildingMeshes.push(body);

      // Surrounding courtyard palm trees
      this.envProps.createPalmTree(mp.x + 12, mp.z - 10, 0.9);
      this.envProps.createPalmTree(mp.x - 12, mp.z + 10, 0.9);
    });
  }

  buildIndustrialPort() {
    // Industrial shipping port in Southwest Mainland (X: -360 to -240, Z: -350 to -220)
    const colors = [0xd93829, 0x2668b8, 0xe5a329, 0x228b48, 0x8e35a6];

    // Stacks of Shipping Containers
    for (let i = 0; i < 28; i++) {
      const cx = -330 + (i % 6) * 14;
      const cz = -320 + Math.floor(i / 6) * 18;
      const col = colors[i % colors.length];

      // Ground container
      const c1 = this.envProps.createShippingContainer(cx, 0, cz, col, (i % 2 === 0 ? 0 : Math.PI / 2));
      if (c1 && c1.colliderBox && !this.colliders.some(item => item.box === c1.colliderBox)) {
        this.colliders.push({ box: c1.colliderBox, type: 'container' });
      }
      // Stacked container
      if (i % 3 === 0) {
        const c2 = this.envProps.createShippingContainer(cx, 2.6, cz, colors[(i + 2) % colors.length], 0);
        if (c2 && c2.colliderBox && !this.colliders.some(item => item.box === c2.colliderBox)) {
          this.colliders.push({ box: c2.colliderBox, type: 'container' });
        }
      }
    }

    // Industrial Storage Silos
    const siloMat = new THREE.MeshStandardMaterial({ color: 0x99a3b0, metalness: 0.8, roughness: 0.3 });
    [-350, -320, -290].forEach(sx => {
      const silo = new THREE.Mesh(new THREE.CylinderGeometry(5, 5, 20, 16), siloMat);
      silo.position.set(sx, 10, -260);
      silo.castShadow = true;
      this.scene.add(silo);
      this.colliders.push({ box: new THREE.Box3().setFromObject(silo), type: 'building' });
    });
  }

  buildInteractiveVenues() {
    // 1. THE MALIBU CLUB (X: 135, Z: -30)
    const malibuGroup = new THREE.Group();
    const clubMat = new THREE.MeshStandardMaterial({ color: 0x1f1430, roughness: 0.3, metalness: 0.8 });
    const clubBuilding = new THREE.Mesh(new THREE.BoxGeometry(24, 16, 36), clubMat);
    clubBuilding.position.set(138, 8, -30);
    clubBuilding.castShadow = true;
    malibuGroup.add(clubBuilding);

    // Neon Malibu Marquee
    const mCanvas = document.createElement('canvas');
    mCanvas.width = 256;
    mCanvas.height = 128;
    const mctx = mCanvas.getContext('2d');
    mctx.fillStyle = '#080014';
    mctx.fillRect(0, 0, 256, 128);
    mctx.fillStyle = '#ff00a0';
    mctx.font = '900 36px Montserrat, sans-serif';
    mctx.textAlign = 'center';
    mctx.fillText('MALIBU CLUB', 128, 55);
    mctx.fillStyle = '#00ffff';
    mctx.font = 'bold 20px Montserrat, sans-serif';
    mctx.fillText('★ VICE CITY ★', 128, 95);

    const mSign = new THREE.Mesh(
      new THREE.PlaneGeometry(14, 7),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mCanvas) })
    );
    mSign.rotateY(-Math.PI / 2);
    mSign.position.set(125.8, 12, -30);
    malibuGroup.add(mSign);

    this.scene.add(malibuGroup);
    this.colliders.push({ box: new THREE.Box3().setFromObject(clubBuilding), type: 'building' });

    // 2. AMMU-NATION GUN SHOP (X: 135, Z: 50)
    const ammuGroup = new THREE.Group();
    const ammuMat = new THREE.MeshStandardMaterial({ color: 0x2b1e16, roughness: 0.6 });
    const ammuBuilding = new THREE.Mesh(new THREE.BoxGeometry(20, 12, 30), ammuMat);
    ammuBuilding.position.set(136, 6, 50);
    ammuBuilding.castShadow = true;
    ammuGroup.add(ammuBuilding);

    const aCanvas = document.createElement('canvas');
    aCanvas.width = 256;
    aCanvas.height = 64;
    const actx = aCanvas.getContext('2d');
    actx.fillStyle = '#140500';
    actx.fillRect(0, 0, 256, 64);
    actx.fillStyle = '#ff3300';
    actx.font = '900 28px Montserrat, sans-serif';
    actx.textAlign = 'center';
    actx.textBaseline = 'middle';
    actx.fillText('AMMU-NATION 🔫', 128, 32);

    const aSign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(aCanvas) })
    );
    aSign.rotateY(-Math.PI / 2);
    aSign.position.set(125.8, 9, 50);
    ammuGroup.add(aSign);

    // Glowing interaction ring on ground
    const ammuRing = new THREE.Mesh(
      new THREE.RingGeometry(1.5, 2.0, 16),
      new THREE.MeshBasicMaterial({ color: 0xff3300, side: THREE.DoubleSide })
    );
    ammuRing.rotateX(-Math.PI / 2);
    ammuRing.position.set(120, 0.1, 50);
    ammuGroup.add(ammuRing);

    this.scene.add(ammuGroup);
    this.colliders.push({ box: new THREE.Box3().setFromObject(ammuBuilding), type: 'building' });
    this.interactiveZones.push({ type: 'ammunation', position: new THREE.Vector3(120, 0, 50), radius: 4.0 });

    // 3. PAY 'N' SPRAY AUTO REPAIR (X: 135, Z: -120)
    const pnsGroup = new THREE.Group();
    const pnsBuilding = new THREE.Mesh(
      new THREE.BoxGeometry(22, 12, 26),
      new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 })
    );
    pnsBuilding.position.set(136, 6, -120);
    pnsBuilding.castShadow = true;
    pnsGroup.add(pnsBuilding);

    const pCanvas = document.createElement('canvas');
    pCanvas.width = 256;
    pCanvas.height = 64;
    const pctx = pCanvas.getContext('2d');
    pctx.fillStyle = '#061826';
    pctx.fillRect(0, 0, 256, 64);
    pctx.fillStyle = '#00ffcc';
    pctx.font = '900 26px Montserrat, sans-serif';
    pctx.textAlign = 'center';
    pctx.textBaseline = 'middle';
    pctx.fillText("PAY 'N' SPRAY 🔧", 128, 32);

    const pSign = new THREE.Mesh(
      new THREE.PlaneGeometry(12, 3),
      new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(pCanvas) })
    );
    pSign.rotateY(-Math.PI / 2);
    pSign.position.set(124.8, 9, -120);
    pnsGroup.add(pSign);

    // Glowing Spray Booth garage marker
    const pnsRing = new THREE.Mesh(
      new THREE.RingGeometry(3.0, 3.8, 16),
      new THREE.MeshBasicMaterial({ color: 0x00ffcc, side: THREE.DoubleSide })
    );
    pnsRing.rotateX(-Math.PI / 2);
    pnsRing.position.set(118, 0.1, -120);
    pnsGroup.add(pnsRing);

    this.scene.add(pnsGroup);
    this.colliders.push({ box: new THREE.Box3().setFromObject(pnsBuilding), type: 'building' });
    this.interactiveZones.push({ type: 'pay_n_spray', position: new THREE.Vector3(118, 0, -120), radius: 6.0 });
  }

  buildBeachPromenadeAndPier() {
    // Lifeguard Towers along Ocean Beach
    [-180, -60, 60, 180].forEach((z, i) => {
      const colors = [0x00e5ff, 0xff007f, 0xffdd00, 0x00ff66];
      this.envProps.createLifeguardTower(215, z, colors[i % colors.length]);
    });

    // Beach Umbrellas & Loungers
    for (let z = -260; z <= 260; z += 25) {
      const col = (z % 50 === 0) ? 0xff007f : (z % 30 === 0 ? 0x00f0ff : 0xffaa00);
      this.envProps.createBeachUmbrella(235 + (Math.sin(z) * 8), z, col);
    }

    // Ocean Beach Marina Wooden Pier extending over the water
    this.envProps.createPier(240, 110, 100, 14);

    // Moored Yachts by the Pier
    this.envProps.createYacht(255, 125, 0);
    this.envProps.createYacht(225, 145, Math.PI / 8);
  }

  buildStreetDetails() {
    // Traffic Lights at major intersections
    const lights = [
      { x: 118, z: -60,  rot: Math.PI / 2 },
      { x: 118, z: 40,   rot: Math.PI / 2 },
      { x: 48,  z: -60,  rot: 0 },
      { x: 48,  z: 40,   rot: 0 },
      { x: -172, z: -60, rot: Math.PI / 2 },
      { x: -172, z: 40,  rot: Math.PI / 2 }
    ];
    lights.forEach(l => this.envProps.createTrafficLight(l.x, l.z, l.rot));

    // Street Lamps along coastal Ocean Drive & Downtown
    for (let z = -280; z <= 280; z += 40) {
      const sl1 = this.envProps.createStreetLight(119, z, Math.PI / 2);
      const sl2 = this.envProps.createStreetLight(31, z, -Math.PI / 2);
      const sl3 = this.envProps.createStreetLight(-171, z, Math.PI / 2);
      const sl4 = this.envProps.createStreetLight(-269, z, -Math.PI / 2);
      [sl1, sl2, sl3, sl4].forEach(lamp => {
        if (lamp && lamp.colliderBox && !this.colliders.some(item => item.box === lamp.colliderBox)) {
          this.colliders.push({ box: lamp.colliderBox, type: 'pole' });
        }
      });
    }

    // Lush Palm Trees along sidewalks
    [-45, 40, 110].forEach(x => {
      for (let z = -280; z <= 280; z += 32) {
        if (Math.abs(z % 60) > 12) {
          this.envProps.createPalmTree(x + 10.5, z, 0.85 + Math.random() * 0.3);
          this.envProps.createPalmTree(x - 10.5, z, 0.85 + Math.random() * 0.3);
        }
      }
    });

    // Default Player Spawn Point on Ocean Drive
    this.spawnPoints.push(new THREE.Vector3(110, 0.5, 20));
  }

  checkCollision(position, radius = 0.6) {
    const minX = position.x - radius;
    const maxX = position.x + radius;
    const minZ = position.z - radius;
    const maxZ = position.z + radius;

    for (let i = 0; i < this.colliders.length; i++) {
      const box = this.colliders[i].box;
      if (
        maxX >= box.min.x &&
        minX <= box.max.x &&
        maxZ >= box.min.z &&
        minZ <= box.max.z &&
        position.y < box.max.y
      ) {
        return { collided: true, box };
      }
    }
    return { collided: false };
  }

  getGroundHeight(x, z) {
    if (x == null || z == null || isNaN(x) || isNaN(z)) return 0;
    for (let i = 0; i < this.bridges.length; i++) {
      const b = this.bridges[i];
      if (x >= b.xMin && x <= b.xMax && Math.abs(z - b.z) <= b.halfWidth) {
        return b.height;
      }
    }
    return 0;
  }
}
