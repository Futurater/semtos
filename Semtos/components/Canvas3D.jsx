import React, { Suspense, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Html, useProgress, PointerLockControls, TransformControls, useGLTF, Center, OrbitControls } from '@react-three/drei';
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

export function CameraTracker({ isFreeRoam, editMode, boundaryMode, isRoadCam, isFrozen }) {
  const textRef = useRef();

  useFrame((state) => {
    if (textRef.current) {
      const { x, y, z } = state.camera.position;
      
      const vector = new THREE.Vector3(0, 0, -1);
      vector.applyQuaternion(state.camera.quaternion);
      
      let heading = "";
      if (Math.abs(vector.x) > Math.abs(vector.z)) {
          heading = vector.x > 0 ? "EAST (+X)" : "WEST (-X)";
      } else {
          heading = vector.z > 0 ? "SOUTH (+Z)" : "NORTH (-Z)";
      }

      textRef.current.innerText = `X: ${x.toFixed(2)} | Y: ${y.toFixed(2)} | Z: ${z.toFixed(2)} | FACING: ${heading}`;
    }
  });

  const modeLabel = isFrozen
    ? 'FROZEN (Press F to Unfreeze)'
    : isRoadCam
    ? 'CCTV ROAD CAM (AI Vision Active)'
    : editMode
    ? 'EDIT MODE (Unlocked)'
    : boundaryMode
    ? 'BOUNDARY MODE (Unlocked)'
    : isFreeRoam
    ? 'FREE ROAM ([WASD] Fly | [Mouse] Look | [Ctrl] Unlock Mouse | [C] Exit)'
    : 'CINEMATIC';

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
      <div style={{ position: 'fixed', top: '20px', right: '20px', pointerEvents: 'none' }}>
        <div className="bg-black/85 text-emerald-400 p-3 rounded-lg border border-emerald-500 font-mono text-sm whitespace-nowrap shadow-xl backdrop-blur-md">
          <div className="mb-1 text-xs text-emerald-500 font-bold">
            MODE: <span className="text-white">{modeLabel}</span>
          </div>
          <div className="text-xs text-slate-400 mb-1">
            [ENTER] Dispatch | [C] Free Roam | [F] Freeze | [V] Road Cam
          </div>
          <strong>CAMERA:</strong> <span ref={textRef} className="text-slate-200">Loading...</span>
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

    // Request pointer lock when free roam starts
    try {
      dom.requestPointerLock?.();
    } catch (_) {}

    const onKeyDown = (e) => {
      // Release mouse pointer when hitting Control or Escape
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
      // Re-lock mouse pointer on click
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

      // Case 1: Pointer Lock active (seamless mouse look without pointer)
      if (document.pointerLockElement === dom) {
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        euler.current.y -= movementX * 0.0025;
        euler.current.x -= movementY * 0.0025;
        euler.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.current.x));
        camera.quaternion.setFromEuler(euler.current);
        return;
      }

      // Case 2: Unlocked pointer drag fallback
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

    // PHASE 1: Wide establishing view — watching the ambulance approach from the distance and the road flush
    if (ambulancePosition.x < -45) {
      targetPosition.set(-55.0, 12.0, 14.0);
      targetLookAt.set(-15.0, 2.0, -6.0);
    } 
    // PHASE 2: IMMEDIATE FOLLOW - Lock smoothly behind the ambulance as it enters the parted corridor
    else if (ambulancePosition.x >= -45 && ambulancePosition.x < -10) {
      targetPosition.set(ambulancePosition.x - 14, 5.0, -2.89);
      targetLookAt.set(ambulancePosition.x + 10, 2.0, -2.89);
    } 
    // PHASE 3: Intersection Hero Shot (Hold position to show Green Signal & clearance)
    else if (ambulancePosition.x >= -10 && ambulancePosition.x < 12) {
      targetPosition.set(-15.0, 6.0, -2.89);
      targetLookAt.set(ambulancePosition.x, 2.0, ambulancePosition.z);
    }
    // PHASE 4: Bird's-Eye Command Center View
    else {
      targetPosition.set(0.03, 80.57, -1.22);
      targetLookAt.set(0.03, 0, -1.22);
    }

    // Smooth camera position and lookAt interpolation
    state.camera.position.lerp(targetPosition, delta * 2.0);
    currentLookAt.current.lerp(targetLookAt, delta * 2.5);
    state.camera.lookAt(currentLookAt.current);
  });

  return null;
}

