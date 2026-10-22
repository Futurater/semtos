import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useProgress, Center, OrbitControls, useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { CityScene } from './CityScene';
import { Ambulance3D } from './Ambulance3D';
import { TrafficManager } from './TrafficManager';
import { ComputerVisionOverlay } from './ComputerVisionOverlay';

function Loader() {
  const { progress } = useProgress();
  return (
    <Html center zIndexRange={[100, 0]}>
      <div className="flex flex-col items-center justify-center p-8 bg-slate-900/90 border border-emerald-500/50 rounded-lg shadow-2xl backdrop-blur-xl w-72">
        <div className="w-12 h-12 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-6"></div>
        <div className="text-emerald-400 font-mono font-bold tracking-widest text-sm text-center">
          LOADING DIGITAL TWIN
        </div>
        <div className="text-slate-300 font-mono text-xl mt-3 font-bold">
          {progress.toFixed(0)}%
        </div>
      </div>
    </Html>
  );
}

export function CameraTracker({ isFreeRoam, editMode, boundaryMode, isRoadCam, isFrozen, onToggleRoadCam }) {
  const textRef = useRef();

  useFrame((state) => {
    if (textRef.current) {
      const { x, y, z } = state.camera.position;
      const vector = new THREE.Vector3(0, 0, -1);
      vector.applyQuaternion(state.camera.quaternion);

      let heading = '';
      if (Math.abs(vector.x) > Math.abs(vector.z)) {
        heading = vector.x > 0 ? 'EAST (+X)' : 'WEST (-X)';
      } else {
        heading = vector.z > 0 ? 'SOUTH (+Z)' : 'NORTH (-Z)';
      }

      textRef.current.innerText = `X: ${x.toFixed(1)} | Y: ${y.toFixed(1)} | Z: ${z.toFixed(1)} (${heading})`;
    }
  });

  const modeLabel = isFrozen
    ? 'FROZEN (Press F to Unfreeze)'
    : isRoadCam
    ? 'CCTV ROAD CAM (YOLOv8 AI Vision Active)'
    : editMode
    ? 'EDIT MODE (Unlocked)'
    : boundaryMode
    ? 'BOUNDARY MODE (Unlocked)'
    : isFreeRoam
    ? 'FREE ROAM ([WASD] Fly | [C] Exit)'
    : 'CINEMATIC CHASE';

  return (
    <Html
      calculatePosition={() => [0, 0]}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 50,
      }}
    >
      <div style={{ position: 'fixed', bottom: '18px', left: '18px', pointerEvents: 'auto' }}>
        <div className="bg-slate-950/90 text-emerald-400 p-3 rounded-xl border border-emerald-500/50 font-mono text-xs whitespace-nowrap shadow-xl backdrop-blur-md">
          <div className="mb-1 text-emerald-400 font-bold flex items-center justify-between gap-4">
            <span>
              CAM: <span className="text-white">{modeLabel}</span>
            </span>
            <button
              onClick={onToggleRoadCam}
              className={`px-2 py-0.5 rounded text-[10px] font-bold border transition ${
                isRoadCam
                  ? 'bg-sky-500 text-slate-950 border-sky-300'
                  : 'bg-slate-900 text-sky-400 border-sky-500/40 hover:bg-slate-800'
              }`}
            >
              {isRoadCam ? '🎥 AI CCTV ON [V]' : '🎥 AI CCTV OFF [V]'}
            </button>
          </div>
          <div className="text-[10px] text-slate-400 mb-1">
            [ENTER] Dispatch | [N] Adaptive Normal Cycle | [V] AI CCTV Cam | [C] Free Roam | [F] Freeze
          </div>
          <strong>POS:</strong> <span ref={textRef} className="text-slate-200">Loading...</span>
        </div>
      </div>
    </Html>
  );
}

