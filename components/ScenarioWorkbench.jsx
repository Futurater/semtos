import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, OrbitControls, TransformControls, useGLTF } from '@react-three/drei';
import { Box3, Vector3 } from 'three';
import { CityScene } from './CityScene';
import { captureFreeRoamMouse, FreeRoamFlightCamera } from './Canvas3D';
import { scenarioRoadHeight } from './case2Simulation';
import { addScenarioVehicles, createSavedDenseFlowScenario, HEADINGS, ONCOMING_FLOW_POLICY, requestAmbulanceBackout, stageScenario, stepScenario } from './scenarioTraffic';

const directions = { N: 'North', E: 'East', S: 'South', W: 'West' };
const control = 'rounded border border-slate-600 bg-slate-900 px-2.5 py-1.5 text-slate-100 disabled:opacity-40';
const primary = 'rounded bg-sky-300 px-2.5 py-1.5 font-semibold text-slate-950 disabled:opacity-40';
const diagnosticPriority = vehicle => vehicle.kind === 'ambulance' ? 0
  : vehicle.spaceRequest || vehicle.status === 'Yielding' || vehicle.status.endsWith('to open a gap') ? 1 : 2;

function driverStatus(vehicle) {
  if (vehicle.spaceRequest && vehicle.status === 'Making room for a neighbor') {
    return `Opening gap for ${vehicle.spaceRequest}`;
  }
  if (vehicle.status === 'Yielding' && vehicle.lateralTarget != null) {
    const forward = HEADINGS[vehicle.heading];
    const side = vehicle.z * forward.x - vehicle.x * forward.z;
    return vehicle.lateralTarget > side ? 'Yielding right' : 'Yielding left';
  }
  return vehicle.status;
}

function CoordinateInput({ label, value, onCommit }) {
  return (
    <label className="text-xs">{label}
      <input key={value} className={`mt-1 w-full ${control}`} type="number" step=".1"
        defaultValue={value.toFixed(2)}
        onBlur={event => onCommit(event.currentTarget.valueAsNumber)}
        onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} />
    </label>
  );
}

function snapshot(vehicles) {
  return vehicles.map(({ id, kind, heading, modelIdx, x, y, z, parked }) => ({
    id, kind, heading, modelIdx, x, y, z, parked, rotation: HEADINGS[heading].rotation, speed: 0,
    status: parked ? 'Parked obstacle' : 'Ready',
  }));
}

function ScenarioVehicle({ vehicle, editing, selected, onSelect, onMove, onRotate, rotating }) {
  const group = useRef();
  const ambulance = vehicle.kind === 'ambulance';
  const file = ambulance ? '/ambulance.glb' : `/car${vehicle.modelIdx + 1}.glb`;
  const { scene } = useGLTF(file);
  const model = useMemo(() => {
    const clone = scene.clone(true);
    if (!ambulance && vehicle.modelIdx === 2) {
      const center = new Box3().setFromObject(clone).getCenter(new Vector3());
      clone.position.x -= center.x;
      clone.position.z -= center.z;
    }
    return clone;
  }, [scene, ambulance, vehicle.modelIdx]);
  const baseRotation = ambulance ? Math.PI : (vehicle.modelIdx === 0 ? 0 : Math.PI);

  useFrame(() => {
    if (editing || !group.current) return;
    group.current.position.set(vehicle.x, vehicle.y, vehicle.z);
    group.current.rotation.y = vehicle.rotation;
  }, -0.5);

  return (
    <>
      <group ref={group} position={[vehicle.x, vehicle.y, vehicle.z]} rotation={[0, vehicle.rotation, 0]} onClick={event => {
        event.stopPropagation();
        if (!document.pointerLockElement) onSelect(vehicle.id);
      }}>
        <group scale={ambulance ? .194 : .6} rotation={[0, baseRotation, 0]}>
          <primitive object={model} />
        </group>
        {(selected || (editing && ambulance)) && (
          <Html center position={[0, ambulance ? 2.2 : 1.5, 0]} pointerEvents="none" zIndexRange={[30, 0]}>
            <span className="whitespace-nowrap rounded border border-sky-500/60 bg-slate-950/95 px-2 py-1 text-xs text-sky-100">{vehicle.id}</span>
          </Html>
        )}
        {ambulance && !editing && (
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, .08, 0]}>
            <ringGeometry args={[17.7, 18, 48]} />
            <meshBasicMaterial color="#38bdf8" transparent opacity={.23} depthWrite={false} />
          </mesh>
        )}
      </group>
      {editing && selected && (
        <TransformControls
          object={group}
          mode={rotating ? 'rotate' : 'translate'}
          rotationSnap={Math.PI / 2}
          space="world"
          showX={!rotating}
          showY={rotating}
          showZ={!rotating}
          onMouseUp={() => {
            if (!rotating) {
              onMove(vehicle.id, group.current.position.x, group.current.position.z);
              return;
            }
            const facing = new Vector3(0, 0, -1).applyQuaternion(group.current.quaternion);
            const angle = Math.atan2(-facing.x, -facing.z);
            const direction = Object.keys(HEADINGS).reduce((best, next) =>
              Math.cos(angle - HEADINGS[next].rotation) > Math.cos(angle - HEADINGS[best].rotation) ? next : best, vehicle.heading);
            onRotate(vehicle.id, direction);
          }}
        />
      )}
    </>
  );
}

