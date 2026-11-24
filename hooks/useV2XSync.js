// hooks/useV2XSync.js
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

const CHANNEL_NAME = 'SEMTOS_V2X_LIVE_BUS_V1';
const STORAGE_KEY = 'SEMTOS_V2X_LATEST_SNAPSHOT_V1';
const CMD_STORAGE_KEY = 'SEMTOS_V2X_LATEST_CMD_V1';
const LIVE_TIMEOUT_MS = 1500;

export { ROAD_NODES, ORIGIN_LNG, ORIGIN_LAT, signalArms, offsetLngLatPerp, buildRoadTrafficLinesGeoJSON } from './corridorGeometry';
import { twinToRoadGeo, vehicleToRoadGeo } from './corridorGeometry';
export { twinToRoadGeo, vehicleToRoadGeo };

export function haversineMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Publisher Hook — Used inside `src/app/page.js` to broadcast 20Hz live telemetry + vehicles
 */
export function useV2XBroadcaster({
  selectedCase,
  case1Stream,
  case1Signal,
  case3,
  vehiclesRef,
  espIp,
  isWifiEnabled,
  lastWifiByteSent,
  serialLastByte,
  isSerialConnected,
  onRemoteCommand,
  dispatch,
}) {
  const channelRef = useRef(null);
  const latest = useRef({});

  useEffect(() => {
    latest.current = {
      selectedCase, case1Stream, case1Signal, case3, vehiclesRef, espIp,
      isWifiEnabled, lastWifiByteSent, serialLastByte, isSerialConnected, onRemoteCommand, dispatch,
    };
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if ('BroadcastChannel' in window) {
      channelRef.current = new BroadcastChannel(CHANNEL_NAME);
    }
    return () => {
      channelRef.current?.close();
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCommand = (cmd) => {
      if (!cmd || !cmd.action) return;
      const handler = latest.current.onRemoteCommand;
      if (handler) return handler(cmd.action, cmd);
      if (cmd.action === 'FREEZE') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyF', key: 'f', bubbles: true }));
      } else if (cmd.action === 'NORMAL_CYCLE') {
        window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyN', key: 'n', bubbles: true }));
      }
    };

    let bc = null;
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'SEMTOS_CMD' && ev.data.payload?.action !== 'DISPATCH') handleCommand(ev.data.payload);
      };
    }

    const onStorage = (ev) => {
      if (ev.key === CMD_STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          if (parsed.action !== 'DISPATCH') handleCommand(parsed);
        } catch (_) {}
      }
    };
    window.addEventListener('storage', onStorage);

    let commandPollPending = false;
    let active = true;
    const cmdPollTimer = setInterval(() => {
      if (commandPollPending) return;
      commandPollPending = true;
      fetch('/api/v2x?consumeCommands=1', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (!active) return;
          data?.commands?.forEach(cmd => handleCommand({ ...cmd.payload, action: cmd.command }));
        })
        .catch(() => {})
        .finally(() => { commandPollPending = false; });
    }, 250);

    return () => {
      active = false;
      bc?.close();
      clearInterval(cmdPollTimer);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  // 20Hz Telemetry Publisher
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let tick = 0;
    let snapshotPending = false;
    const interval = setInterval(() => {
      const {
        selectedCase, case1Stream, case1Signal, case3, vehiclesRef, espIp,
        isWifiEnabled, lastWifiByteSent, serialLastByte, isSerialConnected,
      } = latest.current;
      if (selectedCase !== 1 && selectedCase !== 3) return;
      const c1Pos = case1Stream?.ambulancePosition || { x: -120, y: 0.5, z: -6.0, rotation: -Math.PI / 2 };
      const c1Geo = twinToRoadGeo(c1Pos.x, c1Pos.z, { ambId: 'AMB_1' });

      const c3PosA = case3?.ambulanceA?.position || { x: 2.2, y: 0.55, z: 90, rotation: 0 };
      const c3PosB = case3?.ambulanceB?.position || { x: 90, y: 0.55, z: -2.89, rotation: Math.PI / 2 };
      const wpIdxB = case3?.ambulanceB?.currentWaypointIdx ?? 0;

      const c3GeoA = twinToRoadGeo(c3PosA.x, c3PosA.z, { ambId: 'AMB_A' });
      const c3GeoB = twinToRoadGeo(c3PosB.x, c3PosB.z, { ambId: 'AMB_B', wpIdx: wpIdxB });

      // Serialize live civilian vehicles from TrafficManager.jsx
      const rawVehicles = vehiclesRef?.current || [];
      const vehicles = rawVehicles.map((veh) => {
        const vx = veh.pos?.x ?? 0;
        const vz = veh.pos?.z ?? 0;
        const geo = vehicleToRoadGeo(vx, vz, veh.type, selectedCase);
        return {
          id: veh.id,
          type: veh.type,
          x: Number(vx.toFixed(2)),
          z: Number(vz.toFixed(2)),
          speed: Number((veh.speed || 0).toFixed(2)),
          state: veh.state || 'IDLE_QUEUE',
          ble: Boolean(veh.receivesBLE),
          lngLat: geo.lngLat,
          bearing: Number(geo.bearing.toFixed(1)),
        };
      });

      const payload = {
        timestamp: Date.now(),
        selectedCase,
        signals: selectedCase === 1 ? {
          phase: case1Signal?.phase || 'ALL_RED',
          signalPhase: case1Signal?.signalPhase || 'ALL_RED',
          nGreen: Boolean(case1Signal?.nGreen),
          sGreen: Boolean(case1Signal?.sGreen),
          eGreen: Boolean(case1Signal?.eGreen),
          wGreen: Boolean(case1Signal?.wGreen),
          nYellow: Boolean(case1Signal?.nYellow),
          sYellow: Boolean(case1Signal?.sYellow),
          eYellow: Boolean(case1Signal?.eYellow),
          wYellow: Boolean(case1Signal?.wYellow),
          timeRemaining: case1Signal?.timeRemaining ?? 15,
          isPreempted: Boolean(case1Signal?.isPreempted),
        } : {
          phase: case3?.signals?.phase || 'ALL_RED',
          signalPhase: case3?.signals?.phaseLabel || 'STANDBY',
          nGreen: Boolean(case3?.signals?.nGreen),
          sGreen: Boolean(case3?.signals?.sGreen),
          eGreen: Boolean(case3?.signals?.eGreen),
          wGreen: Boolean(case3?.signals?.wGreen),
          nYellow: Boolean(case3?.signals?.nYellow),
          sYellow: Boolean(case3?.signals?.sYellow),
          eYellow: Boolean(case3?.signals?.eYellow),
          wYellow: Boolean(case3?.signals?.wYellow),
          timeRemaining: case3?.signals?.timeRemaining ?? 15,
          isPreempted: Boolean(case3?.deadlockDetected && !case3?.trafficCycleActive),
        },
        vehicles,
        dispatch: latest.current.dispatch ?? null,
        case1: {
          isSimulationRunning: Boolean(case1Stream?.isSimulationRunning),
          isFrozen: Boolean(case1Stream?.isFrozen),
          ambulancePosition: c1Pos,
          ambulanceLngLat: c1Geo.lngLat,
          ambulanceBearing: c1Geo.bearing,
          distanceToJunction: Math.max(0, Math.round(0 - c1Pos.x)),
        },
        case3: {
          isSimulationRunning: Boolean(case3?.isSimulationRunning),
          isFrozen: Boolean(case3?.isFrozen),
          deadlockDetected: Boolean(case3?.deadlockDetected),
          trafficCycleActive: Boolean(case3?.trafficCycleActive),
          ambulanceA: {
            ...(case3?.ambulanceA || {}),
            position: c3PosA,
            lngLat: c3GeoA.lngLat,
            bearing: c3GeoA.bearing,
          },
          ambulanceB: {
            ...(case3?.ambulanceB || {}),
            position: c3PosB,
            currentWaypointIdx: wpIdxB,
            lngLat: c3GeoB.lngLat,
            bearing: c3GeoB.bearing,
          },
          metrics: case3?.metrics || {
            directJunctionDelaySec: 48,
            macroDetourDurationSec: 18,
            netTimeSavedSec: 30,
            co2ReductionPct: 64,
          },
        },
        hardware: {
          espIp: espIp || '192.168.4.1',
          isWifiEnabled: Boolean(isWifiEnabled),
          lastByte: lastWifiByteSent || serialLastByte || 'R',
          isSerialConnected: Boolean(isSerialConnected),
        },
      };

      try {
        channelRef.current?.postMessage({ type: 'SEMTOS_STATE', payload });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch (_) {}

      tick += 1;
      if (tick % 2 === 0 && !snapshotPending) {
        snapshotPending = true;
        fetch('/api/v2x', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'SNAPSHOT', payload }),
          cache: 'no-store'
        }).catch(() => {}).finally(() => { snapshotPending = false; });
      }
    }, 50);

    return () => clearInterval(interval);
  }, []);
}

