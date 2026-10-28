import * as THREE from 'three';
import { clamp, lerp } from '../core/MathUtils.js';

// Dynamic 24-hour Day/Night cycle, celestial sun/moon lighting, procedural night starfield,
// periodic Weather system (CLEAR / OVERCAST / RAIN) with 3D rain streaks, and animated ocean.

const WEATHER_STATES = ['CLEAR', 'OVERCAST', 'RAIN'];

export class SkyAndLighting {
  constructor(scene) {
    this.scene = scene;
    this.time = 0;

    // Start at 17:12 (late afternoon approaching sunset & night so player sees transition quickly)
    this.timeOfDay = 17.2; // 0..24 hours
    this.dayDuration = 360; // 360 seconds (6 minutes) for a smooth, relaxed full 24h cycle
    this.isNight = false;
    this.nightFactor = 0;   // 0 = full day, 1 = full night

    // Periodic weather state machine
    this.weatherIndex = 0;
    this.weather = WEATHER_STATES[0]; // 'CLEAR' | 'OVERCAST' | 'RAIN'
    this.weatherTimer = 65;
    this.rainIntensity = 0;
    this.overcastFactor = 0;

    // Reusable scratch colors to avoid per-frame allocations
    this._cTop = new THREE.Color();
    this._cMid = new THREE.Color();
    this._cBot = new THREE.Color();
    this._cFog = new THREE.Color();
    this._cSun = new THREE.Color();
    this._cHemiSky = new THREE.Color();
    this._cHemiGnd = new THREE.Color();
    this._cOceanDeep = new THREE.Color();
    this._cOceanShallow = new THREE.Color();

    this.initSky();
    this.initLights();
    this.initOcean();
    this.initRain();
    this.updateAtmosphere(0);
  }

