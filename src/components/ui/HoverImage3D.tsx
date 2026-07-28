"use client";
import React, { useRef, useState, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useTexture } from "@react-three/drei";
import Image from "next/image";

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
    const currentMaterial = materialRef.current;
    return () => {
      geometry.dispose();
      if (currentMaterial) currentMaterial.dispose();
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
      const img = texture.image as HTMLImageElement;
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

export function HoverImage3D({ src, alt = "", className = "" }: { src: string, alt?: string, className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect(); // Maintain active state once visible to avoid flashing
        }
      },
      { 
        rootMargin: "150px" // Start pre-booting WebGL 150px before entering viewport
      }
    );

    if (containerRef.current) {
      observer.observe(containerRef.current);
    }

    return () => observer.disconnect();
  }, []);

  return (
    <div 
      ref={containerRef} 
      className={className} 
      style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}
    >
      {!inView ? (
        // Static optimized Next.js Image for immediate SEO indexing and LCP/layout stability
        <Image 
          src={src} 
          alt={alt} 
          fill 
          className="object-cover" 
          sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          loading="lazy"
        />
      ) : (
        // 3D Interactive WebGL Canvas mounts dynamically when in viewport
        <Canvas
          orthographic
          camera={{ position: [0, 0, 1], zoom: 1 }}
          style={{ width: "100%", height: "100%", outline: "none", pointerEvents: "auto" }}
        >
          <React.Suspense fallback={null}>
            <Scene src={src} />
          </React.Suspense>
        </Canvas>
      )}
    </div>
  );
}
