import { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';

// ── Case 3 Waypoint & Kinematics Configuration ──────────────────────────────
// Ambulance A (Main South Approach):
const AMB_A_START_Z = 90.0;
const AMB_A_LANE_X  = 2.2;
const AMB_A_END_Z   = -120.0;
const AMB_A_SPEED   = 0.55; // units per tick (~11 u/s)

// Ambulance B (East Approach & North Block Detour):
const AMB_B_START_X = 90.0;
const AMB_B_LANE_Z  = -2.89; // East approach westbound lane
const AMB_B_SPEED   = 0.60; // units per tick (~12 u/s)

// Detour Waypoints mapped from user Free-Roam Camera Telemetry:
// WP 0: East approach driving West (-X)
// WP 1: Right turn into North Side Street (X <= 47.0) -> facing North (-Z)
// WP 2: Left turn into Parallel West Avenue (Z <= -60.0) -> facing West (-X)
// WP 3: Left turn into South Side Street (X <= -85.0) -> facing South (+Z)
// WP 4: Right turn into Main Avenue (Z >= -2.89) -> facing West (-X), exiting West
const DETOUR_WAYPOINTS = [
  { id: 1, name: 'North Side Street Turn',  triggerAxis: 'x', triggerVal: 47.0,  condition: '<=', targetRot: 0,            nextDir: 'N' },
  { id: 2, name: 'Parallel West Ave Turn',  triggerAxis: 'z', triggerVal: -60.0, condition: '<=', targetRot: Math.PI / 2,  nextDir: 'W' },
  { id: 3, name: 'South Return Street Turn', triggerAxis: 'x', triggerVal: -87.0, condition: '<=', targetRot: Math.PI,       nextDir: 'S' },
  { id: 4, name: 'Main Avenue Re-entry',    triggerAxis: 'z', triggerVal: -2.89, condition: '>=', targetRot: Math.PI / 2,  nextDir: 'W' },
];

export function useCase3TrafficStream(active = true) {
  const [state, setState] = useState({
    ambulanceA: {
      id: 'AMB_A',
      name: 'Ambulance A (Cardiac - South)',
      priority: 'LEVEL 1 - CRITICAL',
      position: { x: AMB_A_LANE_X, y: 0.65, z: AMB_A_START_Z, rotation: 0 },
      distanceToJunction: 90.0,
      status: 'IDLE_STANDBY',
      etaToJunction: 7.5,
    },
    ambulanceB: {
      id: 'AMB_B',
      name: 'Ambulance B (Trauma - East)',
      priority: 'LEVEL 1 - CRITICAL',
      position: { x: AMB_B_START_X, y: 0.65, z: AMB_B_LANE_Z, rotation: Math.PI / 2 },
      distanceToJunction: 90.0,
      status: 'IDLE_STANDBY',
      currentWaypointIdx: 0,
      waypointName: 'Awaiting Dispatch',
      detourActive: false,
    },
    deadlockDetected: false,
    trafficCycleActive: false,
    isSimulationRunning: false,
    isFrozen: false,
    activeCamFollow: 'detour', // 'detour' (Amb B), 'corridor' (Amb A), 'overview'
    signals: {
      phase: 'ALL_RED',
      phaseLabel: 'STANDBY — ALL RED',
      sGreen: false,
      sYellow: false,
      nGreen: false,
      nYellow: false,
      eGreen: false,
      eYellow: false,
      wGreen: false,
      wYellow: false,
      timeRemaining: 15,
      activeArm: 'NONE',
    },
    metrics: {
      directJunctionDelaySec: 48,
      macroDetourDurationSec: 18,
      netTimeSavedSec: 30,
      co2ReductionPct: 64,
    },
    auditLogs: [],
  });

  const simRunningRef = useRef(false);
  const activeRef = useRef(active);
  activeRef.current = active;
  const isFrozenRef   = useRef(false);
  const trafficCycleActiveRef = useRef(false);
  const cycleArmIndexRef = useRef(0);
  const cycleTimerRef = useRef(15.0);

  // Normal traffic orchestration arm sequence
  const CYCLE_SEQUENCE = [
    { arm: 'WEST',  phase: 'W_RELEASE', label: 'EAST APPROACH (WESTBOUND) GREEN — FLUSHING GRIDLOCK' },
    { arm: 'NORTH', phase: 'N_RELEASE', label: 'NORTH APPROACH (SOUTHBOUND) GREEN' },
    { arm: 'EAST',  phase: 'E_RELEASE', label: 'WEST APPROACH (EASTBOUND) GREEN' },
    { arm: 'SOUTH', phase: 'S_RELEASE', label: 'SOUTH APPROACH (NORTHBOUND) GREEN' },
  ];

  // Position & rotation refs for smooth tick updates
  const posARef = useRef({ x: AMB_A_LANE_X, y: 0.55, z: AMB_A_START_Z, rotation: 0 });
  const posBRef = useRef({ x: AMB_B_START_X, y: 0.55, z: AMB_B_LANE_Z, rotation: Math.PI / 2 });
  const wpIndexBRef = useRef(0);
  const rotTargetBRef = useRef(Math.PI / 2);
  const lastTickRef = useRef(0);

  const addLog = useCallback((msg, type = 'info') => {
    setState(prev => {
      const logs = [...prev.auditLogs, {
        id: Date.now() + Math.random(),
        timestamp: '[' + new Date().toTimeString().split(' ')[0] + ']',
        message: msg,
        type,
      }];
      if (logs.length > 50) logs.shift();
      return { ...prev, auditLogs: logs };
    });
  }, []);

  const dispatchCase3 = useCallback(() => {
    if (simRunningRef.current && !trafficCycleActiveRef.current) return;
    simRunningRef.current = true;
    isFrozenRef.current = false;
    trafficCycleActiveRef.current = false;
    cycleArmIndexRef.current = 0;
    cycleTimerRef.current = 15.0;
    wpIndexBRef.current = 0;
    rotTargetBRef.current = Math.PI / 2;
    lastTickRef.current = performance.now();

    posARef.current = { x: AMB_A_LANE_X, y: 0.55, z: AMB_A_START_Z, rotation: 0 };
    posBRef.current = { x: AMB_B_START_X, y: 0.55, z: AMB_B_LANE_Z, rotation: Math.PI / 2 };

    addLog('Dual dispatch triggered: Ambulance A (South) & Ambulance B (East) en route.', 'warning');
    addLog('Two emergency units are approaching the junction.', 'danger');
    addLog('DEADLOCK RESOLVED: Ambulance A granted South Green Corridor. Ambulance B assigned Macro-Detour via North Block.', 'success');

    setState(prev => ({
      ...prev,
      trafficCycleActive: false,
      isSimulationRunning: true,
      isFrozen: false,
      deadlockDetected: true,
      signals: {
        phase: 'S_GREEN_CORRIDOR',
        phaseLabel: 'SOUTH CORRIDOR GREEN (AMBULANCE A)',
        sGreen: true,
        sYellow: false,
        nGreen: true,
        nYellow: false,
        eGreen: false,
        eYellow: false,
        wGreen: false,
        wYellow: false,
        timeRemaining: 15,
        activeArm: 'SOUTH',
      },
      ambulanceA: {
        ...prev.ambulanceA,
        status: 'CORRIDOR_ACTIVE',
        position: { ...posARef.current },
      },
      ambulanceB: {
        ...prev.ambulanceB,
        status: 'DETOUR_ACTIVE',
        detourActive: true,
        currentWaypointIdx: 0,
        waypointName: 'Leg 1: East Approach -> WP 1',
        position: { ...posBRef.current },
      },
    }));
  }, [addLog]);

  const toggleFreeze = useCallback(() => {
    isFrozenRef.current = !isFrozenRef.current;
    if (!isFrozenRef.current) lastTickRef.current = performance.now();
    setState(prev => ({ ...prev, isFrozen: isFrozenRef.current }));
    addLog(`System ${isFrozenRef.current ? 'PAUSED' : 'RESUMED'}.`);
  }, [addLog]);

  const resetCase3 = useCallback(() => {
    simRunningRef.current = false;
    isFrozenRef.current = false;
    trafficCycleActiveRef.current = false;
    cycleArmIndexRef.current = 0;
    cycleTimerRef.current = 15.0;
    wpIndexBRef.current = 0;
    rotTargetBRef.current = Math.PI / 2;
    lastTickRef.current = performance.now();
    posARef.current = { x: AMB_A_LANE_X, y: 0.55, z: AMB_A_START_Z, rotation: 0 };
    posBRef.current = { x: AMB_B_START_X, y: 0.55, z: AMB_B_LANE_Z, rotation: Math.PI / 2 };

    setState(prev => ({
      ...prev,
      deadlockDetected: false,
      trafficCycleActive: false,
      isSimulationRunning: false,
      isFrozen: false,
      signals: {
        phase: 'ALL_RED',
        phaseLabel: 'STANDBY — ALL RED',
        sGreen: false,
        sYellow: false,
        nGreen: false,
        nYellow: false,
        eGreen: false,
        eYellow: false,
        wGreen: false,
        wYellow: false,
        timeRemaining: 15,
        activeArm: 'NONE',
      },
      ambulanceA: {
        ...prev.ambulanceA,
        position: { x: AMB_A_LANE_X, y: 0.65, z: AMB_A_START_Z, rotation: 0 },
        distanceToJunction: 90.0,
        status: 'IDLE_STANDBY',
      },
      ambulanceB: {
        ...prev.ambulanceB,
        position: { x: AMB_B_START_X, y: 0.65, z: AMB_B_LANE_Z, rotation: Math.PI / 2 },
        distanceToJunction: 90.0,
        status: 'IDLE_STANDBY',
        currentWaypointIdx: 0,
        waypointName: 'Awaiting Dispatch',
        detourActive: false,
      },
    }));
  }, []);

  // Key listeners for Case 3
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e) => {
      if (e.target?.closest?.('input, textarea, select, dialog, [contenteditable]')) return;
      if (e.code === 'KeyF') {
        toggleFreeze();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, toggleFreeze]);

  // ── Main simulation tick loop (50ms physics, real-time dt substepped for background tab safety) ───────────
  useEffect(() => {
    lastTickRef.current = performance.now();
    addLog('Case 03 initialized. Complete ambulance intake to dispatch.');

    const interval = setInterval(() => {
      const now = performance.now();
      const elapsed = Math.min(1.2, Math.max(0.01, (now - (lastTickRef.current || now)) / 1000));
      lastTickRef.current = now;
      if (!activeRef.current || !simRunningRef.current || isFrozenRef.current) return;

      const steps = Math.max(1, Math.round(elapsed / 0.05));
      for (let stepIdx = 0; stepIdx < steps; stepIdx++) {
        // ──────────────────────────────────────────────────────────────────────
        // 0. Post-Clearance Normal Traffic Signal Orchestration (Case 1 Functionality)
        // ──────────────────────────────────────────────────────────────────────
        if (trafficCycleActiveRef.current) {
          cycleTimerRef.current -= 0.05;
          if (cycleTimerRef.current <= 0) {
            cycleArmIndexRef.current = (cycleArmIndexRef.current + 1) % CYCLE_SEQUENCE.length;
            cycleTimerRef.current = 15.0;
            const nextCycle = CYCLE_SEQUENCE[cycleArmIndexRef.current];
            addLog(`Signal phase transition: ${nextCycle.label}`, 'info');
          }
          continue;
        }

        // ──────────────────────────────────────────────────────────────────────
        // 1. Advance Ambulance A (South -> North along -Z)
        // ──────────────────────────────────────────────────────────────────────
        let currentZA = posARef.current.z;
        if (currentZA > AMB_A_END_Z) {
          currentZA -= AMB_A_SPEED;
        }

        let currentYA = 0.55;
        if (currentZA > 45) {
          const t = THREE.MathUtils.clamp((currentZA - 45) / 45, 0, 1);
          currentYA = THREE.MathUtils.lerp(0.55, 0.72, t);
        } else if (currentZA < -15) {
          const t = THREE.MathUtils.clamp((-15 - currentZA) / 35, 0, 1);
          currentYA = THREE.MathUtils.lerp(0.55, 0.75, t);
        }
        posARef.current = { x: AMB_A_LANE_X, y: currentYA, z: currentZA, rotation: 0 };

        // ──────────────────────────────────────────────────────────────────────
        // 2. Advance Ambulance B along Detour Waypoint Path
        // ──────────────────────────────────────────────────────────────────────
        let { x: currentXB, z: currentZB, rotation: rotB } = posBRef.current;
        const wpIdx = wpIndexBRef.current;

        if (wpIdx === 0) {
          currentXB -= AMB_B_SPEED;
          rotTargetBRef.current = Math.PI / 2;
          if (currentXB <= DETOUR_WAYPOINTS[0].triggerVal) {
            wpIndexBRef.current = 1;
            rotTargetBRef.current = DETOUR_WAYPOINTS[0].targetRot;
            addLog('Ambulance B reached Waypoint 1 (X: 47.0) — Turning Right onto North Side Street.', 'info');
          }
        } else if (wpIdx === 1) {
          currentZB -= AMB_B_SPEED;
          rotTargetBRef.current = 0;
          if (currentZB <= DETOUR_WAYPOINTS[1].triggerVal) {
            wpIndexBRef.current = 2;
            rotTargetBRef.current = DETOUR_WAYPOINTS[1].targetRot;
            addLog('Ambulance B reached Waypoint 2 (Z: -60.0) — Turning Left onto Parallel West Avenue.', 'info');
          }
        } else if (wpIdx === 2) {
          currentXB -= AMB_B_SPEED;
          rotTargetBRef.current = Math.PI / 2;
          if (currentXB <= DETOUR_WAYPOINTS[2].triggerVal) {
            wpIndexBRef.current = 3;
            rotTargetBRef.current = DETOUR_WAYPOINTS[2].targetRot;
            currentXB = -87.0;
            addLog('Ambulance B reached Waypoint 3 (X: -87.0) — Turning Left onto South Return Street.', 'info');
          }
        } else if (wpIdx === 3) {
          currentXB = -87.0;
          currentZB += AMB_B_SPEED;
          rotTargetBRef.current = Math.PI;
          if (currentZB >= DETOUR_WAYPOINTS[3].triggerVal) {
            wpIndexBRef.current = 4;
            rotTargetBRef.current = DETOUR_WAYPOINTS[3].targetRot;
            currentZB = -2.89;
            addLog('Ambulance B returned to Main Avenue past Junction — Bypass Complete!', 'success');
          }
        } else {
          currentZB = -2.89;
          currentXB -= AMB_B_SPEED;
          rotTargetBRef.current = Math.PI / 2;
        }

        rotB = THREE.MathUtils.lerp(rotB, rotTargetBRef.current, 0.2);

        let currentYB = 0.55;
        if (wpIdx === 1) {
          const t = THREE.MathUtils.clamp((currentZB - (-2.89)) / (-60.0 - (-2.89)), 0, 1);
          currentYB = THREE.MathUtils.lerp(0.55, 2.05, t);
        } else if (wpIdx === 2) {
          currentYB = 2.05;
        } else if (wpIdx === 3) {
          const t = THREE.MathUtils.clamp((currentZB - (-60.0)) / (-2.89 - (-60.0)), 0, 1);
          currentYB = THREE.MathUtils.lerp(2.05, 0.55, t);
        }

        posBRef.current = { x: currentXB, y: currentYB, z: currentZB, rotation: rotB };

        const ambACleared = currentZA <= -40.0;
        const ambBCleared = wpIdx === 4 && currentXB <= -135;
        if (ambACleared && ambBCleared && !trafficCycleActiveRef.current) {
          trafficCycleActiveRef.current = true;
          cycleArmIndexRef.current = 0;
          cycleTimerRef.current = 15.0;
          addLog('Dual emergency clearance confirmed: Ambulances delivered past junction.', 'success');
          addLog('Initiating Case 1 Normal Traffic Orchestration — Flushing queued East Approach traffic.', 'info');
        }
      }

      if (trafficCycleActiveRef.current) {
        const currentCycle = CYCLE_SEQUENCE[cycleArmIndexRef.current];
        const isYellow = cycleTimerRef.current <= 2.5;
        let nG = false, sG = false, eG = false, wG = false;
        let nY = false, sY = false, eY = false, wY = false;

        if (currentCycle.arm === 'WEST') { wG = !isYellow; wY = isYellow; }
        else if (currentCycle.arm === 'NORTH') { sG = !isYellow; sY = isYellow; }
        else if (currentCycle.arm === 'EAST') { eG = !isYellow; eY = isYellow; }
        else if (currentCycle.arm === 'SOUTH') { nG = !isYellow; nY = isYellow; }

        setState(prev => ({
          ...prev,
          deadlockDetected: false,
          trafficCycleActive: true,
          signals: {
            phase: currentCycle.phase,
            phaseLabel: currentCycle.label,
            timeRemaining: Math.ceil(cycleTimerRef.current),
            activeArm: currentCycle.arm,
            nGreen: nG, nYellow: nY,
            sGreen: sG, sYellow: sY,
            eGreen: eG, eYellow: eY,
            wGreen: wG, wYellow: wY,
          },
          ambulanceA: { ...prev.ambulanceA, status: 'DELIVERED', position: { ...posARef.current } },
          ambulanceB: { ...prev.ambulanceB, status: 'DELIVERED', position: { ...posBRef.current } },
        }));
        return;
      }

      const wpIdx = wpIndexBRef.current;
      const wpName = wpIdx === 0
        ? 'Leg 1: Westbound Approach -> Turn 1 (X: 47)'
        : wpIdx === 1
        ? 'Leg 2: North Side Street -> Turn 2 (Z: -60)'
        : wpIdx === 2
        ? 'Leg 3: Parallel West Avenue -> Turn 3 (X: -85)'
        : wpIdx === 3
        ? 'Leg 4: South Return Street -> Rejoining Main Ave'
        : 'Leg 5: Westbound Departure (Bypass Complete)';
      const distA = Math.max(0, posARef.current.z);
      const ambACleared = posARef.current.z <= -40.0;
      const ambBCleared = wpIdx === 4 && posBRef.current.x <= -135;

      // Smooth 50ms tick sync — matching Case 1 kinematics
      setState(prev => ({
        ...prev,
        ambulanceA: {
          ...prev.ambulanceA,
          position: { ...posARef.current },
          distanceToJunction: distA,
          status: ambACleared ? 'CLEARED' : 'CORRIDOR_ACTIVE',
        },
        ambulanceB: {
          ...prev.ambulanceB,
          position: { ...posBRef.current },
          currentWaypointIdx: wpIdx,
          waypointName: wpName,
          status: ambBCleared ? 'CLEARED' : 'DETOUR_ACTIVE',
        },
      }));
    }, 50);

    return () => clearInterval(interval);
  }, [addLog]);

  const setCamFollow = useCallback((camType) => {
    setState(prev => ({ ...prev, activeCamFollow: camType }));
  }, []);

  return {
    ...state,
    posARef,
    posBRef,
    dispatchCase3,
    toggleFreeze,
    resetCase3,
    setCamFollow,
  };
}

