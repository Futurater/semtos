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
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 28,
          background: 'rgba(2, 6, 23, 0.94)',
          border: '1.5px solid #22c55e',
          borderRadius: 14,
          fontFamily: 'monospace',
          width: 280,
          boxShadow: '0 0 32px rgba(34,197,94,0.35)',
        }}
      >
        <div style={{ color: '#4ade80', fontWeight: 800, letterSpacing: 2, fontSize: 12, textAlign: 'center' }}>
          LOADING BENGALURU 3D TWIN
        </div>
        <div style={{ color: '#f8fafc', fontSize: 22, marginTop: 10, fontWeight: 900 }}>
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
    ? 'BTP CCTV AI CAM (YOLOv8 Queue Vision)'
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
      <div style={{ position: 'fixed', bottom: 18, left: 18, pointerEvents: 'auto' }}>
        <div
          style={{
            background: 'rgba(2, 6, 23, 0.92)',
            color: '#4ade80',
            padding: '10px 14px',
            borderRadius: 12,
            border: '1px solid rgba(34, 197, 94, 0.45)',
            fontFamily: 'monospace',
            fontSize: 11,
            whiteSpace: 'nowrap',
            boxShadow: '0 10px 28px rgba(0,0,0,0.8)',
            backdropFilter: 'blur(10px)',
          }}
        >
          <div style={{ marginBottom: 4, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14 }}>
            <span>
              CAM: <span style={{ color: '#ffffff' }}>{modeLabel}</span>
            </span>
            <button
              onClick={onToggleRoadCam}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                fontSize: 10,
                fontWeight: 800,
                cursor: 'pointer',
                background: isRoadCam ? '#38bdf8' : '#0f172a',
                color: isRoadCam ? '#020617' : '#38bdf8',
                border: '1px solid #38bdf8',
              }}
            >
              {isRoadCam ? '🎥 AI CCTV ON [V]' : '🎥 AI CCTV OFF [V]'}
            </button>
          </div>
          <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>
            [ENTER] Dispatch | [N] Adaptive Cycle | [V] BTP AI CCTV | [C] Free Roam | [F] Freeze
          </div>
          <strong>POS:</strong> <span ref={textRef} style={{ color: '#e2e8f0' }}>Loading...</span>
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

    const onKeyDown = (e) => {
      if (e.key === 'Control' || e.code === 'Escape') {
        if (document.pointerLockElement) document.exitPointerLock?.();
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

    const onMouseDown = (e) => {
      isDragging.current = true;
      prevMouse.current = { x: e.clientX, y: e.clientY };
    };

    const onMouseMove = (e) => {
      if (!isDragging.current) return;
      euler.current.setFromQuaternion(camera.quaternion);
      const dx = e.clientX - prevMouse.current.x;
      const dy = e.clientY - prevMouse.current.y;
      prevMouse.current = { x: e.clientX, y: e.clientY };
      euler.current.y -= dx * 0.003;
      euler.current.x -= dy * 0.003;
      euler.current.x = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, euler.current.x));
      camera.quaternion.setFromEuler(euler.current);
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
    dom.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    dom.addEventListener('wheel', onWheel, { passive: true });

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
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
      targetPosition.set(-52.0, 11.5, 13.5);
      targetLookAt.set(-12.0, 2.0, -5.0);
    } else if (ambulancePosition.x >= -45 && ambulancePosition.x < -10) {
      targetPosition.set(ambulancePosition.x - 14, 5.2, -2.89);
      targetLookAt.set(ambulancePosition.x + 12, 2.0, -2.89);
    } else if (ambulancePosition.x >= -10 && ambulancePosition.x < 14) {
      targetPosition.set(-15.0, 6.2, -2.89);
      targetLookAt.set(ambulancePosition.x, 2.0, ambulancePosition.z);
    } else {
      targetPosition.set(-18.0, 24.0, 22.0);
      targetLookAt.set(0.0, 1.5, -2.0);
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

// ── Realistic Cantilevered Overhead Traffic Signal Mast Gantry ───────────────
function SignalHeadBox({ position, red, yellow, green }) {
  const gap = 0.26;
  const redCol = red ? '#ef4444' : '#2a1215';
  const yellowCol = yellow ? '#facc15' : '#2a2410';
  const greenCol = green ? '#22c55e' : '#0b2414';

  return (
    <group position={position}>
      {/* Backplate & Visor Housing */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[0.38, 0.96, 0.24]} />
        <meshStandardMaterial color="#0f172a" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh position={[0, 0, -0.02]}>
        <boxGeometry args={[0.44, 1.02, 0.04]} />
        <meshStandardMaterial color="#cbd5e1" />
      </mesh>

      {/* Red Aspect */}
      <mesh position={[0, gap, 0.13]}>
        <sphereGeometry args={[0.105, 16, 16]} />
        <meshBasicMaterial color={redCol} />
      </mesh>
      {red && <pointLight position={[0, gap, 0.35]} color="#ef4444" intensity={12} distance={18} />}

      {/* Yellow Aspect */}
      <mesh position={[0, 0, 0.13]}>
        <sphereGeometry args={[0.105, 16, 16]} />
        <meshBasicMaterial color={yellowCol} />
      </mesh>
      {yellow && <pointLight position={[0, 0, 0.35]} color="#facc15" intensity={10} distance={15} />}

      {/* Green Aspect */}
      <mesh position={[0, -gap, 0.13]}>
        <sphereGeometry args={[0.105, 16, 16]} />
        <meshBasicMaterial color={greenCol} />
      </mesh>
      {green && <pointLight position={[0, -gap, 0.35]} color="#22c55e" intensity={18} distance={24} />}
    </group>
  );
}

function TrafficLightGantry({
  position,
  rotation,
  nsGreen,
  nsYellow,
  ewGreen,
  ewYellow,
  isNS,
  signTitle,
  signSub,
}) {
  const green = isNS ? nsGreen : ewGreen;
  const yellow = isNS ? nsYellow : ewYellow;
  const red = !green && !yellow;

  return (
    <group position={position} rotation={rotation}>
      {/* Heavy Vertical Steel Mast Column anchored to sidewalk */}
      <mesh position={[0, -1.6, 0]} castShadow>
        <cylinderGeometry args={[0.14, 0.18, 6.2, 16]} />
        <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.3} />
      </mesh>
      {/* Concrete Pedestal Base */}
      <mesh position={[0, -4.4, 0]}>
        <cylinderGeometry args={[0.28, 0.32, 0.8, 16]} />
        <meshStandardMaterial color="#475569" roughness={0.8} />
      </mesh>

      {/* Horizontal Cantilevered Mast Arm extending 5.8m over the road lanes */}
      <mesh position={[2.8, 1.25, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.09, 0.12, 5.8, 12]} />
        <meshStandardMaterial color="#334155" metalness={0.75} roughness={0.3} />
      </mesh>

      {/* Overhead Warm LED Streetlamp Luminaire at top of mast */}
      <mesh position={[1.4, 1.55, 0.2]}>
        <boxGeometry args={[0.6, 0.1, 0.28]} />
        <meshBasicMaterial color="#fef08a" />
      </mesh>
      <pointLight position={[2.2, 1.2, 0.5]} color="#fde68a" intensity={6} distance={26} />

      {/* Dual Overhead Signal Heads (Primary & Secondary Lane Aspects) */}
      <SignalHeadBox position={[2.3, 0.65, 0.18]} red={red} yellow={yellow} green={green} />
      <SignalHeadBox position={[4.6, 0.65, 0.18]} red={red} yellow={yellow} green={green} />

      {/* Bengaluru BBMP / Traffic Police Overhead Highway Signboard */}
      {signTitle && (
        <Html position={[3.4, 1.95, 0]} center distanceFactor={38} zIndexRange={[10, 0]}>
          <div
            style={{
              background: 'linear-gradient(180deg, #065f46 0%, #064e3b 100%)',
              border: '2px solid #f8fafc',
              borderRadius: 6,
              padding: '4px 10px',
              color: '#ffffff',
              fontFamily: 'monospace',
              textAlign: 'center',
              whiteSpace: 'nowrap',
              boxShadow: '0 4px 14px rgba(0,0,0,0.75)',
              pointerEvents: 'none',
            }}
          >
            <div style={{ fontSize: 9, fontWeight: 900, letterSpacing: 1 }}>{signTitle}</div>
            {signSub && (
              <div style={{ fontSize: 7.5, color: '#a7f3d0', fontWeight: 700, marginTop: 1 }}>
                {signSub}
              </div>
            )}
          </div>
        </Html>
      )}
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
      <TrafficLightGantry
        {...nProps}
        position={[-7.5, 4.2, -10.5]}
        rotation={[0, 0, 0]}
        signTitle="BRIGADE RD JUNCTION • BENGALURU"
        signSub="↑ RESIDENCY RD 0.6 KM | SHIVAJINAGAR ←"
      />
      <TrafficLightGantry
        {...sProps}
        position={[7.5, 4.2, 10.5]}
        rotation={[0, Math.PI, 0]}
        signTitle="MAYO HALL • MG ROAD CORRIDOR"
        signSub="↑ CUBBON PARK 0.9 KM"
      />
      <TrafficLightGantry
        {...eProps}
        position={[12.5, 4.2, -8.5]}
        rotation={[0, -Math.PI / 2, 0]}
        signTitle="MG ROAD GREEN CORRIDOR (BTP V2X)"
        signSub="↑ ANIL KUMBLE CIRCLE | 🏥 BOWRING HOSPITAL 0.8 KM"
      />
      <TrafficLightGantry
        {...wProps}
        position={[-12.5, 4.2, 8.5]}
        rotation={[0, Math.PI / 2, 0]}
        signTitle="TRINITY CIRCLE • INDIRANAGAR →"
        signSub="NAMMA METRO PURPLE LINE CORRIDOR"
      />
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
      {/* Realistic Dusk Smart-City Atmosphere */}
      <color attach="background" args={['#071022']} />
      <fog attach="fog" args={['#071022', 65, 380]} />

      <hemisphereLight skyColor="#38bdf8" groundColor="#0f172a" intensity={0.65} />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[140, 190, 90]}
        intensity={1.75}
        color="#f8fafc"
        castShadow
        shadow-camera-left={-150}
        shadow-camera-right={150}
        shadow-camera-top={150}
        shadow-camera-bottom={-150}
        shadow-mapSize={[2048, 2048]}
      />
      <directionalLight position={[-110, 65, -90]} intensity={0.45} color="#fdba74" />

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
