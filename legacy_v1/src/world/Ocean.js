import * as THREE from 'three';

export class Ocean {
  constructor(scene) {
    this.scene = scene;
    this.initOcean();
  }

  initOcean() {
    const oceanGeo = new THREE.PlaneGeometry(1600, 1600, 96, 96);
    oceanGeo.rotateX(-Math.PI / 2);

    this.oceanMat = new THREE.ShaderMaterial({
      uniforms: {
        time: { value: 0 },
        waterColor: { value: new THREE.Color(0x064273) },
        crestColor: { value: new THREE.Color(0x55ffdd) },
        sunDirection: { value: new THREE.Vector3(-0.7, 0.4, -0.5).normalize() }
      },
      vertexShader: `
        uniform float time;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vec3 pos = position;
          // Sine waves
          float wave1 = sin(pos.x * 0.05 + time * 1.5) * cos(pos.z * 0.04 + time * 1.2) * 0.45;
          float wave2 = sin(pos.x * 0.12 - time * 2.0) * 0.18;
          pos.y += wave1 + wave2;

          vPosition = (modelMatrix * vec4(pos, 1.0)).xyz;
          vNormal = normalize(vec3(
            -cos(pos.x * 0.05 + time * 1.5) * 0.05,
            1.0,
            -cos(pos.z * 0.04 + time * 1.2) * 0.04
          ));

          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
      fragmentShader: `
        uniform vec3 waterColor;
        uniform vec3 crestColor;
        uniform vec3 sunDirection;
        varying vec3 vPosition;
        varying vec3 vNormal;

        void main() {
          vec3 normal = normalize(vNormal);
          vec3 viewDir = normalize(cameraPosition - vPosition);

          // Specular highlight from sun
          vec3 reflectDir = reflect(-sunDirection, normal);
          float spec = pow(max(dot(viewDir, reflectDir), 0.0), 32.0);

          // Fresnel effect
          float fresnel = pow(1.0 - max(dot(viewDir, normal), 0.0), 2.5);

          vec3 finalColor = mix(waterColor, crestColor, fresnel * 0.65);
          finalColor += vec3(1.0, 0.8, 0.5) * spec * 0.8;

          gl_FragColor = vec4(finalColor, 0.88);
        }
      `,
      transparent: true,
      side: THREE.DoubleSide
    });

    this.oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMat);
    this.oceanMesh.position.set(0, -0.2, 0);
    this.scene.add(this.oceanMesh);
  }

  update(delta) {
    if (this.oceanMat) {
      this.oceanMat.uniforms.time.value += delta;
    }
  }
}
