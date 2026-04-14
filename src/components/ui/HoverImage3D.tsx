"use client";
import React, { useRef, useState, useMemo } from "react";
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
  
  useFrame((state, delta) => {
    hoverValue.current = THREE.MathUtils.lerp(hoverValue.current, hovered ? 1 : 0, delta * 6);
    if (materialRef.current) {
      materialRef.current.uniforms.uHoverState.value = hoverValue.current;
      materialRef.current.uniforms.uTime.value = state.clock.getElapsedTime();
    }
  });

  const { viewport } = useThree();
  
  // Calculate scale to "cover" the viewport based on image aspect ratio
  let scaleX = 1;
  let scaleY = 1;
  
  if (texture && texture.image) {
    // Cast to HTMLImageElement or any to satisfy TypeScript
    const img = texture.image as any;
    const aspectRatio = img.width / img.height;
    const vpRatio = viewport.width / viewport.height;
    if (vpRatio > aspectRatio) {
      scaleX = viewport.width;
      scaleY = viewport.width / aspectRatio;
    } else {
      scaleY = viewport.height;
      scaleX = viewport.height * aspectRatio;
    }
  }

  return (
    <mesh 
      ref={meshRef}
      onPointerOver={() => { setHovered(true); document.body.style.cursor = 'crosshair'; }}
      onPointerOut={() => { setHovered(false); document.body.style.cursor = 'auto'; }}
      scale={[scaleX, scaleY, 1]} 
    >
      <planeGeometry args={[1, 1, 32, 32]} />
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
