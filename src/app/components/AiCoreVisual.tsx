'use client';

import { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { AiCoreShader } from './AiCoreShader';

// ─── Browser Console Warning Patch ───────────────────────────────────────────
// Suppress noisy Three.js Clock deprecation warnings originating from 
// @react-three/fiber's internal Clock instantiations under Three.js r184.
if (typeof window !== 'undefined') {
  const originalWarn = console.warn;
  console.warn = function (...args) {
    if (
      args[0] &&
      typeof args[0] === 'string' &&
      args[0].includes('THREE.Clock') &&
      args[0].includes('deprecated')
    ) {
      return;
    }
    originalWarn.apply(console, args);
  };
}

// ─── Client-Side Hydration Guard ──────────────────────────────────────────────
function useIsMounted() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}

// ─── Particle Core Component ──────────────────────────────────────────────────
interface ParticleSystemProps {
  interactive: boolean;
}

function ParticleSystem({ interactive }: ParticleSystemProps) {
  const coreRef = useRef<THREE.Points>(null);
  const shellRef = useRef<THREE.Points>(null);
  const isHoveredRef = useRef(false);
  const [hovered, setHovered] = useState(false);

  // Synchronize hover ref with state
  useEffect(() => {
    isHoveredRef.current = hovered && interactive;
  }, [hovered, interactive]);

  // ─── Inner Core Particle Generation (High Density Sphere Volume) ────────────
  const { corePositions, coreRandoms, coreScales } = useMemo(() => {
    const count = 7500;
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Golden ratio spherical distribution for beautiful uniform volume density
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      
      // Force higher density towards center using square root scaling
      const r = 0.52 * Math.pow(Math.random(), 0.6);

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      randoms[i] = Math.random();
      scales[i] = 0.35 + Math.random() * 0.65;
    }

    return {
      corePositions: positions,
      coreRandoms: randoms,
      coreScales: scales,
    };
  }, []);

  // ─── Outer Shell Particle Generation (Hollow Surface Shell) ─────────────────
  const { shellPositions, shellRandoms, shellScales } = useMemo(() => {
    const count = 2800;
    const positions = new Float32Array(count * 3);
    const randoms = new Float32Array(count);
    const scales = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2.0 * Math.PI;
      const phi = Math.acos(2.0 * v - 1.0);
      
      // Keep shell thin by restricting radius bounds
      const r = 1.34 + Math.random() * 0.08;

      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);

      randoms[i] = Math.random();
      scales[i] = 0.7 + Math.random() * 1.3;
    }

    return {
      shellPositions: positions,
      shellRandoms: randoms,
      shellScales: scales,
    };
  }, []);

  // ─── Shader Uniforms Setup ──────────────────────────────────────────────────
  const coreUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(999, 999, 999) },
    uHover: { value: 0 },
    uRadius: { value: 1.0 },
    uType: { value: 0.0 }
  }), []);

  const shellUniforms = useMemo(() => ({
    uTime: { value: 0 },
    uMouse: { value: new THREE.Vector3(999, 999, 999) },
    uHover: { value: 0 },
    uRadius: { value: 1.0 },
    uType: { value: 1.0 }
  }), []);

  // ─── R3F Animation Render Loop ─────────────────────────────────────────────
  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    
    // Update elapsed times
    coreUniforms.uTime.value = time;
    shellUniforms.uTime.value = time;

    // Smooth uniform transitions (Easing/Interpolation)
    const targetHover = isHoveredRef.current ? 1.0 : 0.0;
    coreUniforms.uHover.value = THREE.MathUtils.lerp(coreUniforms.uHover.value, targetHover, 0.08);
    shellUniforms.uHover.value = THREE.MathUtils.lerp(shellUniforms.uHover.value, targetHover, 0.08);

    if (isHoveredRef.current) {
      // Map 2D pointer coordinates into normalized device 3D coordinate space
      const targetMouse = new THREE.Vector3(
        state.pointer.x * 1.8,
        state.pointer.y * 1.8,
        0
      );
      coreUniforms.uMouse.value.lerp(targetMouse, 0.12);
      shellUniforms.uMouse.value.lerp(targetMouse, 0.12);
    } else {
      // Deflect ray to void
      const inactiveMouse = new THREE.Vector3(999, 999, 999);
      coreUniforms.uMouse.value.lerp(inactiveMouse, 0.08);
      shellUniforms.uMouse.value.lerp(inactiveMouse, 0.08);
    }

    // Dynamic rotation of Core and Shell arrays to create emergent complexity
    if (coreRef.current) {
      coreRef.current.rotation.y = time * 0.04;
      coreRef.current.rotation.x = time * 0.02;
    }
    if (shellRef.current) {
      shellRef.current.rotation.z = -time * 0.025;
    }
  });

  return (
    <group 
      onPointerOver={() => interactive && setHovered(true)}
      onPointerOut={() => interactive && setHovered(false)}
    >
      {/* ─── Inner Active Core Particles ─── */}
      <points ref={coreRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[corePositions, 3]}
          />
          <bufferAttribute
            attach="attributes-aRandom"
            args={[coreRandoms, 1]}
          />
          <bufferAttribute
            attach="attributes-aScale"
            args={[coreScales, 1]}
          />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={AiCoreShader.vertexShader}
          fragmentShader={AiCoreShader.fragmentShader}
          uniforms={coreUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>

      {/* ─── Outer Protective Shell Particles ─── */}
      <points ref={shellRef}>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[shellPositions, 3]}
          />
          <bufferAttribute
            attach="attributes-aRandom"
            args={[shellRandoms, 1]}
          />
          <bufferAttribute
            attach="attributes-aScale"
            args={[shellScales, 1]}
          />
        </bufferGeometry>
        <shaderMaterial
          vertexShader={AiCoreShader.vertexShader}
          fragmentShader={AiCoreShader.fragmentShader}
          uniforms={shellUniforms}
          transparent
          depthWrite={false}
          blending={THREE.AdditiveBlending}
        />
      </points>
    </group>
  );
}

