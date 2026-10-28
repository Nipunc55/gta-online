import * as THREE from 'three';

export class SkyAndLighting {
  constructor(scene) {
    this.scene = scene;
    this.initSky();
    this.initLights();
  }

  initSky() {
    // Sunset Miami atmospheric background color
    this.scene.background = new THREE.Color(0x281335);

    // Exponential fog for sunset distance depth
    this.scene.fog = new THREE.FogExp2(0x35193d, 0.0035);

    // Procedural Sky Dome
    const skyGeo = new THREE.SphereGeometry(600, 32, 15);
    const skyMat = new THREE.ShaderMaterial({
      uniforms: {
        topColor: { value: new THREE.Color(0x180b2a) },    // Deep twilight purple
        midColor: { value: new THREE.Color(0xff4b72) },    // Vibrant Miami neon pink
        bottomColor: { value: new THREE.Color(0xffa14a) }, // Golden sunset orange
        offset: { value: 20 },
        exponent: { value: 0.6 }
      },
      vertexShader: `
        varying vec3 vWorldPosition;
        void main() {
          vec4 worldPosition = modelMatrix * vec4(position, 1.0);
          vWorldPosition = worldPosition.xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 midColor;
        uniform vec3 bottomColor;
        uniform float offset;
        uniform float exponent;
        varying vec3 vWorldPosition;
        void main() {
          float h = normalize(vWorldPosition + offset).y;
          vec3 sky;
          if (h > 0.2) {
            sky = mix(midColor, topColor, max(pow((h - 0.2) / 0.8, exponent), 0.0));
          } else {
            sky = mix(bottomColor, midColor, max(h / 0.2, 0.0));
          }
          gl_FragColor = vec4(sky, 1.0);
        }
      `,
      side: THREE.BackSide
    });

    const skyDome = new THREE.Mesh(skyGeo, skyMat);
    this.scene.add(skyDome);
  }

  initLights() {
    // Ambient / Hemisphere light
    this.hemiLight = new THREE.HemisphereLight(0xffb5c5, 0x221833, 0.9);
    this.hemiLight.position.set(0, 50, 0);
    this.scene.add(this.hemiLight);

    // Directional Sunset Sun
    this.sunLight = new THREE.DirectionalLight(0xffb366, 2.2);
    this.sunLight.position.set(-150, 60, -100);
    this.sunLight.castShadow = true;

    // Optimize shadow frustum for city scale
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 400;

    const d = 140;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;

    this.scene.add(this.sunLight);

    // Neon Accent Fill Light (Cyan contrast from beach side)
    const oceanFill = new THREE.DirectionalLight(0x00ffff, 0.5);
    oceanFill.position.set(120, 30, 80);
    this.scene.add(oceanFill);
  }

  updateFollow(targetPos) {
    if (this.sunLight) {
      this.sunLight.position.x = targetPos.x - 120;
      this.sunLight.position.z = targetPos.z - 80;
      this.sunLight.target.position.copy(targetPos);
      this.sunLight.target.updateMatrixWorld();
    }
  }
}