export const useV2XPublisher = useV2XBroadcaster;

// ── Standalone Traffic Physics Helper (mirrors TrafficManager.jsx) ──
function createStandaloneVehicles(caseId) {
  const cars = [];
  let id = 1;
  const SPAWN = 55;

  if (caseId === 3) {
    // Northbound (Brigade Rd -> Kamaraj Rd)
    [
      { perp: 1.2, pull: 1.0, zs: [16, 36, 58] },
      { perp: 3.4, pull: 5.0, zs: [19, 42, 66] },
    ].forEach((lane) => {
      lane.zs.forEach((z) => {
        cars.push({
          id: id++, type: 'N', axis: 'z', perpAxis: 'x', sign: -1,
          x: lane.perp, z, homePerp: lane.perp, pullOverPerp: lane.pull,
          stopLine: 11, startPos: SPAWN, wrapPos: -SPAWN - 20,
          speed: 0, state: 'IDLE_QUEUE', ble: false,
        });
      });
    });

    // Southbound (Kamaraj Rd -> Brigade Rd)
    [
      { perp: -3.1, pull: -3.4, zs: [-14, -22, -30] },
      { perp: -1.8, pull: -3.2, zs: [-18, -26, -34] },
    ].forEach((lane) => {
      lane.zs.forEach((z) => {
        cars.push({
          id: id++, type: 'S', axis: 'z', perpAxis: 'x', sign: 1,
          x: lane.perp, z, homePerp: lane.perp, pullOverPerp: lane.pull,
          stopLine: -11, startPos: -SPAWN - 10, wrapPos: SPAWN,
          speed: 0, state: 'IDLE_QUEUE', ble: false,
        });
      });
    });

    // West Approach (Eastbound on M.G. Rd West)
    [
      { perp: 1.8, xs: [-13, -23, -35, -48] },
      { perp: 3.5, xs: [-16, -27, -39, -53] },
    ].forEach((lane) => {
      lane.xs.forEach((x) => {
        cars.push({
          id: id++, type: 'E', axis: 'x', perpAxis: 'z', sign: 1,
          x, z: lane.perp, homePerp: lane.perp, pullOverPerp: lane.perp,
          stopLine: -8, startPos: -SPAWN - 20, wrapPos: SPAWN,
          speed: 0, state: 'IDLE_QUEUE', ble: false,
        });
      });
    });

    // East Approach Gridlock (Westbound on M.G. Rd East)
    [
      { x: 16.2, z: -1.8 }, { x: 25.9, z: -2.4 }, { x: 42.0, z: -2.35 },
      { x: 20.8, z: -3.7 }, { x: 26.8, z: -5.0 }, { x: 38.8, z: -5.15 },
    ].forEach((c) => {
      cars.push({
        id: id++, type: 'W', axis: 'x', perpAxis: 'z', sign: -1,
        x: c.x, z: c.z, homePerp: c.z, pullOverPerp: c.z,
        stopLine: 8, startPos: 43, wrapPos: -SPAWN - 20,
        speed: 0, state: 'IDLE_QUEUE', ble: false,
      });
    });
  } else {
    // Case 01 Standard 4-Way Queue
    const lanes = [
      { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perp: 2.5,  pull: 3.1,  stopLine: 11,  wrap: -SPAWN - 20, start: SPAWN,       cnt: 3, stag: 0, sp: 8 },
      { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perp: 1.0,  pull: 2.5,  stopLine: 11,  wrap: -SPAWN - 20, start: SPAWN,       cnt: 3, stag: 5, sp: 8 },
      { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1,  perp: -3.1, pull: -3.4, stopLine: -11, wrap: SPAWN,       start: -SPAWN - 10, cnt: 3, stag: 0, sp: 8 },
      { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1,  perp: -1.8, pull: -3.2, stopLine: -11, wrap: SPAWN,       start: -SPAWN - 10, cnt: 3, stag: 5, sp: 8 },
      { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1,  perp: -7.5, pull: -9.0, stopLine: -7,  wrap: SPAWN,       start: -SPAWN - 10, cnt: 8, stag: 0, sp: 7 },
      { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1,  perp: -4.5, pull: -2.0, stopLine: -7,  wrap: SPAWN,       start: -SPAWN - 10, cnt: 8, stag: 5, sp: 7 },
      { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perp: 4.5,  pull: 1.5,  stopLine: 6,   wrap: -SPAWN - 10, start: SPAWN,       cnt: 4, stag: 0, sp: 8 },
      { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perp: 7.5,  pull: 9.0,  stopLine: 6,   wrap: -SPAWN - 10, start: SPAWN,       cnt: 4, stag: 5, sp: 8 },
    ];
    lanes.forEach((l) => {
      for (let i = 0; i < l.cnt; i++) {
        const p = l.stopLine - l.sign * (2 + l.stag + i * l.sp);
        cars.push({
          id: id++, type: l.dir, axis: l.axis, perpAxis: l.perpAxis, sign: l.sign,
          x: l.axis === 'x' ? p : l.perp,
          z: l.axis === 'z' ? p : l.perp,
          homePerp: l.perp, pullOverPerp: l.pull,
          stopLine: l.stopLine, startPos: l.start, wrapPos: l.wrap,
          speed: 0, state: 'IDLE_QUEUE', ble: false,
        });
      }
    });
  }

  return cars;
}

