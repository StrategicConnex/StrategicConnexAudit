"use client";
import React, { useRef, useMemo } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import * as THREE from "three";

const GeometricNetwork = () => {
    const particlesRef = useRef<THREE.Points>(null);
    const linesRef = useRef<THREE.LineSegments>(null);
    const groupRef = useRef<THREE.Group>(null);
    
    const count = 120; // Number of nodes representing connection points/infrastructure
    const maxDistance = 4.5; // Max distance to form a connection wire
    
    const [positions, linesData] = useMemo(() => {
        const p = new Float32Array(count * 3);
        const l = [];
        
        for (let i = 0; i < count; i++) {
            p[i*3] = (Math.random() - 0.5) * 25;
            p[i*3+1] = (Math.random() - 0.5) * 25;
            p[i*3+2] = (Math.random() - 0.5) * 25;
        }
        
        for (let i = 0; i < count; i++) {
            for (let j = i + 1; j < count; j++) {
                const dx = p[i*3] - p[j*3];
                const dy = p[i*3+1] - p[j*3+1];
                const dz = p[i*3+2] - p[j*3+2];
                const distSq = dx*dx + dy*dy + dz*dz;
                
                if (distSq < maxDistance * maxDistance) {
                    l.push(
                        p[i*3], p[i*3+1], p[i*3+2],
                        p[j*3], p[j*3+1], p[j*3+2]
                    );
                }
            }
        }
        return [p, new Float32Array(l)];
    }, [count]);
    
    useFrame((state) => {
        const t = state.clock.getElapsedTime();
        if (groupRef.current) {
            // Rotating data network mimicking flow of information / operations
            groupRef.current.rotation.y = t * 0.05;
            groupRef.current.rotation.x = t * 0.03;
            
            // Mouse interaction / distortion
            const mx = state.pointer.x * 2;
            const my = state.pointer.y * 2;
            
            groupRef.current.rotation.z = THREE.MathUtils.lerp(groupRef.current.rotation.z, mx * 0.1, 0.05);
            groupRef.current.position.x = THREE.MathUtils.lerp(groupRef.current.position.x, mx, 0.05);
            groupRef.current.position.y = THREE.MathUtils.lerp(groupRef.current.position.y, my, 0.05);
        }
    });

    return (
        <group ref={groupRef}>
            <points ref={particlesRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={positions.length / 3} array={positions} itemSize={3} />
                </bufferGeometry>
                <pointsMaterial color="#D4AF37" size={0.1} transparent opacity={0.6} sizeAttenuation={true} blending={THREE.AdditiveBlending} depthWrite={false} />
            </points>
            <lineSegments ref={linesRef}>
                <bufferGeometry>
                    <bufferAttribute attach="attributes-position" count={linesData.length / 3} array={linesData} itemSize={3} />
                </bufferGeometry>
                <lineBasicMaterial color="#2563EB" transparent opacity={0.25} depthWrite={false} blending={THREE.AdditiveBlending} />
            </lineSegments>
        </group>
    );
};

export function ServicesBackground3D({ className = "" }: { className?: string }) {
    return (
        <div className={className} style={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0, zIndex: 0, pointerEvents: "none" }}>
            <Canvas camera={{ position: [0, 0, 15], fov: 60 }}>
                <GeometricNetwork />
            </Canvas>
        </div>
    );
}
