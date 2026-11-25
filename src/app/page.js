"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useV2XBroadcaster } from '../../hooks/useV2XSync';
import { useTrafficStream } from '../../hooks/useTrafficStream';
import { useTrafficSignal } from '../../hooks/useTrafficSignal';
import { useCase3TrafficStream } from '../../hooks/useCase3TrafficStream';
import { useHardwareSerial } from '../../hooks/useHardwareSerial';
import { useHardwareWifi } from '../../hooks/useHardwareWifi';
import CoordinationQueue from '../../components/CoordinationQueue';
import OperationsHeader from '../../components/OperationsHeader';
import { ArrowUpRight, Route, GitBranch, Timer, SlidersHorizontal, MapPin } from 'lucide-react';
import { Canvas3D } from '../../components/Canvas3D';
import { case2TrafficSignal, createCase2Simulation, stepCase2 } from '../../components/case2Simulation';
import { ScenarioWorkbench } from '../../components/ScenarioWorkbench';
import { HEADINGS, prepareImportedScenario, scenarioVehicle } from '../../components/scenarioTraffic';

function Case2HUD({ simulation, frozen, dispatch, toggleFreeze, onReset, onBackToMenu, onSwitchCase }) {
  const { phase, northStatus } = simulation;
  const { eGreen: eastGreen, nGreen: northGreen, eYellow, nYellow } = case2TrafficSignal(simulation);
  const active = phase !== 'ready' && phase !== 'complete';
  const eastStatus = {
    ready: 'Ready',
    approach: 'Approaching the junction',
    eastGreen: 'Priority · green corridor',
    eastClearance: 'Junction traffic clearing',
  }[phase] || 'Junction clear · hospital-bound';

  return (
    <section aria-label="Case 2 controls" className="twin-card twin-instrument text-xs">
      <div className="instrument-nav">
        <button onClick={onBackToMenu}>← Overview</button>
        <button onClick={() => onSwitchCase(3)}>Switch case ↗</button>
      </div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="font-bold text-blue-300">CASE 02 · DUAL AMBULANCE</span>
        {phase !== 'ready' && <button onClick={onReset} className="rounded bg-slate-800 px-2 py-1 text-slate-200">Reset</button>}
      </div>
      <div aria-live="polite" className="space-y-3">
        {[
          { direction: 'Eastbound', green: eastGreen, yellow: eYellow, status: eastStatus },
          { direction: 'Northbound', green: northGreen, yellow: nYellow, status: northStatus },
        ].map(({ direction, green, yellow, status }) => (
          <div key={direction} className="border-t border-slate-700 pt-2">
            <div className="flex items-center justify-between font-bold text-slate-100">
              {direction}
              <span className={green ? 'text-green-400' : yellow ? 'text-amber-300' : 'text-red-400'}>{green ? 'GREEN' : yellow ? 'YELLOW' : 'RED'}</span>
            </div>
            <div className="mt-1 text-slate-300">{status}</div>
          </div>
        ))}
      </div>
      {simulation.traffic && <p className="mt-2 text-emerald-300">Normal traffic cycle</p>}
      <div className="mt-4 flex gap-2">
        <button onClick={dispatch} disabled={active} className="flex-1 rounded bg-blue-300 px-2 py-2 font-bold text-slate-950 disabled:bg-slate-800 disabled:text-slate-300">
          {phase === 'ready' ? 'Run simulation [Enter]' : phase === 'complete' ? 'Run again [Enter]' : 'Simulation running'}
        </button>
        {active && (
          <button onClick={toggleFreeze} className="rounded bg-slate-800 px-2 py-2 text-slate-100">
            {frozen ? 'Resume [F]' : 'Pause [F]'}
          </button>
        )}
      </div>
    </section>
  );
}

function TwinPanel({ id, title, onBackToMenu, onSwitchCase, children }) {
  return <aside className="twin-card twin-instrument">
    <div className="instrument-nav"><button onClick={onBackToMenu}>← Overview</button>
      <button onClick={() => onSwitchCase(id === 1 ? 2 : id === 2 ? 3 : 1)}>Switch case ↗</button></div>
    <small>Simulation desk · Case 0{id}</small><h1>{title}</h1>{children}
  </aside>;
}

function ArmSignals({ signals }) {
  return <div className="instrument-signals">{[['North','s'],['East','w'],['South','n'],['West','e']].map(([label, arm]) => {
    const phase = signals[arm + 'Green'] ? 'Open' : signals[arm + 'Yellow'] ? 'Changing' : 'Hold';
    return <div key={label}><span>{label}</span><b data-phase={phase}>{phase}</b></div>;
  })}</div>;
}

function Case1SignalHUD({ signals, stream, start, dispatch, demoMode, onToggleDemo, onRunDemo, onResetDemo, onBackToMenu, onSwitchCase }) {
  const phase = signals.phase.replaceAll('_', ' ').toLowerCase();
  return <TwinPanel id={1} title="Ambulance priority" onBackToMenu={onBackToMenu} onSwitchCase={onSwitchCase}>
    <p className="instrument-note">M.G. Road · west approach</p>
    {demoMode ? (
      <div className="instrument-demo-controls">
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onRunDemo} disabled={stream.isSimulationRunning} className="instrument-dispatch !m-0 flex-1">
            <span>{stream.isSimulationRunning ? 'Demo running' : 'Run demo'}</span><kbd>Enter</kbd>
          </button>
          {stream.isSimulationRunning && (
            <button type="button" onClick={stream.toggleFreeze} className="px-2 py-2 text-xs">
              {stream.isFrozen ? 'Resume [F]' : 'Pause [F]'}
            </button>
          )}
          {(stream.isSimulationRunning || signals.phase !== 'ALL_RED') && (
            <button type="button" onClick={onResetDemo} className="px-2 py-2 text-xs">Reset</button>
          )}
        </div>
      </div>
    ) : (
      <CoordinationQueue className="instrument-dispatch" start={start} currentDispatchId={dispatch?.id} busy={stream.isSimulationRunning}/>
    )}
    <div className="instrument-stat">
      <span>Demo mode</span>
      <button type="button" aria-pressed={demoMode} onClick={() => onToggleDemo(!demoMode)} className="px-2 py-1 text-[11px]">
        {demoMode ? 'On · skip intake' : 'Off · hospital queue'}
      </button>
    </div>
    <div className="instrument-stat"><span>Signal phase</span><strong>{phase}</strong></div>
    <ArmSignals signals={signals}/>
    {signals.phase.includes('RELEASE') && <div className="instrument-stat"><span>Next phase</span><strong>{signals.timeRemaining} s</strong></div>}
  </TwinPanel>;
}