function stepStandaloneVehicles(cars, { caseId, dt, ambPos, isPreempted, nGreen, sGreen, eGreen, wGreen }) {
  const NORMAL_SPEED = 7.0;
  const lerp = (a, b, t) => a + (b - a) * Math.min(1, t);

  cars.forEach((veh) => {
    const inJunction = veh.x > -5.0 && veh.x < 3.5 && veh.z > -9.5 && veh.z < 9.5;
    const axisVal = veh.axis === 'x' ? veh.x : veh.z;
    const perpVal = veh.perpAxis === 'x' ? veh.x : veh.z;
    const distToStop = (veh.stopLine - axisVal) * veh.sign;
    const approaching = !inJunction && distToStop >= 0 && distToStop < 22;

    const isGreen =
      veh.type === 'N' ? nGreen :
      veh.type === 'S' ? sGreen :
      veh.type === 'E' ? eGreen : wGreen;

    let shouldYield = false;
    if (!inJunction && isPreempted && ambPos) {
      const distAmb = Math.hypot(veh.x - ambPos.x, veh.z - ambPos.z);
      if (caseId === 3 && veh.type === 'N') {
        if (veh.z >= 25.0 && distAmb <= 28 && ambPos.z > veh.z - 30) shouldYield = true;
      } else if (caseId === 1 && veh.type === 'E') {
        if (distAmb <= 16 && veh.x < -20 && ambPos.x <= veh.x + 30) shouldYield = true;
      }
    }

    if (inJunction && (veh.state === 'IDLE_QUEUE' || veh.state === 'SLOWING_FORWARD')) {
      veh.state = 'DRIVING_GREEN';
    } else if (!inJunction) {
      if (shouldYield) {
        veh.state = Math.abs(perpVal - veh.pullOverPerp) < 0.25 ? 'HOLDING' : 'YIELDING';
      } else if (veh.state === 'YIELDING' || veh.state === 'HOLDING') {
        veh.state = 'RESUMING_LANE';
      } else if (isGreen) {
        if (veh.state === 'IDLE_QUEUE' || veh.state === 'SLOWING_FORWARD') veh.state = 'DRIVING_GREEN';
      } else if (approaching) {
        veh.state = distToStop < 2 ? 'IDLE_QUEUE' : 'SLOWING_FORWARD';
      } else if (veh.state === 'IDLE_QUEUE') {
        veh.state = 'DRIVING_GREEN';
      }
    }

    if (veh.state === 'RESUMING_LANE' && Math.abs(perpVal - veh.homePerp) < 0.25) {
      veh.state = (!isGreen && !inJunction) ? 'IDLE_QUEUE' : 'DRIVING_GREEN';
    }

    let targetSpeed = NORMAL_SPEED;
    let targetPerp = veh.homePerp;
    veh.ble = false;

    if (veh.state === 'IDLE_QUEUE') {
      targetSpeed = 0;
    } else if (veh.state === 'SLOWING_FORWARD') {
      targetSpeed = NORMAL_SPEED * Math.max(0, Math.min(1, distToStop / 18));
    } else if (veh.state === 'YIELDING' || veh.state === 'HOLDING') {
      targetSpeed = 0;
      targetPerp = veh.pullOverPerp;
      veh.ble = true;
    } else if (veh.state === 'RESUMING_LANE') {
      targetSpeed = NORMAL_SPEED * 0.45;
    }

    // Car-following collision avoidance
    let blocked = false;
    let blockDist = Infinity;
    let leaderSpeed = 0;
    for (let i = 0; i < cars.length; i++) {
      const o = cars[i];
      if (o.id === veh.id || o.type !== veh.type) continue;
      const oAxis = o.axis === 'x' ? o.x : o.z;
      const oPerp = o.perpAxis === 'x' ? o.x : o.z;
      const dPar = (oAxis - axisVal) * veh.sign;
      const dPerp = Math.abs(oPerp - perpVal);
      if (dPar > 0 && dPar < 14 && dPerp < 1.8 && dPar < blockDist) {
        blocked = true;
        blockDist = dPar;
        leaderSpeed = o.speed;
      }
    }

    if (blocked && veh.state !== 'IDLE_QUEUE' && veh.state !== 'HOLDING') {
      targetSpeed = blockDist < 7.2 ? 0 : Math.min(targetSpeed, leaderSpeed);
    }

    veh.speed = lerp(veh.speed, targetSpeed, dt * 4.5);
    const step = approaching && !isGreen
      ? Math.min(veh.speed * dt, Math.max(0, distToStop - 1))
      : veh.speed * dt;
    const nextAxis = axisVal + step * veh.sign;
    const nextPerp = lerp(perpVal, targetPerp, dt * 1.5);

    if (veh.axis === 'x') {
      veh.x = nextAxis;
      veh.z = nextPerp;
    } else {
      veh.z = nextAxis;
      veh.x = nextPerp;
    }

    if ((veh.sign === 1 && nextAxis > veh.wrapPos) || (veh.sign === -1 && nextAxis < veh.wrapPos)) {
      if (veh.axis === 'x') {
        veh.x = veh.startPos;
        veh.z = veh.homePerp;
      } else {
        veh.z = veh.startPos;
        veh.x = veh.homePerp;
      }
      veh.speed = 0;
      veh.state = 'DRIVING_GREEN';
    }
  });

  return cars.map((v) => {
    const geo = vehicleToRoadGeo(v.x, v.z, v.type, caseId);
    return {
      id: v.id,
      type: v.type,
      x: Number(v.x.toFixed(2)),
      z: Number(v.z.toFixed(2)),
      speed: Number(v.speed.toFixed(2)),
      state: v.state,
      ble: v.ble,
      lngLat: geo.lngLat,
      bearing: Number(geo.bearing.toFixed(1)),
    };
  });
}

