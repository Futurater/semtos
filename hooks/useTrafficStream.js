// hooks/useTrafficStream.js
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  CASE1_AMBULANCE_SPEED,
  CASE1_AMBULANCE_START_X as AMB_START_X,
  CASE1_AMBULANCE_LANE_Z as AMB_LANE_Z,
  CASE1_PREEMPTION_X as AVE_ENTRY_X,
} from '../components/standardTraffic';

// Ambulance starts far West on the main avenue and drives East (along +X).
const AMB_SPEED_DX     = CASE1_AMBULANCE_SPEED / 20; // units per 50 ms tick
const AMB_WRAP_X       =  150;
const CLEARED_X        =   15;   // fires N_RELEASE sequential sequence

export function useTrafficStream(useMockData = true) {
  const [state, setState] = useState({
    ambulancePosition: { x: AMB_START_X, y: 0.5, z: AMB_LANE_Z, rotation: -Math.PI / 2 },
    isSimulationRunning: false,
    isFrozen: false,
    auditLogs: [],
  });

  const simRunningRef        = useRef(false);
  const isFrozenRef          = useRef(false);
  const onAvenueCallbackRef  = useRef(null);
  const onClearedCallbackRef = useRef(null);
  const onNormalCycleCallbackRef = useRef(null);
  const avenueEventFiredRef  = useRef(false);
  const clearedEventFiredRef = useRef(false);
  const xRef                 = useRef(AMB_START_X);

  const update = useCallback((patch) => {
    setState(prev => ({ ...prev, ...patch }));
  }, []);

  const addLog = useCallback((msg) => {
    setState(prev => {
      const logs = [...prev.auditLogs, {
        id: Date.now() + Math.random(),
        timestamp: '[' + new Date().toTimeString().split(' ')[0] + ']',
        message: msg,
      }];
      if (logs.length > 50) logs.shift();
      return { ...prev, auditLogs: logs };
    });
  }, []);

  // page.js calls this once to wire up signal-hook callbacks
  const registerCallbacks = useCallback((onAvenue, onCleared, onNormal) => {
    onAvenueCallbackRef.current      = onAvenue;
    onClearedCallbackRef.current     = onCleared;
    onNormalCycleCallbackRef.current = onNormal || null;
  }, []);

  const dispatchCase1 = useCallback(() => {
    if (simRunningRef.current) return;
    simRunningRef.current = true;
    isFrozenRef.current = false;
    avenueEventFiredRef.current  = false;
    clearedEventFiredRef.current = false;
    xRef.current = AMB_START_X;
    addLog('Ambulance dispatched — heading East on Main Avenue.');
    update({ isSimulationRunning: true, isFrozen: false });
  }, [addLog, update]);

  const toggleFreeze = useCallback(() => {
    isFrozenRef.current = !isFrozenRef.current;
    update({ isFrozen: isFrozenRef.current });
    addLog('System ' + (isFrozenRef.current ? 'FROZEN' : 'UNFROZEN') + '.');
  }, [addLog, update]);

  useEffect(() => {
    if (!useMockData) return;
    const onKey = (e) => {
      if (e.target?.closest?.('input, textarea, select, dialog, [contenteditable]')) return;
      if (e.code === 'KeyN') {
        e.preventDefault();
        if (onNormalCycleCallbackRef.current) {
          onNormalCycleCallbackRef.current();
          addLog('Normal cycle activated by operator.');
        }
      }
      if (e.code === 'KeyF') {
        toggleFreeze();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [useMockData, toggleFreeze, addLog]);

  // Ambulance movement loop
  useEffect(() => {
    if (!useMockData) return;
    addLog('System ready. Complete ambulance intake to dispatch.');
    const interval = setInterval(() => {
      if (!simRunningRef.current || isFrozenRef.current) return;
      xRef.current += AMB_SPEED_DX;
      const x = xRef.current;

      if (!avenueEventFiredRef.current && x >= AVE_ENTRY_X) {
        avenueEventFiredRef.current = true;
        addLog('Ambulance on avenue — West corridor GREEN.');
        if (onAvenueCallbackRef.current) onAvenueCallbackRef.current();
      }
      if (!clearedEventFiredRef.current && x >= CLEARED_X) {
        clearedEventFiredRef.current = true;
        addLog('Ambulance cleared junction — sequential release begins.');
        if (onClearedCallbackRef.current) onClearedCallbackRef.current();
      }
      if (x > AMB_WRAP_X) {
        simRunningRef.current = false;
        xRef.current = AMB_START_X;
        addLog('Ambulance exited. Complete intake for the next run.');
        update({
          isSimulationRunning: false,
          ambulancePosition: { x: AMB_START_X, y: 0.5, z: AMB_LANE_Z, rotation: -Math.PI / 2 },
        });
        return;
      }
      update({ ambulancePosition: { x, y: 0.5, z: AMB_LANE_Z, rotation: -Math.PI / 2 } });
    }, 50);
    return () => clearInterval(interval);
  }, [useMockData, addLog, update]);

  return {
    ambulancePosition: state.ambulancePosition,
    isSimulationRunning: state.isSimulationRunning,
    isFrozen: state.isFrozen,
    auditLogs: state.auditLogs,
    isPreempted: false,
    registerCallbacks,
    dispatchCase1,
    toggleFreeze,
  };
}