export function FreeRoamFlightCamera() {
  const { camera, gl } = useThree();
  const keys = useRef({ w: false, a: false, s: false, d: false, space: false, shift: false });
  const isDragging = useRef(false);
  const prevMouse = useRef({ x: 0, y: 0 });
  const euler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'));

  useEffect(() => {
    const dom = gl.domElement;
    euler.current.setFromQuaternion(camera.quaternion);

    try {
      dom.requestPointerLock?.();
    } catch (_) {}

    const onKeyDown = (e) => {
      if (e.key === 'Control' || e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'Escape') {
        if (document.pointerLockElement) {
          document.exitPointerLock?.();
        }
        return;
      }
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.w = true;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.s = true;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.a = true;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.d = true;
      if (e.code === 'Space' || e.code === 'KeyE') keys.current.space = true;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') keys.current.shift = true;
    };

    const onKeyUp = (e) => {
      if (e.code === 'KeyW' || e.code === 'ArrowUp') keys.current.w = false;
      if (e.code === 'KeyS' || e.code === 'ArrowDown') keys.current.s = false;
      if (e.code === 'KeyA' || e.code === 'ArrowLeft') keys.current.a = false;
      if (e.code === 'KeyD' || e.code === 'ArrowRight') keys.current.d = false;
      if (e.code === 'Space' || e.code === 'KeyE') keys.current.space = false;
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight' || e.code === 'KeyQ') keys.current.shift = false;
    };

    const onClick = () => {
      if (document.pointerLockElement !== dom) {
        dom.requestPointerLock?.();
      }
    };

    const onMouseDown = (e) => {
      isDragging.current = true;
      prevMouse.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      euler.current.setFromQuaternion(camera.quaternion);
      if (document.pointerLockElement === dom) {
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;
        euler.current.y -= movementX * 0.0025;
        euler.current.x -= movementY * 0.0025;
        euler.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.current.x));
        camera.quaternion.setFromEuler(euler.current);
        return;
      }
      if (isDragging.current) {
        const dx = e.clientX - prevMouse.current.x;
        const dy = e.clientY - prevMouse.current.y;
        prevMouse.current = { x: e.clientX, y: e.clientY };
        euler.current.y -= dx * 0.003;
        euler.current.x -= dy * 0.003;
        euler.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.current.x));
        camera.quaternion.setFromEuler(euler.current);
      }
    };

    const onMouseUp = () => {
      isDragging.current = false;
    };

    const onWheel = (e) => {
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
      camera.position.addScaledVector(forward, -e.deltaY * 0.03);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('click', onClick);
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      if (document.pointerLockElement === dom) {
        document.exitPointerLock?.();
      }
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('click', onClick);
      dom.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      dom.removeEventListener('wheel', onWheel);
    };
  }, [camera, gl]);

  useFrame((_, delta) => {
    const moveSpeed = (keys.current.shift ? 45 : 30) * delta;
    const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
    const up = new THREE.Vector3(0, 1, 0);

    if (keys.current.w) camera.position.addScaledVector(forward, moveSpeed);
    if (keys.current.s) camera.position.addScaledVector(forward, -moveSpeed);
    if (keys.current.d) camera.position.addScaledVector(right, moveSpeed);
    if (keys.current.a) camera.position.addScaledVector(right, -moveSpeed);
    if (keys.current.space) camera.position.addScaledVector(up, moveSpeed);
    if (keys.current.shift && !keys.current.w) camera.position.addScaledVector(up, -moveSpeed);
  });

  return null;
}