function createInitialStandaloneState() {
  const c1Geo = twinToRoadGeo(-120, -6.0, { ambId: 'AMB_1' });
  const c3GeoA = twinToRoadGeo(2.2, 90.0, { ambId: 'AMB_A' });
  const c3GeoB = twinToRoadGeo(90.0, -2.89, { ambId: 'AMB_B', wpIdx: 0 });
  const initialCars = createStandaloneVehicles(1).map((v) => {
    const geo = vehicleToRoadGeo(v.x, v.z, v.type);
    return { ...v, lngLat: geo.lngLat, bearing: Number(geo.bearing.toFixed(1)) };
  });

  return {
    timestamp: Date.now(),
    selectedCase: 1,
    isStandaloneFallback: true,
    vehicles: initialCars,
    signals: {
      phase: 'ALL_RED',
      signalPhase: 'ALL_RED',
      nGreen: false,
      sGreen: false,
      eGreen: false,
      wGreen: false,
      nYellow: false,
      sYellow: false,
      eYellow: false,
      wYellow: false,
      timeRemaining: 15,
      isPreempted: false,
    },
    case1: {
      isSimulationRunning: false,
      isFrozen: false,
      ambulancePosition: { x: -120, y: 0.5, z: -6.0, rotation: -Math.PI / 2 },
      ambulanceLngLat: c1Geo.lngLat,
      ambulanceBearing: c1Geo.bearing,
      distanceToJunction: 120,
    },
    case3: {
      isSimulationRunning: false,
      isFrozen: false,
      deadlockDetected: false,
      trafficCycleActive: false,
      ambulanceA: {
        id: 'AMB_A',
        name: 'Ambulance A (Cardiac - Brigade Rd)',
        status: 'IDLE_STANDBY',
        position: { x: 2.2, y: 0.55, z: 90, rotation: 0 },
        lngLat: c3GeoA.lngLat,
        bearing: c3GeoA.bearing,
        distanceToJunction: 90,
      },
      ambulanceB: {
        id: 'AMB_B',
        name: 'Ambulance B (Trauma - M.G. Rd East)',
        status: 'IDLE_STANDBY',
        position: { x: 90, y: 0.55, z: -2.89, rotation: Math.PI / 2 },
        lngLat: c3GeoB.lngLat,
        bearing: c3GeoB.bearing,
        currentWaypointIdx: 0,
        waypointName: 'Awaiting Dispatch (M.G. Road East)',
        detourActive: false,
      },
      metrics: {
        directJunctionDelaySec: 48,
        macroDetourDurationSec: 18,
        netTimeSavedSec: 30,
        co2ReductionPct: 64,
      },
    },
    hardware: {
      espIp: '192.168.4.1',
      isWifiEnabled: false,
      lastByte: 'R',
      isSerialConnected: false,
    },
  };
}

