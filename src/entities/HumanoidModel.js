import * as THREE from 'three';

// Shared articulated low-poly humanoid builder used by Player, Civilians, Gang, and Police NPCs.
// Local forward is -Z (matches yaw = 0 -> (0, 0, -1)).

const SKIN_TONES = [0xf2c29b, 0xe0ac69, 0xc68642, 0x8d5524, 0xf6d3b8];
const HAIR_COLORS = [0x1c140d, 0x3b2614, 0x6b4423, 0xb8860b, 0x222222];
const SHIRT_COLORS = [0x2e86c1, 0xe74c3c, 0x27ae60, 0xf39c12, 0x8e44ad, 0x16a085, 0xf5f5f5, 0xd35400];
const PANTS_COLORS = [0x1f2a38, 0x2c3e50, 0x4a3b2c, 0x34495e, 0x222222, 0x5d6d7e];

const SharedGeo = {};
function ensureGeo() {
  if (SharedGeo.ready) return;
  SharedGeo.ready = true;
  SharedGeo.torso = new THREE.BoxGeometry(0.46, 0.56, 0.25);
  SharedGeo.hips = new THREE.BoxGeometry(0.44, 0.16, 0.24);
  SharedGeo.head = new THREE.BoxGeometry(0.28, 0.30, 0.28);
  SharedGeo.hair = new THREE.BoxGeometry(0.30, 0.12, 0.30);
  SharedGeo.capBrim = new THREE.BoxGeometry(0.30, 0.04, 0.18);
  SharedGeo.glasses = new THREE.BoxGeometry(0.26, 0.07, 0.06);
  SharedGeo.arm = new THREE.BoxGeometry(0.14, 0.54, 0.14);
  SharedGeo.leg = new THREE.BoxGeometry(0.17, 0.64, 0.17);
  SharedGeo.shoe = new THREE.BoxGeometry(0.18, 0.11, 0.27);
}

export function createHumanoid(opts = {}) {
  ensureGeo();
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const role = opts.role || 'civilian'; // 'player' | 'civilian' | 'police' | 'gang'

  const skinColor = opts.skinColor ?? pick(SKIN_TONES);
  const hairColor = opts.hairColor ?? pick(HAIR_COLORS);
  let shirtColor = opts.shirtColor ?? pick(SHIRT_COLORS);
  let pantsColor = opts.pantsColor ?? pick(PANTS_COLORS);

  if (role === 'player') {
    shirtColor = 0x16a085;
    pantsColor = 0x1c2833;
  } else if (role === 'police') {
    shirtColor = 0x18253b;
    pantsColor = 0x101826;
  } else if (role === 'gang') {
    shirtColor = opts.gangColor || 0x9b1c1c;
    pantsColor = 0x222222;
  }

  const skinMat = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.75, flatShading: true });
  const shirtMat = new THREE.MeshStandardMaterial({ color: shirtColor, roughness: 0.7, flatShading: true });
  const pantsMat = new THREE.MeshStandardMaterial({ color: pantsColor, roughness: 0.8, flatShading: true });
  const hairMat = new THREE.MeshStandardMaterial({ color: hairColor, roughness: 0.85, flatShading: true });
  const shoeMat = new THREE.MeshStandardMaterial({
    color: role === 'police' ? 0x111111 : 0xeeeeee,
    roughness: 0.5,
    flatShading: true
  });

  const root = new THREE.Group();

  // Torso (pivot at hips/waist height ~1.10)
  const torso = new THREE.Mesh(SharedGeo.torso, shirtMat);
  torso.position.y = 1.12;
  torso.castShadow = true;
  root.add(torso);

  const hips = new THREE.Mesh(SharedGeo.hips, pantsMat);
  hips.position.y = -0.32;
  torso.add(hips);

  // Head
  const head = new THREE.Mesh(SharedGeo.head, skinMat);
  head.position.set(0, 0.46, 0);
  head.castShadow = true;
  torso.add(head);

  const hair = new THREE.Mesh(SharedGeo.hair, role === 'police' ? shirtMat : hairMat);
  hair.position.set(0, 0.14, 0.01);
  head.add(hair);

  if (role === 'police') {
    const brim = new THREE.Mesh(SharedGeo.capBrim, shoeMat);
    brim.position.set(0, 0.10, -0.17);
    head.add(brim);
  }

  if (role === 'player' || role === 'police' || Math.random() < 0.25) {
    const glasses = new THREE.Mesh(
      SharedGeo.glasses,
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.2, metalness: 0.8 })
    );
    glasses.position.set(0, 0.02, -0.14);
    head.add(glasses);
  }

  // Arms (shoulder pivots on torso, local -Z is forward)
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.31, 0.22, 0);
  const leftArmMesh = new THREE.Mesh(SharedGeo.arm, skinMat);
  leftArmMesh.position.y = -0.25;
  leftArmMesh.castShadow = true;
  leftArm.add(leftArmMesh);
  torso.add(leftArm);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.31, 0.22, 0);
  const rightArmMesh = new THREE.Mesh(SharedGeo.arm, skinMat);
  rightArmMesh.position.y = -0.25;
  rightArmMesh.castShadow = true;
  rightArm.add(rightArmMesh);
  torso.add(rightArm);

  // Weapon hand socket (points along local -Z when rightArm is raised by +PI/2 around X)
  const weaponSocket = new THREE.Group();
  weaponSocket.position.set(0, -0.50, -0.06);
  rightArm.add(weaponSocket);

  // Legs (hip pivots at y = 0.76)
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.13, 0.76, 0);
  const leftLegMesh = new THREE.Mesh(SharedGeo.leg, pantsMat);
  leftLegMesh.position.y = -0.32;
  leftLegMesh.castShadow = true;
  leftLeg.add(leftLegMesh);
  const leftShoe = new THREE.Mesh(SharedGeo.shoe, shoeMat);
  leftShoe.position.set(0, -0.68, -0.04);
  leftLeg.add(leftShoe);
  root.add(leftLeg);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.13, 0.76, 0);
  const rightLegMesh = new THREE.Mesh(SharedGeo.leg, pantsMat);
  rightLegMesh.position.y = -0.32;
  rightLegMesh.castShadow = true;
  rightLeg.add(rightLegMesh);
  const rightShoe = new THREE.Mesh(SharedGeo.shoe, shoeMat);
  rightShoe.position.set(0, -0.68, -0.04);
  rightLeg.add(rightShoe);
  root.add(rightLeg);

  return {
    root,
    torso,
    head,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponSocket
  };
}