  initSky() {
    this.scene.background = new THREE.Color(0x88c4ee);
    this.scene.fog = new THREE.FogExp2(0x9bcce8, 0.0012);

    const skyGeo = new THREE.SphereGeometry(900, 32, 16);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x2d7ad6) },
        midColor: { value: new THREE.Color(0x7ec0ee) },
        bottomColor: { value: new THREE.Color(0xe6dcc5) },
        nightFactor: { value: 0.0 },
        time: { value: 0.0 }
      },
      vertexShader: `
        varying vec3 vLocalPos;
        void main() {
          vLocalPos = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float nightFactor;
        uniform float time;
        varying vec3 vLocalPos;

        float hash(vec3 p) {
          p = fract(p * 0.3183099 + 0.1);
          p *= 17.0;
          return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
        }

        void main() {
          vec3 dir = normalize(vLocalPos);
          float h = clamp(dir.y, 0.0, 1.0);
          vec3 col = h < 0.25
            ? mix(bottomColor, midColor, h / 0.25)
            : mix(midColor, topColor, pow((h - 0.25) / 0.75, 0.7));

          if (nightFactor > 0.01 && h > 0.12) {
            vec3 starGrid = floor(dir * 260.0);
            float n = hash(starGrid);
            if (n > 0.9945) {
              float twinkle = 0.65 + 0.35 * sin(time * 3.0 + n * 120.0);
              float horizonFade = smoothstep(0.12, 0.38, h);
              col += vec3(0.92, 0.96, 1.0) * ((n - 0.9945) / 0.0055) * twinkle * horizonFade * nightFactor;
            }
          }

          gl_FragColor = vec4(col, 1.0);
        }
      `,
      side: THREE.BackSide,
      depthWrite: false
    });
    this.skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(this.skyDome);
  }

  initLights() {
    this.hemiLight = new THREE.HemisphereLight(0xd9ecff, 0x7c7462, 0.85);
    this.hemiLight.position.set(0, 80, 0);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4dc, 2.0);
    this.sunLight.position.set(-140, 180, -110);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 20;
    this.sunLight.shadow.camera.far = 420;
    const d = 120;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.fillLight = new THREE.DirectionalLight(0x9fd4ff, 0.4);
    this.fillLight.position.set(120, 60, 100);
    this.scene.add(this.fillLight);
  }

  initOcean() {
    const geo = new THREE.PlaneGeometry(2200, 2200, 80, 80);
    geo.rotateX(-Math.PI / 2);
    this.oceanMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        deepColor: { value: new THREE.Color(0x0c4f7a) },
        shallowColor: { value: new THREE.Color(0x28a4b8) },
        sunDir: { value: new THREE.Vector3(-0.6, 0.7, -0.4).normalize() },
        specStrength: { value: 0.65 }
      },
      vertexShader: `
        uniform float time;
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vec3 p = position;
          float w1 = sin(p.x * 0.04 + time * 1.4) * cos(p.z * 0.035 + time * 1.1) * 0.25;
          float w2 = sin(p.x * 0.11 - time * 1.9) * 0.08;
          p.y += w1 + w2;
          vPos = (modelMatrix * vec4(p, 1.0)).xyz;
          vNormal = normalize(vec3(
            -cos(p.x * 0.04 + time * 1.4) * 0.03,
            1.0,
            -cos(p.z * 0.035 + time * 1.1) * 0.03
          ));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 deepColor;
        uniform vec3 shallowColor;
        uniform vec3 sunDir;
        uniform float specStrength;
        varying vec3 vPos;
        varying vec3 vNormal;
        void main() {
          vec3 n = normalize(vNormal);
          vec3 v = normalize(cameraPosition - vPos);
          float fres = pow(1.0 - max(dot(v, n), 0.0), 2.2);
          vec3 r = reflect(-sunDir, n);
          float spec = pow(max(dot(v, r), 0.0), 48.0);
          float shore = smoothstep(520.0, 420.0, max(abs(vPos.x), abs(vPos.z)));
          vec3 col = mix(deepColor, shallowColor, max(fres * 0.6, shore * 0.75));
          col += vec3(1.0, 0.96, 0.85) * spec * specStrength;
          gl_FragColor = vec4(col, 0.92);
        }
      `,
      transparent: true
    });
    this.ocean = new THREE.Mesh(geo, this.oceanMat);
    this.ocean.position.y = -0.55;
    this.scene.add(this.ocean);
  }

  initRain() {
    const count = 450;
    this.rainCount = count;
    this.rainDrops = new Float32Array(count * 3);
    const positions = new Float32Array(count * 6); // 2 vertices per streak

    for (let i = 0; i < count; i++) {
      const rx = (Math.random() - 0.5) * 56;
      const ry = Math.random() * 26;
      const rz = (Math.random() - 0.5) * 56;
      this.rainDrops[i * 3] = rx;
      this.rainDrops[i * 3 + 1] = ry;
      this.rainDrops[i * 3 + 2] = rz;

      const idx = i * 6;
      positions[idx] = rx;
      positions[idx + 1] = ry;
      positions[idx + 2] = rz;
      positions[idx + 3] = rx + 0.15;
      positions[idx + 4] = ry - 1.35;
      positions[idx + 5] = rz + 0.1;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.rainMat = new THREE.LineBasicMaterial({
      color: 0xaec8e8,
      transparent: true,
      opacity: 0.45,
      depthWrite: false
    });
    this.rainMesh = new THREE.LineSegments(geo, this.rainMat);
    this.rainMesh.visible = false;
    this.rainMesh.frustumCulled = false;
    this.scene.add(this.rainMesh);
  }

  /** Advance time of day & cycle weather on demand (e.g., [T] hotkey). */
  cycleTimeAndWeather() {
    this.timeOfDay = (this.timeOfDay + 5.0) % 24;
    if (Math.random() < 0.45) {
      this.weatherIndex = (this.weatherIndex + 1) % WEATHER_STATES.length;
      this.weather = WEATHER_STATES[this.weatherIndex];
      this.weatherTimer = 65;
    }
    this.updateAtmosphere(0);
  }

  getWeatherGripMultiplier() {
    if (this.weather === 'RAIN') return 0.82;
    if (this.weather === 'OVERCAST') return 0.95;
    return 1.0;
  }

  getFormattedTime() {
    const totalMinutes = Math.floor(this.timeOfDay * 60) % (24 * 60);
    const hh = Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  getPhaseLabel() {
    const icon = this.weather === 'RAIN'
      ? '🌧️'
      : (this.weather === 'OVERCAST' ? '☁️' : (this.isNight ? '🌙' : '☀️'));
    return `${this.getFormattedTime()} ${icon} ${this.weather}`;
  }

  updateAtmosphere(dt, targetPos = null) {
    // 1. Advance diurnal clock
    if (dt > 0) {
      this.timeOfDay = (this.timeOfDay + (24 / this.dayDuration) * dt) % 24;

      // Periodic weather transition
      this.weatherTimer -= dt;
      if (this.weatherTimer <= 0) {
        this.weatherIndex = (this.weatherIndex + 1) % WEATHER_STATES.length;
        this.weather = WEATHER_STATES[this.weatherIndex];
        this.weatherTimer = this.weather === 'CLEAR' ? 75 : (this.weather === 'OVERCAST' ? 45 : 50);
      }
    }

    // Smooth weather blend targets
    const targetRain = this.weather === 'RAIN' ? 1.0 : 0.0;
    const targetOvercast = this.weather === 'RAIN' ? 0.85 : (this.weather === 'OVERCAST' ? 0.55 : 0.0);
    const wRate = dt > 0 ? Math.min(1, dt * 0.8) : 1.0;
    this.rainIntensity = lerp(this.rainIntensity, targetRain, wRate);
    this.overcastFactor = lerp(this.overcastFactor, targetOvercast, wRate);

    // 2. Solar elevation: sunrise = 06:00, zenith = 12:00, sunset = 18:00, midnight = 00:00
    const sunAngle = ((this.timeOfDay - 6.0) / 24.0) * Math.PI * 2;
    const sunElev = Math.sin(sunAngle); // -1..+1
    const sunHoriz = Math.cos(sunAngle);

    // Night state triggers at 18:30 until 05:48
    this.isNight = this.timeOfDay >= 18.5 || this.timeOfDay < 5.8;
    this.nightFactor = clamp((-sunElev + 0.08) / 0.42, 0, 1);
    const goldenFactor = clamp(1.0 - Math.abs(sunElev - 0.06) / 0.28, 0, 1);

    // 3. Interpolate sky dome palette (Day -> Golden Hour -> Night)
    this._cTop.setHex(0x2d7ad6);
    this._cMid.setHex(0x7ec0ee);
    this._cBot.setHex(0xe6dcc5);
    this._cFog.setHex(0x9bcce8);

    if (goldenFactor > 0) {
      this._cTop.lerp(new THREE.Color(0x1f2b52), goldenFactor * 0.85);
      this._cMid.lerp(new THREE.Color(0xd96b43), goldenFactor * 0.9);
      this._cBot.lerp(new THREE.Color(0xf4a261), goldenFactor * 0.95);
      this._cFog.lerp(new THREE.Color(0xc97b63), goldenFactor * 0.8);
    }

    if (this.nightFactor > 0) {
      this._cTop.lerp(new THREE.Color(0x040711), this.nightFactor);
      this._cMid.lerp(new THREE.Color(0x091224), this.nightFactor);
      this._cBot.lerp(new THREE.Color(0x131d33), this.nightFactor);
      this._cFog.lerp(new THREE.Color(0x080f1d), this.nightFactor);
    }

    // Apply overcast / rain storm desaturation & darkening
    if (this.overcastFactor > 0) {
      const stormCol = this.isNight ? new THREE.Color(0x0a0f18) : new THREE.Color(0x52606e);
      this._cTop.lerp(stormCol, this.overcastFactor * 0.8);
      this._cMid.lerp(stormCol, this.overcastFactor * 0.75);
      this._cBot.lerp(stormCol, this.overcastFactor * 0.7);
      this._cFog.lerp(stormCol, this.overcastFactor * 0.85);
    }

    this.skyDome.material.uniforms.topColor.value.copy(this._cTop);
    this.skyDome.material.uniforms.midColor.value.copy(this._cMid);
    this.skyDome.material.uniforms.bottomColor.value.copy(this._cBot);
    this.skyDome.material.uniforms.nightFactor.value = this.nightFactor * (1.0 - this.overcastFactor);
    this.skyDome.material.uniforms.time.value = this.time;

    this.scene.background.copy(this._cFog);
    this.scene.fog.color.copy(this._cFog);
    this.scene.fog.density = lerp(0.0012, 0.0027, this.overcastFactor);

    // 4. Sun / Moon directional & hemisphere lighting
    const dayStrength = clamp((sunElev + 0.05) / 0.45, 0, 1);
    this._cHemiSky.setHex(0xd9ecff).lerp(new THREE.Color(0x1e2f4f), this.nightFactor);
    this._cHemiGnd.setHex(0x7c7462).lerp(new THREE.Color(0x0d1118), this.nightFactor);
    this.hemiLight.color.copy(this._cHemiSky);
    this.hemiLight.groundColor.copy(this._cHemiGnd);
    this.hemiLight.intensity = lerp(0.85, 0.28, this.nightFactor) * (1.0 - this.overcastFactor * 0.25);

    this._cSun.setHex(0xfff4dc);
    if (goldenFactor > 0) this._cSun.lerp(new THREE.Color(0xff9e5e), goldenFactor * 0.85);
    if (this.nightFactor > 0) this._cSun.lerp(new THREE.Color(0x6e8cff), this.nightFactor);
    this.sunLight.color.copy(this._cSun);

    const rawSunIntensity = lerp(0.38, 2.0, dayStrength);
    this.sunLight.intensity = rawSunIntensity * (1.0 - this.overcastFactor * 0.45);
    this.fillLight.intensity = lerp(0.4, 0.14, this.nightFactor);

    // Position sun (or moon at night) relative to targetPos
    const tx = targetPos ? targetPos.x : 0;
    const tz = targetPos ? targetPos.z : 0;
    const orbitSign = sunElev >= -0.05 ? 1 : -1;
    const elevY = Math.max(45, Math.abs(sunElev) * 185 + 35);
    const offsetX = -sunHoriz * 165 * orbitSign;
    const offsetZ = -105 * orbitSign;
    this.sunLight.position.set(tx + offsetX, elevY, tz + offsetZ);
    this.sunLight.target.position.set(tx, 0, tz);
    this.sunLight.target.updateMatrixWorld();

    // 5. Ocean shader sync
    if (this.oceanMat) {
      this._cOceanDeep.setHex(0x0c4f7a).lerp(new THREE.Color(0x041526), this.nightFactor);
      this._cOceanShallow.setHex(0x28a4b8).lerp(new THREE.Color(0x092b42), this.nightFactor);
      this.oceanMat.uniforms.deepColor.value.copy(this._cOceanDeep);
      this.oceanMat.uniforms.shallowColor.value.copy(this._cOceanShallow);
      this.oceanMat.uniforms.sunDir.value.set(offsetX, elevY, offsetZ).normalize();
      this.oceanMat.uniforms.specStrength.value = lerp(0.65, 0.22, this.nightFactor) * (1.0 - this.overcastFactor * 0.6);
    }
  }

  updateRainParticles(dt, targetPos) {
    if (!this.rainMesh) return;
    if (this.rainIntensity <= 0.02) {
      this.rainMesh.visible = false;
      return;
    }
    this.rainMesh.visible = true;
    this.rainMat.opacity = 0.48 * this.rainIntensity;

    const cx = targetPos ? targetPos.x : 0;
    const cy = targetPos ? targetPos.y : 0;
    const cz = targetPos ? targetPos.z : 0;
    this.rainMesh.position.set(cx, cy, cz);

    const posAttr = this.rainMesh.geometry.attributes.position;
    const arr = posAttr.array;
    const fallSpeed = 26.0 * dt;

    for (let i = 0; i < this.rainCount; i++) {
      let ry = this.rainDrops[i * 3 + 1] - fallSpeed;
      if (ry < -1.0) {
        ry = 24.0 + Math.random() * 4.0;
        this.rainDrops[i * 3] = (Math.random() - 0.5) * 56;
        this.rainDrops[i * 3 + 2] = (Math.random() - 0.5) * 56;
      }
      this.rainDrops[i * 3 + 1] = ry;
      const rx = this.rainDrops[i * 3];
      const rz = this.rainDrops[i * 3 + 2];

      const idx = i * 6;
      arr[idx] = rx;
      arr[idx + 1] = ry;
      arr[idx + 2] = rz;
      arr[idx + 3] = rx + 0.15;
      arr[idx + 4] = ry - 1.35;
      arr[idx + 5] = rz + 0.1;
    }
    posAttr.needsUpdate = true;
  }

  update(dt, targetPos) {
    this.time += dt;
    if (this.oceanMat) this.oceanMat.uniforms.time.value = this.time;
    this.updateAtmosphere(dt, targetPos);
    this.updateRainParticles(dt, targetPos);
    if (targetPos && this.skyDome) {
      this.skyDome.position.x = targetPos.x;
      this.skyDome.position.z = targetPos.z;
    }
  }
}
