import * as THREE from 'three';

// Soft volumetric light-beam shader for open cone geometries (street lamps & headlights).
// Instead of a flat translucent cone (which reads as solid grey geometry), the beam:
//  - fades out smoothly along its length (bright at the source, invisible at the far end)
//  - fades out at the silhouette edges (view-angle falloff), so no hard cone outline
//  - ignores scene fog (fogged additive surfaces turn grey at night)
// Works with both regular Mesh and InstancedMesh.
// Relies on ConeGeometry UVs: uv.y = 1 at the apex (light source), 0 at the open base.

export function createLightBeamMaterial({ color = 0xffe2a0, intensity = 0.35, lengthFalloff = 1.8, edgeFalloff = 1.6 } = {}) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uLengthFalloff: { value: lengthFalloff },
      uEdgeFalloff: { value: edgeFalloff }
    },
    vertexShader: `
      varying float vAlong;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        vAlong = 1.0 - uv.y;
        vec4 p = vec4(position, 1.0);
        vec3 n = normal;
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
          n = mat3(instanceMatrix) * n;
        #endif
        vec4 mv = modelViewMatrix * p;
        vViewPos = mv.xyz;
        vViewNormal = normalize(normalMatrix * n);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uIntensity;
      uniform float uLengthFalloff;
      uniform float uEdgeFalloff;
      varying float vAlong;
      varying vec3 vViewNormal;
      varying vec3 vViewPos;
      void main() {
        // Length falloff: soft start right at the lens, fading to zero at the far end
        float lengthFade = pow(clamp(1.0 - vAlong, 0.0, 1.0), uLengthFalloff) * smoothstep(0.0, 0.06, vAlong);
        // Edge falloff: surfaces seen edge-on (cone silhouette) vanish
        vec3 viewDir = normalize(-vViewPos);
        float facing = abs(dot(normalize(vViewNormal), viewDir));
        float edgeFade = pow(facing, uEdgeFalloff);
        // Fade when the camera is very close to the beam surface (prevents screen-filling haze)
        float nearFade = smoothstep(0.6, 3.0, length(vViewPos));
        float a = uIntensity * lengthFade * edgeFade * nearFade;
        if (a < 0.002) discard;
        gl_FragColor = vec4(uColor, a);
      }
    `,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    fog: false
  });
}
