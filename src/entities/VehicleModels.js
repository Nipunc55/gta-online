import * as THREE from 'three';
import { createLightBeamMaterial } from '../world/LightBeamMaterial.js';

// 5 distinct low-poly GTA vehicle classes with custom proportions, handling stats,
// wheel groups, brake lights, headlights, and police lightbar.

export const VEHICLE_TYPES = {
  sport: {
    id: 'sport',
    name: 'GROTTI CHEETAH GT',
    width: 2.0,
    length: 4.5,
    chassisH: 0.46,
    cabinH: 0.44,
    cabinW: 1.55,
    cabinL: 1.85,
    cabinZ: 0.15,
    wheelRadius: 0.36,
    wheelBase: 2.75,
    maxSpeed: 44,
    acceleration: 25,
    braking: 34,
    steerSpeed: 2.5,
    grip: 10.5,
    driftGrip: 2.6,
    maxHealth: 260,
    spoiler: true,
    colors: [0xe74c3c, 0xf1c40f, 0x00bcd4, 0x9b59b6, 0x2ecc71, 0xff5722]
  },
  sedan: {
    id: 'sedan',
    name: 'TAILGATER SEDAN',
    width: 1.9,
    length: 4.5,
    chassisH: 0.54,
    cabinH: 0.54,
    cabinW: 1.62,
    cabinL: 2.15,
    cabinZ: 0.05,
    wheelRadius: 0.35,
    wheelBase: 2.7,
    maxSpeed: 33,
    acceleration: 17,
    braking: 28,
    steerSpeed: 2.25,
    grip: 9.5,
    driftGrip: 3.0,
    maxHealth: 300,
    colors: [0x34495e, 0x7f8c8d, 0x2980b9, 0x8e44ad, 0xc0392b, 0xecf0f1, 0x2c3e50]
  },
  suv: {
    id: 'suv',
    name: 'BALLER SUV',
    width: 2.1,
    length: 4.8,
    chassisH: 0.68,
    cabinH: 0.66,
    cabinW: 1.85,
    cabinL: 2.85,
    cabinZ: 0.3,
    wheelRadius: 0.42,
    wheelBase: 2.9,
    maxSpeed: 30,
    acceleration: 15,
    braking: 25,
    steerSpeed: 2.0,
    grip: 9.0,
    driftGrip: 3.2,
    maxHealth: 420,
    colors: [0x1c2833, 0x566573, 0x1e8449, 0x784212, 0xd0d3d4, 0x922b21]
  },
  pickup: {
    id: 'pickup',
    name: 'BRAVADO BISON',
    width: 2.08,
    length: 5.0,
    chassisH: 0.64,
    cabinH: 0.64,
    cabinW: 1.82,
    cabinL: 1.7,
    cabinZ: -0.4,
    wheelRadius: 0.42,
    wheelBase: 3.05,
    maxSpeed: 31,
    acceleration: 16,
    braking: 26,
    steerSpeed: 2.05,
    grip: 8.8,
    driftGrip: 2.8,
    maxHealth: 400,
    isPickup: true,
    colors: [0xb03a2e, 0x1f618d, 0xd4ac0d, 0x2e4053, 0xba4a00, 0x117a65]
  },
  police: {
    id: 'police',
    name: 'LSPD INTERCEPTOR',
    width: 1.96,
    length: 4.65,
    chassisH: 0.54,
    cabinH: 0.52,
    cabinW: 1.65,
    cabinL: 2.15,
    cabinZ: 0.05,
    wheelRadius: 0.36,
    wheelBase: 2.78,
    maxSpeed: 40,
    acceleration: 23,
    braking: 32,
    steerSpeed: 2.4,
    grip: 10.2,
    driftGrip: 2.9,
    maxHealth: 360,
    isPolice: true,
    colors: [0x11161d]
  }
};

let cachedHeadlightTex = null;
function getHeadlightProjectorTexture() {
  if (cachedHeadlightTex) return cachedHeadlightTex;
  if (typeof document === 'undefined') return null;

  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, 128, 256);

  // Dual overlapping forward headlight cones (bottom of canvas = near front bumper, top = far road)
  const drawBeam = (cx) => {
    const grad = ctx.createRadialGradient(cx, 244, 4, cx, 120, 195);
    grad.addColorStop(0.0, 'rgba(255, 250, 220, 0.92)');
    grad.addColorStop(0.18, 'rgba(255, 244, 195, 0.58)');
    grad.addColorStop(0.55, 'rgba(255, 236, 170, 0.20)');
    grad.addColorStop(1.0, 'rgba(255, 236, 170, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - 10, 252);
    ctx.lineTo(cx + 10, 252);
    ctx.lineTo(cx + 58, 4);
    ctx.lineTo(cx - 58, 4);
    ctx.closePath();
    ctx.fill();
  };

  drawBeam(42);
  drawBeam(86);

  cachedHeadlightTex = new THREE.CanvasTexture(canvas);
  cachedHeadlightTex.needsUpdate = true;
  return cachedHeadlightTex;
}