/** Animate humanoid limbs given speed/aim/punch states. */
export function animateHumanoid(rig, dt, state) {
  const { moving, sprinting, aiming, aimPitch = 0, punchTimer = 0 } = state;
  rig._animTime = (rig._animTime || 0) + (moving ? dt * (sprinting ? 13 : 8) : dt * 2.5);
  const t = rig._animTime;

  if (moving) {
    const amp = sprinting ? 0.85 : 0.55;
    const s = Math.sin(t) * amp;
    rig.leftLeg.rotation.x = s;
    rig.rightLeg.rotation.x = -s;
    if (!aiming && punchTimer <= 0) {
      rig.leftArm.rotation.x = -s * 0.75;
      rig.rightArm.rotation.x = s * 0.75;
      rig.leftArm.rotation.y = 0;
      rig.rightArm.rotation.y = 0;
    }
    rig.torso.position.y = 1.12 + Math.abs(Math.sin(t)) * 0.045;
  } else {
    const k = Math.min(1, dt * 10);
    rig.leftLeg.rotation.x *= (1 - k);
    rig.rightLeg.rotation.x *= (1 - k);
    rig.torso.position.y = 1.12 + Math.sin(t) * 0.015;
    if (!aiming && punchTimer <= 0) {
      rig.leftArm.rotation.x *= (1 - k);
      rig.rightArm.rotation.x *= (1 - k);
      rig.leftArm.rotation.y *= (1 - k);
      rig.rightArm.rotation.y *= (1 - k);
    }
  }

  // Forward is local -Z, so raising the arm forward is a POSITIVE X rotation (+PI/2)
  if (aiming) {
    rig.rightArm.rotation.x = Math.PI / 2 - aimPitch;
    rig.rightArm.rotation.y = 0.08;
    rig.leftArm.rotation.x = Math.PI / 2.2 - aimPitch * 0.8;
    rig.leftArm.rotation.y = -0.35;
  } else if (punchTimer > 0) {
    const p = Math.sin(punchTimer * Math.PI);
    rig.rightArm.rotation.x = p * 1.55;
    rig.rightArm.position.z = -p * 0.22;
  } else {
    rig.rightArm.position.z = 0;
  }
}
