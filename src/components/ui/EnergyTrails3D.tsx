"use client";
import React, { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

function TrailsShader() {
  const meshRef = useRef<THREE.Mesh>(null);
  const shaderMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      time: { value: 0 },
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      varying vec2 vUv;
      
      // Simplex noise function
      vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
      vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
      float snoise(vec2 v) {
        const vec4 C = vec4(0.211324865405187,  // (3.0-sqrt(3.0))/6.0
                            0.366025403784439,  // 0.5*(sqrt(3.0)-1.0)
                           -0.577350269189626,  // -1.0 + 2.0 * C.x
                            0.024390243902439); // 1.0 / 41.0
        vec2 i  = floor(v + dot(v, C.yy) );
        vec2 x0 = v -   i + dot(i, C.xx);
        vec2 i1;
        i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
        vec4 x12 = x0.xyxy + C.xxzz;
        x12.xy -= i1;
        i = mod289(i);
        vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 ))
          + i.x + vec3(0.0, i1.x, 1.0 ));
        vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0);
        m = m*m; m = m*m;
        vec3 x = 2.0 * fract(p * C.www) - 1.0;
        vec3 h = abs(x) - 0.5;
        vec3 ox = floor(x + 0.5);
        vec3 a0 = x - ox;
        m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h );
        vec3 g;
        g.x  = a0.x  * x0.x  + h.x  * x0.y;
        g.yz = a0.yz * x12.xz + h.yz * x12.yw;
        return 130.0 * dot(m, g);
      }

      float line(vec2 uv, float offset, float speed, float width, float curve) {
          // Add some horizontal curvature
          float c = sin(uv.y * 3.1415 + time * 0.1) * curve;
          float n = snoise(vec2(uv.y * 1.5 - time * speed, uv.x * 2.0)) * 0.1;
          float l = abs(uv.x - 0.75 - offset + n + c); // Base around x=0.75 (right side)
          return smoothstep(width, 0.0, l);
      }

      void main() {
          vec2 uv = vUv;
          
          float l1 = line(uv, 0.0, 0.1, 0.06, 0.05);   // Main thick trail
          float l2 = line(uv, 0.08, 0.15, 0.02, 0.1);  // Fast thin trail
          float l3 = line(uv, -0.05, 0.08, 0.1, -0.05); // Broad slow glow trail
          float l4 = line(uv, 0.15, 0.2, 0.01, 0.0);   // Very thin accent
          
          // Neon Blue/Cyan colors
          vec3 color1 = vec3(0.0, 0.4, 1.0) * l1 * 1.5;
          vec3 color2 = vec3(0.0, 0.8, 1.0) * l2 * 2.5;
          vec3 color3 = vec3(0.1, 0.2, 0.8) * l3 * 0.8;
          vec3 color4 = vec3(0.8, 0.9, 1.0) * l4 * 2.0; // White-blue core
          
          vec3 finalColor = color1 + color2 + color3 + color4;
          
          // Fade out to the left to avoid text interference
          float horizontalFade = smoothstep(0.4, 0.7, uv.x); 
          // Soften top and bottom edges
          float verticalFade = smoothstep(0.0, 0.2, uv.y) * smoothstep(1.0, 0.8, uv.y);
          
          gl_FragColor = vec4(finalColor, finalColor.r + finalColor.g + finalColor.b) * verticalFade * horizontalFade;
      }
    `,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
  }), []);

  const geometry = useMemo(() => new THREE.PlaneGeometry(2, 2), []);

  React.useEffect(() => {
    return () => {
      geometry.dispose();
      shaderMaterial.dispose();
    };
  }, [geometry, shaderMaterial]);

  useFrame((state) => {
    if (shaderMaterial) {
      shaderMaterial.uniforms.time.value = state.clock.elapsedTime;
    }
  });

  return (
    <mesh ref={meshRef} geometry={geometry}>
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
}

export function EnergyTrails3D() {
  return (
    <div style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 0, pointerEvents: 'none' }}>
      <Canvas style={{ background: 'transparent' }}>
        <TrailsShader />
      </Canvas>
    </div>
  );
}
