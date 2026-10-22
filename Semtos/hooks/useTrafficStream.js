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
    v2xConnected: false,
    networkMode: 'CLOUD_ONLINE', // 'CLOUD_ONLINE' | 'BLE_FALLBACK'
    yoloQueue: {
      queueCount: 4,
      detectedVehicles: 6,
      queueDensity: 'MODERATE',
      recommendedHoldSeconds: 23,
      deadlockDetected: false,
      source: 'SIMULATED_DEFAULT',
    },
    routing: {
      deadlockRerouteActive: false,
      activeRouteType: 'PRIMARY',
      bypassName: 'Residency Rd – St. Marks Rd Emergency Bypass',
    },
    telemetry: {
      unitId: 'AMB-108-BLR',
      speedKmh: 0,
      heading: 275,
      distanceToSignal: 450,
      etaSeconds: 0,
      rssiDbm: -52,
      dispatchLatencyMs: 3.2,
    },
    esp32Signal: {
      ledState: 'RED',
      buzzerActive: false,
      holdSeconds: 23,
    },
    auditLogs: [],
  });

  const simRunningRef          = useRef(false);
  const isFrozenRef            = useRef(false);
  const onAvenueCallbackRef    = useRef(null);
  const onClearedCallbackRef   = useRef(null);
  const onNormalCycleCallbackRef = useRef(null);
  const avenueEventFiredRef    = useRef(false);
  const clearedEventFiredRef   = useRef(false);
  const xRef                   = useRef(AMB_START_X);
  const currentSpeedRef        = useRef(AMB_SPEED_DX);
  const vehiclesRef            = useRef(null);
  const wsRef                  = useRef(null);

  const update = useCallback((patch) => {
    setState((prev) => ({ ...prev, ...patch }));
  }, []);

  const addLog = useCallback((msg, category = 'TWIN') => {
    setState((prev) => {
      const logs = [
        ...prev.auditLogs,
        {
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          timestamp: '[' + new Date().toTimeString().split(' ')[0] + ']',
          category,
          message: msg,
        },
      ];
      if (logs.length > 60) logs.shift();
      return { ...prev, auditLogs: logs };
    });
  }, []);

  const sendV2X = useCallback((payloadOrEventName) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        const packet =
          typeof payloadOrEventName === 'string'
            ? { event: payloadOrEventName, timestamp: Date.now() }
            : { ...payloadOrEventName, timestamp: Date.now() };
        wsRef.current.send(JSON.stringify(packet));
      } catch (e) {
        console.warn('[3D-TWIN] Failed to broadcast V2X event:', e);
      }
    }
  }, []);

  // Trigger 3D Twin Ambulance Dispatch (callable from UI, keyboard, or incoming Phone 1 event)
  const startTwinDispatch = useCallback(
    (broadcastToServer = true) => {
      if (simRunningRef.current) return;
      simRunningRef.current = true;
      avenueEventFiredRef.current = true;
      clearedEventFiredRef.current = false;
      xRef.current = AMB_START_X;
      currentSpeedRef.current = AMB_SPEED_DX;

      addLog('Ambulance dispatched — West corridor preempted GREEN.', 'DISPATCH');
      update({ isSimulationRunning: true });

      if (onAvenueCallbackRef.current) {
        onAvenueCallbackRef.current();
      }
      if (broadcastToServer) {
        sendV2X('V2X_ALERT_TRIGGER');
      }
    },
    [addLog, update, sendV2X]
  );

  // ---- Connect to Authoritative V2X Server on Port 4081 --------------------
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let unmounted = false;

    function connectWS() {
      if (unmounted) return;
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      try {
        ws = new WebSocket(`ws://${host}:4081`);
        wsRef.current = ws;

        ws.onopen = () => {
          update({ v2xConnected: true });
          ws.send(
            JSON.stringify({
              event: 'REGISTER_CLIENT',
              clientType: 'DASHBOARD',
            })
          );
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            switch (data.event) {
              case 'SEMTOS_INIT_STATE': {
                if (data.state) {
                  setState((prev) => ({
                    ...prev,
                    networkMode: data.state.networkMode || prev.networkMode,
                    yoloQueue: data.state.yoloQueue || prev.yoloQueue,
                    routing: data.state.routing || prev.routing,
                    esp32Signal: {
                      ledState: data.state.signal?.esp32LedState || 'RED',
                      buzzerActive: Boolean(data.state.signal?.buzzerActive),
                      holdSeconds: data.state.signal?.greenHoldSeconds || 23,
                    },
                    auditLogs: Array.isArray(data.state.auditLogs)
                      ? data.state.auditLogs.map((l) => ({
                          id: l.id,
                          timestamp: `[${l.timestamp}]`,
                          category: l.category || 'V2X',
                          message: l.message,
                        }))
                      : prev.auditLogs,
                  }));
                }
                break;
              }

              case 'SIMULATION_STARTED':
              case 'V2X_ALERT_TRIGGER': {
                if (!simRunningRef.current) {
                  startTwinDispatch(false);
                } else if (onAvenueCallbackRef.current) {
                  onAvenueCallbackRef.current();
                }
                setState((prev) => ({
                  ...prev,
                  esp32Signal: {
                    ...prev.esp32Signal,
                    ledState: 'GREEN',
                    buzzerActive: true,
                  },
                }));
                break;
              }

              case 'V2X_CLEARANCE_CONFIRMED': {
                if (onClearedCallbackRef.current) {
                  onClearedCallbackRef.current();
                }
                setState((prev) => ({
                  ...prev,
                  esp32Signal: {
                    ...prev.esp32Signal,
                    ledState: 'RED',
                    buzzerActive: false,
                  },
                }));
                break;
              }

              case 'AMBULANCE_TELEMETRY':
              case 'GPS_BROADCAST': {
                setState((prev) => ({
                  ...prev,
                  networkMode: data.networkMode || prev.networkMode,
                  telemetry: {
                    unitId: data.unitId || prev.telemetry.unitId,
                    speedKmh: data.speedKmh ?? prev.telemetry.speedKmh,
                    heading: data.heading ?? prev.telemetry.heading,
                    distanceToSignal: data.distanceToSignal ?? prev.telemetry.distanceToSignal,
                    etaSeconds: data.etaSeconds ?? prev.telemetry.etaSeconds,
                    rssiDbm: data.rssiDbm ?? prev.telemetry.rssiDbm,
                    dispatchLatencyMs: data.dispatchLatencyMs ?? prev.telemetry.dispatchLatencyMs,
                  },
                }));
                if (data.preemptionActive && !simRunningRef.current) {
                  startTwinDispatch(false);
                }
                break;
              }

              case 'YOLO_QUEUE_STATE': {
                setState((prev) => ({
                  ...prev,
                  yoloQueue: data.yoloQueue || prev.yoloQueue,
                  routing: data.routing || prev.routing,
                  esp32Signal: {
                    ...prev.esp32Signal,
                    holdSeconds:
                      data.signal?.greenHoldSeconds ||
                      data.yoloQueue?.recommendedHoldSeconds ||
                      prev.esp32Signal.holdSeconds,
                  },
                }));
                break;
              }

              case 'V2X_DEADLOCK_REROUTE': {
                setState((prev) => ({
                  ...prev,
                  routing: {
                    ...prev.routing,
                    deadlockRerouteActive: Boolean(data.deadlockDetected),
                    activeRouteType: data.deadlockDetected ? 'BYPASS' : 'PRIMARY',
                    bypassName: data.bypassName || prev.routing.bypassName,
                  },
                }));
                break;
              }

              case 'NETWORK_MODE_CHANGED': {
                setState((prev) => ({
                  ...prev,
                  networkMode: data.networkMode || prev.networkMode,
                }));
                break;
              }

              case 'ESP32_SIGNAL_COMMAND': {
                setState((prev) => ({
                  ...prev,
                  esp32Signal: {
                    ledState: data.ledState || prev.esp32Signal.ledState,
                    buzzerActive: Boolean(data.buzzer),
                    holdSeconds: data.holdSeconds ?? prev.esp32Signal.holdSeconds,
                  },
                }));
                break;
              }

              case 'AUDIT_LOG_APPEND': {
                if (data.log) {
                  setState((prev) => {
                    const nextLogs = [
                      ...prev.auditLogs,
                      {
                        id: data.log.id,
                        timestamp: `[${data.log.timestamp}]`,
                        category: data.log.category || 'V2X',
                        message: data.log.message,
                      },
                    ];
                    if (nextLogs.length > 60) nextLogs.shift();
                    return { ...prev, auditLogs: nextLogs };
                  });
                }
                break;
              }

              default:
                break;
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          update({ v2xConnected: false });
          if (!unmounted) {
            reconnectTimer = setTimeout(connectWS, 3000);
          }
        };

        ws.onerror = () => {
          update({ v2xConnected: false });
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
  }, [update, startTwinDispatch]);

  // page.js calls this once to wire up signal-hook callbacks
  const registerCallbacks = useCallback((onAvenue, onCleared, onNormal) => {
    onAvenueCallbackRef.current      = onAvenue;
    onClearedCallbackRef.current     = onCleared;
    onNormalCycleCallbackRef.current = onNormal || null;
  }, []);

  const registerVehiclesRef = useCallback((ref) => {
    vehiclesRef.current = ref;
  }, []);

  // Operator controls exposed to Dashboard UI
  const toggleNetworkMode = useCallback(() => {
    const nextMode = state.networkMode === 'CLOUD_ONLINE' ? 'BLE_FALLBACK' : 'CLOUD_ONLINE';
    update({ networkMode: nextMode });
    sendV2X({ event: 'NETWORK_MODE_TOGGLE', networkMode: nextMode });
  }, [state.networkMode, update, sendV2X]);

  const updateYoloQueue = useCallback(
    (queueCount, source = 'DASHBOARD_SIMULATOR') => {
      sendV2X({
        event: 'YOLO_QUEUE_UPDATE',
        queueCount: Number(queueCount),
        source,
      });
    },
    [sendV2X]
  );

  // ENTER key: dispatch ambulance  |  N key: start normal cycle  |  F key: freeze
  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        startTwinDispatch(true);
      }
      if (e.code === 'KeyN') {
        e.preventDefault();
        if (onNormalCycleCallbackRef.current) {
          onNormalCycleCallbackRef.current();
          addLog('Normal cycle activated by operator.', 'SIGNAL');
        }
      }
      if (e.code === 'KeyF') {
        isFrozenRef.current = !isFrozenRef.current;
        update({ isFrozen: isFrozenRef.current });
        addLog('System ' + (isFrozenRef.current ? 'FROZEN' : 'UNFROZEN') + '.', 'SYSTEM');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addLog, update, startTwinDispatch]);

  // Ambulance 3D movement loop with active vehicle anti-collision safety
  useEffect(() => {
    if (!useMockData) return;
    addLog('System ready. Press ENTER or use /ambulance phone client to dispatch.');
    const interval = setInterval(() => {
      if (!simRunningRef.current || isFrozenRef.current) return;

      const currentX = xRef.current;
      const ambZ = AMB_LANE_Z;

      let isObstructed = false;
      const vehicleList =
        vehiclesRef.current?.current ||
        (Array.isArray(vehiclesRef.current) ? vehiclesRef.current : null);

      if (vehicleList && vehicleList.length > 0) {
        for (let i = 0; i < vehicleList.length; i++) {
          const veh = vehicleList[i];
          if (!veh || !veh.pos) continue;

          if (veh.type === 'E') {
            const dx = veh.pos.x - currentX;
            const dz = Math.abs(veh.pos.z - ambZ);
            if (dx > 0 && dx < 7.5 && dz < 1.85) {
              isObstructed = true;
              break;
            }
          } else {
            const dx = Math.abs(veh.pos.x - currentX);
            const dz = Math.abs(veh.pos.z - ambZ);
            if (dx < 5.0 && dz < 2.5) {
              isObstructed = true;
              break;
            }
          }
        }
      }

      const targetMaxSpeed = currentX >= CLEARED_X ? 0.62 : AMB_SPEED_DX;

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
        addLog('Ambulance on avenue — West corridor GREEN.', 'PREEMPT');
        if (onAvenueCallbackRef.current) onAvenueCallbackRef.current();
      }
      if (!clearedEventFiredRef.current && x >= CLEARED_X) {
        clearedEventFiredRef.current = true;
        addLog('Ambulance cleared junction — sequential release begins.', 'CLEARANCE');
        if (onClearedCallbackRef.current) onClearedCallbackRef.current();
        sendV2X('V2X_CLEARANCE_CONFIRMED');
      }
      if (x > AMB_WRAP_X) {
        simRunningRef.current = false;
        xRef.current = AMB_START_X;
        currentSpeedRef.current = AMB_SPEED_DX;
        addLog('Ambulance exited corridor. Ready for next dispatch.', 'SYSTEM');
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
    v2xConnected: state.v2xConnected,
    networkMode: state.networkMode,
    yoloQueue: state.yoloQueue,
    routing: state.routing,
    telemetry: state.telemetry,
    esp32Signal: state.esp32Signal,
    auditLogs: state.auditLogs,
    isPreempted: state.esp32Signal.ledState === 'GREEN',
    registerCallbacks,
    registerVehiclesRef,
    startTwinDispatch,
    toggleNetworkMode,
    updateYoloQueue,
  };
}
