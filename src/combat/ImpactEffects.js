import * as THREE from 'three';

// Pooled low-poly visual effects:
// - Bullet impact sparks
// - Blood splatter droplets
// - Bullet tracer streaks
// - Tire drift / engine damage smoke puffs
// - Vehicle explosion fireballs

export class ImpactEffects {
  constructor(scene) {
    this.scene = scene;
    this.particles = [];
    this.tracers = [];

    this.cubeGeo = new THREE.BoxGeometry(0.11, 0.11, 0.11);
    this.smokeGeo = new THREE.DodecahedronGeometry(0.28, 0);

    this.sparkMat = new THREE.MeshBasicMaterial({ color: 0xffd24c });
    this.bloodMat = new THREE.MeshBasicMaterial({ color: 0xc01818 });
    this.fireMat = new THREE.MeshBasicMaterial({ color: 0xff5511 });
  }

  _spawnBurst(pos, count, mat, speedMin, speedMax, life, scale = 1, gravity = -18) {
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(this.cubeGeo, mat);
      m.position.copy(pos);
      m.scale.setScalar(scale * (0.7 + Math.random() * 0.6));
      const spd = speedMin + Math.random() * (speedMax - speedMin);
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI * 0.65;
      const vel = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * spd,
        Math.cos(phi) * spd * 0.9 + 1.2,
        Math.sin(phi) * Math.sin(theta) * spd
      );
      this.scene.add(m);
      this.particles.push({ mesh: m, vel, life, maxLife: life, gravity, grow: 0 });
    }
  }

  createImpactSparks(position) {
    this._spawnBurst(position, 9, this.sparkMat, 2.5, 7.5, 0.32, 0.85, -18);
  }

  createBloodSplatter(position) {
    this._spawnBurst(position, 8, this.bloodMat, 1.5, 5.0, 0.36, 1.0, -16);
  }

  createTireSmoke(position) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xd0d4dc,
      transparent: true,
      opacity: 0.42
    });
    const m = new THREE.Mesh(this.smokeGeo, mat);
    m.position.copy(position);
    m.position.x += (Math.random() - 0.5) * 0.35;
    m.position.z += (Math.random() - 0.5) * 0.35;
    this.scene.add(m);
    this.particles.push({
      mesh: m,
      vel: new THREE.Vector3((Math.random() - 0.5) * 0.7, 0.9 + Math.random() * 0.6, (Math.random() - 0.5) * 0.7),
      life: 0.65,
      maxLife: 0.65,
      gravity: 0.5,
      grow: 2.2,
      fadeMat: mat
    });
  }

  spawnExplosion(position) {
    const origin = position.clone().add(new THREE.Vector3(0, 0.8, 0));
    this._spawnBurst(origin, 28, this.fireMat, 5, 16, 0.75, 2.6, -12);
    this._spawnBurst(origin, 18, this.sparkMat, 6, 18, 0.65, 1.8, -14);
    for (let i = 0; i < 10; i++) {
      this.createTireSmoke(origin.clone().add(new THREE.Vector3(
        (Math.random() - 0.5) * 2.2,
        Math.random() * 1.5,
        (Math.random() - 0.5) * 2.2
      )));
    }
  }

  spawnTracer(start, end) {
    const pts = [start.clone(), end.clone()];
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = new THREE.LineBasicMaterial({
      color: 0xffe885,
      transparent: true,
      opacity: 0.85
    });
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ line, geo, mat, life: 0.065 });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.scene.remove(p.mesh);
        if (p.fadeMat) p.fadeMat.dispose();
        this.particles.splice(i, 1);
        continue;
      }
      p.vel.y += p.gravity * dt;
      p.mesh.position.addScaledVector(p.vel, dt);
      if (p.grow) {
        p.mesh.scale.addScalar(p.grow * dt);
      }
      if (p.fadeMat) {
        p.fadeMat.opacity = (p.life / p.maxLife) * 0.42;
      }
    }

    for (let i = this.tracers.length - 1; i >= 0; i--) {
      const tr = this.tracers[i];
      tr.life -= dt;
      if (tr.life <= 0) {
        this.scene.remove(tr.line);
        tr.geo.dispose();
        tr.mat.dispose();
        this.tracers.splice(i, 1);
      } else {
        tr.mat.opacity = tr.life / 0.065;
      }
    }
  }
}