export function buildVehicleModel(typeKey = 'sedan', colorHex = null) {
  const spec = VEHICLE_TYPES[typeKey] || VEHICLE_TYPES.sedan;
  const bodyColor = colorHex ?? spec.colors[Math.floor(Math.random() * spec.colors.length)];

  const root = new THREE.Group();
  const bodyGroup = new THREE.Group(); // tilts with roll & pitch
  root.add(bodyGroup);

  const bodyMat = new THREE.MeshStandardMaterial({
    color: bodyColor,
    roughness: 0.32,
    metalness: 0.65,
    flatShading: true
  });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x1b1e23, roughness: 0.8, flatShading: true });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1d2b3a,
    roughness: 0.15,
    metalness: 0.85,
    transparent: true,
    opacity: 0.78
  });

  const baseY = spec.wheelRadius + spec.chassisH * 0.5 - 0.05;

  // Lower chassis
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(spec.width, spec.chassisH, spec.length), bodyMat);
  chassis.position.y = baseY;
  chassis.castShadow = true;
  chassis.receiveShadow = true;
  bodyGroup.add(chassis);

  // Bumpers
  const fBumper = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.98, 0.22, 0.22), trimMat);
  fBumper.position.set(0, baseY - spec.chassisH * 0.25, -spec.length / 2 - 0.06);
  bodyGroup.add(fBumper);

  const rBumper = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.98, 0.24, 0.22), trimMat);
  rBumper.position.set(0, baseY - spec.chassisH * 0.25, spec.length / 2 + 0.06);
  bodyGroup.add(rBumper);

  // Cabin glass + roof
  const cabinY = baseY + spec.chassisH * 0.5 + spec.cabinH * 0.5 - 0.02;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(spec.cabinW, spec.cabinH, spec.cabinL), glassMat);
  cabin.position.set(0, cabinY, spec.cabinZ);
  cabin.castShadow = true;
  bodyGroup.add(cabin);

  const roof = new THREE.Mesh(new THREE.BoxGeometry(spec.cabinW - 0.1, 0.08, spec.cabinL - 0.18), bodyMat);
  roof.position.set(0, cabinY + spec.cabinH * 0.5 + 0.02, spec.cabinZ);
  bodyGroup.add(roof);

  if (spec.spoiler) {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.92, 0.08, 0.32), trimMat);
    spoiler.position.set(0, baseY + spec.chassisH * 0.5 + 0.22, spec.length * 0.45);
    bodyGroup.add(spoiler);
  }

  if (spec.isPickup) {
    const bedFloor = new THREE.Mesh(new THREE.BoxGeometry(spec.width * 0.88, 0.08, 1.65), trimMat);
    bedFloor.position.set(0, baseY + spec.chassisH * 0.5 + 0.02, 1.35);
    bodyGroup.add(bedFloor);
  }

  // Seated driver silhouette
  const driverGroup = new THREE.Group();
  const dTorso = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.40, 0.25),
    new THREE.MeshStandardMaterial({ color: spec.isPolice ? 0x1b263b : 0x16a085, roughness: 0.7 })
  );
  dTorso.position.set(-0.36, cabinY - 0.06, spec.cabinZ - 0.1);
  const dHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.22, 0.24, 0.22),
    new THREE.MeshStandardMaterial({ color: 0xe0ac69, roughness: 0.7 })
  );
  dHead.position.set(-0.36, cabinY + 0.24, spec.cabinZ - 0.1);
  driverGroup.add(dTorso, dHead);
  driverGroup.visible = false;
  bodyGroup.add(driverGroup);

  // Headlights, volumetric beam cones, road projector pool & forward SpotLight
  const hlMat = new THREE.MeshBasicMaterial({ color: 0xfff8d6 });
  const blMat = new THREE.MeshBasicMaterial({ color: 0x990011 });
  const headlightGroup = new THREE.Group();
  bodyGroup.add(headlightGroup);

  const beamLen = 9.0;
  const beamGeo = new THREE.ConeGeometry(1.5, beamLen, 18, 1, true);
  beamGeo.translate(0, -beamLen * 0.5, 0);
  beamGeo.rotateX(Math.PI / 2); // Apex at (0,0,0), opens toward -Z
  const beamMat = createLightBeamMaterial({ color: 0xfff1c8, intensity: 0.22, lengthFalloff: 1.6, edgeFalloff: 2.0 });

  [-spec.width * 0.34, spec.width * 0.34].forEach((lx) => {
    const hl = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.13, 0.05), hlMat);
    hl.position.set(lx, baseY + 0.05, -spec.length / 2 - 0.03);
    bodyGroup.add(hl);

    const beam = new THREE.Mesh(beamGeo, beamMat);
    beam.position.set(lx, baseY + 0.05, -spec.length / 2 - 0.04);
    beam.rotation.x = -0.075; // Tilt slightly downward onto the road ahead
    headlightGroup.add(beam);

    const bl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.14, 0.05), blMat);
    bl.position.set(lx, baseY + 0.06, spec.length / 2 + 0.03);
    bodyGroup.add(bl);
  });

  // Ground road-surface light projection decal
  const poolW = spec.width * 2.55;
  const poolL = 13.0;
  const poolGeo = new THREE.PlaneGeometry(poolW, poolL);
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = new THREE.MeshBasicMaterial({
    map: getHeadlightProjectorTexture(),
    color: 0xfff7d6,
    transparent: true,
    opacity: 0.52,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2
  });
  const groundPool = new THREE.Mesh(poolGeo, poolMat);
  groundPool.position.set(0, 0.03, -spec.length / 2 - poolL * 0.5 + 0.2);
  groundPool.renderOrder = 1;
  root.add(groundPool);

  // Forward Three.js SpotLight illuminating roads, buildings, and obstacles ahead
  const spotLight = new THREE.SpotLight(0xfff5d6, 26, 38, Math.PI * 0.28, 0.55, 1.2);
  spotLight.position.set(0, baseY + 0.12, -spec.length / 2 - 0.05);
  spotLight.castShadow = false;
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, -0.5, -spec.length / 2 - 18);
  bodyGroup.add(spotLight);
  bodyGroup.add(spotTarget);
  spotLight.target = spotTarget;

  // Police white doors & lightbar
  let policeRed = null, policeBlue = null;
  if (spec.isPolice) {
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.4 });
    [-spec.width / 2 - 0.01, spec.width / 2 + 0.01].forEach((dx) => {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.02, spec.chassisH * 0.88, 1.65), doorMat);
      door.position.set(dx, baseY, 0.05);
      bodyGroup.add(door);
    });
    const barY = cabinY + spec.cabinH * 0.5 + 0.12;
    const barBase = new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.10, 0.24), trimMat);
    barBase.position.set(0, barY, spec.cabinZ);
    bodyGroup.add(barBase);

    policeRed = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.22), new THREE.MeshBasicMaterial({ color: 0xff1122 }));
    policeRed.position.set(-0.30, barY + 0.01, spec.cabinZ);
    bodyGroup.add(policeRed);

    policeBlue = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.11, 0.22), new THREE.MeshBasicMaterial({ color: 0x1177ff }));
    policeBlue.position.set(0.30, barY + 0.01, spec.cabinZ);
    bodyGroup.add(policeBlue);
  }

  // 4 wheels
  const wheelGeo = new THREE.CylinderGeometry(spec.wheelRadius, spec.wheelRadius, 0.28, 12);
  wheelGeo.rotateZ(Math.PI / 2);
  const rimGeo = new THREE.CylinderGeometry(spec.wheelRadius * 0.58, spec.wheelRadius * 0.58, 0.30, 8);
  rimGeo.rotateZ(Math.PI / 2);
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1c20, roughness: 0.85, flatShading: true });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xd5d8dc, metalness: 0.8, roughness: 0.25 });

  const wx = spec.width * 0.5;
  const wz = spec.wheelBase * 0.5;
  const wheelCoords = [
    { x: -wx, z: -wz, isFront: true },
    { x: wx, z: -wz, isFront: true },
    { x: -wx, z: wz, isFront: false },
    { x: wx, z: wz, isFront: false }
  ];
  const wheels = [];
  let frontL = null, frontR = null;

  wheelCoords.forEach((wc) => {
    const wg = new THREE.Group();
    wg.position.set(wc.x, spec.wheelRadius, wc.z);
    const spin = new THREE.Group();
    const tire = new THREE.Mesh(wheelGeo, tireMat);
    tire.castShadow = true;
    const rim = new THREE.Mesh(rimGeo, rimMat);
    spin.add(tire, rim);
    wg.add(spin);
    root.add(wg);
    wheels.push({ group: wg, spin, isFront: wc.isFront });
    if (wc.isFront && wc.x < 0) frontL = wg;
    if (wc.isFront && wc.x > 0) frontR = wg;
  });

  return {
    root,
    bodyGroup,
    chassis,
    bodyMat,
    brakeMat: blMat,
    headlightMat: hlMat,
    headlightGroup,
    groundPool,
    spotLight,
    spotTarget,
    driverGroup,
    wheels,
    frontL,
    frontR,
    policeRed,
    policeBlue,
    spec
  };
}