// ─── WebGL Detection Utility ──────────────────────────────────────────────────
function checkWebGLSupport() {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
    return !!gl;
  } catch (e) {
    return false;
  }
}

// ─── Main Exportable Canvas Component ─────────────────────────────────────────
interface AiCoreVisualProps {
  size?: number;
  interactive?: boolean;
}

export default function AiCoreVisual({ size = 200, interactive = true }: AiCoreVisualProps) {
  const mounted = useIsMounted();
  const [webglSupported, setWebglSupported] = useState(true);

  useEffect(() => {
    if (mounted) {
      setWebglSupported(checkWebGLSupport());
    }
  }, [mounted]);

  // Return glass loader skeleton on SSR environments to prevent layout shift
  if (!mounted) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className="rounded-full bg-[#030303] border border-white/[0.04] flex items-center justify-center relative overflow-hidden"
      >
        <div className="w-1/2 h-1/2 rounded-full bg-gradient-to-br from-red-500/10 to-rose-500/10 blur-xl animate-pulse" />
      </div>
    );
  }

  const isSmall = size <= 60;

  // ─── Glowing CSS Fallback if WebGL fails / is unsupported ───────────────────
  if (!webglSupported) {
    return (
      <div 
        style={{ width: size, height: size }} 
        className="rounded-full bg-[#030303]/90 border border-white/[0.06] flex items-center justify-center relative overflow-hidden shadow-[0_0_30px_rgba(239,68,68,0.12)] group pointer-events-auto"
      >
        {/* Animated fluid base glow */}
        <div className="absolute inset-0 bg-gradient-to-br from-[#ef4444]/15 via-[#be123c]/5 to-[#f97316]/15 animate-pulse duration-4000 pointer-events-none" />
        
        {/* Micro-breathing core blur orb */}
        <div 
          className="absolute rounded-full bg-gradient-to-tr from-[#ef4444]/35 to-[#f97316]/35 blur-md animate-pulse pointer-events-none transition-all duration-700 group-hover:scale-[1.25]" 
          style={{ width: size * 0.5, height: size * 0.5 }}
        />
        
        {/* Core center micro-dot */}
        <div 
          className="rounded-full bg-white/20 border border-white/30 backdrop-blur-md shadow-[inset_0_0_8px_rgba(255,255,255,0.2)] flex items-center justify-center transition-transform duration-500 group-hover:scale-110 pointer-events-none"
          style={{ width: Math.max(16, size * 0.28), height: Math.max(16, size * 0.28) }}
        >
          <div className="w-2.5 h-2.5 rounded-full bg-red-500 animate-ping shadow-[0_0_10px_#ef4444]" />
        </div>
      </div>
    );
  }

  // Calculate standard perspective camera properties
  const cameraZ = isSmall ? 3.0 : 3.8;

  return (
    <div 
      style={{ width: size, height: size }} 
      className="relative flex items-center justify-center cursor-pointer select-none rounded-full"
    >
      <Canvas
        camera={{ position: [0, 0, cameraZ], fov: 45 }}
        dpr={[1, 2]} // Clamp dpr to 2 to prevent GPU drain on extreme high-res displays
        gl={{ 
          antialias: true, 
          alpha: true,
          powerPreference: "high-performance",
          stencil: false,
          depth: false
        }}
        className="absolute inset-0 z-10"
      >
        <ambientLight intensity={1.5} />
        <ParticleSystem interactive={interactive} />
      </Canvas>

      {/* Decorative Outer Glass Glow Orbs */}
      <div 
        className={`absolute inset-0 rounded-full border border-white/[0.03] pointer-events-none transition-all duration-700 bg-gradient-to-br from-indigo-500/[0.02] via-transparent to-cyan-500/[0.02] ${
          isSmall ? 'scale-[1.05]' : 'scale-[1.08] shadow-[inset_0_0_12px_rgba(255,255,255,0.01)]'
        }`}
      />
    </div>
  );
}