function Case3TelemetryHUD({ case3, start, dispatch, demoMode, onToggleDemo, onRunDemo, onResetDemo, onBackToMenu, onSwitchCase }) {
  const { ambulanceA, ambulanceB, trafficCycleActive, signals, metrics } = case3;
  const activeDispatch = case3.isSimulationRunning && !trafficCycleActive;
  return <TwinPanel id={3} title="Dual response" onBackToMenu={onBackToMenu} onSwitchCase={onSwitchCase}>
    <p className="instrument-note">Brigade corridor · Cubbon detour</p>
    {demoMode ? (
      <div className="instrument-demo-controls">
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={onRunDemo} disabled={activeDispatch} className="instrument-dispatch !m-0 flex-1">
            <span>{activeDispatch ? 'Demo running' : trafficCycleActive ? 'Run demo again' : 'Run demo'}</span><kbd>Enter</kbd>
          </button>
          {case3.isSimulationRunning && (
            <button type="button" onClick={case3.toggleFreeze} className="px-2 py-2 text-xs">
              {case3.isFrozen ? 'Resume [F]' : 'Pause [F]'}
            </button>
          )}
          {case3.isSimulationRunning && (
            <button type="button" onClick={onResetDemo} className="px-2 py-2 text-xs">Reset</button>
          )}
        </div>
      </div>
    ) : (
      <CoordinationQueue className="instrument-dispatch" start={start} currentDispatchId={dispatch?.id} busy={activeDispatch}/>
    )}
    <div className="instrument-stat">
      <span>Demo mode</span>
      <button type="button" aria-pressed={demoMode} onClick={() => onToggleDemo(!demoMode)} className="px-2 py-1 text-[11px]">
        {demoMode ? 'On · skip intake' : 'Off · hospital queue'}
      </button>
    </div>
    {trafficCycleActive ? <><div className="instrument-stat"><span>Both units delivered</span><strong>{signals.timeRemaining} s</strong></div><p>{signals.phaseLabel}</p><ArmSignals signals={signals}/></> :
      [ambulanceA, ambulanceB].map((unit, i) => <section className="instrument-unit" key={unit.id}>
        <div><strong>{i ? 'Unit B · Trauma' : 'Unit A · Cardiac'}</strong><small>{unit.status.replaceAll('_',' ').toLowerCase()}</small></div>
        <p>{i ? unit.waypointName : 'Brigade Road · south approach'}</p>
        <small>X {unit.position.x.toFixed(1)}　Z {unit.position.z.toFixed(1)}{i ? '　Leg ' + (unit.currentWaypointIdx + 1) + ' / 5' : ''}</small>
      </section>)}
    <details className="instrument-details"><summary>Detour comparison</summary>
      {[['Direct junction delay', metrics.directJunctionDelaySec],['Detour duration', metrics.macroDetourDurationSec],['Clearance saved', metrics.netTimeSavedSec]].map(([label,value]) =>
        <div className="instrument-stat" key={label}><span>{label}</span><strong>{value} s</strong></div>)}</details>
  </TwinPanel>;
}

