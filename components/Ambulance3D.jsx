import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useGLTF } from '@react-three/drei';
import * as THREE from 'three';

export function Ambulance3D({
  position, ringColor = '#3b82f6', ringRadius = 14, label = null, floatingLabel,
  corridorActive = false, livePosition = false, showRing = true,
}) {
  const group = useRef();
  const bleRingRef = useRef();
  const { scene } = useGLTF('/ambulance.glb');

  const clonedScene = React.useMemo(() => {
    const clone = scene.clone(true);
    clone.traverse((child) => {
      if (child.isMesh) child.frustumCulled = true;
    });
    return clone;
  }, [scene]);

  useFrame((state) => {
    if (group.current && position) {
      const targetY = position.y !== undefined ? position.y : 0.55;
      if (livePosition) {
        group.current.position.set(position.x, targetY, position.z);
        group.current.rotation.y = position.rotation ?? 0;
      } else {
        group.current.position.lerp(
          new THREE.Vector3(position.x, targetY, position.z),
          0.25
        );
        if (position.rotation !== undefined) {
          group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, position.rotation, 0.25);
        }
      }
    }

    if (bleRingRef.current) {
      const time = state.clock.getElapsedTime();
      bleRingRef.current.material.opacity = 0.08 + 0.14 * Math.abs(Math.sin(time * 2.2));
    }
  }, livePosition ? -0.75 : 0);

  if (!position) return null;

  const initialY = position.y !== undefined ? position.y : 0.55;

  return (
    <group ref={group} position={[position.x, initialY, position.z]} rotation={[0, position.rotation || 0, 0]}>
      <primitive object={clonedScene} scale={0.194} position={[0, 0, 0]} rotation={[0, Math.PI, 0]} />

      {floatingLabel && (
        <Html center position={[0, 2.7, 0]} zIndexRange={[35, 0]} pointerEvents="none">
          <div className="relative flex -translate-y-1.5 items-center gap-2.5 whitespace-nowrap rounded-lg border border-sky-400/70 bg-slate-950/95 px-2.5 py-1.5 font-sans shadow-lg">
            <span aria-hidden="true" className="grid h-6 w-6 place-items-center rounded-md bg-sky-500/15 text-sm font-bold text-sky-300">+</span>
            <div className="flex flex-col gap-0.5 leading-tight">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-slate-50">{floatingLabel}</span>
              {corridorActive && <span className="flex items-center gap-1.5 text-[10px] font-medium text-emerald-300"><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-400" />Green corridor active</span>}
            </div>
            <span aria-hidden="true" className="absolute -bottom-[5px] left-1/2 h-2 w-2 -translate-x-1/2 rotate-45 border-b border-r border-sky-400/70 bg-slate-950" />
          </div>
        </Html>
      )}

      {/* Glowing BLE Signal Radius Overlay */}
      {showRing && (
        <mesh ref={bleRingRef} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]}>
          <ringGeometry args={[ringRadius - 2, ringRadius, 64]} />
          <meshBasicMaterial color={ringColor} transparent opacity={0.15} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}

      {/* Optional In-World Beacon Label */}
      {label && (
        <group position={[0, 3.2, 0]}>
          <pointLight color={ringColor} intensity={2.5} distance={6} />
        </group>
      )}
    </group>
  );
}

useGLTF.preload('/ambulance.glb');
