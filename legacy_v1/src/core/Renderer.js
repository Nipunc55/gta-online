import * as THREE from 'three';

export class GameRenderer {
  constructor(canvas, camera = null) {
    this.canvas = canvas;
    this.camera = camera;
    this.quality = 'high';
    this.onResizeCallback = null;

    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: 'high-performance',
      alpha: false
    });

    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    window.addEventListener('resize', () => this.onWindowResize());
  }

  setCamera(camera) {
    this.camera = camera;
  }

  onResize(callback) {
    this.onResizeCallback = callback;
  }

  setQuality(preset) {
    this.quality = preset;
    if (preset === 'low') {
      this.renderer.shadowMap.enabled = false;
      this.renderer.setPixelRatio(1.0);
    } else if (preset === 'medium') {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.BasicShadowMap;
      this.renderer.setPixelRatio(1.25);
    } else { // high
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    }
  }

  onWindowResize(camera = null) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    this.renderer.setSize(width, height);

    const activeCamera = camera || this.camera;
    if (activeCamera) {
      const aspect = height > 0 ? width / height : 1;
      if (activeCamera.aspect !== undefined) {
        activeCamera.aspect = aspect;
      }
      if (typeof activeCamera.updateProjectionMatrix === 'function') {
        activeCamera.updateProjectionMatrix();
      }
    }

    if (typeof this.onResizeCallback === 'function') {
      this.onResizeCallback(width, height, activeCamera);
    }
  }

  render(scene, camera) {
    if (camera) {
      this.camera = camera;
    }
    this.renderer.render(scene, camera);
  }
}
