"use client";

/**
 * SEMTOS — Smart Emergency Management and Traffic Orchestration System
 * ============================================================================
 * File: Semtos/src/app/page.js (Unified Bengaluru 3D Digital Twin &
 *       V2X Command Center Dashboard)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useTrafficStream } from '../../hooks/useTrafficStream';
import { useTrafficSignal } from '../../hooks/useTrafficSignal';
import { useGeospatialSimulation, CORRIDORS } from '../../hooks/useGeospatialSimulation';
import { Canvas3D } from '../../components/Canvas3D';
import { MapboxSimulation } from '../../components/MapboxSimulation';

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
    ALL_RED:      { text: 'ALL APPROACHES - STANDBY',       color: '#ef4444', sub: 'Press ENTER or dispatch from /ambulance' },
    W_GREEN:      { text: 'EMERGENCY - MG RD CORRIDOR OPEN', color: '#22c55e', sub: 'Ambulance en route — Cross-streets held RED' },
    E_RESUME:     { text: 'CORRIDOR CLEARED - RESUMING',    color: '#10b981', sub: 'Yielded vehicles merging back into lane' },
    N_RELEASE:    { text: 'NORTH ARM RELEASED',             color: '#22c55e', sub: 'Sequential queue discharge active' },
    S_RELEASE:    { text: 'SOUTH ARM RELEASED',             color: '#22c55e', sub: 'Sequential queue discharge active' },
    W_RELEASE:    { text: 'WEST ARM RELEASED',              color: '#22c55e', sub: 'Sequential queue discharge active' },
    E_RELEASE:    { text: 'EAST ARM RELEASED',              color: '#22c55e', sub: 'Resuming adaptive rotation' },
    NORMAL_CYCLE: { text: 'ADAPTIVE BTP NORMAL CYCLE',      color: '#38bdf8', sub: 'YOLOv8 queue-scaled rotation active' },
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
        background: 'rgba(2, 6, 23, 0.90)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${p.color}`,
        borderRadius: 14,
        padding: '14px 18px',
        fontFamily: 'monospace',
        width: 280,
        boxShadow: `0 12px 32px rgba(0,0,0,0.75), 0 0 20px ${p.color}33`,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <span style={{ fontSize: 10, color: '#94a3b8', letterSpacing: 1.4, fontWeight: 700 }}>
          BTP 3D SIGNAL CONTROLLER
        </span>
        <span
          style={{
            fontSize: 9,
            padding: '2px 6px',
            borderRadius: 4,
            background: networkMode === 'BLE_FALLBACK' ? 'rgba(245,158,11,0.2)' : 'rgba(16,185,129,0.2)',
            color: networkMode === 'BLE_FALLBACK' ? '#fbbf24' : '#34d399',
            fontWeight: 800,
          }}
        >
          {networkMode === 'BLE_FALLBACK' ? '📡 BLE OVERRIDE' : '☁️ V2X CLOUD'}
        </span>
      </div>
      <div style={{ fontSize: 12.5, fontWeight: 900, color: p.color, marginBottom: 2 }}>{p.text}</div>
      <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10 }}>{p.sub}</div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 10,
          background: 'rgba(15, 23, 42, 0.85)',
          padding: '7px 10px',
          borderRadius: 8,
          border: '1px solid #1e293b',
        }}
      >
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

      <div
        style={{
          marginTop: 10,
          paddingTop: 8,
          borderTop: '1px solid #1e293b',
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: 10,
          color: '#94a3b8',
        }}
      >
        <span>
          ESP32 LED:{' '}
          <strong style={{ color: esp32Signal?.ledState === 'GREEN' ? '#4ade80' : '#f87171' }}>
            {esp32Signal?.ledState || 'RED'}
          </strong>
        </span>
        <span>
          BUZZER: <strong>{esp32Signal?.buzzerActive ? 'ACTIVE 🔔' : 'IDLE'}</strong>
        </span>
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

  const {
    corridor,
    simState: geoSimState,
    civilianVehicles: geoCivilianVehicles,
    dispatchAmbulance: dispatchGeoAmbulance,
    toggleFreeze: toggleGeoFreeze,
    toggleRealPhoneGps: toggleGeoPhoneGps,
  } = useGeospatialSimulation(selectedCorridorKey);

  useEffect(() => {
    registerCallbacks(onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle);
    if (registerVehiclesRef) {
      registerVehiclesRef(vehiclesRef);
    }
  }, [registerCallbacks, registerVehiclesRef, onAmbulanceOnAvenue, onAmbulanceCleared, onNormalCycle]);

  useEffect(() => {
    if (yoloQueue?.recommendedHoldSeconds) {
      setAdaptiveGreenHoldSeconds(yoloQueue.recommendedHoldSeconds);
    }
  }, [yoloQueue?.recommendedHoldSeconds, setAdaptiveGreenHoldSeconds]);

  const handleUnifiedDispatch = () => {
    dispatchGeoAmbulance();
    startTwinDispatch(true);
  };

  const cases = [
    {
      id: 1,
      label: 'CASE 01',
      title: 'Bengaluru Green Corridor Preemption (3D Map & Twin)',
      description:
        'OSRM road-snapped Bengaluru corridors (MG Road, Hosur Road, Indiranagar) with Haversine ETA tracking, directional vector alerts, and BLE failover.',
      tags: ['Bengaluru 3D Map', 'Road-Snapped OSRM', 'Dot-Product Filter', '3D Digital Twin'],
      color: '#22c55e',
      available: true,
      defaultView: 'SPLIT',
    },
    {
      id: 2,
      label: 'CASE 02',
      title: 'Edge-AI Adaptive Queue Timing (YOLOv8)',
      description:
        'Real-time computer vision queue analytics (YOLOv8 + OpenCV) that counts queued vehicles in the target lane and scales green-hold duration dynamically.',
      tags: ['YOLOv8 + OpenCV', 'Queue Discharge Model', 'Dynamic Green Hold', 'BTP AI CCTV'],
      color: '#38bdf8',
      available: true,
      defaultView: 'TWIN',
    },
    {
      id: 3,
      label: 'CASE 03',
      title: 'Multi-Junction Green Wave & Deadlock Bypass',
      description:
        'Automated gridlock detection (>= 12 queued vehicles) that triggers dynamic Bengaluru parallel-road bypass rerouting and 3-junction Green Wave cascade.',
      tags: ['Deadlock Detection', 'Cubbon Rd Bypass', 'J1 → J2 → J3 Wave', 'V2I Security'],
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
      onNormalCycle();
    } else if (c.id === 3) {
      updateYoloQueue(13, 'CASE_03_DEADLOCK_DEMO');
    } else {
      updateYoloQueue(4, 'CASE_01_STANDARD_DEMO');
    }
  };

  const anyPreemptionActive = isPreempted || geoSimState.signalPhase === 'W_GREEN';

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
          <div style={{ fontSize: 11, letterSpacing: 5, color: '#38bdf8', marginBottom: 8, fontWeight: 700 }}>
            BENGALURU SMART CITY V2X • KSCST 50TH SPP PROTOTYPE
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
          <p style={{ color: '#94a3b8', fontSize: 13, marginTop: 10, maxWidth: 640, lineHeight: 1.7 }}>
            Smart Emergency Management and Traffic Orchestration System — Road-Snapped Bengaluru Emergency Green Corridors (MG Road, Silk Board–Hosur Rd, Indiranagar 100 Ft Rd).
          </p>

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
    <main
      style={{
        position: 'relative',
        width: '100vw',
        height: '100vh',
        overflow: 'hidden',
        background: '#020617',
        color: '#e2e8f0',
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* ── Top Header Navigation Bar (Fixed 54px height, No Black Void Above) ── */}
      <header
        style={{
          height: 54,
          width: '100%',
          flex: 'none',
          zIndex: 35,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: 'rgba(2, 6, 23, 0.96)',
          backdropFilter: 'blur(12px)',
          borderBottom: '1px solid #1e293b',
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button
            onClick={() => setStarted(false)}
            style={{
              fontSize: 11,
              color: '#cbd5e1',
              padding: '5px 10px',
              borderRadius: 8,
              background: '#0f172a',
              border: '1px solid #334155',
              cursor: 'pointer',
              fontFamily: 'monospace',
              fontWeight: 700,
            }}
          >
            ← SCENARIOS
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: v2xConnected ? '#4ade80' : '#fbbf24',
                boxShadow: v2xConnected ? '0 0 8px #22c55e' : 'none',
              }}
            />
            <span style={{ fontWeight: 900, color: '#ffffff', fontSize: 13, letterSpacing: 1.2 }}>
              SEMTOS BENGALURU
            </span>
            <span
              style={{
                fontSize: 10,
                color: '#4ade80',
                padding: '2px 7px',
                borderRadius: 6,
                background: 'rgba(16, 185, 129, 0.15)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                fontWeight: 800,
              }}
            >
              CASE 0{activeCaseId}
            </span>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div
          style={{
            display: 'flex',
            background: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: 12,
            padding: 3,
            gap: 4,
          }}
        >
          {[
            { id: 'MAP', icon: '🗺️', label: '3D MAP' },
            { id: 'TWIN', icon: '🏙️', label: '3D TWIN' },
            { id: 'SPLIT', icon: '⚡', label: 'SPLIT VIEW' },
          ].map((tab) => {
            const active = viewMode === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setViewMode(tab.id)}
                style={{
                  padding: '5px 12px',
                  borderRadius: 8,
                  fontSize: 11,
                  fontWeight: 800,
                  cursor: 'pointer',
                  fontFamily: 'monospace',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  background: active ? '#22c55e' : 'transparent',
                  color: active ? '#020617' : '#94a3b8',
                  border: 'none',
                  boxShadow: active ? '0 0 14px rgba(34,197,94,0.4)' : 'none',
                }}
              >
                <span>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Bengaluru Corridor Selector + Network Mode + Mobile App Links */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <select
            value={selectedCorridorKey}
            onChange={(e) => setSelectedCorridorKey(e.target.value)}
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              fontSize: 11,
              color: '#ffffff',
              borderRadius: 8,
              padding: '6px 10px',
              fontFamily: 'monospace',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            {Object.keys(CORRIDORS).map((key) => (
              <option key={key} value={key}>
                {CORRIDORS[key].name}
              </option>
            ))}
          </select>

          <button
            onClick={toggleNetworkMode}
            style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 8,
              fontWeight: 800,
              fontFamily: 'monospace',
              cursor: 'pointer',
              background: networkMode === 'BLE_FALLBACK' ? '#f59e0b' : '#0f172a',
              color: networkMode === 'BLE_FALLBACK' ? '#020617' : '#4ade80',
              border: networkMode === 'BLE_FALLBACK' ? '1px solid #fcd34d' : '1px solid rgba(34,197,94,0.4)',
            }}
          >
            {networkMode === 'BLE_FALLBACK' ? '📡 BLE FALLBACK' : '☁️ 5G CLOUD'}
          </button>

          <a
            href="/ambulance"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              background: 'rgba(6, 78, 59, 0.55)',
              color: '#6ee7b7',
              border: '1px solid rgba(52, 211, 153, 0.4)',
              padding: '6px 10px',
              borderRadius: 8,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            🚑 AMB TX
          </a>

          <a
            href="/driver"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontSize: 11,
              background: 'rgba(136, 19, 55, 0.55)',
              color: '#fda4af',
              border: '1px solid rgba(251, 113, 133, 0.4)',
              padding: '6px 10px',
              borderRadius: 8,
              fontWeight: 800,
              textDecoration: 'none',
            }}
          >
            📱 DRIVER HUD
          </a>

          <button
            onClick={() => setShowAuditDrawer((prev) => !prev)}
            style={{
              fontSize: 11,
              padding: '6px 10px',
              borderRadius: 8,
              fontWeight: 800,
              fontFamily: 'monospace',
              cursor: 'pointer',
              background: showAuditDrawer ? 'rgba(56, 189, 248, 0.2)' : '#0f172a',
              color: showAuditDrawer ? '#38bdf8' : '#94a3b8',
              border: showAuditDrawer ? '1px solid rgba(56, 189, 248, 0.5)' : '1px solid #334155',
            }}
          >
            📋 LOGS
          </button>
        </div>
      </header>

      {/* ── Sleek Floating Preemption Alert Pill (No Black Void Bar!) ── */}
      {anyPreemptionActive && (
        <div
          style={{
            position: 'fixed',
            top: 64,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 40,
            background: 'rgba(6, 78, 59, 0.92)',
            border: '1.5px solid #4ade80',
            backdropFilter: 'blur(10px)',
            borderRadius: 999,
            padding: '6px 18px',
            boxShadow: '0 8px 28px rgba(34, 197, 94, 0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          <span style={{ fontSize: 13 }}>🚨</span>
          <span style={{ fontSize: 11, fontWeight: 900, color: '#ffffff', letterSpacing: 1.2 }}>
            GREEN CORRIDOR PREEMPTED — BENGALURU V2X ACTIVE • HOLD: {yoloQueue?.recommendedHoldSeconds || 23}s
          </span>
        </div>
      )}

      {/* ── Main Viewports Container ── */}
      <div style={{ flex: 1, width: '100%', position: 'relative', display: 'flex', overflow: 'hidden' }}>
        {/* 1. 3D Bengaluru Geospatial Map View */}
        {(viewMode === 'MAP' || viewMode === 'SPLIT') && (
          <div
            style={{
              width: viewMode === 'SPLIT' ? '50%' : '100%',
              height: '100%',
              position: 'relative',
              borderRight: viewMode === 'SPLIT' ? '1px solid #1e293b' : 'none',
            }}
          >
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
          <div
            style={{
              width: viewMode === 'SPLIT' ? '50%' : '100%',
              height: '100%',
              position: 'relative',
            }}
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
              <Canvas3D
                vehiclesRef={vehiclesRef}
                ambulancePosition={ambulancePosition}
                isSimulationRunning={isSimulationRunning}
                isPreempted={isPreempted}
                isFrozen={isFrozen}
                signalPhase={signalPhase}
                defaultRoadCam={activeCaseId === 2}
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
          <aside
            style={{
              position: 'absolute',
              top: 16,
              right: 16,
              zIndex: 30,
              width: 315,
              maxHeight: 'calc(100% - 32px)',
              background: 'rgba(2, 6, 23, 0.90)',
              border: '1px solid #1e293b',
              backdropFilter: 'blur(12px)',
              borderRadius: 16,
              padding: 14,
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.8)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              pointerEvents: 'auto',
            }}
          >
            {/* YOLOv8 Queue Analytics & Hold Scaling Card */}
            <div
              style={{
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid #1e293b',
                borderRadius: 12,
                padding: 12,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: '#38bdf8', letterSpacing: 1 }}>
                  🎥 EDGE-AI YOLOv8 QUEUE
                </span>
                <span
                  style={{
                    fontSize: 9,
                    padding: '2px 6px',
                    borderRadius: 4,
                    fontWeight: 800,
                    background: yoloQueue?.deadlockDetected ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)',
                    color: yoloQueue?.deadlockDetected ? '#f87171' : '#34d399',
                  }}
                >
                  {yoloQueue?.queueDensity || 'MODERATE'}
                </span>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
                <div style={{ background: '#020617', padding: 8, borderRadius: 8, border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 9, color: '#64748b' }}>QUEUED CARS</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#ffffff' }}>{yoloQueue?.queueCount ?? 4}</div>
                </div>
                <div style={{ background: '#020617', padding: 8, borderRadius: 8, border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: 9, color: '#64748b' }}>DYNAMIC HOLD</div>
                  <div style={{ fontSize: 18, fontWeight: 900, color: '#4ade80' }}>
                    {yoloQueue?.recommendedHoldSeconds ?? 23}s
                  </div>
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>
                  <span>Queue Density Slider</span>
                  <span>{yoloQueue?.source || 'SIM'}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="16"
                  value={yoloQueue?.queueCount ?? 4}
                  onChange={(e) => updateYoloQueue(e.target.value, 'DASHBOARD_SLIDER')}
                  style={{ width: '100%', accentColor: '#38bdf8', cursor: 'pointer' }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: '#64748b' }}>
                  <span>0 cars (14s)</span>
                  <span>6 cars (28s)</span>
                  <span>12+ (Gridlock)</span>
                </div>
              </div>
            </div>

            {/* Live V2X & Vector Filter Audit Log Stream */}
            <div
              style={{
                flex: 1,
                minHeight: 150,
                maxHeight: 240,
                background: 'rgba(15, 23, 42, 0.9)',
                border: '1px solid #1e293b',
                borderRadius: 12,
                padding: 12,
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderBottom: '1px solid #1e293b',
                  paddingBottom: 6,
                  marginBottom: 8,
                }}
              >
                <span style={{ fontSize: 10, fontWeight: 800, color: '#4ade80', letterSpacing: 1 }}>
                  🛡️ V2X & VECTOR AUDIT
                </span>
                <span style={{ fontSize: 9, color: '#64748b' }}>
                  Latency: {telemetry?.dispatchLatencyMs ?? 3.2}ms
                </span>
              </div>
              <div style={{ flex: 1, overflowY: 'auto', fontSize: 10, paddingRight: 4 }}>
                {[...auditLogs].reverse().map((log) => (
                  <div
                    key={log.id}
                    style={{
                      borderBottom: '1px solid rgba(30, 41, 59, 0.6)',
                      paddingBottom: 5,
                      marginBottom: 5,
                      lineHeight: 1.45,
                    }}
                  >
                    <span style={{ color: '#64748b', marginRight: 6 }}>{log.timestamp}</span>
                    {log.category && (
                      <span style={{ color: '#38bdf8', fontWeight: 700, marginRight: 6 }}>[{log.category}]</span>
                    )}
                    <span style={{ color: '#e2e8f0' }}>{log.message}</span>
                  </div>
                ))}
              </div>
            </div>
          </aside>
        )}

        {/* ── Bottom-Right / Floating Deadlock Bypass Pill (When Queue >= 12 Cars) ── */}
        {routing?.deadlockRerouteActive && (
          <div
            style={{
              position: 'absolute',
              top: 16,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 35,
              background: 'rgba(245, 158, 11, 0.95)',
              color: '#020617',
              padding: '7px 16px',
              borderRadius: 999,
              fontSize: 11,
              fontWeight: 900,
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              boxShadow: '0 8px 28px rgba(245, 158, 11, 0.45)',
              whiteSpace: 'nowrap',
            }}
          >
            <span>
              ⚠️ GRIDLOCK DETECTED ({yoloQueue?.queueCount} CARS) • REROUTED VIA: {corridor.bypassName}
            </span>
            <button
              onClick={() => updateYoloQueue(4, 'OPERATOR_CLEAR_GRIDLOCK')}
              style={{
                padding: '3px 9px',
                borderRadius: 999,
                background: '#020617',
                color: '#fcd34d',
                fontSize: 9.5,
                fontWeight: 800,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              CLEAR GRIDLOCK
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
