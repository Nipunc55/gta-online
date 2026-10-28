import * as THREE from 'three';

export class EnvironmentProps {
  constructor(scene, colliders = null) {
    this.scene = scene;
    this.colliders = colliders;
    this.palmTrees = [];
    this.trafficLights = [];
    this.propsGroup = new THREE.Group();
    this.scene.add(this.propsGroup);
  }

  createPalmTree(x, z, scale = 1.0) {
    const tree = new THREE.Group();

    // Curved Trunk
    const trunkMat = new THREE.MeshStandardMaterial({
      color: 0x5a3d28,
      roughness: 0.9,
      metalness: 0.1
    });

    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0.4 * scale, 3 * scale, 0.2 * scale),
      new THREE.Vector3(0.8 * scale, 6.5 * scale, 0.1 * scale),
      new THREE.Vector3(0.5 * scale, 9.5 * scale, -0.2 * scale)
    ]);

    const trunkGeo = new THREE.TubeGeometry(curve, 16, 0.35 * scale, 8, false);
    const trunkMesh = new THREE.Mesh(trunkGeo, trunkMat);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;
    tree.add(trunkMesh);

    // Palm Leaves Fronds
    const leafMat = new THREE.MeshStandardMaterial({
      color: 0x1f7a2d,
      roughness: 0.6,
      side: THREE.DoubleSide
    });

    const leafGeo = new THREE.BufferGeometry();
    const leafLen = 4.2 * scale;
    const leafWidth = 1.2 * scale;
    const verts = new Float32Array([
      0, 0, 0,
      -leafWidth * 0.5, -0.4 * scale, leafLen * 0.5,
      0, -1.2 * scale, leafLen,
      leafWidth * 0.5, -0.4 * scale, leafLen * 0.5
    ]);
    const indices = [0, 1, 2, 0, 2, 3];
    leafGeo.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    leafGeo.setIndex(indices);
    leafGeo.computeVertexNormals();

    const numLeaves = 8;
    for (let i = 0; i < numLeaves; i++) {
      const angle = (i / numLeaves) * Math.PI * 2;
      const leaf = new THREE.Mesh(leafGeo, leafMat);
      leaf.position.set(0.5 * scale, 9.5 * scale, -0.2 * scale);
      leaf.rotation.y = angle;
      leaf.rotation.x = 0.35;
      leaf.castShadow = true;
      tree.add(leaf);
    }

    tree.position.set(x, 0, z);
    this.propsGroup.add(tree);
    this.palmTrees.push(tree);
    return tree;
  }

  createStreetLight(x, z, rotationY = 0) {
    const lamp = new THREE.Group();
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x22262c, roughness: 0.3, metalness: 0.8 });

    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 6.5, 8), metalMat);
    pole.position.y = 3.25;
    pole.castShadow = true;
    lamp.add(pole);

    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 2.2), metalMat);
    arm.position.set(0, 6.4, 0.9);
    arm.rotation.x = -0.15;
    lamp.add(arm);

    const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.6), metalMat);
    fixture.position.set(0, 6.2, 1.8);
    lamp.add(fixture);

    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffe090 });
    const bulbGeo = new THREE.PlaneGeometry(0.35, 0.5);
    bulbGeo.rotateX(Math.PI / 2);
    const bulb = new THREE.Mesh(bulbGeo, bulbMat);
    bulb.position.set(0, 6.08, 1.8);
    lamp.add(bulb);

    lamp.position.set(x, 0, z);
    lamp.rotation.y = rotationY;
    this.propsGroup.add(lamp);

    lamp.pole = pole;
    lamp.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(pole);
    lamp.colliderBox = box;
    if (this.colliders) {
      this.colliders.push({ box, type: 'pole' });
    }

    return lamp;
  }

  createBeachUmbrella(x, z, colorHex = 0xff007f) {
    const umbrella = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.8, roughness: 0.2 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 8), poleMat);
    pole.position.y = 1.3;
    umbrella.add(pole);

    const canopyMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.5, side: THREE.DoubleSide });
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.8, 0.7, 8, 1, true), canopyMat);
    canopy.position.y = 2.4;
    canopy.castShadow = true;
    umbrella.add(canopy);

    umbrella.position.set(x, 0, z);
    this.propsGroup.add(umbrella);
  }

  createLifeguardTower(x, z, colorHex = 0x00e5ff) {
    const tower = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6 });
    const darkWoodMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 });

    // 4 Stilts / Legs
    [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]].forEach(([px, pz]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 3.2, 8), darkWoodMat);
      leg.position.set(px, 1.6, pz);
      leg.castShadow = true;
      tower.add(leg);
    });

    // Deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.25, 3.2), woodMat);
    deck.position.y = 3.2;
    deck.castShadow = true;
    tower.add(deck);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(2.2, 2.2, 2.2), woodMat);
    cabin.position.set(0, 4.4, 0);
    cabin.castShadow = true;
    tower.add(cabin);

    // Overhanging Roof (Pink accent)
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xff007f, roughness: 0.4 });
    const roof = new THREE.Mesh(new THREE.ConeGeometry(2.4, 1.2, 4), roofMat);
    roof.position.set(0, 6.0, 0);
    roof.rotation.y = Math.PI / 4;
    roof.castShadow = true;
    tower.add(roof);

    tower.position.set(x, 0, z);
    this.propsGroup.add(tower);
    return tower;
  }

  createTrafficLight(x, z, rotationY = 0) {
    const tl = new THREE.Group();
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x33373d, roughness: 0.4, metalness: 0.7 });

    // Mast Pole
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 7.5, 8), poleMat);
    mast.position.y = 3.75;
    mast.castShadow = true;
    tl.add(mast);

    // Cantilever Arm
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 5.0, 8), poleMat);
    arm.position.set(0, 7.2, 2.5);
    arm.rotation.x = Math.PI / 2;
    tl.add(arm);

    // Signal Box
    const boxGeo = new THREE.BoxGeometry(0.4, 1.2, 0.35);
    const box = new THREE.Mesh(boxGeo, new THREE.MeshStandardMaterial({ color: 0x222222 }));
    box.position.set(0, 6.6, 4.5);
    tl.add(box);

    // Red, Yellow, Green Lenses
    const redLens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0xff0033 }));
    redLens.position.set(0, 7.0, 4.68);
    tl.add(redLens);

    const yelLens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0x221a00 }));
    yelLens.position.set(0, 6.6, 4.68);
    tl.add(yelLens);

    const grnLens = new THREE.Mesh(new THREE.CircleGeometry(0.12, 12), new THREE.MeshBasicMaterial({ color: 0x00ff66 }));
    grnLens.position.set(0, 6.2, 4.68);
    tl.add(grnLens);

    tl.position.set(x, 0, z);
    tl.rotation.y = rotationY;
    this.propsGroup.add(tl);
    this.trafficLights.push({ red: redLens, yellow: yelLens, green: grnLens });
    return tl;
  }

  createShippingContainer(x, y, z, colorHex = 0xd93829, rotationY = 0) {
    const containerMat = new THREE.MeshStandardMaterial({ color: colorHex, roughness: 0.6, metalness: 0.4 });
    const container = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.6, 6.2), containerMat);
    container.position.set(x, y + 1.3, z);
    container.rotation.y = rotationY;
    container.castShadow = true;
    container.receiveShadow = true;
    this.propsGroup.add(container);

    container.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(container);
    container.colliderBox = box;
    if (this.colliders) {
      this.colliders.push({ box, type: 'container' });
    }

    return container;
  }

  createStuntRamp(x, z, rotationY = 0, width = 6, height = 2.8, length = 7.0) {
    const rampGroup = new THREE.Group();

    // Yellow and black warning ramp material
    const rampMat = new THREE.MeshStandardMaterial({
      color: 0xffcc00,
      roughness: 0.5,
      metalness: 0.2
    });

    // Wedge Shape
    const shape = new THREE.Shape();
    shape.moveTo(0, 0);
    shape.lineTo(length, 0);
    shape.lineTo(0, height);
    shape.closePath();

    const extrudeSettings = { depth: width, bevelEnabled: false };
    const geom = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    geom.rotateY(Math.PI / 2);
    geom.translate(-width / 2, 0, -length / 2);

    const rampMesh = new THREE.Mesh(geom, rampMat);
    rampMesh.castShadow = true;
    rampMesh.receiveShadow = true;
    rampGroup.add(rampMesh);

    // Hazard Stripes on edges
    const stripeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const stripeGeo = new THREE.BoxGeometry(width + 0.1, 0.2, length + 0.1);
    const stripe = new THREE.Mesh(stripeGeo, stripeMat);
    stripe.position.set(0, 0.1, 0);
    rampGroup.add(stripe);

    rampGroup.position.set(x, 0, z);
    rampGroup.rotation.y = rotationY;
    this.propsGroup.add(rampGroup);

    rampGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rampGroup);
    rampGroup.colliderBox = box;
    if (this.colliders) {
      this.colliders.push({ box, type: 'ramp' });
    }

    return rampGroup;
  }

  createBillboard(x, y, z, brandName = "SPRUNK", colorHex = 0x00ff77, rotationY = 0) {
    const bb = new THREE.Group();

    // Frame & Post
    const postMat = new THREE.MeshStandardMaterial({ color: 0x333740, metalness: 0.8 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.35, y, 8), postMat);
    post.position.y = y / 2;
    bb.add(post);

    // Canvas Sign
    const signCanvas = document.createElement('canvas');
    signCanvas.width = 512;
    signCanvas.height = 256;
    const ctx = signCanvas.getContext('2d');
    ctx.fillStyle = '#080512';
    ctx.fillRect(0, 0, 512, 256);
    ctx.fillStyle = '#' + new THREE.Color(colorHex).getHexString();
    ctx.font = '900 64px Montserrat, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(brandName, 256, 128);

    const signTex = new THREE.CanvasTexture(signCanvas);
    const signMat = new THREE.MeshBasicMaterial({ map: signTex });
    const sign = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.4), signMat);
    sign.position.y = y;
    sign.castShadow = true;
    bb.add(sign);

    bb.position.set(x, 0, z);
    bb.rotation.y = rotationY;
    this.propsGroup.add(bb);
    return bb;
  }

  createPier(x, z, length = 90, width = 12) {
    const pierGroup = new THREE.Group();
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x4a3b32, roughness: 0.9 });
    const postMat = new THREE.MeshStandardMaterial({ color: 0x241d18, roughness: 0.95 });

    // Deck
    const deck = new THREE.Mesh(new THREE.BoxGeometry(width, 0.5, length), woodMat);
    deck.position.set(0, 1.2, length / 2);
    deck.receiveShadow = true;
    pierGroup.add(deck);

    // Supporting wooden pylons
    for (let pz = 5; pz <= length - 5; pz += 10) {
      [-width / 2 + 0.8, width / 2 - 0.8].forEach(px => {
        const pylon = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 3.5, 8), postMat);
        pylon.position.set(px, 0, pz);
        pierGroup.add(pylon);
      });
    }

    pierGroup.position.set(x, 0, z);
    this.propsGroup.add(pierGroup);
    return pierGroup;
  }

  createYacht(x, z, rotationY = 0) {
    const yacht = new THREE.Group();
    const hullMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, metalness: 0.3, roughness: 0.2 });
    const trimMat = new THREE.MeshStandardMaterial({ color: 0x0099ff, roughness: 0.4 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x111e2e, metalness: 0.9, roughness: 0.1 });

    // Lower Hull
    const hull = new THREE.Mesh(new THREE.BoxGeometry(4.2, 1.8, 14), hullMat);
    hull.position.y = 0.5;
    yacht.add(hull);

    // Blue stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.3, 13.8), trimMat);
    stripe.position.y = 1.0;
    yacht.add(stripe);

    // Cabin
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.6, 7.5), hullMat);
    cabin.position.set(0, 2.0, -0.5);
    yacht.add(cabin);

    // Tinted windshield
    const glass = new THREE.Mesh(new THREE.BoxGeometry(3.45, 1.0, 3.0), glassMat);
    glass.position.set(0, 2.2, -2.5);
    yacht.add(glass);

    // Radar Arch
    const arch = new THREE.Mesh(new THREE.BoxGeometry(3.6, 1.2, 0.3), hullMat);
    arch.position.set(0, 3.2, 1.0);
    yacht.add(arch);

    yacht.position.set(x, -0.4, z);
    yacht.rotation.y = rotationY;
    this.propsGroup.add(yacht);
    return yacht;
  }

  update(delta) {
    // Gentle palm tree sway
    const time = performance.now() * 0.0015;
    for (let i = 0; i < this.palmTrees.length; i++) {
      this.palmTrees[i].rotation.z = Math.sin(time + i * 0.4) * 0.03;
    }
  }
}
