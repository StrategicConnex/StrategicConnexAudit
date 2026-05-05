"use client";
import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { PointMaterial, Points } from "@react-three/drei";

const ParticleSwarm = () => {
  const pointsRef = useRef<THREE.Points>(null);
  const count = 3000;
  
  const [positions, colors] = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const cols = new Float32Array(count * 3);
    const colorGold = new THREE.Color("#D4AF37");
    const colorBlue = new THREE.Color("#2563EB");
    
    for (let i = 0; i < count; i++) {
        pos[i * 3 + 0] = (Math.random() - 0.5) * 20;
        pos[i * 3 + 1] = (Math.random() - 0.5) * 20;
        pos[i * 3 + 2] = (Math.random() - 0.5) * 8 - 3;
        
        const isBlue = Math.random() > 0.8;
        cols[i * 3 + 0] = isBlue ? colorBlue.r : colorGold.r;
        cols[i * 3 + 1] = isBlue ? colorBlue.g : colorGold.g;
        cols[i * 3 + 2] = isBlue ? colorBlue.b : colorGold.b;
    }
    return [pos, cols];
  }, [count]);

  // Cleanup buffers on unmount
  React.useEffect(() => {
    return () => {
      if (pointsRef.current) {
        pointsRef.current.geometry.dispose();
      }
    };
  }, []);

  useFrame((state) => {
    const time = state.clock.getElapsedTime();
    if (pointsRef.current) {
        pointsRef.current.rotation.y = Math.sin(time / 20) * 0.15;
        pointsRef.current.rotation.x = Math.cos(time / 25) * 0.15;
        
        const mouseX = (state.pointer.x * 0.6);
        const mouseY = (state.pointer.y * 0.6);
        
        pointsRef.current.position.x = THREE.MathUtils.lerp(pointsRef.current.position.x, mouseX, 0.05);
        pointsRef.current.position.y = THREE.MathUtils.lerp(pointsRef.current.position.y, mouseY, 0.05);
    }
  });

  return (
    <Points ref={pointsRef} positions={positions} colors={colors} frustumCulled={false}>
      <PointMaterial 
        transparent 
        vertexColors
        size={0.045} 
        sizeAttenuation={true} 
        depthWrite={false}
        opacity={0.6}
        blending={THREE.AdditiveBlending}
      />
    </Points>
  );
};

export function GlobalBackground3D({ className = "" }: { className?: string }) {
  return (
    <div className={className} style={{ width: "100vw", height: "100vh", position: "fixed", top: 0, left: 0, zIndex: -1, pointerEvents: "none" }}>
      <Canvas camera={{ position: [0, 0, 5], fov: 75 }}>
        <ParticleSwarm />
      </Canvas>
    </div>
  );
}
