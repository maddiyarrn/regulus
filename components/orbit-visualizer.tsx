'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

interface OrbitalPosition {
  x: number;
  y: number;
  z: number;
}

interface SatelliteData {
  id: number;
  name: string;
  norad_id: string;
  orbitPath: OrbitalPosition[];
  color?: string;
}

interface OrbitVisualizerProps {
  satellites: SatelliteData[];
  showLabels?: boolean;
  earthRadius?: number;
}

const SCALE = 0.001;

function Earth({ radius = 6.371 }: { radius?: number }) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame((_, delta) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.05;
    }
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[radius, 64, 64]} />
      <meshPhongMaterial
        color="#1a6bbf"
        emissive="#0a2a4a"
        shininess={15}
        specular="#4488cc"
      />
    </mesh>
  );
}

function AtmosphereGlow({ radius = 6.371 }: { radius?: number }) {
  return (
    <mesh>
      <sphereGeometry args={[radius * 1.02, 32, 32]} />
      <meshPhongMaterial
        color="#4fa3ff"
        transparent
        opacity={0.08}
        side={THREE.BackSide}
      />
    </mesh>
  );
}

function SatelliteOrbit({ satellite }: { satellite: SatelliteData }) {
  const color = satellite.color || '#10b981';

  const { orbitGeometry, satPosition } = useMemo(() => {
    if (!satellite.orbitPath || satellite.orbitPath.length < 2) {
      return { orbitGeometry: null, satPosition: new THREE.Vector3(0, 10, 0) };
    }

    const points = satellite.orbitPath.map(
      (p) => new THREE.Vector3(p.x * SCALE, p.y * SCALE, p.z * SCALE)
    );

    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const first = satellite.orbitPath[0];
    const pos = new THREE.Vector3(
      first.x * SCALE,
      first.y * SCALE,
      first.z * SCALE
    );

    return { orbitGeometry: geometry, satPosition: pos };
  }, [satellite.orbitPath]);

  const colorObj = useMemo(() => new THREE.Color(color), [color]);

  return (
    <group>
      {/* Orbit path */}
      {orbitGeometry && (
        <line>
          <primitive object={orbitGeometry} attach="geometry" />
          <lineBasicMaterial color={colorObj} transparent opacity={0.5} />
        </line>
      )}
      {/* Satellite dot */}
      <mesh position={satPosition}>
        <sphereGeometry args={[0.25, 8, 8]} />
        <meshBasicMaterial color={colorObj} />
      </mesh>
    </group>
  );
}

export function OrbitVisualizer({
  satellites,
  earthRadius = 6.371,
}: OrbitVisualizerProps) {
  return (
    <div className="relative w-full" style={{ height: 'calc(100vh - 120px)' }}>
      <Canvas
        camera={{ position: [0, 20, 50], fov: 55, near: 0.1, far: 10000 }}
        gl={{ antialias: true, alpha: false }}
        style={{ background: '#020817' }}
      >
        {/* Lights */}
        <ambientLight intensity={0.4} />
        <directionalLight position={[100, 50, 100]} intensity={1.2} />
        <pointLight position={[-100, -50, -100]} intensity={0.3} color="#4466ff" />

        {/* Stars */}
        <mesh>
          <sphereGeometry args={[500, 32, 32]} />
          <meshBasicMaterial color="#000008" side={THREE.BackSide} />
        </mesh>
        {/* Star field as points */}
        <StarField />

        {/* Earth */}
        <Earth radius={earthRadius} />
        <AtmosphereGlow radius={earthRadius} />

        {/* Satellites */}
        {satellites.map((sat) => (
          <SatelliteOrbit key={sat.id} satellite={sat} />
        ))}

        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={8}
          maxDistance={300}
          zoomSpeed={0.8}
        />
      </Canvas>

      {/* Overlay UI */}
      <div className="absolute top-3 left-3 bg-black/70 text-white text-xs px-3 py-2 rounded-lg border border-white/10 backdrop-blur-sm space-y-1">
        <div className="font-semibold text-sm">Orbit Visualization</div>
        <div className="text-white/60">Source: Space-Track.org</div>
        <div className="mt-2 space-y-0.5 text-white/80">
          <div>Drag — rotate</div>
          <div>Scroll — zoom</div>
          <div>Right drag — pan</div>
        </div>
      </div>

      <div className="absolute top-3 right-3 bg-black/70 text-white text-xs px-3 py-2 rounded-lg border border-white/10 backdrop-blur-sm">
        <div className="text-white/60">Tracking</div>
        <div className="text-lg font-bold">{satellites.length}</div>
        <div className="text-white/60">satellites</div>
      </div>

      {/* Satellite legend */}
      {satellites.length > 0 && (
        <div className="absolute bottom-3 left-3 bg-black/70 text-white text-xs px-3 py-2 rounded-lg border border-white/10 backdrop-blur-sm max-h-48 overflow-y-auto">
          <div className="font-semibold mb-1">Satellites</div>
          {satellites.slice(0, 20).map((sat) => (
            <div key={sat.id} className="flex items-center gap-2 py-0.5">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: sat.color || '#10b981' }}
              />
              <span className="truncate max-w-[150px]">{sat.name}</span>
            </div>
          ))}
          {satellites.length > 20 && (
            <div className="text-white/50 mt-1">+{satellites.length - 20} more</div>
          )}
        </div>
      )}
    </div>
  );
}

function StarField() {
  const geometry = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(3000 * 3);
    for (let i = 0; i < 3000; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 400 + Math.random() * 50;
      positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      positions[i * 3 + 2] = r * Math.cos(phi);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, []);

  return (
    <points geometry={geometry}>
      <pointsMaterial color="#ffffff" size={0.5} sizeAttenuation />
    </points>
  );
}
