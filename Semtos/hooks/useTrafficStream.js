import { useState, useEffect, useRef, useCallback } from 'react';

// Ambulance starts further back on the approach avenue (X = -90) so preemption and flushing complete smoothly
const AMB_START_X      =  -90;
const AMB_LANE_Z       =  -6.0;  // East-bound lane centre Z
const AMB_SPEED_DX     =   0.44; // Approach speed (~8.8 u/s)
const AMB_WRAP_X       =   100;  // Long exit runway
const AVE_ENTRY_X      =  -45;   // fires W_GREEN signal
const CLEARED_X        =   15;   // fires N_RELEASE sequential sequence

export function useTrafficStream(useMockData = true) {
  const [state, setState] = useState({
    ambulancePosition: { x: AMB_START_X, y: 0.02, z: AMB_LANE_Z, rotation: -Math.PI / 2 },
    isSimulationRunning: false,
    isFrozen: false,
    auditLogs: [],
  });

  const simRunningRef        = useRef(false);
  const isFrozenRef          = useRef(false);
  const onAvenueCallbackRef  = useRef(null);
  const onClearedCallbackRef = useRef(null);
  const avenueEventFiredRef  = useRef(false);
  const clearedEventFiredRef = useRef(false);
  const xRef                 = useRef(AMB_START_X);
  const currentSpeedRef      = useRef(AMB_SPEED_DX);
  const vehiclesRef          = useRef(null);
  const wsRef                = useRef(null);

  // ---- Connect to V2X Bridge WebSocket Server --------------------
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let unmounted = false;

    function connectWS() {
      if (unmounted) return;
      try {
        ws = new WebSocket('ws://localhost:4081');
        wsRef.current = ws;

        ws.onopen = () => {
          console.log('[3D-TWIN] 🔗 Connected to V2X WebSocket Bridge Server on port 4081');
        };

        ws.onclose = () => {
          console.log('[3D-TWIN] 🔌 Disconnected from V2X Bridge Server, retrying in 3s...');
          if (!unmounted) {
            reconnectTimer = setTimeout(connectWS, 3000);
          }
        };

        ws.onerror = () => {
          // Silent fallback if server is starting
        };
      } catch (_) {
        if (!unmounted) {
          reconnectTimer = setTimeout(connectWS, 3000);
        }
      }
    }

    connectWS();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const sendV2X = useCallback((eventName) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ event: eventName, timestamp: Date.now() }));
        console.log(`[3D-TWIN] 📡 Broadcasted V2X Event: ${eventName}`);
      } catch (e) {
        console.warn('[3D-TWIN] Failed to broadcast V2X event:', e);
      }
    }
  }, []);

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

  const onNormalCycleCallbackRef = useRef(null);

  // page.js calls this once to wire up signal-hook callbacks
  const registerCallbacks = useCallback((onAvenue, onCleared, onNormal) => {
    onAvenueCallbackRef.current     = onAvenue;
    onClearedCallbackRef.current    = onCleared;
    onNormalCycleCallbackRef.current = onNormal || null;
  }, []);

  const registerVehiclesRef = useCallback((ref) => {
    vehiclesRef.current = ref;
  }, []);

  // ENTER key: dispatch ambulance  |  N key: start normal cycle  |  F key: freeze
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        if (simRunningRef.current) return; // already running, ignore
        simRunningRef.current = true;
        avenueEventFiredRef.current  = true; // Fire immediately on dispatch
        clearedEventFiredRef.current = false;
        xRef.current = AMB_START_X;
        currentSpeedRef.current = AMB_SPEED_DX;
        addLog('Ambulance dispatched — heading East on Main Avenue.');
        update({ isSimulationRunning: true });
        
        // Signal hook: immediately preempt signals on dispatch
        if (onAvenueCallbackRef.current) {
          onAvenueCallbackRef.current();
        }

        // Broadcast V2X alert immediately to driver companion phones
        sendV2X('V2X_ALERT_TRIGGER');
      }
      if (e.code === 'KeyN') {
        e.preventDefault();
        // Jump straight to normal cycle
        if (onNormalCycleCallbackRef.current) {
          onNormalCycleCallbackRef.current();
          addLog('Normal cycle activated by operator.');
        }
      }
      if (e.code === 'KeyF') {
        isFrozenRef.current = !isFrozenRef.current;
        update({ isFrozen: isFrozenRef.current });
        addLog('System ' + (isFrozenRef.current ? 'FROZEN' : 'UNFROZEN') + '.');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addLog, update, sendV2X]);

  // Ambulance movement loop with active vehicle anti-collision safety
  useEffect(() => {
    if (!useMockData) return;
    addLog('System ready. Press ENTER to dispatch ambulance.');
    const interval = setInterval(() => {
      if (!simRunningRef.current || isFrozenRef.current) return;
      
      const currentX = xRef.current;
      const ambZ = AMB_LANE_Z;

      // Check if any car is directly obstructing the ambulance path ahead
      let isObstructed = false;
      const vehicleList = vehiclesRef.current?.current || (Array.isArray(vehiclesRef.current) ? vehiclesRef.current : null);
      
      if (vehicleList && vehicleList.length > 0) {
        for (let i = 0; i < vehicleList.length; i++) {
          const veh = vehicleList[i];
          if (!veh || !veh.pos) continue;

          // 1. Eastbound cars on the same avenue:
          if (veh.type === 'E') {
            const dx = veh.pos.x - currentX;
            const dz = Math.abs(veh.pos.z - ambZ);
            // If vehicle is in front (dx between 0 and 7.5 units) and still occupying the central corridor (dz < 1.85)
            if (dx > 0 && dx < 7.5 && dz < 1.85) {
              isObstructed = true;
              break;
            }
          } 
          // 2. Cross-traffic cars (North/South/West) traversing the intersection
          else {
            const dx = Math.abs(veh.pos.x - currentX);
            const dz = Math.abs(veh.pos.z - ambZ);
            // If near the junction and vehicle is in the intersection path
            if (dx < 5.0 && dz < 2.5) {
              isObstructed = true;
              break;
            }
          }
        }
      }

      // Target speed: approach cruising (0.44 u/tick = ~8.8 u/s),
      // post-junction exit speed (0.62 u/tick = ~12.4 u/s)
      const targetMaxSpeed = currentX >= CLEARED_X ? 0.62 : AMB_SPEED_DX;

      // Smooth deceleration if obstructed ahead; smooth acceleration to target speed when path is clear
      if (isObstructed) {
        currentSpeedRef.current = Math.max(0, currentSpeedRef.current - 0.08);
      } else {
        const accelRate = 0.03;
        currentSpeedRef.current = Math.min(targetMaxSpeed, currentSpeedRef.current + accelRate);
      }

      xRef.current += currentSpeedRef.current;
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
        // Broadcast clearance event to mobile app for Thank You screen
        sendV2X('V2X_CLEARANCE_CONFIRMED');
      }
      if (x > AMB_WRAP_X) {
        simRunningRef.current = false;
        xRef.current = AMB_START_X;
        currentSpeedRef.current = AMB_SPEED_DX;
        addLog('Ambulance exited. Press ENTER for next run.');
        update({
          isSimulationRunning: false,
          ambulancePosition: { x: AMB_START_X, y: 0.02, z: AMB_LANE_Z, rotation: -Math.PI / 2 },
        });
        return;
      }
      update({ ambulancePosition: { x, y: 0.02, z: AMB_LANE_Z, rotation: -Math.PI / 2 } });
    }, 50);
    return () => clearInterval(interval);
  }, [useMockData, addLog, update, sendV2X]);

  return {
    ambulancePosition: state.ambulancePosition,
    isSimulationRunning: state.isSimulationRunning,
    isFrozen: state.isFrozen,
    auditLogs: state.auditLogs,
    isPreempted: false,
    registerCallbacks,
    registerVehiclesRef,
  };
}
