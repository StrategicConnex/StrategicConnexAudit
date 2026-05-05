"use client";
import React, { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform float uHoverState;
  uniform float uTime;
  varying vec2 vUv;
  
  void main() {
    vec2 uv = vUv;
    
    // Wave distortion on hover
    float waveX = sin(uv.y * 15.0 + uTime * 3.0) * 0.015 * uHoverState;
    float waveY = cos(uv.x * 15.0 + uTime * 3.0) * 0.015 * uHoverState;
    
    uv.x += waveX;
    uv.y += waveY;
    
    // Slight zoom in on hover
    uv = mix(uv, (uv - 0.5) * 0.9 + 0.5, uHoverState);
    
    vec4 texColor = texture2D(uTexture, uv);
    
    // Subtle energetic brightness tint on hover
    vec3 brightColor = mix(texColor.rgb, texColor.rgb * vec3(1.1, 1.05, 0.9), uHoverState);
    
    gl_FragColor = vec4(brightColor, texColor.a);
  }
`;

const Scene = ({ src }: { src: string }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  
  const texture = useTexture(src);
  
  const [hovered, setHovered] = useState(false);
  const hoverValue = useRef(0);
  
  const uniforms = useMemo(() => ({
    uTexture: { value: texture },
    uHoverState: { value: 0 },
    uTime: { value: 0 }
  }), [texture]);

  // Memoize geometry to avoid creating it on every render
  const geometry = useMemo(() => new THREE.PlaneGeometry(1, 1, 32, 32), []);

  // Cleanup resources on unmount
  useEffect(() => {
    return () => {
      geometry.dispose();
      // material and textures are handled by suspense/r3f but manual is safer for custom shaders
      if (materialRef.current) materialRef.current.dispose();
    };
  }, [geometry]);
  
  useFrame((state, delta) => {
    hoverValue.current = THREE.MathUtils.lerp(hoverValue.current, hovered ? 1 : 0, delta * 6);
    if (materialRef.current) {
      materialRef.current.uniforms.uHoverState.value = hoverValue.current;
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  const { viewport } = useThree();
  
  // Calculate scale
  const [scaleX, scaleY] = useMemo(() => {
    if (texture && texture.image) {
      const img = texture.image as any;
      const aspectRatio = img.width / img.height;
      const vpRatio = viewport.width / viewport.height;
      if (vpRatio > aspectRatio) {
        return [viewport.width, viewport.width / aspectRatio];
      } else {
        return [viewport.height * aspectRatio, viewport.height];
      }
    }
    return [1, 1];
  }, [texture, viewport]);

  return (
    <mesh 
      ref={meshRef}
      onPointerOver={() => { setHovered(true); document.body.style.cursor = 'crosshair'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      scale={[scaleX, scaleY, 1]} 
      geometry={geometry}
    >
      <shaderMaterial
        ref={materialRef}
        vertexShader={vertexShader}
        fragmentShader={fragmentShader}
        uniforms={uniforms}
      />
    </mesh>
  );
};

export function HoverImage3D({ src, className = "" }: { src: string, className?: string }) {
  return (
    <div className={className} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <Canvas
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1 }}
        style={{ width: "100%", height: "100%", outline: "none", pointerEvents: "auto" }}
      >
        <React.Suspense fallback={null}>
          <Scene src={src} />
        </React.Suspense>
      </Canvas>
    </div>
  );
}