function ScenarioClock({ vehicles, running, movingOncoming, onTick, onComplete }) {
  const sinceUpdate = useRef(0);
  const accumulated = useRef(0);
  useFrame((_, delta) => {
    if (!running) return;
    accumulated.current += Math.min(delta, .25);
    while (accumulated.current >= .04) {
      stepScenario(vehicles, .04, movingOncoming ? ONCOMING_FLOW_POLICY : undefined);
      accumulated.current -= .04;
      sinceUpdate.current += .04;
    }
    if (sinceUpdate.current >= .16) {
      sinceUpdate.current = 0;
      onTick(vehicles);
    }
    if (vehicles.filter(vehicle => vehicle.kind === 'ambulance').every(vehicle => vehicle.done)) {
      onTick(vehicles);
      onComplete();
    }
  }, -1);
  return null;
}

export function ScenarioWorkbench({ caseNumber, initialVehicles, resumeOnEdit, importAdjustments = 0, onSave, onMenu, onOriginal }) {
  const [setup, setSetup] = useState(() => snapshot(initialVehicles));
  const [draft, setDraft] = useState(() => snapshot(initialVehicles));
  const [runtime, setRuntime] = useState(null);
  const [editing, setEditing] = useState(true);
  const [freeRoam, setFreeRoam] = useState(false);
  const workbenchRef = useRef(null);
  const [rotating, setRotating] = useState(false);
  const [running, setRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [selection, setSelection] = useState(null);
  const [kind, setKind] = useState('car');
  const [heading, setHeading] = useState('E');
  const [count, setCount] = useState('1');
  const [message, setMessage] = useState(importAdjustments ? `Moved ${importAdjustments} preset placements to open road when importing this copy.` : '');
  const [activity, setActivity] = useState([]);
  const nextId = useRef(Math.max(0, ...initialVehicles.map(vehicle => Number(vehicle.id.match(/\d+$/)?.[0] || 0))) + 1);
  const resume = useRef(resumeOnEdit);
  const changed = useRef(false);

  const vehicles = editing ? draft : runtime || setup;
  const selected = vehicles.find(vehicle => vehicle.id === selection);
  const cars = vehicles.filter(vehicle => vehicle.kind === 'car').length;
  const ambulances = vehicles.length - cars;

  function changeDraft(next) {
    changed.current = true;
    setDraft(next);
    setMessage('');
  }

  function moveVehicle(id, x, z) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return;
    const previous = draft.find(vehicle => vehicle.id === id);
    if (!previous || (Math.abs(previous.x - x) < .005 && Math.abs(previous.z - z) < .005)) return;
    changeDraft(draft.map(vehicle => vehicle.id === id
      ? { ...vehicle, x, z, y: scenarioRoadHeight(x, z, vehicle.heading) } : vehicle));
  }

  function rotateVehicle(id, direction) {
    changeDraft(draft.map(vehicle => vehicle.id === id ? {
      ...vehicle, heading: direction, rotation: HEADINGS[direction].rotation,
      y: scenarioRoadHeight(vehicle.x, vehicle.z, direction),
    } : vehicle));
  }

  function replaceLayout(next) {
    nextId.current = next.length + 1;
    resume.current = false;
    changed.current = false;
    setRunning(false);
    setCompleted(false);
    setEditing(true);
    setRotating(false);
    setSelection(null);
    setRuntime(null);
    setDraft(next);
    setSetup(next);
    setActivity([]);
    setMessage('');
    onSave(next);
  }

  function addVehicles() {
    const requested = Number(count);
    if (!Number.isInteger(requested) || requested < 1) {
      setMessage('Enter a whole number of at least 1.');
      return;
    }
    const next = addScenarioVehicles(draft, kind, requested, heading, nextId.current);
    const added = next.length - draft.length;
    nextId.current += added;
    if (added) {
      changeDraft(next);
      setSelection(next.at(-1).id);
    }
    if (added < requested) setMessage(`Placed ${added} of ${requested}. The starting lanes have limited room.`);
  }

  function launch(placements = editing ? draft : setup) {
    const layout = snapshot(placements);
    const staged = stageScenario(layout);
    if (staged.error) {
      setMessage(staged.error);
      return false;
    }
    setSetup(layout);
    if (changed.current || caseNumber === 4) onSave(layout);
    setRuntime(staged.vehicles);
    setEditing(false);
    setRunning(true);
    setCompleted(false);
    setActivity([]);
    setMessage(staged.adjusted ? `Separated ${staged.adjusted} close placements for this run.` : '');
    changed.current = false;
    return true;
  }

  function toggleFreeRoam() {
    if (!freeRoam) captureFreeRoamMouse(workbenchRef.current?.querySelector('canvas'));
    setFreeRoam(!freeRoam);
  }

  function toggleEdit() {
    if (!editing) {
      if (document.pointerLockElement === workbenchRef.current?.querySelector('canvas')) {
        document.exitPointerLock();
      }
      resume.current = running;
      setRunning(false);
      setDraft(snapshot(runtime || setup));
      setEditing(true);
      setMessage('');
      changed.current = false;
      return;
    }

    if (resume.current) {
      if (!changed.current && runtime) {
        setEditing(false);
        setRunning(true);
      } else if (!launch(draft)) return;
    } else {
      if (changed.current) {
        setSetup(snapshot(draft));
        onSave(snapshot(draft));
        setRuntime(null);
        setCompleted(false);
      }
      setEditing(false);
    }
    resume.current = false;
  }

  useEffect(() => {
    const keydown = event => {
      if (event.repeat || event.target?.closest?.('input,select,textarea,[contenteditable]')) return;
      if (event.code === 'KeyE') {
        event.preventDefault();
        toggleEdit();
      } else if (event.code === 'KeyC') {
        if (!event.ctrlKey && !event.metaKey && !event.altKey) toggleFreeRoam();
      } else if (event.code === 'KeyR' && editing && selection) {
        setRotating(active => !active);
      } else if (event.code === 'Enter' && !running) {
        event.preventDefault();
        launch();
      } else if (event.code === 'KeyF' && runtime && !editing && !completed) {
        setRunning(active => !active);
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });

  const onTick = useCallback(current => {
    setActivity(current.filter(vehicle => vehicle.kind === 'ambulance' ||
      ['Yielding', 'Waiting for a gap', 'Holding the rescue lane', 'Making room for a neighbor'].includes(vehicle.status) ||
      vehicle.status.endsWith(' to open a gap') ||
      vehicle.id === selection)
      .sort((a, b) => diagnosticPriority(a) - diagnosticPriority(b))
      .map(vehicle => ({ id: vehicle.id, status: driverStatus(vehicle) })));
  }, [selection]);
  const onComplete = useCallback(() => {
    setRunning(false);
    setCompleted(true);
  }, []);

  function leave() {
    if (editing && changed.current) onSave(snapshot(draft));
    onMenu();
  }

  return (
    <main ref={workbenchRef} className="relative h-screen overflow-hidden bg-slate-950 text-slate-100">
      <Canvas
        dpr={1}
        camera={{ position: [-17, 83, 22], fov: 45 }}
        onPointerMissed={event => {
          if (document.pointerLockElement || event.button !== 0) return;
          setSelection(null);
          if (freeRoam) captureFreeRoamMouse(workbenchRef.current?.querySelector('canvas'));
        }}
      >
        <color attach="background" args={['#0d172a']} />
        <ambientLight intensity={1.25} />
        <directionalLight position={[42, 75, 35]} intensity={1.2} />
        {freeRoam ? <FreeRoamFlightCamera editing={editing} /> :
          <OrbitControls makeDefault target={[-17, 0, 4]} minDistance={8} maxDistance={210} maxPolarAngle={Math.PI / 2.15} />}
        <Suspense fallback={<Html center><span className="whitespace-nowrap rounded bg-slate-950 px-3 py-2 text-sm">Loading city…</span></Html>}>
          <CityScene />
          {vehicles.map(vehicle => (
            <ScenarioVehicle key={vehicle.id} vehicle={vehicle} editing={editing} selected={selection === vehicle.id}
              onSelect={setSelection} onMove={moveVehicle} onRotate={rotateVehicle} rotating={rotating} />
          ))}
          <ScenarioClock vehicles={runtime || []} running={running && !editing} movingOncoming={caseNumber === 4} onTick={onTick} onComplete={onComplete} />
        </Suspense>
      </Canvas>
      <section aria-label="Scenario controls" className="absolute left-4 top-4 max-h-[calc(100%-2rem)] w-80 max-w-[calc(100%-2rem)] overflow-auto rounded-xl border border-sky-400/35 bg-slate-950/95 p-4 text-sm shadow-2xl">
        <div className="flex items-start justify-between gap-2">
          <div><span className="font-mono text-xs text-sky-300">CASE 0{caseNumber}</span><h1 className="font-semibold">{caseNumber === 4 ? 'Custom scenarios' : 'Scenario editor'}</h1></div>
          <button className={control} onClick={leave}>Menu</button>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className={control} onClick={toggleEdit}>{editing ? 'Finish edit [E]' : 'Edit [E]'}</button>
          <button className={control} onClick={toggleFreeRoam}>{freeRoam ? 'Orbit view [C]' : 'Free roam [C]'}</button>
          <button className={primary} onClick={() => launch()} disabled={running}>
            {runtime && !editing ? 'Restart' : 'Run [Enter]'}
          </button>
          {runtime && !editing && !completed && <button className={control} onClick={() => setRunning(active => !active)}>{running ? 'Pause [F]' : 'Resume [F]'}</button>}
          {runtime && !editing && !completed && (
            <button className={control} onClick={() => {
              if (requestAmbulanceBackout(runtime)) {
                setMessage('Ambulance reversing along its approach.');
                setRunning(true);
              } else {
                setMessage('The ambulance needs a recorded approach before it can reverse.');
              }
            }}>Reverse out</button>
          )}
          {onOriginal && <button className={control} onClick={onOriginal}>Original demo</button>}
        </div>
        {caseNumber === 4 && (
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={control} onClick={() => replaceLayout([])}>Reset</button>
            <button className={control} onClick={() => replaceLayout(createSavedDenseFlowScenario())}>Load dense one-way example</button>
          </div>
        )}
        <div className="mt-2 text-xs text-slate-300">
          {freeRoam ? 'WASD to fly · Mouse to look · Esc frees cursor · Click empty view to recapture' :
            editing ? 'Select a vehicle, then drag its arrows on the road.' : running ? 'Running' : completed ? 'Run complete' : 'Ready to run'}
          {' · '}{cars} {cars === 1 ? 'car' : 'cars'} · {ambulances} {ambulances === 1 ? 'ambulance' : 'ambulances'}
        </div>
        {editing && (
          <div className="mt-4 space-y-3 border-t border-slate-700 pt-3">
            <div className="grid grid-cols-[1fr_1fr_64px] gap-2">
              <label className="text-xs">Vehicle<select className={`mt-1 w-full ${control}`} value={kind} onChange={event => setKind(event.target.value)}><option value="car">Car</option><option value="ambulance">Ambulance</option></select></label>
              <label className="text-xs">Heading<select className={`mt-1 w-full ${control}`} value={heading} onChange={event => setHeading(event.target.value)}>
                {Object.entries(directions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select></label>
              <label className="text-xs">Count<input className={`mt-1 w-full ${control}`} type="number" min="1" step="1" value={count} onChange={event => setCount(event.target.value)} /></label>
            </div>
            <button className={primary} onClick={addVehicles}>Add vehicles</button>
            {!!draft.length && (
              <label className="block text-xs">Selected vehicle<select className={`mt-1 w-full ${control}`} value={selection || ''} onChange={event => setSelection(event.target.value || null)}>
                <option value="">Select a vehicle</option>
                {draft.map(vehicle => <option key={vehicle.id} value={vehicle.id}>{vehicle.id}</option>)}
              </select></label>
            )}
            {selected && (
              <div className="space-y-2">
                {selected.kind === 'car' && <label className="flex items-center gap-2 text-xs">
                  <input type="checkbox" checked={Boolean(selected.parked)} onChange={event =>
                    changeDraft(draft.map(vehicle => vehicle.id === selected.id ? { ...vehicle, parked: event.target.checked } : vehicle))
                  } />
                  Parked obstacle
                </label>}
                <button className={control} onClick={() => setRotating(active => !active)}>{rotating ? 'Move [R]' : 'Rotate [R]'}</button>
                <button className={control} onClick={() => rotateVehicle(selected.id, { N: 'S', E: 'W', S: 'N', W: 'E' }[selected.heading])}>Turn 180°</button>
                <div className="grid grid-cols-2 gap-2">
                  <CoordinateInput key={`x-${selected.id}`} label="Position X" value={selected.x} onCommit={value => moveVehicle(selected.id, value, selected.z)} />
                  <CoordinateInput key={`z-${selected.id}`} label="Position Z" value={selected.z} onCommit={value => moveVehicle(selected.id, selected.x, value)} />
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex-1 text-xs">Vehicle heading<select className={`mt-1 w-full ${control}`} value={selected.heading} onChange={event => rotateVehicle(selected.id, event.target.value)}>
                    {Object.entries(directions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select></label>
                  <button className={control} onClick={() => { changeDraft(draft.filter(vehicle => vehicle.id !== selected.id)); setSelection(null); }}>Remove selected</button>
                </div>
              </div>
            )}
          </div>
        )}
        {message && <p role="status" className="mt-3 rounded border border-amber-400/40 bg-amber-400/10 p-2 text-xs text-amber-100">{message}</p>}
        {!editing && !!activity.length && <ul aria-label="Driver actions" className="mt-3 max-h-40 space-y-1 overflow-auto border-t border-slate-700 pt-2 text-xs">
          {activity.map(({ id, status }) => <li className="flex justify-between gap-2" key={id}><span>{id}</span><span className="text-sky-300">{status}</span></li>)}
        </ul>}
      </section>
    </main>
  );
}