export default function Dashboard() {
  const [started, setStarted] = useState(false);
  const [selectedCase, setSelectedCase] = useState(1);
  const [dispatch, setDispatch] = useState(null);
  const [demoMode, setDemoMode] = useState(false);
  const lastDispatchId = useRef(null);
  const [editor, setEditor] = useState(null);
  const scenarioLayouts = useRef({});

  useEffect(() => {
    try {
      setDemoMode(window.localStorage.getItem('SEMTOS_DEMO_MODE_V1') === '1');
    } catch (_) {}
  }, []);

  const updateDemoMode = useCallback((nextValue) => {
    setDemoMode(prev => {
      const next = typeof nextValue === 'function' ? Boolean(nextValue(prev)) : Boolean(nextValue);
      try {
        window.localStorage.setItem('SEMTOS_DEMO_MODE_V1', next ? '1' : '0');
      } catch (_) {}
      return next;
    });
  }, []);

  // Case 1 Hooks
  const case1Stream = useTrafficStream(started && selectedCase === 1 && !editor);
  const case1Signal = useTrafficSignal();

  // Case 3 Hook
  const case3 = useCase3TrafficStream(started && selectedCase === 3 && !editor);
  const [case2, setCase2] = useState(createCase2Simulation);
  const [case2Frozen, setCase2Frozen] = useState(false);
  const [, setCase2Revision] = useState(0);
  const lastCase2FrameRef = useRef(0);
  const onCase2Change = useCallback((shouldRender = true) => {
    lastCase2FrameRef.current = performance.now();
    if (shouldRender) setCase2Revision(value => value + 1);
  }, []);
  const dispatchCase2 = useCallback(() => {
    setCase2Frozen(false);
    lastCase2FrameRef.current = performance.now();
    setCase2(current => {
      if (current.phase !== 'ready' && current.phase !== 'complete') return current;
      return { ...createCase2Simulation(), phase: 'approach', northStatus: 'Approaching the junction' };
    });
  }, []);
  const toggleCase2Freeze = useCallback(() => setCase2Frozen(frozen => !frozen), []);
  const resetCase2 = useCallback(() => {
    setCase2(createCase2Simulation());
    setCase2Frozen(false);
  }, []);

  const dispatchDemo = useCallback((requestedCase) => {
    if (editor) return;
    const target = [1, 2, 3].includes(requestedCase) ? requestedCase : selectedCase === 4 ? 1 : selectedCase;
    lastDispatchId.current = null;
    setDispatch(null);
    case1Stream.resetCase1();
    case1Signal.resetSignals();
    setCase2(createCase2Simulation());
    setCase2Frozen(false);
    case3.resetCase3();
    setEditor(null);
    setSelectedCase(target);
    setStarted(true);
    if (target === 1) {
      case1Stream.dispatchCase1();
    } else if (target === 2) {
      lastCase2FrameRef.current = performance.now();
      setCase2({ ...createCase2Simulation(), phase: 'approach', northStatus: 'Approaching the junction' });
    } else if (target === 3) {
      case3.dispatchCase3();
    }
  }, [editor, selectedCase, case1Stream, case1Signal, case3]);

  const resetDemo = useCallback((requestedCase) => {
    const target = [1, 2, 3].includes(requestedCase) ? requestedCase : selectedCase;
    lastDispatchId.current = null;
    setDispatch(null);
    case1Stream.resetCase1();
    case1Signal.resetSignals();
    setCase2(createCase2Simulation());
    setCase2Frozen(false);
    case3.resetCase3();
    if ([1, 2, 3].includes(target)) {
      setEditor(null);
      setSelectedCase(target);
      setStarted(true);
    }
  }, [selectedCase, case1Stream, case1Signal, case3]);

  useEffect(() => {
    if (!started || editor || !demoMode || (selectedCase !== 1 && selectedCase !== 3)) return;
    const onDemoKeyDown = (event) => {
      if (event.repeat || event.target?.closest?.('input,textarea,select,dialog,[contenteditable],button')) return;
      if (event.code !== 'Enter') return;
      if (selectedCase === 1 && !case1Stream.isSimulationRunning) {
        event.preventDefault();
        dispatchDemo(1);
      } else if (selectedCase === 3 && (!case3.isSimulationRunning || case3.trafficCycleActive)) {
        event.preventDefault();
        dispatchDemo(3);
      }
    };
    window.addEventListener('keydown', onDemoKeyDown);
    return () => window.removeEventListener('keydown', onDemoKeyDown);
  }, [started, editor, demoMode, selectedCase, case1Stream.isSimulationRunning, case3.isSimulationRunning, case3.trafficCycleActive, dispatchDemo]);

  // Keep Case 2 progressing smoothly even when `/` is a background tab (e.g. while viewing /ambulance)
  useEffect(() => {
    if (!started || selectedCase !== 2 || editor || case2Frozen) return;
    if (case2.phase === 'ready' || case2.phase === 'complete') return;

    let lastStep = performance.now();
    const timer = setInterval(() => {
      const now = performance.now();
      if (now - lastCase2FrameRef.current < 250) {
        lastStep = now;
        return;
      }
      let remaining = Math.min(1.0, Math.max(0.05, (now - lastStep) / 1000));
      lastStep = now;
      while (remaining > 0) {
        const step = Math.min(remaining, 0.05);
        stepCase2(case2, step);
        remaining -= step;
      }
      setCase2Revision(value => value + 1);
    }, 100);

    return () => clearInterval(timer);
  }, [started, selectedCase, editor, case2, case2Frozen, case2.phase]);

  useEffect(() => {
    if (!started || selectedCase !== 2 || editor) return;
    const onKeyDown = (event) => {
      if (event.repeat || event.target?.closest?.('input,textarea,select,dialog,[contenteditable]')) return;
      if (event.code === 'Enter') {
        if (event.target?.closest?.('button')) return;
        event.preventDefault();
        dispatchCase2();
      } else if (event.code === 'KeyF' && case2.phase !== 'ready') {
        toggleCase2Freeze();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [started, selectedCase, editor, case2, dispatchCase2, toggleCase2Freeze]);

  const vehiclesRef = useRef([]);

  const beginEdit = useCallback(() => {
    const saved = scenarioLayouts.current[selectedCase];
    if (saved) {
      setEditor({ vehicles: saved, resume: false });
      return;
    }
    const traffic = (selectedCase === 2 ? case2.cars : vehiclesRef.current).map(car =>
      scenarioVehicle(`Car ${car.id}`, 'car', car.pos.x, car.pos.z, car.type, car.modelIdx, car.pos.y)
    );
    const ambulances = selectedCase === 1 ? [case1Stream.ambulancePosition]
      : selectedCase === 2 ? [case2.east, case2.north] : [case3.ambulanceA.position, case3.ambulanceB.position];
    for (const [index, position] of ambulances.entries()) {
      const heading = Object.keys(HEADINGS).reduce((best, direction) =>
        Math.cos(position.rotation - HEADINGS[direction].rotation) > Math.cos(position.rotation - HEADINGS[best].rotation)
          ? direction : best, 'N');
      traffic.push(scenarioVehicle(`Ambulance ${index + 1}`, 'ambulance', position.x, position.z, heading, 0, position.y));
    }
    const running = selectedCase === 1 ? case1Stream.isSimulationRunning && !case1Stream.isFrozen
      : selectedCase === 2 ? case2.phase !== 'ready' && case2.phase !== 'complete' && !case2Frozen
      : case3.isSimulationRunning && !case3.isFrozen;
    setEditor({ ...prepareImportedScenario(traffic), resume: running });
  }, [selectedCase, case1Stream, case2, case2Frozen, case3]);

  const backToOverview = useCallback(() => {
    if (case1Stream.isSimulationRunning || case1Signal.phase !== 'ALL_RED') {
      case1Stream.resetCase1();
      case1Signal.resetSignals();
      if (dispatch?.caseId === 1) {
        lastDispatchId.current = null;
        setDispatch(null);
      }
    }
    if (case3.isSimulationRunning) {
      case3.resetCase3();
      if (dispatch?.caseId === 3) {
        lastDispatchId.current = null;
        setDispatch(null);
      }
    }
    if (case2.phase !== 'ready') {
      setCase2(createCase2Simulation());
      setCase2Frozen(false);
    }
    setEditor(null);
    setStarted(false);
    if (selectedCase === 4) setSelectedCase(1);
  }, [case1Stream, case1Signal, case3, case2.phase, dispatch?.caseId, selectedCase]);

  const switchCase = useCallback((nextCase) => {
    if (nextCase !== 1 && (case1Stream.isSimulationRunning || case1Signal.phase !== 'ALL_RED')) {
      case1Stream.resetCase1();
      case1Signal.resetSignals();
      if (dispatch?.caseId === 1) {
        lastDispatchId.current = null;
        setDispatch(null);
      }
    }
    if (nextCase !== 2 && case2.phase !== 'ready') {
      setCase2(createCase2Simulation());
      setCase2Frozen(false);
    }
    if (nextCase !== 3 && case3.isSimulationRunning) {
      case3.resetCase3();
      if (dispatch?.caseId === 3) {
        lastDispatchId.current = null;
        setDispatch(null);
      }
    }
    setEditor(null);
    setSelectedCase(nextCase);
    setStarted(true);
  }, [case1Stream, case1Signal, case2.phase, case3, dispatch?.caseId]);

  const startDispatch = useCallback(record => {
    if (lastDispatchId.current === record.id) return;
    if (editor) throw new Error('Leave the scenario editor before starting coordination.');
    const active = case1Stream.isSimulationRunning ||
      (case2.phase !== 'ready' && case2.phase !== 'complete') ||
      (case3.isSimulationRunning && !case3.trafficCycleActive);
    if (active) throw new Error('A dispatch is already active in this scenario.');
    if (record.caseId === 1) {
      case3.resetCase3();
      setCase2(createCase2Simulation());
      setCase2Frozen(false);
    } else {
      case1Stream.resetCase1();
      case1Signal.resetSignals();
      setCase2(createCase2Simulation());
      setCase2Frozen(false);
    }
    lastDispatchId.current = record.id;
    setDispatch(record);
    setSelectedCase(record.caseId);
    setStarted(true);
    if (record.caseId === 1) case1Stream.dispatchCase1();
    else case3.dispatchCase3();
  }, [case1Stream, case1Signal, case2.phase, case3, editor]);

  const handleRemoteCommand = useCallback((command, payload = {}) => {
    if (command === 'SET_DEMO_MODE') {
      updateDemoMode(Boolean(payload.enabled));
    } else if ((command === 'SWITCH_CASE' || command === 'SET_CASE') && (payload.caseId || payload.caseNumber)) {
      const number = Number(payload.caseId || payload.caseNumber);
      if (![1, 2, 3, 4].includes(number)) return;
      switchCase(number);
    } else if (editor || (started && selectedCase === 4)) {
      return;
    } else if (command === 'DISPATCH_CASE2') {
      if (selectedCase !== 2 || case2.phase === 'ready' || case2.phase === 'complete') {
        dispatchDemo(2);
      }
    } else if (command === 'DISPATCH_DEMO') {
      dispatchDemo(Number(payload.caseId) || undefined);
    } else if (command === 'RESET_DEMO') {
      resetDemo(Number(payload.caseId) || undefined);
    } else if (command === 'DISPATCH' && payload.dispatch) {
      try { startDispatch(payload.dispatch); } catch (error) { console.warn(error.message); }
    } else if (command === 'NORMAL_CYCLE') {
      if (selectedCase === 1) {
        case1Signal.onNormalCycle?.();
      }
    } else if (command === 'FREEZE') {
      if (selectedCase === 1) {
        case1Stream.toggleFreeze?.();
      } else if (selectedCase === 2) {
        toggleCase2Freeze();
      } else {
        case3.toggleFreeze();
      }
    }
  }, [started, selectedCase, editor, case1Stream, case1Signal, case2.phase, case3, startDispatch, switchCase, toggleCase2Freeze, updateDemoMode, dispatchDemo, resetDemo]);

  // ESP32 Web Serial Hardware Synchronization (Zero-Fail Fallback)
  const {
    isConnected: isSerialConnected,
    portName: serialPortName,
    lastByteSent: serialLastByte,
    connectESP32,
    disconnectESP32,
    sendByteCommand,
  } = useHardwareSerial();

  // ESP32 Wi-Fi V2I HTTP Actuation (Wireless Hotspot Demo)
  const {
    espIp,
    updateEspIp,
    isWifiEnabled,
    toggleWifi,
    lastWifiByteSent,
    wifiStatus,
    lastResponseTime,
    isConnecting: isWifiConnecting,
    lastError: wifiLastError,
    linkSuccess: wifiLinkSuccess,
    saveAndLink,
    sendWifiCommand,
    testPing,
  } = useHardwareWifi();

  const [showHardwareMenu, setShowHardwareMenu] = useState(false);
  const [showPhoneQrModal, setShowPhoneQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [networkInfo, setNetworkInfo] = useState({
    ip: '',
    driverUrl: '',
    ambulanceUrl: '',
  });

  useEffect(() => {
    fetch('/api/network-ip')
      .then(r => r.json())
      .then(data => {
        if (data?.ip) setNetworkInfo(data);
      })
      .catch(() => setNetworkInfo({
        ip: window.location.hostname,
        driverUrl: new URL('/driver', window.location.origin).href,
        ambulanceUrl: new URL('/ambulance', window.location.origin).href,
      }));
  }, []);

  // Live 20Hz V2X Telemetry Broadcaster to /ambulance and /driver dashboards
  useV2XBroadcaster({
    selectedCase: editor ? 4 : (!started && selectedCase === 4) ? 1 : selectedCase,
    case1Stream,
    case1Signal,
    case2,
    case2Frozen,
    readCase2Signals: case2TrafficSignal,
    case3,
    vehiclesRef,
    espIp,
    isWifiEnabled,
    lastWifiByteSent,
    serialLastByte,
    isSerialConnected,
    onRemoteCommand: handleRemoteCommand,
    dispatch: dispatch?.caseId === selectedCase ? dispatch : null,
    demoMode,
  });
  const [tempIp, setTempIp] = useState(espIp);

  useEffect(() => {
    setTempIp(espIp);
  }, [espIp]);

  const { registerCallbacks } = case1Stream;
  const { onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle } = case1Signal;
  useEffect(() => {
    if (selectedCase === 1) {
      registerCallbacks(onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle);
    }
  }, [selectedCase, registerCallbacks, onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle]);

  // Synchronize simulation signal states in real-time to physical ESP32
  useEffect(() => {
    let targetByte = 'R';

    if (started && !editor && selectedCase === 1) {
      // ── In CASE 01 (West Approach Monitoring): ──────────────────────────
      // - If signalPhase === 'W_GREEN' or signalPhase === 'E_RESUME': send 'P'.
      // - If signalPhase === 'W_RELEASE': send 'G'.
      // - If transitioning from West Green (Yellow phase): send 'Y'.
      // - For all other phases (ALL_RED, N_RELEASE, S_RELEASE, E_RELEASE): send 'R'.
      const phase = case1Signal.phase;
      const signalPhase = case1Signal.signalPhase;

      if (phase === 'W_GREEN' || phase === 'E_RESUME' || (signalPhase === 'W_GREEN' && phase !== 'NORMAL_CYCLE')) {
        targetByte = 'P';
      } else if (case1Signal.wYellow) {
        targetByte = 'Y';
      } else if (phase === 'W_RELEASE' || signalPhase === 'W_RELEASE' || (phase === 'NORMAL_CYCLE' && case1Signal.wGreen)) {
        targetByte = 'G';
      } else {
        targetByte = 'R';
      }
    } else if (started && !editor && selectedCase === 2) {
      const c2Sig = case2TrafficSignal(case2);
      if (case2.phase === 'eastGreen' || case2.phase === 'northGreen') {
        targetByte = 'P';
      } else if (c2Sig.eYellow) {
        targetByte = 'Y';
      } else if (c2Sig.eGreen) {
        targetByte = 'G';
      } else {
        targetByte = 'R';
      }
    } else if (started && !editor && selectedCase === 3) {
      // ── In CASE 03 (Ambulance A South Corridor & Post-Clearance Cycle): ──
      // - Before dispatch (IDLE_STANDBY / ALL_RED): send 'R'.
      // - Upon [ENTER] dispatch while Ambulance A's corridor is flushing: send 'P'.
      // - During Post-Clearance Normal Traffic Orchestration:
      //   - When monitored approach is Green: send 'G'.
      //   - During Yellow transition: send 'Y'.
      //   - When Red: send 'R'.
      if (!case3.isSimulationRunning || case3.signals.phase === 'ALL_RED') {
        targetByte = 'R';
      } else if (!case3.trafficCycleActive) {
        targetByte = 'P';
      } else {
        // Monitored approach is South approach corridor
        if (case3.signals.nYellow) {
          targetByte = 'Y';
        } else if (case3.signals.nGreen) {
          targetByte = 'G';
        } else {
          targetByte = 'R';
        }
      }
    }

    sendByteCommand(targetByte);
    sendWifiCommand(targetByte);
  }, [
    started,
    selectedCase,
    editor,
    isSerialConnected,
    isWifiEnabled,
    case1Signal.phase,
    case1Signal.signalPhase,
    case1Signal.wGreen,
    case1Signal.wYellow,
    case2,
    case2.phase,
    case2.traffic?.index,
    case2.traffic?.stage,
    case3.isSimulationRunning,
    case3.trafficCycleActive,
    case3.signals.phase,
    case3.signals.nGreen,
    case3.signals.nYellow,
    sendByteCommand,
    sendWifiCommand
  ]);

  if (!started) {
    const cases = [
      { id: 1, icon: Route, title: 'Ambulance priority', description: 'Clear the M.G. Road approach for a single emergency vehicle.' },
      { id: 2, icon: Timer, title: 'Dual-ambulance priority handoff', description: 'Clear the eastbound unit first, then release the northbound approach.' },
      { id: 3, icon: GitBranch, title: 'Dual ambulance response', description: 'Give one unit priority and route the second through Cubbon Road.' },
      { id: 4, icon: SlidersHorizontal, title: 'Custom scenario builder', description: 'Place vehicles, choose their headings, and test how traffic yields.' },
    ];
    return <main className="operations overview">
      <OperationsHeader/>
      <div className="overview-content">
        <section className="atlas-hero"><div className="atlas-copy">
          <span className="kicker"><span className="index-rule"/> Bengaluru, Karnataka</span>
          <h1>Traffic <br/>operations<span>.</span></h1>
          <p>Emergency response and signal control along the M.G. Road corridor.</p>
          <a className="hero-link" href="/driver">Open commuter map <ArrowUpRight size={17}/></a>
        </div><figure className="atlas-map"><img src="/maps/corridor-atlas.svg" alt="Corridor map linking Brigade junction, Kamaraj Road and Central Street"/>
          <figcaption><MapPin size={13}/> Central Bengaluru <a href="https://www.openstreetmap.org/copyright">© OpenStreetMap</a></figcaption></figure></section>
        <div className="overview-grid"><section className="scenarios"><div className="section-heading"><h2>Simulation desk</h2><span>3D digital twin</span></div>
          {cases.map(({ id, icon: Icon, title, description, pending }) => <button key={id} className="case-row" disabled={pending}
            onClick={() => {
              const layout = scenarioLayouts.current[id];
              setSelectedCase(id);
              setEditor(layout ? { vehicles: layout, resume: false } : null);
              setStarted(true);
            }}>
            <i className="case-symbol"><Icon size={22}/></i><span className="case-info"><small>Case 0{id}</small><strong>{title}</strong><span>{description}</span></span>
            {pending ? <small>Planned</small> : <ArrowUpRight size={19}/>}
          </button>)}</section>
          <section className="field-views"><div className="section-heading"><h2>Field views</h2></div>
            <div className="overview-queue">
              <button
                type="button"
                className="demo-toggle"
                style={{ width: '100%' }}
                aria-pressed={demoMode}
                onClick={() => updateDemoMode(v => !v)}
              >
                Demo mode: {demoMode ? 'On · no hospital intake needed' : 'Off · uses hospital departures'}
              </button>
              {demoMode ? (
                <div className="demo-grid">
                  {[1, 2, 3].map(caseNum => (
                    <button
                      key={caseNum}
                      type="button"
                      className="primary-action"
                      onClick={() => dispatchDemo(caseNum)}
                    >
                      Run Case 0{caseNum}
                    </button>
                  ))}
                </div>
              ) : (
                <CoordinationQueue className="primary-action overview-queue" start={startDispatch} currentDispatchId={dispatch?.id} busy={case1Stream.isSimulationRunning || (case3.isSimulationRunning && !case3.trafficCycleActive)}/>
              )}
            </div>
            <a href="/driver"><span><small>For commuters</small><strong>Live traffic map</strong></span><ArrowUpRight size={19}/></a>
            <a href="/ambulance"><span><small>For response units</small><strong>Ambulance desk</strong></span><ArrowUpRight size={19}/></a>
          </section></div>
      </div></main>;
  }

  if (editor || selectedCase === 4) {
    return (
      <ScenarioWorkbench
        key={selectedCase}
        caseNumber={selectedCase}
        initialVehicles={editor?.vehicles || scenarioLayouts.current[selectedCase] || []}
        resumeOnEdit={editor?.resume ?? false}
        importAdjustments={editor?.adjusted ?? 0}
        onSave={vehicles => { scenarioLayouts.current[selectedCase] = vehicles; }}
        onMenu={backToOverview}
        onOriginal={selectedCase !== 4 ? () => setEditor(null) : undefined}
      />
    );
  }

  const case2Signals = case2TrafficSignal(case2);
  const signals = selectedCase === 1 ? case1Signal : selectedCase === 2 ? case2Signals : case3.signals;

  return (
    <main className="twin-studio relative w-screen h-screen overflow-hidden bg-black text-slate-200 font-sans">
      <div className="absolute inset-0 z-0">
        <Canvas3D
          selectedCase={selectedCase}
          onEditScenario={beginEdit}
          vehiclesRef={vehiclesRef}
          ambulancePosition={case1Stream.ambulancePosition}
          ambulanceA={case3.ambulanceA}
          ambulanceB={case3.ambulanceB}
          case2={selectedCase === 2 ? case2 : null}
          onCase2Change={onCase2Change}
          activeCamFollow={case3.activeCamFollow}
          onSetCamFollow={case3.setCamFollow}
          isSimulationRunning={selectedCase === 1 ? case1Stream.isSimulationRunning : selectedCase === 2 ? case2.phase !== 'ready' && case2.phase !== 'complete' : case3.isSimulationRunning}
          isPreempted={selectedCase === 1 ? case1Signal.isPreempted : selectedCase === 2 ? case2.phase === 'eastGreen' || case2.phase === 'northGreen' : case3.deadlockDetected && !case3.trafficCycleActive}
          isFrozen={selectedCase === 1 ? case1Stream.isFrozen : selectedCase === 2 ? case2Frozen : case3.isFrozen}
          signalPhase={signals.signalPhase ?? signals.phase}
          nGreen={signals.nGreen} sGreen={signals.sGreen} eGreen={signals.eGreen} wGreen={signals.wGreen}
          nYellow={signals.nYellow} sYellow={signals.sYellow} eYellow={signals.eYellow} wYellow={signals.wYellow}
        />
      </div>

      {selectedCase === 3 && (case3.deadlockDetected || case3.trafficCycleActive) &&
        <div role="status" className="twin-announcement">{case3.trafficCycleActive ?
          'Both units delivered · Normal signal cycle resumed' : 'Junction conflict · Unit B diverted via Cubbon Road'}</div>}

      {/* ── Top-Right Hardware Control Bar (Dual USB Serial & Wi-Fi V2I) ── */}
      <div className="twin-toolbar" style={{
        position: 'fixed',
        top: 20,
        right: 20,
        zIndex: 120,
        display: selectedCase === 2 ? 'none' : 'flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'monospace'
      }}>
        {/* Launch 2D Google Maps Ambulance Cockpit */}
        <a
          href="/ambulance"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            background: 'rgba(2, 6, 23, 0.94)',
            color: '#22c55e',
            border: '1.5px solid #16a34a',
            borderRadius: 8,
            padding: '7px 12px',
            fontSize: 11,
            fontWeight: 800,
            textDecoration: 'none',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            letterSpacing: 1,
          }}
        >
          <span>🚑</span>
          <span>Ambulance desk</span>
        </a>

        {/* Launch Commuter Phone Alert HUD (Scan QR) */}
        <button
          onClick={() => setShowPhoneQrModal(true)}
          title="Open Commuter HUD on your Mobile Phone via QR Code"
          style={{
            background: 'rgba(2, 6, 23, 0.94)',
            color: '#f59e0b',
            border: '1.5px solid #d97706',
            borderRadius: 8,
            padding: '7px 12px',
            fontSize: 11,
            fontWeight: 800,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            letterSpacing: 1,
            boxShadow: '0 0 14px rgba(245, 158, 11, 0.35)',
            transition: 'all 0.2s ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'rgba(245, 158, 11, 0.18)';
            e.currentTarget.style.boxShadow = '0 0 20px rgba(245, 158, 11, 0.55)';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(2, 6, 23, 0.94)';
            e.currentTarget.style.boxShadow = '0 0 14px rgba(245, 158, 11, 0.35)';
          }}
        >
          <span>📱</span>
          <span>Phone link</span>
        </button>

        {/* USB Serial Indicator / Button */}
        {!isSerialConnected ? (
          <button
            onClick={connectESP32}
            title="Connect USB Serial (Zero-Fail 115200 baud Fallback)"
            style={{
              background: 'rgba(2, 6, 23, 0.94)',
              color: '#38bdf8',
              border: '1.5px solid #0284c7',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 0 14px rgba(2, 132, 199, 0.35)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(14, 165, 233, 0.18)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(56, 189, 248, 0.55)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(2, 6, 23, 0.94)';
              e.currentTarget.style.boxShadow = '0 0 14px rgba(2, 132, 199, 0.35)';
            }}
          >
            <span>🔌</span>
            <span>USB serial</span>
          </button>
        ) : (
          <div style={{
            background: 'rgba(2, 6, 23, 0.94)',
            border: `1.5px solid ${
              serialLastByte === 'P' || serialLastByte === 'G'
                ? '#22c55e'
                : serialLastByte === 'Y'
                ? '#facc15'
                : '#ef4444'
            }`,
            borderRadius: 8,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: `0 0 16px ${
              serialLastByte === 'P' || serialLastByte === 'G'
                ? 'rgba(34, 197, 94, 0.35)'
                : serialLastByte === 'Y'
                ? 'rgba(250, 204, 21, 0.35)'
                : 'rgba(239, 68, 68, 0.35)'
            }`,
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background:
                serialLastByte === 'P'
                  ? '#10b981'
                  : serialLastByte === 'G'
                  ? '#22c55e'
                  : serialLastByte === 'Y'
                  ? '#facc15'
                  : '#ef4444',
              boxShadow: `0 0 10px ${
                serialLastByte === 'P'
                  ? '#10b981'
                  : serialLastByte === 'G'
                  ? '#22c55e'
                  : serialLastByte === 'Y'
                  ? '#facc15'
                  : '#ef4444'
              }`,
              animation: serialLastByte === 'P' ? 'pulse 0.8s infinite' : 'none'
            }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f8fafc' }}>
              ⚡ USB: <strong style={{ color: serialLastByte === 'P' ? '#10b981' : serialLastByte === 'G' ? '#22c55e' : serialLastByte === 'Y' ? '#facc15' : '#ef4444' }}>[{serialLastByte || 'R'}]</strong>
            </span>
            <button
              onClick={disconnectESP32}
              title="Disconnect USB"
              style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Wi-Fi V2I HTTP Indicator / Button */}
        {!isWifiEnabled ? (
          <button
            onClick={() => toggleWifi(true)}
            title="Enable Wireless V2I (HTTP fetch to ESP32 IP)"
            style={{
              background: 'rgba(2, 6, 23, 0.94)',
              color: '#a855f7',
              border: '1.5px solid #9333ea',
              borderRadius: 8,
              padding: '7px 12px',
              fontSize: 11,
              fontWeight: 800,
              cursor: 'pointer',
              boxShadow: '0 0 14px rgba(168, 85, 247, 0.3)',
              backdropFilter: 'blur(10px)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              letterSpacing: 1,
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'rgba(168, 85, 247, 0.18)';
              e.currentTarget.style.boxShadow = '0 0 20px rgba(168, 85, 247, 0.55)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'rgba(2, 6, 23, 0.94)';
              e.currentTarget.style.boxShadow = '0 0 14px rgba(168, 85, 247, 0.3)';
            }}
          >
            <span>📶</span>
            <span>WI-FI V2I</span>
          </button>
        ) : (
          <div style={{
            background: 'rgba(2, 6, 23, 0.94)',
            border: `1.5px solid ${wifiStatus === 'ERROR' ? '#ef4444' : '#a855f7'}`,
            borderRadius: 8,
            padding: '6px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            boxShadow: `0 0 16px ${wifiStatus === 'ERROR' ? 'rgba(239, 68, 68, 0.35)' : 'rgba(168, 85, 247, 0.35)'}`,
            backdropFilter: 'blur(10px)'
          }}>
            <div style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: wifiStatus === 'ERROR' ? '#ef4444' : (lastWifiByteSent === 'P' ? '#10b981' : lastWifiByteSent === 'G' ? '#22c55e' : lastWifiByteSent === 'Y' ? '#facc15' : '#ef4444'),
              boxShadow: `0 0 10px ${wifiStatus === 'ERROR' ? '#ef4444' : '#a855f7'}`
            }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#f8fafc' }}>
              📶 V2I ({espIp}): <strong style={{ color: '#c084fc' }}>[{lastWifiByteSent || 'R'}]</strong>
            </span>
            <button
              onClick={() => toggleWifi(false)}
              title="Disable Wi-Fi Actuation"
              style={{ background: 'transparent', border: 'none', color: '#64748b', fontSize: 11, cursor: 'pointer', padding: '0 2px' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* Settings Gear (Open Drawer / IP Config) */}
        <button
          onClick={() => setShowHardwareMenu(prev => !prev)}
          title="Hardware Actuation Settings & Manual Test"
          style={{
            background: showHardwareMenu ? '#334155' : 'rgba(2, 6, 23, 0.94)',
            color: '#94a3b8',
            border: '1.5px solid #475569',
            borderRadius: 8,
            padding: '7px 10px',
            fontSize: 12,
            fontWeight: 800,
            cursor: 'pointer',
            backdropFilter: 'blur(10px)',
            transition: 'all 0.2s ease',
          }}
        >
          ⚙️
        </button>

        {/* ── EXPANDABLE HARDWARE CONFIGURATION CARD ── */}
        {showHardwareMenu && (
          <div className="hardware-panel" style={{
            position: 'absolute',
            top: 48,
            right: 0,
            width: 320,
            background: 'rgba(2, 6, 23, 0.98)',
            border: '1.5px solid #334155',
            borderRadius: 12,
            padding: '14px 16px',
            boxShadow: '0 12px 32px rgba(0,0,0,0.8), 0 0 24px rgba(56, 189, 248, 0.2)',
            backdropFilter: 'blur(16px)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            zIndex: 130
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 900, color: '#38bdf8', letterSpacing: 1.2 }}>
                HARDWARE ACTUATION CONFIG
              </span>
              <button
                onClick={() => setShowHardwareMenu(false)}
                style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 12, fontWeight: 700 }}
              >
                ✕
              </button>
            </div>

            {/* Wi-Fi V2I IP Settings */}
            <div>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 5, display: 'flex', justifyContent: 'space-between' }}>
                <span>📶 ESP32 WI-FI IP (HOTSPOT / SOFTAP):</span>
                {wifiStatus === 'LINKED' && (
                  <span style={{ color: '#22c55e', fontWeight: 800 }}>ONLINE ({lastResponseTime || 12}ms)</span>
                )}
                {wifiStatus === 'CONNECTING' && (
                  <span style={{ color: '#facc15', fontWeight: 800 }}>TESTING...</span>
                )}
                {wifiStatus === 'ERROR' && (
                  <span style={{ color: '#ef4444', fontWeight: 800 }}>OFFLINE</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  type="text"
                  value={tempIp}
                  onChange={e => setTempIp(e.target.value)}
                  placeholder="e.g. 192.168.4.1"
                  style={{
                    flex: 1,
                    background: '#0f172a',
                    border: `1px solid ${wifiStatus === 'ERROR' ? '#ef4444' : wifiStatus === 'LINKED' ? '#22c55e' : '#475569'}`,
                    borderRadius: 6,
                    padding: '6px 8px',
                    color: '#f8fafc',
                    fontSize: 11,
                    fontFamily: 'monospace'
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      saveAndLink(tempIp, 'R');
                    }
                  }}
                />
                <button
                  onClick={() => saveAndLink(tempIp, 'R')}
                  disabled={isWifiConnecting}
                  style={{
                    background: isWifiConnecting
                      ? '#475569'
                      : wifiLinkSuccess
                      ? '#059669'
                      : wifiStatus === 'ERROR'
                      ? '#b91c1c'
                      : '#9333ea',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 10,
                    fontWeight: 800,
                    cursor: isWifiConnecting ? 'wait' : 'pointer',
                    boxShadow: isWifiConnecting ? 'none' : '0 0 10px rgba(147, 51, 234, 0.4)',
                    transition: 'all 0.2s ease',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {isWifiConnecting ? '⏳ TESTING...' : wifiLinkSuccess ? '✅ LINKED!' : 'SAVE & LINK'}
                </button>
              </div>

              {/* Endpoint Target info */}
              <div style={{ fontSize: 9, color: '#64748b', marginTop: 4, display: 'flex', justifyContent: 'space-between' }}>
                <span>Target: <code>http://{espIp}/signal?cmd=...</code></span>
                <span>Port: <strong>80 (HTTP)</strong></span>
              </div>

              {/* Success Notification */}
              {wifiLinkSuccess && (
                <div style={{ marginTop: 6, padding: '6px 8px', background: 'rgba(34, 197, 94, 0.15)', border: '1px solid #22c55e', borderRadius: 6, fontSize: 10, color: '#4ade80' }}>
                  ✅ <strong>Handshake Confirmed:</strong> ESP32 responded on <code>http://{espIp}</code>!
                </div>
              )}

              {/* Diagnostic Error Banner */}
              {wifiStatus === 'ERROR' && wifiLastError && (
                <div style={{
                  marginTop: 8,
                  padding: '8px 10px',
                  background: 'rgba(239, 68, 68, 0.12)',
                  border: '1px solid rgba(239, 68, 68, 0.6)',
                  borderRadius: 6,
                  fontSize: 10,
                  color: '#fca5a5'
                }}>
                  <div style={{ fontWeight: 800, color: '#f87171', marginBottom: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span>⚠️</span>
                    <span>CANNOT REACH ESP32 AT {espIp}</span>
                  </div>
                  <div style={{ fontSize: 9, color: '#cbd5e1', lineHeight: 1.4, marginBottom: 6 }}>
                    {wifiLastError}
                  </div>
                  <div style={{ borderTop: '1px solid rgba(239, 68, 68, 0.3)', paddingTop: 5, fontSize: 9, color: '#e2e8f0' }}>
                    <strong>Verify checklist:</strong>
                    <ul style={{ paddingLeft: 14, margin: '3px 0 0 0', lineHeight: 1.4 }}>
                      <li>Ensure ESP32 is flashed with <code>firmware/esp32_traffic_light.ino</code>.</li>
                      <li>Check Arduino Serial Monitor for the actual IP assigned by your hotspot.</li>
                      <li>Ensure this laptop & ESP32 are on the <strong>same</strong> Wi-Fi/Hotspot.</li>
                      <li><strong>Presentation fallback:</strong> Click <strong>[🔌 USB SERIAL]</strong> for instant wired control without Wi-Fi!</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>

            {/* Quick Test Triggers */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 8 }}>
              <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>
                MANUAL HARDWARE OVERRIDE (TEST LEDS):
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <button
                  onClick={() => { sendByteCommand('P'); testPing('P', tempIp); }}
                  style={{ background: '#059669', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  {"🟢 TEST 'P' (PREEMPTION)"}
                </button>
                <button
                  onClick={() => { sendByteCommand('G'); testPing('G', tempIp); }}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  {"🟢 TEST 'G' (GREEN)"}
                </button>
                <button
                  onClick={() => { sendByteCommand('Y'); testPing('Y', tempIp); }}
                  style={{ background: '#ca8a04', color: '#000', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  {"🟡 TEST 'Y' (YELLOW)"}
                </button>
                <button
                  onClick={() => { sendByteCommand('R'); testPing('R', tempIp); }}
                  style={{ background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, padding: '6px', fontSize: 10, fontWeight: 800, cursor: 'pointer' }}
                >
                  {"🔴 TEST 'R' (RED)"}
                </button>
              </div>
            </div>

            {/* Recommendation note */}
            <div style={{ borderTop: '1px solid #334155', paddingTop: 6, fontSize: 9, color: '#64748b', lineHeight: 1.4 }}>
              💡 <strong>Presentation Tip:</strong> Both USB and Wi-Fi run concurrently. You can demo Wi-Fi V2I wirelessly via phone hotspot, with USB Serial connected as a fail-safe.
            </div>
          </div>
        )}
      </div>

      {/* Primary HUD depending on selected case */}
      {selectedCase === 1 ? (
        <Case1SignalHUD
          signals={case1Signal}
          stream={case1Stream}
          dispatch={dispatch}
          start={startDispatch}
          demoMode={demoMode}
          onToggleDemo={updateDemoMode}
          onRunDemo={() => dispatchDemo(1)}
          onResetDemo={() => resetDemo(1)}
          onBackToMenu={backToOverview}
          onSwitchCase={switchCase}
        />
      ) : selectedCase === 2 ? (
        <Case2HUD
          simulation={case2}
          frozen={case2Frozen}
          dispatch={dispatchCase2}
          toggleFreeze={toggleCase2Freeze}
          onReset={resetCase2}
          onBackToMenu={backToOverview}
          onSwitchCase={switchCase}
        />
      ) : (
        <Case3TelemetryHUD
          case3={case3}
          start={startDispatch}
          dispatch={dispatch?.caseId === 3 ? dispatch : null}
          demoMode={demoMode}
          onToggleDemo={updateDemoMode}
          onRunDemo={() => dispatchDemo(3)}
          onResetDemo={() => resetDemo(3)}
          onBackToMenu={backToOverview}
          onSwitchCase={switchCase}
        />
      )}
      {/* ── MOBILE PHONE QR CODE MODAL ── */}
      {showPhoneQrModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(2, 6, 23, 0.85)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 200,
          fontFamily: 'monospace'
        }}
        onClick={() => setShowPhoneQrModal(false)}
        >
          <div role="dialog" aria-label="Open commuter map on your phone" className="phone-dialog" style={{
            background: 'rgba(15, 23, 42, 0.96)',
            border: '1.5px solid #f59e0b',
            borderRadius: 16,
            padding: '24px 28px',
            maxWidth: 420,
            width: '90%',
            boxShadow: '0 0 40px rgba(245, 158, 11, 0.4)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            textAlign: 'center',
            gap: 14,
            position: 'relative'
          }}
          onClick={e => e.stopPropagation()}
          >
            <button
              onClick={() => setShowPhoneQrModal(false)}
              style={{
                position: 'absolute',
                top: 14,
                right: 16,
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                fontSize: 16,
                fontWeight: 700,
                cursor: 'pointer'
              }}
            >
              ✕
            </button>

            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 800, letterSpacing: 2 }}>
              COMMUTER MAP
            </div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#f8fafc' }}>
              Open on your phone
            </div>

            {/* QR Code Canvas/Image */}
            <div style={{
              background: '#fff',
              padding: 12,
              borderRadius: 12,
              boxShadow: '0 4px 20px rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&color=0-0-0&bgcolor=255-255-255&data=${encodeURIComponent(networkInfo.driverUrl)}`}
                alt="Scan to open on phone"
                width={190}
                height={190}
                style={{ display: 'block', borderRadius: 4 }}
              />
            </div>

            {/* Direct URL Box */}
            <div style={{ width: '100%', background: '#020617', border: '1px solid #334155', borderRadius: 8, padding: '8px 10px' }}>
              <div style={{ fontSize: 9, color: '#64748b', marginBottom: 2 }}>OR ENTER THIS URL ON YOUR PHONE BROWSER:</div>
              <div style={{ fontSize: 13, fontWeight: 900, color: '#38bdf8', wordBreak: 'break-all' }}>
                {networkInfo.driverUrl}
              </div>
            </div>

            {/* Buttons */}
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button
                onClick={() => {
                  if (navigator.clipboard?.writeText) {
                    navigator.clipboard.writeText(networkInfo.driverUrl).catch(() => {});
                  } else {
                    const input = document.createElement('textarea');
                    input.value = networkInfo.driverUrl;
                    input.style.position = 'fixed';
                    input.style.opacity = '0';
                    document.body.appendChild(input);
                    input.select();
                    document.execCommand('copy');
                    document.body.removeChild(input);
                  }
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2000);
                }}
                style={{
                  flex: 1,
                  background: copiedLink ? '#16a34a' : '#1e293b',
                  color: '#fff',
                  border: '1px solid #475569',
                  borderRadius: 8,
                  padding: '8px 0',
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer'
                }}
              >
                {copiedLink ? '✅ COPIED!' : '📋 COPY LINK'}
              </button>
              <a
                href={networkInfo.driverUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  flex: 1,
                  background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
                  color: '#000',
                  border: 'none',
                  borderRadius: 8,
                  padding: '8px 0',
                  fontSize: 11,
                  fontWeight: 900,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                ↗ OPEN IN TAB
              </a>
            </div>

            {/* Checklist */}
            <div style={{ fontSize: 10, color: '#94a3b8', lineHeight: 1.5, textAlign: 'left', width: '100%', background: 'rgba(30, 41, 59, 0.4)', padding: '8px 12px', borderRadius: 8 }}>
              <div><strong>⚡ Quick Setup:</strong></div>
              <div>1. Connect your phone to the <strong>same Wi-Fi or Mobile Hotspot</strong>.</div>
              <div>2. Point your phone camera at the QR code above.</div>
              <div>3. Dispatch ambulance on the laptop to trigger live siren & yield alerts!</div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