export function CinematicCamera({ ambulancePosition }) {
  const currentLookAt = useRef(new THREE.Vector3(-15, 2, -6));

  useFrame((state, delta) => {
    const targetPosition = new THREE.Vector3();
    const targetLookAt = new THREE.Vector3();

    if (ambulancePosition.x < -45) {
      targetPosition.set(-55.0, 12.0, 14.0);
      targetLookAt.set(-15.0, 2.0, -6.0);
    } else if (ambulancePosition.x >= -45 && ambulancePosition.x < -10) {
      targetPosition.set(ambulancePosition.x - 14, 5.0, -2.89);
      targetLookAt.set(ambulancePosition.x + 10, 2.0, -2.89);
    } else if (ambulancePosition.x >= -10 && ambulancePosition.x < 12) {
      targetPosition.set(-15.0, 6.0, -2.89);
      targetLookAt.set(ambulancePosition.x, 2.0, ambulancePosition.z);
    } else {
      targetPosition.set(0.03, 80.57, -1.22);
      targetLookAt.set(0.03, 0, -1.22);
    }

    state.camera.position.lerp(targetPosition, delta * 2.0);
    currentLookAt.current.lerp(targetLookAt, delta * 2.5);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

export function AmbulanceApproachCamera({ ambulancePosition, isSimulationRunning = false }) {
  const currentLookAt = useRef(new THREE.Vector3(-30.0, 1.2, -6.0));

  useFrame((state, delta) => {
    const targetPosition = new THREE.Vector3(2.5, 8.5, -5.5);
    let targetLookAt;
    if (!isSimulationRunning || ambulancePosition.x <= -85) {
      targetLookAt = new THREE.Vector3(-30.0, 1.2, -6.0);
    } else {
      targetLookAt = new THREE.Vector3(ambulancePosition.x, 1.5, ambulancePosition.z);
    }

    state.camera.position.lerp(targetPosition, delta * 3.0);
    currentLookAt.current.lerp(targetLookAt, delta * 3.5);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

function TrafficLightPole({ position, rotation, nsGreen, nsYellow, ewGreen, ewYellow, isNS }) {
  const gap = 0.22;
  const green = isNS ? nsGreen : ewGreen;
  const yellow = isNS ? nsYellow : ewYellow;
  const red = !green && !yellow;

  const redCol = red ? '#ef4444' : '#2d1515';
  const yellowCol = yellow ? '#facc15' : '#2d2510';
  const greenCol = green ? '#22c55e' : '#0d2010';

  return (
    <group position={position} rotation={rotation}>
      <mesh position={[0, -1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.22, 0.75, 0.18]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      <mesh position={[0, gap, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={redCol} />
      </mesh>
      {red && <pointLight color="#ef4444" intensity={8} distance={12} />}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={yellowCol} />
      </mesh>
      {yellow && <pointLight color="#facc15" intensity={6} distance={10} />}
      <mesh position={[0, -gap, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={greenCol} />
      </mesh>
      {green && <pointLight color="#22c55e" intensity={14} distance={18} />}
    </group>
  );
}

export function TrafficLightOverlay({
  nGreen = false, sGreen = false, eGreen = false, wGreen = false,
  nYellow = false, sYellow = false, eYellow = false, wYellow = false,
}) {
  const nProps = { nsGreen: nGreen, nsYellow: nYellow, ewGreen: false, ewYellow: false, isNS: true };
  const sProps = { nsGreen: sGreen, nsYellow: sYellow, ewGreen: false, ewYellow: false, isNS: true };
  const eProps = { nsGreen: false, nsYellow: false, ewGreen: eGreen, ewYellow: eYellow, isNS: false };
  const wProps = { nsGreen: false, nsYellow: false, ewGreen: wGreen, ewYellow: wYellow, isNS: false };

  return (
    <group>
      <TrafficLightPole {...nProps} position={[-4.2, 4.2, -9.5]} rotation={[0, 0, 0]} />
      <TrafficLightPole {...sProps} position={[3.8, 4.2, 9.5]} rotation={[0, Math.PI, 0]} />
      <TrafficLightPole {...eProps} position={[12.0, 4.2, -1.5]} rotation={[0, -Math.PI / 2, 0]} />
      <TrafficLightPole {...wProps} position={[-12.0, 4.2, 7.5]} rotation={[0, Math.PI / 2, 0]} />
    </group>
  );
}

export function CctvOverlay() {
  const { scene: cctvScene } = useGLTF('/cctv.glb');
  return (
    <group position={[-4.91, 3.65, -2.80]} rotation={[0, 26 * (Math.PI / 180), 0]}>
      <Center>
        <primitive object={cctvScene} scale={0.351} />
      </Center>
    </group>
  );
}

export function Canvas3D({
  vehiclesRef: externalVehiclesRef,
  ambulancePosition,
  isSimulationRunning = false,
  isPreempted,
  isFrozen,
  signalPhase,
  defaultRoadCam = false,
  nGreen = false, sGreen = false, eGreen = false, wGreen = false,
  nYellow = false, sYellow = false, eYellow = false, wYellow = false,
}) {
  const [isFreeRoam, setIsFreeRoam] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [boundaryMode, setBoundaryMode] = useState(false);
  const [isRoadCam, setIsRoadCam] = useState(defaultRoadCam);
  const localVehiclesRef = useRef([]);
  const vehiclesRef = externalVehiclesRef || localVehiclesRef;

  // Automatically enable/disable CCTV AI Vision Road Cam when switching Cases (e.g. Case 02)
  useEffect(() => {
    setIsRoadCam(Boolean(defaultRoadCam));
  }, [defaultRoadCam]);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.code === 'KeyV') {
        setIsRoadCam((prev) => !prev);
        setIsFreeRoam(false);
        setEditMode(false);
        setBoundaryMode(false);
      }
      if (e.code === 'KeyC') {
        setIsFreeRoam((prev) => !prev);
        setIsRoadCam(false);
      }
      if (e.code === 'KeyE') {
        setEditMode((prev) => !prev);
        setBoundaryMode(false);
        setIsRoadCam(false);
      }
      if (e.code === 'KeyB') {
        setBoundaryMode((prev) => !prev);
        setEditMode(false);
        setIsRoadCam(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showOrbitControls = editMode || boundaryMode;

  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 50, 150], fov: 45 }}>
      <color attach="background" args={['#020617']} />
      <fog attach="fog" args={['#020617', 50, 400]} />

      <ambientLight intensity={0.5} />
      <directionalLight
        position={[150, 200, 100]}
        intensity={1.5}
        castShadow
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-100, 50, -100]} intensity={0.3} />

      <Suspense fallback={<Loader />}>
        <CityScene isPreempted={isPreempted} />
        <Ambulance3D position={ambulancePosition} isSimulationRunning={isSimulationRunning} />
        <TrafficLightOverlay
          nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
          nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
        />
        <CctvOverlay />
        <TrafficManager
          ambulancePosition={ambulancePosition}
          isPreempted={isPreempted}
          nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
          nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
          isFrozen={isFrozen}
          editMode={editMode}
          boundaryMode={boundaryMode}
          externalVehiclesRef={vehiclesRef}
        />
        {isRoadCam && (
          <ComputerVisionOverlay
            vehiclesRef={vehiclesRef}
            ambulancePosition={ambulancePosition}
            isSimulationRunning={isSimulationRunning}
            isPreempted={isPreempted}
            isActive={true}
          />
        )}
      </Suspense>

      <CameraTracker
        isFreeRoam={isFreeRoam}
        editMode={editMode}
        boundaryMode={boundaryMode}
        isRoadCam={isRoadCam}
        isFrozen={isFrozen}
        onToggleRoadCam={() => setIsRoadCam((prev) => !prev)}
      />

      {showOrbitControls ? (
        <OrbitControls makeDefault />
      ) : isFreeRoam ? (
        <FreeRoamFlightCamera />
      ) : isRoadCam ? (
        <AmbulanceApproachCamera ambulancePosition={ambulancePosition} isSimulationRunning={isSimulationRunning} />
      ) : (
        <CinematicCamera ambulancePosition={ambulancePosition} />
      )}
    </Canvas>
  );
}
