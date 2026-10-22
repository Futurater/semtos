"use client";

/**
 * SEMTOS — Smart Emergency Management and Traffic Orchestration System
 * ============================================================================
 * File: Semtos/src/app/page.js (Milestone 4 — Unified 3D Digital Twin &
 *       V2X Command Center Dashboard)
 * Route: http://<LAN_IP>:4000/
 *
 * Capabilities Integrated:
 *  1. All 3 Simulation Cases Unlocked on Launch Screen:
 *     - CASE 01: Ambulance Priority Preemption (3D Map & Twin)
 *     - CASE 02: Edge-AI Adaptive Queue Timing (YOLOv8 + OpenCV Live Scaling)
 *     - CASE 03: Dynamic Deadlock Rerouting & Multi-Junction Green Corridor
 *  2. Unified Bidirectional V2X Control:
 *     - Live synchronization with `/ambulance` (Phone 1), `/driver` (Phone 2),
 *       `v2x-server.js` (Port 4081), and `yolo_queue_analyzer.py`.
 *     - Real-time Edge-AI YOLOv8 Queue & Dynamic Green-Hold Panel (`T_hold` formula).
 *     - Hybrid Cloud Online (5G/WebSocket) vs. Offline ESP32 BLE Fallback Toggle.
 *     - Expandable Live V2X & Security Audit Trail Drawer + Preemption Banner.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTrafficStream } from '../../hooks/useTrafficStream';
import { useTrafficSignal } from '../../hooks/useTrafficSignal';
import { useGeospatialSimulation, CORRIDORS } from '../../hooks/useGeospatialSimulation';
import { Canvas3D } from '../../components/Canvas3D';
import { MapboxSimulation } from '../../components/MapboxSimulation';
import { PreemptionAlertBanner } from '../../components/PreemptionAlertBanner';

function SignalHUD({
  phase,
  nGreen, sGreen, eGreen, wGreen,
  nYellow, sYellow, eYellow, wYellow,
  timeRemaining,
  yoloQueue,
  networkMode,
  esp32Signal,
}) {
  const phaseLabel = {
    ALL_RED:      { text: 'ALL APPROACHES - GRIDLOCK',      color: '#ef4444', sub: 'Press ENTER or dispatch from /ambulance' },
    W_GREEN:      { text: 'EMERGENCY - WEST CORRIDOR OPEN', color: '#22c55e', sub: 'Ambulance en route — N/S/W held RED' },
    E_RESUME:     { text: 'CORRIDOR CLEARED - EAST RESUME', color: '#10b981', sub: 'Yielded vehicles merging back' },
    N_RELEASE:    { text: 'NORTH RELEASED',                 color: '#22c55e', sub: 'Sequential queue discharge active' },
    S_RELEASE:    { text: 'SOUTH RELEASED',                 color: '#22c55e', sub: 'Sequential queue discharge active' },
    W_RELEASE:    { text: 'WEST RELEASED',                  color: '#22c55e', sub: 'Sequential queue discharge active' },
    E_RELEASE:    { text: 'EAST RELEASED',                  color: '#22c55e', sub: 'Resuming normal cycle' },
    NORMAL_CYCLE: { text: 'ADAPTIVE NORMAL CYCLE',          color: '#38bdf8', sub: 'YOLOv8 queue-scaled rotation active' },
  };
  const p = phaseLabel[phase] || { text: phase, color: '#fff', sub: '' };
  const arms = [
    { label: 'NORTH', green: nGreen, yellow: nYellow },
    { label: 'EAST',  green: eGreen, yellow: eYellow },
    { label: 'SOUTH', green: sGreen, yellow: sYellow },
    { label: 'WEST',  green: wGreen, yellow: wYellow },
  ];

  return (
    <div
      style={{
        position: 'absolute',
        top: 16,
        left: 16,
        zIndex: 25,
        background: 'rgba(2,6,23,0.92)',
        border: `1.5px solid ${p.color}`,
        borderRadius: 12,
        padding: '14px 18px',
        fontFamily: 'monospace',
        minWidth: 265,
        boxShadow: `0 0 22px ${p.color}44`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1.5 }}>3D INTERSECTION SIGNAL</span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 4,
            background: networkMode === 'BLE_FALLBACK' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
            color: networkMode === 'BLE_FALLBACK' ? '#fbbf24' : '#34d399',
            fontWeight: 700,
          }}
        >
          {networkMode === 'BLE_FALLBACK' ? '📡 BLE OVERRIDE' : '☁️ V2X CLOUD'}
        </span>
      </div>
      <div style={{ fontSize: 13, fontWeight: 800, color: p.color, marginBottom: 2 }}>{p.text}</div>
      <div style={{ fontSize: 10, color: '#64748b', marginBottom: 10 }}>{p.sub}</div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, background: 'rgba(15,23,42,0.8)', padding: '6px 10px', borderRadius: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: '#64748b' }}>PHASE TIMER</div>
          <div style={{ fontSize: 20, fontWeight: 900, color: p.color }}>{timeRemaining}s</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#64748b' }}>YOLO GREEN HOLD</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: '#38bdf8' }}>
            {yoloQueue?.recommendedHoldSeconds || 23}s ({yoloQueue?.queueCount ?? 4} cars)
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, fontSize: 11 }}>
        {arms.map(({ label, green, yellow }) => {
          const icon = green ? '🟢' : yellow ? '🟡' : '🔴';
          const col = green ? '#22c55e' : yellow ? '#facc15' : '#ef4444';
          return (
            <div key={label} style={{ color: col, display: 'flex', gap: 5, alignItems: 'center', fontWeight: 700 }}>
              <span>{icon}</span>
              <span style={{ color: '#cbd5e1' }}>{label}</span>
            </div>
          );
        })}
      </div>

      <div style={{ marginTop: 10, paddingTop: 8, borderTop: '1px solid #1e293b', display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8' }}>
        <span>ESP32 GPIO LED: <strong style={{ color: esp32Signal?.ledState === 'GREEN' ? '#22c55e' : '#ef4444' }}>{esp32Signal?.ledState || 'RED'}</strong></span>
        <span>BUZZER: <strong>{esp32Signal?.buzzerActive ? 'ACTIVE 🔔' : 'IDLE'}</strong></span>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [started, setStarted] = useState(false);
  const [activeCaseId, setActiveCaseId] = useState(1);
  const [viewMode, setViewMode] = useState('SPLIT'); // 'MAP' | 'TWIN' | 'SPLIT'
  const [selectedCorridorKey, setSelectedCorridorKey] = useState('BLR_MG_ROAD');
  const [showAuditDrawer, setShowAuditDrawer] = useState(true);

  const vehiclesRef = useRef([]);

  const {
    ambulancePosition,
    isSimulationRunning,
    isFrozen,
    v2xConnected,
    networkMode,
    yoloQueue,
    routing,
    telemetry,
    esp32Signal,
    auditLogs,
    registerCallbacks,
    registerVehiclesRef,
    startTwinDispatch,
    toggleNetworkMode,
    updateYoloQueue,
  } = useTrafficStream(true);

  const {
    phase,
    nGreen, sGreen, eGreen, wGreen,
    nYellow, sYellow, eYellow, wYellow,
    isPreempted,
    onAmbulanceOnAvenue,
    onAmbulanceCleared,
    onNormalCycle,
    setAdaptiveGreenHoldSeconds,
    signalPhase,
    timeRemaining,
  } = useTrafficSignal();

  // Geospatial Map Simulation hook
  const {
    corridor,
    simState: geoSimState,
    civilianVehicles: geoCivilianVehicles,
    dispatchAmbulance: dispatchGeoAmbulance,
    toggleFreeze: toggleGeoFreeze,
    toggleRealPhoneGps: toggleGeoPhoneGps,
  } = useGeospatialSimulation(selectedCorridorKey);

  // Sync callbacks between 3D stream and Signal controller
  useEffect(() => {
    registerCallbacks(onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle);
    if (registerVehiclesRef) {
      registerVehiclesRef(vehiclesRef);
    }
  }, [registerCallbacks, registerVehiclesRef, onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle]);

  // Dynamically feed YOLOv8 recommended hold duration into the traffic signal state machine
  useEffect(() => {
    if (yoloQueue?.recommendedHoldSeconds) {
      setAdaptiveGreenHoldSeconds(yoloQueue.recommendedHoldSeconds);
    }
  }, [yoloQueue?.recommendedHoldSeconds, setAdaptiveGreenHoldSeconds]);

  // Unified Dispatch Handler (triggers both 3D Geospatial Map + 3D Intersection Twin + V2X Phone Alerts)
  const handleUnifiedDispatch = () => {
    dispatchGeoAmbulance();
    startTwinDispatch(true);
  };

  const cases = [
    {
      id: 1,
      label: 'CASE 01',
      title: 'Ambulance Priority Preemption (3D Map & Twin)',
      description:
        'End-to-end V2X emergency preemption with Haversine ETA tracking, directional dot-product civilian alerts, and BLE offline beacon fallback.',
      tags: ['Haversine Spatial Engine', 'Dot-Product Filter', 'BLE Fallback', '3D Digital Twin'],
      color: '#22c55e',
      available: true,
      defaultView: 'SPLIT',
    },
    {
      id: 2,
      label: 'CASE 02',
      title: 'Edge-AI Adaptive Signal Timing (YOLOv8)',
      description:
        'Real-time computer vision queue analytics (YOLOv8 + OpenCV) that counts queued vehicles in the target lane and scales green-hold duration dynamically.',
      tags: ['YOLOv8 + OpenCV', 'Queue Discharge Model', 'Dynamic Green Hold', 'Live Telemetry'],
      color: '#38bdf8',
      available: true,
      defaultView: 'TWIN',
    },
    {
      id: 3,
      label: 'CASE 03',
      title: 'Dynamic Deadlock Rerouting & Green Wave',
      description:
        'Automated gridlock detection (>= 12 queued vehicles) that triggers dynamic corridor bypass rerouting and multi-junction green wave orchestration.',
      tags: ['Deadlock Detection', 'Bypass Rerouting', 'Multi-Junction Wave', 'V2I Security'],
      color: '#a78bfa',
      available: true,
      defaultView: 'MAP',
    },
  ];

  const handleLaunchCase = (c) => {
    setActiveCaseId(c.id);
    setViewMode(c.defaultView);
    setStarted(true);
    if (c.id === 2) {
      updateYoloQueue(7, 'CASE_02_ADAPTIVE_DEMO');
    } else if (c.id === 3) {
      updateYoloQueue(13, 'CASE_03_DEADLOCK_DEMO');
    } else {
      updateYoloQueue(4, 'CASE_01_STANDARD_DEMO');
    }
  };

  if (!started) {
    return (
      <div
        style={{
          minHeight: '100vh',
          background: 'radial-gradient(ellipse at 50% 0%,#0f2027 0%,#020617 65%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          fontFamily: "'Courier New',monospace",
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ fontSize: 11, letterSpacing: 6, color: '#38bdf8', marginBottom: 8 }}>
            KSCST 50TH SPP • MINIMAL-HARDWARE SOFTWARE-FIRST PROTOTYPE
          </div>
          <h1
            style={{
              fontSize: 'clamp(2rem,5vw,3.5rem)',
              fontWeight: 900,
              color: '#22c55e',
              letterSpacing: '0.22em',
              margin: 0,
              textShadow: '0 0 40px rgba(34,197,94,0.4)',
            }}
          >
            SEMTOS CMD
          </h1>
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 10, maxWidth: 620, lineHeight: 1.7 }}>
            Smart Emergency Management and Traffic Orchestration System — Select an orchestration scenario or launch the mobile V2X transceivers below.
          </p>

          {/* Quick Links to Phone 1 (/ambulance) and Phone 2 (/driver) */}
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 18, flexWrap: 'wrap' }}>
            <a
              href="/ambulance"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(16,185,129,0.12)',
                border: '1px solid #22c55e',
                color: '#4ade80',
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              🚑 OPEN PHONE 1: AMBULANCE TRANSMITTER (/ambulance) ↗
            </a>
            <a
              href="/driver"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                background: 'rgba(56,189,248,0.12)',
                border: '1px solid #38bdf8',
                color: '#38bdf8',
                padding: '8px 16px',
                borderRadius: 10,
                fontSize: 12,
                fontWeight: 700,
                textDecoration: 'none',
              }}
            >
              📱 OPEN PHONE 2: CIVILIAN COMMUTER HUD (/driver) ↗
            </a>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit,minmax(290px,1fr))',
            gap: 24,
            width: '100%',
            maxWidth: 1040,
          }}
        >
          {cases.map((c) => (
            <div
              key={c.id}
              onClick={() => handleLaunchCase(c)}
              style={{
                background: `linear-gradient(135deg,rgba(2,6,23,0.95) 0%,rgba(${
                  c.id === 1 ? '34,197,94' : c.id === 2 ? '56,189,248' : '167,139,250'
                },0.10) 100%)`,
                border: `1.5px solid ${c.color}`,
                borderRadius: 16,
                padding: '28px 24px',
                cursor: 'pointer',
                position: 'relative',
                transition: 'transform 0.2s,box-shadow 0.2s',
                boxShadow: `0 0 32px ${c.color}22,0 4px 24px rgba(0,0,0,0.5)`,
                overflow: 'hidden',
              }}
            >
              <div style={{ position: 'absolute', top: 16, right: 16, display: 'flex', alignItems: 'center', gap: 5 }}>
                <div
                  style={{
                    width: 7,
                    height: 7,
                    borderRadius: '50%',
                    background: c.color,
                    boxShadow: `0 0 8px ${c.color}`,
                  }}
                />
                <span style={{ fontSize: 9, letterSpacing: 2, color: c.color, fontWeight: 700 }}>ACTIVE</span>
              </div>
              <div style={{ fontSize: 10, letterSpacing: 4, color: c.color, marginBottom: 12, fontWeight: 700 }}>
                {c.label}
              </div>
              <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: '0 0 12px 0', lineHeight: 1.3 }}>
                {c.title}
              </h2>
              <p style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.7, margin: '0 0 20px 0' }}>
                {c.description}
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 24 }}>
                {c.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 9,
                      letterSpacing: 1,
                      padding: '3px 8px',
                      borderRadius: 4,
                      background: `${c.color}15`,
                      color: c.color,
                      border: `1px solid ${c.color}35`,
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div
                style={{
                  padding: '10px 0',
                  borderTop: `1px solid ${c.color}30`,
                  fontSize: 11,
                  letterSpacing: 3,
                  color: c.color,
                  fontWeight: 700,
                }}
              >
                ▶ LAUNCH SCENARIO
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-200 font-mono flex flex-col">
      {/* High-Priority Preemption Screen Flash Banner when Preempted */}
      <PreemptionAlertBanner
        isPreempted={isPreempted || geoSimState.signalPhase === 'W_GREEN'}
        flushDuration={yoloQueue?.recommendedHoldSeconds || 23}
      />

      {/* ── Top Header Navigation Bar ── */}
      <header className="h-14 w-full flex-none z-30 flex items-center justify-between px-4 bg-slate-950/95 backdrop-blur-md border-b border-slate-800 pointer-events-auto">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setStarted(false)}
            className="text-xs text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-900 border border-slate-700 transition"
          >
            ← SCENARIOS
          </button>
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full ${
                v2xConnected ? 'bg-emerald-400 shadow-[0_0_8px_#22c55e]' : 'bg-amber-400'
              }`}
            />
            <span className="font-bold text-white text-sm tracking-wider">SEMTOS CMD</span>
            <span className="text-[10px] text-emerald-400 px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-500/30">
              CASE 0{activeCaseId}
            </span>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 text-xs">
          <button
            onClick={() => setViewMode('MAP')}
            className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
              viewMode === 'MAP'
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🗺️</span> 3D MAP
          </button>
          <button
            onClick={() => setViewMode('TWIN')}
            className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
              viewMode === 'TWIN'
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>🏙️</span> 3D TWIN
          </button>
          <button
            onClick={() => setViewMode('SPLIT')}
            className={`px-3 py-1 rounded-lg font-bold transition flex items-center gap-1.5 ${
              viewMode === 'SPLIT'
                ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_rgba(34,197,94,0.4)]'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <span>⚡</span> SPLIT VIEW
          </button>
        </div>

        {/* Corridor Selector + Network Mode + Mobile App Links */}
        <div className="flex items-center gap-2">
          <select
            value={selectedCorridorKey}
            onChange={(e) => setSelectedCorridorKey(e.target.value)}
            className="bg-slate-900 border border-slate-700 text-xs text-white rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 font-mono"
          >
            {Object.keys(CORRIDORS).map((key) => (
              <option key={key} value={key}>
                {CORRIDORS[key].name}
              </option>
            ))}
          </select>

          <button
            onClick={toggleNetworkMode}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-bold border transition ${
              networkMode === 'BLE_FALLBACK'
                ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                : 'bg-slate-900 text-emerald-400 border-emerald-500/40 hover:bg-slate-800'
            }`}
            title="Toggle Cloud Online vs Offline ESP32 BLE Beacon Fallback"
          >
            {networkMode === 'BLE_FALLBACK' ? '📡 BLE FALLBACK' : '☁️ 5G CLOUD'}
          </button>

          <a
            href="/ambulance"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-emerald-950/50 hover:bg-emerald-900/70 text-emerald-300 border border-emerald-500/40 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition"
          >
            <span>🚑</span>
            <span className="hidden lg:inline">AMBULANCE TX</span>
          </a>

          <a
            href="/driver"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs bg-rose-950/50 hover:bg-rose-900/70 text-rose-300 border border-rose-500/40 px-2.5 py-1.5 rounded-lg font-bold flex items-center gap-1 transition"
          >
            <span>📱</span>
            <span className="hidden lg:inline">DRIVER HUD</span>
          </a>

          <button
            onClick={() => setShowAuditDrawer((prev) => !prev)}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-bold border transition ${
              showAuditDrawer
                ? 'bg-sky-500/20 text-sky-300 border-sky-500/50'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            📋 LOGS
          </button>
        </div>
      </header>

      {/* ── Deadlock Rerouting Alert Bar (Active when YOLOv8 queue >= 12 cars) ── */}
      {routing?.deadlockRerouteActive && (
        <div className="w-full bg-amber-500/95 text-slate-950 px-5 py-1.5 text-xs font-black flex items-center justify-between z-30 shadow-lg">
          <div className="flex items-center gap-2">
            <span>⚠️ JUNCTION GRIDLOCK DETECTED ({yoloQueue?.queueCount} QUEUED VEHICLES)</span>
            <span>•</span>
            <span>DYNAMIC REROUTE ACTIVE VIA: {routing.bypassName}</span>
          </div>
          <button
            onClick={() => updateYoloQueue(4, 'OPERATOR_CLEAR_GRIDLOCK')}
            className="px-2.5 py-0.5 rounded bg-slate-950 text-amber-300 text-[10px] font-bold"
          >
            CLEAR GRIDLOCK (4 CARS)
          </button>
        </div>
      )}

      {/* ── Main Viewports Container ── */}
      <div className="flex-1 w-full relative flex overflow-hidden">
        {/* 1. 3D Geospatial Map View */}
        {(viewMode === 'MAP' || viewMode === 'SPLIT') && (
          <div className={`${viewMode === 'SPLIT' ? 'w-1/2 border-r border-slate-800' : 'w-full'} h-full relative`}>
            <MapboxSimulation
              corridor={corridor}
              simState={geoSimState}
              civilianVehicles={geoCivilianVehicles}
              onDispatch={handleUnifiedDispatch}
              onToggleFreeze={toggleGeoFreeze}
              onTogglePhoneGps={toggleGeoPhoneGps}
            />
          </div>
        )}

        {/* 2. 3D Three.js Intersection Twin View */}
        {(viewMode === 'TWIN' || viewMode === 'SPLIT') && (
          <div className={`${viewMode === 'SPLIT' ? 'w-1/2' : 'w-full'} h-full relative`}>
            <div className="absolute inset-0 z-0">
              <Canvas3D
                vehiclesRef={vehiclesRef}
                ambulancePosition={ambulancePosition}
                isSimulationRunning={isSimulationRunning}
                isPreempted={isPreempted}
                isFrozen={isFrozen}
                signalPhase={signalPhase}
                nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
                nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
              />
            </div>
            <SignalHUD
              phase={phase}
              nGreen={nGreen} sGreen={sGreen} eGreen={eGreen} wGreen={wGreen}
              nYellow={nYellow} sYellow={sYellow} eYellow={eYellow} wYellow={wYellow}
              timeRemaining={timeRemaining}
              yoloQueue={yoloQueue}
              networkMode={networkMode}
              esp32Signal={esp32Signal}
            />
          </div>
        )}

        {/* ── Right-Side Floating Edge-AI YOLOv8 Queue & V2X Audit Drawer ── */}
        {showAuditDrawer && (
          <aside className="absolute top-4 right-4 z-30 w-80 bg-slate-950/92 border border-slate-800 backdrop-blur-md rounded-2xl p-3.5 shadow-2xl flex flex-col gap-3 pointer-events-auto max-h-[calc(100%-2rem)]">
            {/* YOLOv8 Queue Analytics & Hold Scaling Card */}
            <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-bold text-sky-400 tracking-wider uppercase">
                  🎥 EDGE-AI YOLOv8 QUEUE ANALYTICS
                </span>
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${
                    yoloQueue?.deadlockDetected
                      ? 'bg-red-950 text-red-400 border border-red-500/40'
                      : 'bg-emerald-950 text-emerald-400 border border-emerald-500/30'
                  }`}
                >
                  {yoloQueue?.queueDensity || 'MODERATE'}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 my-2">
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <div className="text-[9px] text-slate-500">QUEUED CARS</div>
                  <div className="text-lg font-black text-white">{yoloQueue?.queueCount ?? 4}</div>
                </div>
                <div className="bg-slate-950 p-2 rounded-lg border border-slate-800">
                  <div className="text-[9px] text-slate-500">DYNAMIC HOLD</div>
                  <div className="text-lg font-black text-emerald-400">
                    {yoloQueue?.recommendedHoldSeconds ?? 23}s
                  </div>
                </div>
              </div>

              {/* Interactive Queue Override Slider (or driven live by yolo_queue_analyzer.py) */}
              <div className="mt-1">
                <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                  <span>Simulate / Override Queue</span>
                  <span>Source: {yoloQueue?.source || 'SIM'}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  value={yoloQueue?.queueCount ?? 4}
                  onChange={(e) => updateYoloQueue(e.target.value, 'DASHBOARD_SLIDER')}
                  className="w-full accent-sky-400 cursor-pointer"
                />
                <div className="flex justify-between text-[9px] text-slate-500">
                  <span>0 cars (14s)</span>
                  <span>6 cars (28s)</span>
                  <span>12+ (Gridlock)</span>
                </div>
              </div>
            </div>

            {/* Live V2X & Vector Filter Audit Log Stream */}
            <div className="flex-1 min-h-[160px] max-h-[260px] bg-slate-900/90 border border-slate-800 rounded-xl p-3 flex flex-col">
              <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 mb-2">
                <span className="text-[10px] font-bold text-emerald-400 tracking-wider">
                  🛡️ V2X & VECTOR AUDIT TRAIL
                </span>
                <span className="text-[9px] text-slate-500">
                  Latency: {telemetry?.dispatchLatencyMs ?? 3.2}ms
                </span>
              </div>
              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 text-[10px]">
                {[...auditLogs].reverse().map((log) => (
                  <div
                    key={log.id}
                    className="border-b border-slate-800/60 pb-1 last:border-0 leading-relaxed"
                  >
                    <span className="text-slate-500 mr-1.5">{log.timestamp}</span>
                    {log.category && (
                      <span className="text-sky-400 font-bold mr-1.5">[{log.category}]</span>
                    )}
                    <span className="text-slate-200">{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}
      </div>
    </main>
  );
}
