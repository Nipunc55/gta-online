import * as THREE from 'three';

export class ImpactEffects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.smokeParticles = [];

    this.initParticlePool();
    this.initSmokePool();
  }

  initParticlePool() {
    this.sparkGroup = new THREE.Group();
    this.scene.add(this.sparkGroup);

    this.poolSize = 48;
    this.sparkCountPerBurst = 12;
    this.sparkPool = [];

    for (let i = 0; i < this.poolSize; i++) {
      const geo = new THREE.BufferGeometry();
      const positions = new Float32Array(this.sparkCountPerBurst * 3);
      const posAttr = new THREE.BufferAttribute(positions, 3);
      geo.setAttribute('position', posAttr);

      const mat = new THREE.PointsMaterial({
        color: 0xffcc33,
        size: 0.22,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false
      });

      const mesh = new THREE.Points(geo, mat);
      mesh.visible = false;
      this.sparkGroup.add(mesh);

      const velocities = [];
      for (let v = 0; v < this.sparkCountPerBurst; v++) {
        velocities.push(new THREE.Vector3());
      }

      this.sparkPool.push({
        mesh,
        geometry: geo,
        material: mat,
        positions,
        posAttr,
        velocities,
        life: 0,
        maxLife: 0.35,
        active: false
      });
    }

    // Keep this.particles aliased for external compatibility
    this.particles = this.sparkPool;
  }

  initSmokePool() {
    this.smokePoolSize = 16;
    this.smokePool = [];
    this.smokeGroup = new THREE.Group();
    this.scene.add(this.smokeGroup);

    const smokeGeo = new THREE.SphereGeometry(0.3, 6, 6);

    for (let i = 0; i < this.smokePoolSize; i++) {
      const smokeMat = new THREE.MeshBasicMaterial({
        color: 0xcccccc,
        transparent: true,
        opacity: 0.35,
        depthWrite: false
      });
      const puff = new THREE.Mesh(smokeGeo, smokeMat);
      puff.visible = false;
      this.smokeGroup.add(puff);

      this.smokePool.push({
        mesh: puff,
        material: smokeMat,
        life: 0,
        maxLife: 0.6,
        growth: 2.0,
        active: false
      });
    }

    this.smokeParticles = this.smokePool;
  }

  createImpactSparks(position, normal) {
    if (!position) return;

    // Find inactive spark entry from pool
    let spark = null;
    for (let i = 0; i < this.sparkPool.length; i++) {
      if (!this.sparkPool[i].active) {
        spark = this.sparkPool[i];
        break;
      }
    }

    // If pool exhausted under extreme automatic fire, reuse entry with lowest remaining life
    if (!spark) {
      let minLife = Infinity;
      for (let i = 0; i < this.sparkPool.length; i++) {
        if (this.sparkPool[i].life < minLife) {
          minLife = this.sparkPool[i].life;
          spark = this.sparkPool[i];
        }
      }
    }

    if (!spark) return;

    const count = this.sparkCountPerBurst;
    const pos = spark.positions;
    const nx = normal ? normal.x : 0;
    const ny = normal ? normal.y : 0;
    const nz = normal ? normal.z : 0;

    for (let i = 0; i < count; i++) {
      pos[i * 3] = position.x;
      pos[i * 3 + 1] = position.y;
      pos[i * 3 + 2] = position.z;

      // Cone around normal or random burst
      spark.velocities[i].set(
        (Math.random() - 0.5 + nx * 0.8) * (5.0 + Math.random() * 3.0),
        (Math.random() * 0.8 + 0.2 + ny * 0.8) * (5.0 + Math.random() * 3.0),
        (Math.random() - 0.5 + nz * 0.7) * (5.0 + Math.random() * 3.0)
      );
    }

    spark.posAttr.needsUpdate = true;
    spark.life = 0.35;
    spark.maxLife = 0.35;
    spark.material.opacity = 1.0;
    spark.mesh.visible = true;
    spark.active = true;
  }

  createTireSmoke(position) {
    if (!position) return;

    let smoke = null;
    for (let i = 0; i < this.smokePool.length; i++) {
      if (!this.smokePool[i].active) {
        smoke = this.smokePool[i];
        break;
      }
    }

    if (!smoke) {
      let minLife = Infinity;
      for (let i = 0; i < this.smokePool.length; i++) {
        if (this.smokePool[i].life < minLife) {
          minLife = this.smokePool[i].life;
          smoke = this.smokePool[i];
        }
      }
    }

    if (!smoke) return;

    smoke.mesh.position.copy(position);
    smoke.mesh.position.y += 0.2;
    smoke.mesh.scale.set(1.0, 1.0, 1.0);
    smoke.material.opacity = 0.35;
    smoke.life = 0.6;
    smoke.maxLife = 0.6;
    smoke.mesh.visible = true;
    smoke.active = true;
  }

  update(delta) {
    // Update sparks
    for (let i = 0; i < this.sparkPool.length; i++) {
      const p = this.sparkPool[i];
      if (!p.active) continue;

      p.life -= delta;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      const count = this.sparkCountPerBurst;
      const pos = p.positions;
      const vels = p.velocities;

      for (let j = 0; j < count; j++) {
        const vel = vels[j];
        vel.y -= 18.0 * delta; // Gravity on sparks
        pos[j * 3] += vel.x * delta;
        pos[j * 3 + 1] += vel.y * delta;
        pos[j * 3 + 2] += vel.z * delta;
      }

      p.posAttr.needsUpdate = true;
      p.material.opacity = Math.max(0, p.life / p.maxLife);
    }

    // Update smoke
    for (let i = 0; i < this.smokePool.length; i++) {
      const s = this.smokePool[i];
      if (!s.active) continue;

      s.life -= delta;
      if (s.life <= 0) {
        s.active = false;
        s.mesh.visible = false;
        continue;
      }

      s.mesh.position.y += delta * 0.8;
      const sScale = 1.0 + (1.0 - s.life / s.maxLife) * s.growth;
      s.mesh.scale.set(sScale, sScale, sScale);
      s.material.opacity = (s.life / s.maxLife) * 0.35;
    }
  }
}
