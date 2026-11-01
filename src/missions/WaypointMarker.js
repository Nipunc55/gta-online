import * as THREE from 'three';
import { CURB_H } from '../world/CityLayout.js';
import { makeTextTexture } from '../world/CityGenerator.js';

/**
 * 3D glowing mission waypoint marker (ground ring + translucent light cylinder + bobbing chevron arrow)
 * plus permanent 3D story landmarks (Lamar's Safehouse canopy & Pay'n'Spray garage).
 */
export class WaypointMarker {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    this.group = new THREE.Group();
    this.group.visible = false;

    // 1. Translucent glowing light beam cylinder
    const cylGeo = new THREE.CylinderGeometry(2.3, 2.3, 5.5, 24, 1, true);
    this.cylMat = new THREE.MeshBasicMaterial({
      color: 0xf1c40f,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.cylinder = new THREE.Mesh(cylGeo, this.cylMat);
    this.cylinder.position.y = 2.75;
    this.group.add(this.cylinder);

    // 2. Concentric glowing ground ring
    const ringGeo = new THREE.RingGeometry(1.85, 2.45, 32);
    ringGeo.rotateX(-Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: 0xf1c40f,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.ring = new THREE.Mesh(ringGeo, this.ringMat);
    this.ring.position.y = 0.06;
    this.group.add(this.ring);

    // 3. Floating 3D downward chevron/diamond arrow
    const arrowGeo = new THREE.ConeGeometry(0.68, 1.35, 4);
    arrowGeo.rotateX(Math.PI); // point downward
    this.arrowMat = new THREE.MeshStandardMaterial({
      color: 0xf1c40f,
      emissive: 0xd4ac0d,
      emissiveIntensity: 0.75,
      roughness: 0.25,
      metalness: 0.5
    });
    this.arrow = new THREE.Mesh(arrowGeo, this.arrowMat);
    this.arrow.position.y = 4.2;
    this.group.add(this.arrow);

    this.scene.add(this.group);
    this.buildStoryLandmarks();
  }

  /**
   * Builds permanent 3D architectural structures for Lamar's Downtown Safehouse (Block [4, 5])
   * and the Westside Pay'n'Spray Auto Shop (Block [1, 2]).
   */
  buildStoryLandmarks() {
    const landmarkGroup = new THREE.Group();
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e272e, roughness: 0.6, metalness: 0.4 });
    const neonGreen = new THREE.MeshStandardMaterial({
      color: 0x2ecc71,
      emissive: 0x2ecc71,
      emissiveIntensity: 0.85,
      roughness: 0.3
    });
    const neonCyan = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      emissive: 0x00ffff,
      emissiveIntensity: 0.85,
      roughness: 0.3
    });

    // --- 1. Lamar's Downtown Safehouse Canopy (Block [4, 5], x = 45, z = 109) ---
    const sh = new THREE.Group();
    sh.position.set(45.0, CURB_H, 109.5);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(11.0, 0.45, 6.2), darkMat);
    roof.position.set(0, 4.2, 0);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(10.6, 4.2, 0.45), darkMat);
    backWall.position.set(0, 2.1, 2.85);
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.2, 0.45), darkMat);
    pillarL.position.set(-5.0, 2.1, -2.7);
    const pillarR = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.2, 0.45), darkMat);
    pillarR.position.set(5.0, 2.1, -2.7);
    const trim = new THREE.Mesh(new THREE.BoxGeometry(11.2, 0.16, 6.4), neonGreen);
    trim.position.set(0, 4.46, 0);
    sh.add(roof, backWall, pillarL, pillarR, trim);

    const signTex = makeTextTexture("LAMAR'S SAFEHOUSE", {
      bg: '#0f171e',
      color: '#2ecc71',
      border: '#2ecc71',
      w: 512,
      h: 96,
      size: 42
    });
    const signMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(8.8, 1.55),
      new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false })
    );
    signMesh.position.set(0, 5.35, -2.95);
    signMesh.rotation.y = Math.PI; // faces North (-Z) toward the avenue at z = 90
    sh.add(signMesh);
    landmarkGroup.add(sh);

    // --- 2. Westside Pay'n'Spray Auto Shop (Block [1, 2], x = -225, z = -164) ---
    const pns = new THREE.Group();
    pns.position.set(-225.0, CURB_H, -163.5);
    const pRoof = new THREE.Mesh(new THREE.BoxGeometry(10.5, 0.45, 7.5), darkMat);
    pRoof.position.set(0, 4.4, 0);
    const pLeft = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 7.2), darkMat);
    pLeft.position.set(-4.9, 2.2, 0);
    const pRight = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4.4, 7.2), darkMat);
    pRight.position.set(4.9, 2.2, 0);
    const pTrim = new THREE.Mesh(new THREE.BoxGeometry(10.7, 0.18, 7.7), neonCyan);
    pTrim.position.set(0, 4.68, 0);
    pns.add(pRoof, pLeft, pRight, pTrim);

    const pnsTex = makeTextTexture("PAY 'N' SPRAY — REPAIR & CLEAR HEAT", {
      bg: '#120c24',
      color: '#00ffff',
      border: '#ff007f',
      w: 512,
      h: 96,
      size: 28
    });
    const pnsSign = new THREE.Mesh(
      new THREE.PlaneGeometry(9.2, 1.55),
      new THREE.MeshBasicMaterial({ map: pnsTex, toneMapped: false })
    );
    pnsSign.position.set(0, 5.5, -3.78);
    pnsSign.rotation.y = Math.PI; // faces North (-Z) toward road at z = -180
    pns.add(pnsSign);
    landmarkGroup.add(pns);

    this.scene.add(landmarkGroup);
  }

  show(x, y, z, colorHex = 0xf1c40f, radius = 2.3) {
    this.group.position.set(x, y, z);
    this.group.visible = true;
    this.cylMat.color.setHex(colorHex);
    this.ringMat.color.setHex(colorHex);
    this.arrowMat.color.setHex(colorHex);
    this.arrowMat.emissive.setHex(colorHex);
    const scale = radius / 2.3;
    this.cylinder.scale.set(scale, 1, scale);
    this.ring.scale.set(scale, scale, 1);
  }

  hide() {
    this.group.visible = false;
  }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    this.arrow.rotation.y += dt * 2.4;
    this.arrow.position.y = 4.15 + Math.sin(this.time * 4.2) * 0.42;
    const pulse = 1.0 + Math.sin(this.time * 5.0) * 0.1;
    this.ring.scale.x = pulse;
    this.ring.scale.y = pulse;
    this.cylMat.opacity = 0.17 + Math.sin(this.time * 4.0) * 0.06;
  }
}