/**
 * Subscriber Hook — Used inside `/ambulance` and `/driver` pages
 */
export function useV2XReceiver() {
  const [state, setState] = useState(createInitialStandaloneState);
  const lastExternalPacketRef = useRef(0);
  const lastLocalPacketRef = useRef(0);
  const standaloneRef = useRef(null);
  if (!standaloneRef.current) standaloneRef.current = {
    selectedCase: 1,
    running: false,
    frozen: false,
    c1X: -120,
    c3ZA: 90,
    c3XB: 90,
    c3ZB: -2.89,
    c3Wp: 0,
    c3NormalCycle: false,
    cycleArmIdx: 0,
    cycleTimer: 15.0,
    vehicles: createStandaloneVehicles(1),
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    let requestPending = false;
    let lastTimestamp = 0;
    const receive = (snapshot, local) => {
      if (!active || !snapshot?.timestamp) return;
      if (local) lastLocalPacketRef.current = Date.now();
      if (snapshot.timestamp <= lastTimestamp) return;
      lastTimestamp = snapshot.timestamp;
      lastExternalPacketRef.current = Date.now();
      setState({ ...snapshot, isStandaloneFallback: false });
    };

    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Date.now() - (parsed.timestamp || 0) < LIVE_TIMEOUT_MS) receive(parsed, true);
      }
    } catch (_) {}

    let bc = null;
    if ('BroadcastChannel' in window) {
      bc = new BroadcastChannel(CHANNEL_NAME);
      bc.onmessage = (ev) => {
        if (ev.data?.type === 'SEMTOS_STATE' && ev.data.payload) {
          receive(ev.data.payload, true);
        }
      };
    }

    const onStorage = (ev) => {
      if (ev.key === STORAGE_KEY && ev.newValue) {
        try {
          const parsed = JSON.parse(ev.newValue);
          receive(parsed, true);
        } catch (_) {}
      }
    };
    window.addEventListener('storage', onStorage);

    const netPollInterval = setInterval(() => {
      if (requestPending || Date.now() - lastLocalPacketRef.current < 350) return;

      requestPending = true;
      fetch('/api/v2x', { cache: 'no-store' })
        .then(r => r.json())
        .then(data => {
          if (data?.ok && data.snapshotAgeMs < LIVE_TIMEOUT_MS) {
            receive(data.snapshot, false);
          }
        })
        .catch(() => {})
        .finally(() => { requestPending = false; });
    }, 100);

    // Standalone 20Hz physics fallback loop when `/` is not open in another tab
    const fallbackTimer = setInterval(() => {
      if (Date.now() - lastExternalPacketRef.current < LIVE_TIMEOUT_MS) return;

      const s = standaloneRef.current;
      if (s.frozen) return;

      if (s.selectedCase === 1) {
        let phase = 'ALL_RED';
        let eGreen = false, wGreen = false, nGreen = false, sGreen = false;
        let eYellow = false, wYellow = false, nYellow = false, sYellow = false;
        let isPreempted = false;

        if (s.running) {
          s.c1X += 0.55;
          if (s.c1X >= -85 && s.c1X < 15) {
            phase = 'W_GREEN';
            eGreen = true;
            wGreen = true;
            isPreempted = true;
          } else if (s.c1X >= 15) {
            phase = 'E_RESUME';
            eGreen = true;
          }
          if (s.c1X > 150) {
            s.c1X = -120;
            s.running = false;
          }
        } else {
          // Keep ordinary traffic moving while the standalone HUD awaits dispatch.
          s.cycleTimer -= 0.05;
          if (s.cycleTimer <= 0) {
            s.cycleArmIdx = (s.cycleArmIdx + 1) % 2;
            s.cycleTimer = 15;
          }
          const avenue = s.cycleArmIdx === 0;
          const green = s.cycleTimer > 3;
          const yellow = s.cycleTimer <= 3 && s.cycleTimer > 1;
          eGreen = wGreen = avenue && green;
          nGreen = sGreen = !avenue && green;
          eYellow = wYellow = avenue && yellow;
          nYellow = sYellow = !avenue && yellow;
          if (green || yellow) phase = avenue ? 'MG_ROAD' : 'BRIGADE_KAMARAJ';
        }

        const c1Pos = { x: s.c1X, y: 0.5, z: -6.0, rotation: -Math.PI / 2 };
        const c1Geo = twinToRoadGeo(c1Pos.x, c1Pos.z, { ambId: 'AMB_1' });
        const vehicles = stepStandaloneVehicles(s.vehicles, {
          caseId: 1,
          dt: 0.05,
          ambPos: c1Pos,
          isPreempted,
          nGreen, sGreen, eGreen, wGreen,
        });

        setState((prev) => ({
          ...prev,
          timestamp: Date.now(),
          selectedCase: 1,
          isStandaloneFallback: true,
          dispatch: s.dispatch ?? null,
          vehicles,
          signals: {
            ...prev.signals,
            phase,
            signalPhase: phase,
            eGreen, wGreen, nGreen, sGreen,
            eYellow, wYellow, nYellow, sYellow,
            timeRemaining: s.running ? null : Math.ceil(s.cycleTimer),
            isPreempted,
          },
          case1: {
            isSimulationRunning: s.running,
            isFrozen: s.frozen,
            ambulancePosition: c1Pos,
            ambulanceLngLat: c1Geo.lngLat,
            ambulanceBearing: c1Geo.bearing,
            distanceToJunction: Math.max(0, Math.round(0 - s.c1X)),
          },
        }));
      } else {
        let wpName = 'Awaiting Dispatch (M.G. Road East)';
        if (s.running && !s.c3NormalCycle) {
          s.c3ZA = Math.max(-120, s.c3ZA - 0.55);
          if (s.c3Wp === 0) {
            wpName = 'Leg 1: M.G. Rd East -> Turn 1 (Kamaraj Rd)';
            s.c3XB -= 0.55;
            if (s.c3XB <= 47.0) { s.c3XB = 47.0; s.c3Wp = 1; }
          } else if (s.c3Wp === 1) {
            wpName = 'Leg 2: Kamaraj Rd North -> Turn 2 (Cubbon Rd)';
            s.c3ZB -= 0.55;
            if (s.c3ZB <= -60.0) { s.c3ZB = -60.0; s.c3Wp = 2; }
          } else if (s.c3Wp === 2) {
            wpName = 'Leg 3: Cubbon Rd West -> Turn 3 (Central St)';
            s.c3XB -= 0.55;
            if (s.c3XB <= -87.0) { s.c3XB = -87.0; s.c3Wp = 3; }
          } else if (s.c3Wp === 3) {
            wpName = 'Leg 4: Central St South -> Anil Kumble Circle';
            s.c3ZB += 0.55;
            if (s.c3ZB >= -2.89) { s.c3ZB = -2.89; s.c3Wp = 4; }
          } else {
            wpName = 'Leg 5: M.G. Road Westbound Departure (Bypass Complete)';
            s.c3XB = Math.max(-135, s.c3XB - 0.55);
          }

          if (s.c3ZA <= -40 && s.c3Wp === 4 && s.c3XB <= -135) {
            s.c3NormalCycle = true;
            s.cycleArmIdx = 0;
            s.cycleTimer = 15.0;
          }
        } else if (s.running && s.c3NormalCycle) {
          s.cycleTimer -= 0.05;
          if (s.cycleTimer <= 0) {
            s.cycleArmIdx = (s.cycleArmIdx + 1) % 4;
            s.cycleTimer = 15.0;
          }
          wpName = 'Delivered — Normal Traffic Cycle Active';
        }

        const c3GeoA = twinToRoadGeo(2.2, s.c3ZA, { ambId: 'AMB_A' });
        const c3GeoB = twinToRoadGeo(s.c3XB, s.c3ZB, { ambId: 'AMB_B', wpIdx: s.c3Wp });

        let sGreen = s.running && !s.c3NormalCycle;
        let nGreen = s.running && !s.c3NormalCycle;
        let wGreen = false;
        let eGreen = false;

        if (s.running && s.c3NormalCycle) {
          wGreen = s.cycleArmIdx === 0;
          sGreen = s.cycleArmIdx === 1;
          eGreen = s.cycleArmIdx === 2;
          nGreen = s.cycleArmIdx === 3;
        }

        const isPreempted = s.running && !s.c3NormalCycle;
        const ambAPos = { x: 2.2, y: 0.55, z: s.c3ZA, rotation: 0 };
        const vehicles = stepStandaloneVehicles(s.vehicles, {
          caseId: 3,
          dt: 0.05,
          ambPos: ambAPos,
          isPreempted,
          nGreen, sGreen, eGreen, wGreen,
        });

        setState((prev) => ({
          ...prev,
          timestamp: Date.now(),
          selectedCase: 3,
          isStandaloneFallback: true,
          dispatch: s.dispatch ?? null,
          vehicles,
          signals: {
            ...prev.signals,
            phase: !s.running ? 'ALL_RED' : s.c3NormalCycle ? 'NORMAL_CYCLE' : 'S_GREEN_CORRIDOR',
            signalPhase: !s.running
              ? 'STANDBY — ALL RED'
              : s.c3NormalCycle
              ? 'POST-CLEARANCE NORMAL TRAFFIC CYCLE'
              : 'BRIGADE RD GREEN (AMB A) • KAMARAJ-CUBBON DETOUR (AMB B)',
            sGreen, nGreen, wGreen, eGreen,
            eYellow: false, wYellow: false, nYellow: false, sYellow: false,
            timeRemaining: Math.ceil(s.cycleTimer),
            isPreempted,
          },
          case3: {
            ...prev.case3,
            isSimulationRunning: s.running,
            isFrozen: s.frozen,
            deadlockDetected: isPreempted,
            trafficCycleActive: s.c3NormalCycle,
            ambulanceA: {
              ...prev.case3.ambulanceA,
              status: s.c3ZA <= -40 ? 'DELIVERED' : s.running ? 'CORRIDOR_ACTIVE' : 'IDLE_STANDBY',
              position: ambAPos,
              lngLat: c3GeoA.lngLat,
              bearing: c3GeoA.bearing,
              distanceToJunction: Math.max(0, Math.round(s.c3ZA)),
            },
            ambulanceB: {
              ...prev.case3.ambulanceB,
              status: s.c3NormalCycle ? 'DELIVERED' : s.running ? 'DETOUR_ACTIVE' : 'IDLE_STANDBY',
              position: { x: s.c3XB, y: 0.55, z: s.c3ZB, rotation: 0 },
              lngLat: c3GeoB.lngLat,
              bearing: c3GeoB.bearing,
              currentWaypointIdx: s.c3Wp,
              waypointName: wpName,
              detourActive: isPreempted,
            },
          },
        }));
      }
    }, 50);

    return () => {
      active = false;
      bc?.close();
      window.removeEventListener('storage', onStorage);
      clearInterval(fallbackTimer);
      clearInterval(netPollInterval);
    };
  }, []);

  const sendCommand = useCallback((action, extra = {}) => {
    const cmd = { action, ...extra, ts: Date.now() };
    if (Date.now() - lastExternalPacketRef.current < LIVE_TIMEOUT_MS) {
      if (Date.now() - lastLocalPacketRef.current < 350) {
        try {
          if ('BroadcastChannel' in window) {
            const bc = new BroadcastChannel(CHANNEL_NAME);
            bc.postMessage({ type: 'SEMTOS_CMD', payload: cmd });
            bc.close();
          } else {
            localStorage.setItem(CMD_STORAGE_KEY, JSON.stringify(cmd));
          }
          return;
        } catch (_) {}
      }

      fetch('/api/v2x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'COMMAND', command: action, payload: extra }),
        cache: 'no-store'
      }).catch(() => {});
      return;
    }

    const s = standaloneRef.current;
    if (action === 'FREEZE') {
      s.frozen = !s.frozen;
      const caseKey = s.selectedCase === 1 ? 'case1' : 'case3';
      setState(prev => ({ ...prev, [caseKey]: { ...prev[caseKey], isFrozen: s.frozen } }));
    } else if (action === 'SWITCH_CASE') {
      s.selectedCase = extra.caseId || 1;
      s.dispatch = null;
      s.running = false;
      s.frozen = false;
      s.c1X = -120;
      s.c3ZA = 90;
      s.c3XB = 90;
      s.c3ZB = -2.89;
      s.c3Wp = 0;
      s.c3NormalCycle = false;
      s.cycleArmIdx = 0;
      s.cycleTimer = 15;
      s.vehicles = createStandaloneVehicles(s.selectedCase);
    }
  }, []);

  const startDispatch = useCallback(async dispatch => {
    if (Date.now() - lastExternalPacketRef.current < LIVE_TIMEOUT_MS) {
      const response = await fetch('/api/v2x', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'COMMAND', command: 'DISPATCH', payload: { dispatchId: dispatch.id } }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      const deadline = Date.now() + 8000;
      while (Date.now() < deadline) {
        const result = await fetch('/api/v2x', { cache: 'no-store' });
        if (result.ok && (await result.json()).snapshot?.dispatch?.id === dispatch.id) return;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      throw new Error('The dashboard did not confirm dispatch. Your intake is saved and you can retry.');
    }

    const s = standaloneRef.current;
    if (s.running && !s.c3NormalCycle) throw new Error('A dispatch is already active.');
    Object.assign(s, {
      selectedCase: dispatch.caseId, dispatch, running: true, frozen: false,
      c1X: -120, c3ZA: 90, c3XB: 90, c3ZB: -2.89, c3Wp: 0, c3NormalCycle: false,
      cycleArmIdx: 0, cycleTimer: 15, vehicles: createStandaloneVehicles(dispatch.caseId),
    });
  }, []);

  return { state, sendCommand, startDispatch };
}

export const useV2XSubscriber = useV2XReceiver;