export function AmbulanceApproachCamera({ ambulancePosition, isSimulationRunning = false }) {
  const currentLookAt = useRef(new THREE.Vector3(-30.0, 1.2, -6.0));

  useFrame((state, delta) => {
    // Overhead CCTV gantry camera position
    const targetPosition = new THREE.Vector3(2.5, 8.5, -5.5);
    
    // Focus down the open avenue to watch the flush and ambulance approach
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

// ──────────────────────────────────────────────────────────────────────────────
// Traffic Light Overlay – 4 poles, one per road arm, real R/Y/G state
// Positions are tuned to sit at the four corners of the intersection.
// ──────────────────────────────────────────────────────────────────────────────
function TrafficLightPole({ position, rotation, nsGreen, nsYellow, ewGreen, ewYellow, isNS }) {
  const gap = 0.22;
  const green  = isNS ? nsGreen  : ewGreen;
  const yellow = isNS ? nsYellow : ewYellow;
  const red    = !green && !yellow;

  const redCol    = red    ? '#ef4444' : '#2d1515';
  const yellowCol = yellow ? '#facc15' : '#2d2510';
  const greenCol  = green  ? '#22c55e' : '#0d2010';

  return (
    <group position={position} rotation={rotation}>
      {/* Pole */}
      <mesh position={[0, -1.2, 0]}>
        <cylinderGeometry args={[0.04, 0.04, 2.4, 8]} />
        <meshStandardMaterial color="#334155" />
      </mesh>
      {/* Housing */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.22, 0.75, 0.18]} />
        <meshStandardMaterial color="#1e293b" />
      </mesh>
      {/* RED bulb */}
      <mesh position={[0, gap, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={redCol} />
      </mesh>
      {/* Point light for active bulb */}
      {red && <pointLight color="#ef4444" intensity={8} distance={12} />}
      {/* YELLOW bulb */}
      <mesh position={[0, 0, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={yellowCol} />
      </mesh>
      {yellow && <pointLight color="#facc15" intensity={6} distance={10} />}
      {/* GREEN bulb */}
      <mesh position={[0, -gap, 0]}>
        <sphereGeometry args={[0.08, 16, 16]} />
        <meshBasicMaterial color={greenCol} />
      </mesh>
      {green && <pointLight color="#22c55e" intensity={14} distance={18} />}
    </group>
  );
}

export function TrafficLightOverlay({ nGreen=false, sGreen=false, eGreen=false, wGreen=false, nYellow=false, sYellow=false, eYellow=false, wYellow=false }) {
  // Each pole gets its own independent R/Y/G state
  const nProps = { nsGreen: nGreen, nsYellow: nYellow, ewGreen: false,  ewYellow: false,  isNS: true  };
  const sProps = { nsGreen: sGreen, nsYellow: sYellow, ewGreen: false,  ewYellow: false,  isNS: true  };
  const eProps = { nsGreen: false,  nsYellow: false,   ewGreen: eGreen, ewYellow: eYellow, isNS: false };
  const wProps = { nsGreen: false,  nsYellow: false,   ewGreen: wGreen, ewYellow: wYellow, isNS: false };

  return (
    <group>
      {/* North arm – signal faces south-bound traffic */}
      <TrafficLightPole {...nProps} position={[-4.2, 4.2, -9.5]}  rotation={[0, 0, 0]} />
      {/* South arm – signal faces north-bound traffic */}
      <TrafficLightPole {...sProps} position={[3.8,  4.2,  9.5]}  rotation={[0, Math.PI, 0]} />
      {/* East arm – signal faces west-bound traffic */}
      <TrafficLightPole {...eProps} position={[12.0, 4.2, -1.5]}  rotation={[0, -Math.PI / 2, 0]} />
      {/* West arm – signal faces east-bound traffic (ambulance road) */}
      <TrafficLightPole {...wProps} position={[-12.0, 4.2, 7.5]}  rotation={[0, Math.PI / 2, 0]} />
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

export function Canvas3D({ vehiclesRef: externalVehiclesRef, ambulancePosition, isSimulationRunning = false, isPreempted, isFrozen, signalPhase, nGreen=false, sGreen=false, eGreen=false, wGreen=false, nYellow=false, sYellow=false, eYellow=false, wYellow=false }) {
  const [isFreeRoam, setIsFreeRoam] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [boundaryMode, setBoundaryMode] = useState(false);
  const [isRoadCam, setIsRoadCam] = useState(false);
  const localVehiclesRef = useRef([]);
  const vehiclesRef = externalVehiclesRef || localVehiclesRef;

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
        setEditMode(prev => !prev);
        setBoundaryMode(false);
        setIsRoadCam(false);
        console.log("🛠️ EDIT MODE TOGGLED");
      }
      if (e.code === 'KeyB') {
        setBoundaryMode(prev => !prev);
        setEditMode(false);
        setIsRoadCam(false);
        console.log("🚧 BOUNDARY MODE TOGGLED");
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const showOrbitControls = editMode || boundaryMode;

  return (
    <Canvas shadows={{ type: THREE.PCFShadowMap }} camera={{ position: [0, 50, 150], fov: 45 }}>
      {/* Dark Mode Atmosphere */}
      <color attach="background" args={['#020617']} />
      <fog attach="fog" args={['#020617', 50, 400]} />
      
      {/* Adequate Lighting */}
      <ambientLight intensity={0.5} />
      
      {/* Main Directional Light with Shadows */}
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

      {/* Fill light */}
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

      {/* ── DEV TOOL: Click anywhere on the road to log exact 3D coordinates ──
           Open F12 → Console, then click the asphalt to get X, Y, Z readouts.
           Set visible={false} to hide the plane without removing the listener.  */}
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, 0.01, 0]}
        visible={false}
        onClick={(e) => {
          e.stopPropagation();
          const { x, y, z } = e.point;
          console.log(`ROAD POINT → X: ${x.toFixed(2)}, Y: ${y.toFixed(2)}, Z: ${z.toFixed(2)}`);
        }}
      >
        <planeGeometry args={[500, 500]} />
        <meshBasicMaterial transparent opacity={0} />
      </mesh>

      <CameraTracker isFreeRoam={isFreeRoam} editMode={editMode} boundaryMode={boundaryMode} isRoadCam={isRoadCam} isFrozen={isFrozen} />

      {/* Use OrbitControls when editing so the mouse isn't locked! */}
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
