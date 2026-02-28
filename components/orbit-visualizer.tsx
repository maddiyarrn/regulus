'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, Stars, Sphere, Line, Html } from '@react-three/drei';
import { useRef, useMemo } from 'react';
import * as THREE from 'three';

interface OrbitalPosition {
  x: number;
  y: number;
  z: number;
  time?: Date;
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

function Earth({ radius = 6.371 }: { radius?: number }) {
  return (
    <Sphere args={[radius, 64, 64]}>
      <meshStandardMaterial
        color="#1e40af"
        roughness={0.8}
        metalness={0.2}
      />
    </Sphere>
  );
}

function SatelliteOrbit({ 
  satellite, 
  showLabel 
}: { 
  satellite: SatelliteData; 
  showLabel: boolean;
}) {
  const scaleFactor = 0.001;
  
  const orbitPoints = useMemo(() => {
    return satellite.orbitPath.map(
      (pos) => new THREE.Vector3(
        pos.x * scaleFactor, 
        pos.y * scaleFactor, 
        pos.z * scaleFactor
      )
    );
  }, [satellite.orbitPath]);

  // Current position (first point in path)
  const currentPos = satellite.orbitPath[0];
  const scaledPos = useMemo(
    () => new THREE.Vector3(
      currentPos.x * scaleFactor,
      currentPos.y * scaleFactor,
      currentPos.z * scaleFactor
    ),
    [currentPos]
  );

  const color = satellite.color || '#10b981';

  return (
    <group>
      {/* Orbit path line */}
      <Line
        points={orbitPoints}
        color={color}
        lineWidth={1.5}
        transparent
        opacity={0.6}
      />
      
      {/* Satellite marker */}
      <mesh position={scaledPos}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} />
      </mesh>

      {/* Label */}
      {showLabel && (
        <Html position={scaledPos} distanceFactor={15} center>
          <div className="bg-background/90 backdrop-blur-sm px-2 py-1 rounded-md border border-border text-xs whitespace-nowrap pointer-events-none">
            <div className="font-semibold">{satellite.name}</div>
            <div className="text-muted-foreground">NORAD: {satellite.norad_id}</div>
          </div>
        </Html>
      )}
    </group>
  );
}

function CollisionWarning({ 
  position, 
  distance 
}: { 
  position: THREE.Vector3; 
  distance: number;
}) {
  return (
    <group position={position}>
      <mesh>
        <sphereGeometry args={[0.5, 16, 16]} />
        <meshBasicMaterial color="#ef4444" transparent opacity={0.6} />
      </mesh>
      <Html distanceFactor={15} center>
        <div className="bg-destructive/90 text-destructive-foreground px-2 py-1 rounded-md text-xs whitespace-nowrap">
          ⚠️ Collision Risk: {distance.toFixed(2)} km
        </div>
      </Html>
    </group>
  );
}

export function OrbitVisualizer({ 
  satellites, 
  showLabels = true,
  earthRadius = 6.371 
}: OrbitVisualizerProps) {
  return (
    <div className="w-full h-screen bg-background">
      <Canvas
        camera={{ position: [50, 30, 50], fov: 60 }}
        gl={{ antialias: true }}
      >
        {/* Lighting */}
        <ambientLight intensity={0.3} />
        <pointLight position={[100, 100, 100]} intensity={1.5} />
        <pointLight position={[-100, -100, -100]} intensity={0.5} />

        {/* Stars background */}
        <Stars radius={300} depth={50} count={5000} factor={4} fade speed={1} />

        {/* Earth */}
        <Earth radius={earthRadius} />

        {/* Satellites and orbits */}
        {satellites.map((satellite) => (
          <SatelliteOrbit
            key={satellite.id}
            satellite={satellite}
            showLabel={showLabels}
          />
        ))}

        {/* Controls */}
        <OrbitControls
          enablePan
          enableZoom
          enableRotate
          minDistance={10}
          maxDistance={200}
        />

        {/* Grid helper (optional) */}
        {/* <gridHelper args={[100, 100]} /> */}
      </Canvas>

      {/* Legend */}
      <div className="absolute top-4 left-4 bg-background/90 backdrop-blur-sm p-4 rounded-lg border border-border max-w-sm">
        <h3 className="font-semibold mb-2">Orbit Visualization</h3>
        <p className="text-xs text-muted-foreground mb-2">
          Data source: <span className="font-medium">Space-Track.org</span>
        </p>
        <div className="space-y-1 text-xs">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#10b981]" />
            <span>Satellite orbit path</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-[#2563eb]" />
            <span>Earth (scale adjusted)</span>
          </div>
        </div>
        <div className="mt-3 text-xs text-muted-foreground">
          <p>Controls:</p>
          <ul className="list-disc list-inside space-y-0.5 mt-1">
            <li>Left click + drag: Rotate</li>
            <li>Right click + drag: Pan</li>
            <li>Scroll: Zoom</li>
          </ul>
        </div>
      </div>

      {/* Satellite count */}
      <div className="absolute top-4 right-4 bg-background/90 backdrop-blur-sm p-3 rounded-lg border border-border">
        <div className="text-sm">
          <span className="text-muted-foreground">Tracking:</span>{' '}
          <span className="font-semibold">{satellites.length}</span> satellites
        </div>
      </div>
    </div>
  );
}
