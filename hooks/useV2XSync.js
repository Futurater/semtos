// hooks/useV2XSync.js
"use client";

import { useEffect, useRef, useState, useCallback } from 'react';

const CHANNEL_NAME = 'SEMTOS_V2X_LIVE_BUS_V1';
const STORAGE_KEY = 'SEMTOS_V2X_LATEST_SNAPSHOT_V1';
const CMD_STORAGE_KEY = 'SEMTOS_V2X_LATEST_CMD_V1';
const DEMO_STORAGE_KEY = 'SEMTOS_DEMO_MODE_V1';
const LIVE_TIMEOUT_MS = 4500;

function readStoredDemoMode() {
  try {
    return typeof window !== 'undefined' && window.localStorage.getItem(DEMO_STORAGE_KEY) === '1';
  } catch (_) {
    return false;
  }
}

function writeStoredDemoMode(enabled) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(DEMO_STORAGE_KEY, enabled ? '1' : '0');
    }
  } catch (_) {}
}

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
const CASE2_PHASE_LABELS = {
  ready: 'Ready to run',
  approach: 'Ambulances approaching',
  eastGreen: 'Eastbound priority',
  eastClearance: 'Clearing the eastbound approach',
  northGreen: 'Northbound priority',
  clear: 'Junction cleared',
  complete: 'Both ambulances cleared',
};

function case2MapSnapshot(simulation, frozen) {
  const { phase, northStatus, east, north } = simulation;
  const active = phase !== 'ready' && phase !== 'complete';
  const unit = (position, direction, instruction) => ({
    position: { x: position.x, z: position.z },
    ...vehicleToRoadGeo(position.x, position.z, direction, 2),
    instruction,
  });
  return {
    phase, phaseLabel: CASE2_PHASE_LABELS[phase],
    isSimulationRunning: active, isFrozen: Boolean(frozen),
    east: unit(east, 'E', CASE2_PHASE_LABELS[phase === 'northGreen' ? 'clear' : phase]),
    north: unit(north, 'N', phase === 'complete' ? 'Junction cleared' : northStatus),
  };
}

export function useV2XBroadcaster({
  selectedCase,
  case1Stream,
  case1Signal,
  case2,
  case2Frozen,
  readCase2Signals,
  case3,
  vehiclesRef,
  espIp,
  isWifiEnabled,
  lastWifiByteSent,
  serialLastByte,
  isSerialConnected,
  onRemoteCommand,
  dispatch,
  demoMode,
}) {
  const channelRef = useRef(null);
  const latest = useRef({});

  useEffect(() => {
    latest.current = {
      selectedCase, case1Stream, case1Signal, case2, case2Frozen, readCase2Signals, case3, vehiclesRef, espIp,
      isWifiEnabled, lastWifiByteSent, serialLastByte, isSerialConnected, onRemoteCommand, dispatch, demoMode,
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
        selectedCase, case1Stream, case1Signal, case2, case2Frozen, readCase2Signals, case3, vehiclesRef, espIp,
        isWifiEnabled, lastWifiByteSent, serialLastByte, isSerialConnected,
      } = latest.current;
      if (![1, 2, 3].includes(selectedCase) || (selectedCase === 2 && !case2)) return;
      const handoff = selectedCase === 2 ? case2MapSnapshot(case2, case2Frozen) : null;
      const c1Pos = case1Stream?.ambulancePosition || { x: -120, y: 0.5, z: -6.0, rotation: -Math.PI / 2 };
      const c1Geo = twinToRoadGeo(c1Pos.x, c1Pos.z, { ambId: 'AMB_1' });

      const c3PosA = case3?.ambulanceA?.position || { x: 2.2, y: 0.55, z: 90, rotation: 0 };
      const c3PosB = case3?.ambulanceB?.position || { x: 90, y: 0.55, z: -2.89, rotation: Math.PI / 2 };
      const wpIdxB = case3?.ambulanceB?.currentWaypointIdx ?? 0;

      const c3GeoA = twinToRoadGeo(c3PosA.x, c3PosA.z, { ambId: 'AMB_A' });
      const c3GeoB = twinToRoadGeo(c3PosB.x, c3PosB.z, { ambId: 'AMB_B', wpIdx: wpIdxB });

      // Serialize live civilian vehicles from TrafficManager.jsx
      const rawVehicles = handoff ? case2.cars : vehiclesRef?.current || [];
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
          state: handoff ? (veh.speed > 0.25 ? 'MOVING' : 'IDLE_QUEUE') : veh.state || 'IDLE_QUEUE',
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
        } : handoff ? {
          ...readCase2Signals(case2),
          signalPhase: handoff.phaseLabel,
          isPreempted: handoff.phase === 'eastGreen' || handoff.phase === 'northGreen',
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
        case2: handoff,
        dispatch: latest.current.dispatch ?? null,
        demoMode: Boolean(latest.current.demoMode),
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

// ── Pure JS Standalone Case 2 Simulation (mirrors components/case2Simulation.js without Three.js) ──
const C2_EAST_CAR_STOP = -10;
const C2_EAST_CLEAR = 5.85;
const C2_EAST_TRAFFIC_EXIT = 72;
const C2_EAST_YIELD_RADIUS = 12;
const C2_NORTH_STOP = 16.7;
const C2_NORTH_CLEAR = -11.85;
const C2_NORTH_START = 66.2;
const C2_NORTH_DISPATCH_EAST_X = -112;
const C2_NORTH_LANE = 0.81;
const C2_NORTH_PASS_LANE = 2.56;
const C2_NORTH_JUNCTION_LANE = 2.35;
const C2_NORTH_QUEUE_RETURN = 40;
const C2_EAST_DEST = 88;
const C2_NORTH_DEST = -67;
const C2_AMB_CRUISE = 10;
const C2_CAR_CRUISE = 6;
const C2_NORTH_CRAWL = 5;
const C2_AMBULANCE = { length: 2.16, width: 0.79 };
const C2_CAR = { length: 1.64, width: 0.70 };
const C2_EDGES = { top: -9.58, bottom: -1.24, westTop: 9.58, westBottom: 1.24, left: -3.69, right: 3.44 };
const C2_NORMAL_ARMS = ['E', 'N', 'S', 'W'];
const C2_NORMAL_ROUTES = {
  E: { stop: C2_EAST_CAR_STOP, clear: 7, exit: 72, entry: -79 },
  N: { stop: C2_NORTH_STOP, clear: -13, exit: -58, entry: 61 },
  S: { stop: -14, clear: 15, exit: 61, entry: -58 },
  W: { stop: 11, clear: -8, exit: -79, entry: 72 },
};

const c2Clamp = (v, min, max) => Math.min(max, Math.max(min, v));
const c2Lerp = (a, b, t) => a + (b - a) * t;
const c2Smoothstep = (x, min, max) => {
  if (x <= min) return 0;
  if (x >= max) return 1;
  const t = (x - min) / (max - min);
  return t * t * (3 - 2 * t);
};

function c2Footprint(heading, steering, size = C2_CAR) {
  const sideways = Math.abs(Math.cos(steering)) * size.width + Math.abs(Math.sin(steering)) * size.length;
  const forward = Math.abs(Math.cos(steering)) * size.length + Math.abs(Math.sin(steering)) * size.width;
  return heading === 'E' || heading === 'W' ? { x: forward, z: sideways } : { x: sideways, z: forward };
}

function c2RoadLimits(type) {
  if (type === 'E') return [C2_EDGES.top, C2_EDGES.bottom];
  if (type === 'W') return [C2_EDGES.westBottom, C2_EDGES.westTop];
  return type === 'N' ? [0, C2_EDGES.right] : [C2_EDGES.left, 0];
}

function c2Overlaps(a, aExt, b, bExt, gap = 0) {
  return Math.abs(a.x - b.x) < aExt.x + bExt.x + gap && Math.abs(a.z - b.z) < aExt.z + bExt.z + gap;
}

function createStandaloneCase2() {
  const lanes = [
    { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perpHome: 2.5, stopLine: 11 },
    { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perpHome: 1.0, stopLine: 11 },
    { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1, perpHome: -3.1, stopLine: -11 },
    { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1, perpHome: -1.8, stopLine: -11 },
    { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1, perpHome: -7.5, stopLine: -7 },
    { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1, perpHome: -4.5, stopLine: -7 },
    { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perpHome: 4.5, stopLine: 6 },
    { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perpHome: 7.5, stopLine: 6 },
  ];

  const cars = [];
  let nextId = 1;
  lanes.forEach((lane, laneIndex) => {
    const count = lane.dir === 'E' ? 9 : lane.axis === 'z' ? 3 : 4;
    const stagger = (laneIndex % 2) * 5;
    const spacing = lane.dir === 'E' ? 7 : 8;
    for (let index = 0; index < count; index++) {
      const longitudinal = lane.stopLine - lane.sign * (2 + stagger + index * spacing);
      const id = nextId++;
      const pos = {
        x: lane.axis === 'x' ? longitudinal : lane.perpHome,
        y: 0.2,
        z: lane.axis === 'z' ? longitudinal : lane.perpHome,
      };
      const car = {
        id,
        type: lane.dir,
        axis: lane.axis,
        perpAxis: lane.perpAxis,
        sign: lane.sign,
        homePerp: lane.perpHome,
        queueIndex: index,
        pos,
        rotY: 0,
        speed: 0,
        receivesBLE: false,
      };

      if (car.type === 'E') {
        const outside = car.homePerp < -6;
        const gaps = outside ? [0, 1.4, -0.8, -2.1, 0.7, 2.4, 1, -0.7, 1.6] : [0.1, -1.3, 0.8, 2, -0.4, -1.7, 0.9, 2.1, 0.3];
        car.pos.z = (outside ? -7.9 : -4.1) + Math.sin(car.id * 2.4) * 0.13;
        car.pos.x -= (outside ? 3.5 : 3) + gaps[index];
        if (index === 2 || (outside && index === 5)) car.pos.z += outside ? 0.45 : -0.45;
        car.yieldPlan = { side: outside ? -8.45 : -3.45, advance: 0.65, delay: 0.24 + (index % 3) * 0.08, duration: 1.15 };
      } else if (car.type === 'N') {
        const curbLane = car.homePerp > 2;
        car.pos.x = curbLane ? 2.65 : 0.90;
        car.pos.z = (curbLane ? [23.5, 29.8, 50] : [22.2, 49.8, 57.2])[index];
        if (curbLane && index === 2) {
          car.yieldPlan = { side: 2.65, advance: 15, range: 15.5, delay: 0.42, duration: 4.0 };
        } else if (!curbLane && index === 2) {
          car.yieldPlan = { side: 0.71, advance: 0.55, range: 6.1, delay: 0.28, duration: 1.2 };
        } else if (!curbLane && index === 0) {
          car.yieldPlan = { side: 2.65, advance: 4.7, range: 10, delay: 0.36, duration: 1.8, sideDelay: 0.46 };
        }
      } else {
        car.pos[car.axis] -= car.sign * 5;
        if (car.type === 'S' && car.homePerp > -2) car.pos.x = -1.35;
      }

      const [min, max] = c2RoadLimits(car.type);
      car.pos[car.perpAxis] = c2Clamp(car.pos[car.perpAxis], min + C2_CAR.width, max - C2_CAR.width);
      car.returnPerp = car.pos[car.perpAxis];
      cars.push(car);
    }
  });

  return {
    phase: 'ready',
    northStatus: 'Ready to run',
    east: { x: -120, y: 0.6, z: -6, rotation: -Math.PI / 2, speed: 0 },
    north: { x: C2_NORTH_LANE, y: 0.67, z: C2_NORTH_START, rotation: 0, speed: 0 },
    cars,
  };
}

function c2Drive(veh, pos, axis, sign, limit, cruise, dt) {
  const room = Math.max(0, (limit - pos[axis]) * sign);
  const targetSpeed = Math.min(cruise, Math.sqrt(2 * 7 * room));
  veh.speed += c2Clamp(targetSpeed - veh.speed, -8 * dt, 5.5 * dt);
  const step = Math.min(veh.speed * dt, room);
  pos[axis] += sign * step;
  if (step === room) veh.speed = 0;
}

function c2FollowLimit(pos, ext, axis, sign, limit, leader, leaderExt, gap) {
  const perp = axis === 'x' ? 'z' : 'x';
  if ((leader[axis] - pos[axis]) * sign <= 0) return limit;
  if (Math.abs(leader[perp] - pos[perp]) >= ext[perp] + leaderExt[perp] + 0.10) return limit;
  const safeLimit = leader[axis] - sign * (ext[axis] + leaderExt[axis] + gap);
  return sign === 1 ? Math.min(limit, safeLimit) : Math.max(limit, safeLimit);
}

function c2AmbLimit(cars, amb, type, axis, sign, limit) {
  const ext = c2Footprint(type, type === 'N' ? amb.rotation : 0, C2_AMBULANCE);
  for (const car of cars) {
    if (car.type === type) limit = c2FollowLimit(amb, ext, axis, sign, limit, car.pos, c2Footprint(type, car.rotY), 0.45);
  }
  return limit;
}

function c2NorthYaw(x, yaw, size) {
  const room = Math.min(x, C2_EDGES.right - x);
  const safeYaw = Math.asin(c2Clamp((room - size.width) / size.length, 0, 1));
  return c2Clamp(yaw, -safeYaw, safeYaw);
}

function c2AdvanceNorth(sim, northHeld, dt) {
  const { north, cars } = sim;
  const limit = c2AmbLimit(cars, north, 'N', 'z', -1, northHeld ? C2_NORTH_STOP : C2_NORTH_DEST);
  const next = { x: north.x, z: north.z, speed: north.speed };
  c2Drive(next, next, 'z', -1, limit, northHeld ? C2_NORTH_CRAWL : C2_AMB_CRUISE, dt);
  if (next.z === north.z) {
    north.speed = next.speed;
    return;
  }
  const moveRight = c2Smoothstep(C2_NORTH_START - next.z, 0, 4.5);
  const moveLeft = c2Smoothstep(45.3 - next.z, 0, 45.3 - C2_NORTH_QUEUE_RETURN);
  next.x = next.z >= 14.6
    ? c2Lerp(C2_NORTH_LANE, C2_NORTH_PASS_LANE, moveRight * (1 - moveLeft))
    : c2Lerp(C2_NORTH_LANE, C2_NORTH_JUNCTION_LANE, c2Smoothstep(14.6 - next.z, 0, 8.6));
  const yaw = -Math.atan2(next.x - north.x, north.z - next.z);
  const rot = c2NorthYaw(next.x, yaw, C2_AMBULANCE);
  const ext = c2Footprint('N', rot, C2_AMBULANCE);
  if (cars.some(c => c2Overlaps(next, ext, c.pos, c2Footprint(c.type, c.rotY), 0.12))) {
    north.speed = 0;
    return;
  }
  north.x = next.x;
  north.z = next.z;
  north.speed = next.speed;
  north.rotation = rot;
}

function stepStandaloneCase2(sim, dt) {
  if (dt <= 0 || sim.phase === 'ready') return;
  const keepsJunction = (car) => {
    const { stop, clear } = C2_NORMAL_ROUTES[car.type];
    const coord = car.pos[car.axis];
    return (coord - stop) * car.sign > 0.001 && (coord - clear) * car.sign < 0;
  };
  const mergeNorthCar = (car) => {
    const next = { x: Math.min(2.65, car.pos.x + 1.15 * dt), z: car.pos.z };
    const rot = c2NorthYaw(next.x, -0.19, C2_CAR);
    const ext = c2Footprint('N', rot);
    if (c2Overlaps(next, ext, sim.north, c2Footprint('N', sim.north.rotation, C2_AMBULANCE), 0.2)) return;
    if (sim.cars.some(o => o !== car && c2Overlaps(next, ext, o.pos, c2Footprint(o.type, o.rotY), 0.2))) return;
    car.pos.x = next.x;
    car.rotY = next.x === 2.65 ? 0 : rot;
  };

  if (sim.traffic) {
    if (sim.phase !== 'complete') {
      c2Drive(sim.east, sim.east, 'x', 1, C2_EAST_DEST, C2_AMB_CRUISE, dt);
      c2AdvanceNorth(sim, false, dt);
      if (sim.north.z <= C2_NORTH_DEST && sim.east.x >= C2_EAST_DEST) sim.phase = 'complete';
    }
    const { cars, east, north, traffic, phase } = sim;
    const activeArm = C2_NORMAL_ARMS[traffic.index];
    const ambulances = phase === 'complete' ? [] : [[east, 'E', 0], [north, 'N', north.rotation]];
    for (const car of cars) {
      const { stop, exit, entry } = C2_NORMAL_ROUTES[car.type];
      const { pos, axis, sign, type, perpAxis } = car;
      if (type === 'N' && pos.z >= C2_NORTH_STOP - 0.001 && pos.z < 28 && pos.x < 2.65) mergeNorthCar(car);
      if (type === 'S' && pos.z <= stop + 0.001 && pos.z > -26 && pos.x > -2.55) {
        const next = { x: Math.max(-2.55, pos.x - dt), z: pos.z };
        if (!cars.some(o => o !== car && c2Overlaps(next, c2Footprint(type, 0), o.pos, c2Footprint(o.type, o.rotY), 0.2))) pos.x = next.x;
      }
      const approachingFixture = (type === 'N' && pos.x < 2.2) || (type === 'S' && pos.x > -2.5);
      const ext = c2Footprint(type, car.rotY);
      const allowed = keepsJunction(car) || (traffic.stage === 'green' && activeArm === type && !approachingFixture);
      const beyondStop = (pos[axis] - stop) * sign > 0.001;
      let limit = allowed || beyondStop ? exit : stop;
      for (const o of cars) if (o !== car && o.type === type) limit = c2FollowLimit(pos, ext, axis, sign, limit, o.pos, c2Footprint(type, o.rotY), 1.0);
      for (const [amb, dir, yaw] of ambulances) if (dir === type) limit = c2FollowLimit(pos, ext, axis, sign, limit, amb, c2Footprint(dir, yaw, C2_AMBULANCE), 0.8);
      const next = { ...pos, speed: car.speed };
      c2Drive(next, next, axis, sign, limit, C2_CAR_CRUISE, dt);
      if (!cars.some(o => o !== car && c2Overlaps(next, ext, o.pos, c2Footprint(o.type, o.rotY), 0.10)) &&
          !ambulances.some(([a, dir, yaw]) => c2Overlaps(next, ext, a, c2Footprint(dir, yaw, C2_AMBULANCE), 0.10))) {
        pos[axis] = next[axis];
        car.speed = next.speed;
      } else car.speed = 0;
      if (pos[axis] !== exit || phase !== 'complete') continue;
      const spawn = { ...pos, [axis]: entry, [perpAxis]: car.returnPerp };
      if (cars.some(o => o !== car && c2Overlaps(spawn, c2Footprint(type, 0), o.pos, c2Footprint(o.type, o.rotY), 1.2))) continue;
      pos.x = spawn.x; pos.y = spawn.y; pos.z = spawn.z;
      car.rotY = 0;
    }
    traffic.remaining -= dt;
    if (traffic.remaining <= 0) {
      if (traffic.stage === 'green') {
        traffic.stage = traffic.initial ? 'clearance' : 'yellow';
        traffic.remaining = traffic.initial ? 0.5 : 2.5;
      } else if (traffic.stage === 'yellow') {
        traffic.stage = 'clearance';
        traffic.remaining = 0.5;
      } else if (!cars.some(keepsJunction)) {
        traffic.index = (traffic.index + 1) % C2_NORMAL_ARMS.length;
        traffic.initial = false;
        traffic.stage = 'green';
        traffic.remaining = 12.5;
      }
    }
    return;
  }

  const { cars, east, north } = sim;
  const northHeld = sim.phase !== 'northGreen' && sim.phase !== 'clear';
  for (const car of cars) {
    if (!car.yieldPlan) continue;
    const eastbound = car.type === 'E';
    const amb = eastbound ? east : north;
    const { axis, perpAxis, sign, pos } = car;
    const distance = (pos[axis] - amb[axis]) * sign;
    const reactionDist = eastbound ? C2_EAST_YIELD_RADIUS : car.yieldPlan.range;
    const canStart = eastbound ? sim.phase === 'eastGreen' && !car.eastCommitted && pos.x < C2_EAST_CAR_STOP - 2 : northHeld;
    const nearAmb = canStart && Math.hypot(distance, pos[perpAxis] - amb[perpAxis]) <= reactionDist;
    car.receivesBLE = nearAmb && distance >= -2;
    if (car.yieldProgress === 1) continue;
    if (!car.yieldOrigin) {
      if (!nearAmb || distance < 0) continue;
      car.reactionTime = (car.reactionTime ?? 0) + dt;
      if (car.reactionTime < car.yieldPlan.delay) continue;
      car.yieldOrigin = { ...pos };
      car.yieldProgress = 0;
    }
    const { side, advance, duration, sideDelay = 0 } = car.yieldPlan;
    const progress = Math.min(1, car.yieldProgress + dt / duration);
    const eased = c2Smoothstep(progress, 0, 1);
    const sideways = c2Smoothstep(progress, sideDelay, 1);
    const goingRight = (side - car.yieldOrigin[perpAxis]) * sign;
    const desiredSteering = Math.sign(goingRight) * (eastbound ? -0.28 * Math.sin(Math.PI * progress) : 0.24 * Math.sin(Math.PI * sideways));
    const lateral = c2Lerp(car.yieldOrigin[perpAxis], side, sideways);
    const steering = car.type === 'N' ? c2NorthYaw(lateral, desiredSteering, C2_CAR) : desiredSteering;
    const ext = c2Footprint(car.type, steering);
    const [min, max] = c2RoadLimits(car.type);
    const next = {
      [axis]: car.yieldOrigin[axis] + sign * advance * eased,
      [perpAxis]: c2Clamp(lateral, min + ext[perpAxis], max - ext[perpAxis]),
    };
    if (c2Overlaps(next, ext, amb, c2Footprint(car.type, eastbound ? 0 : north.rotation, C2_AMBULANCE), 0.11)) continue;
    if (cars.some(o => o !== car && c2Overlaps(next, ext, o.pos, c2Footprint(o.type, o.rotY), 0.11))) continue;
    car.speed = Math.abs(next[axis] - pos[axis]) / dt;
    pos[axis] = next[axis];
    pos[perpAxis] = next[perpAxis];
    car.rotY = steering;
    car.yieldProgress = progress;
  }

  const eastLimit = c2AmbLimit(cars, east, 'E', 'x', 1, C2_EAST_DEST);
  const inNorthQueue = north.z < 63 && northHeld;
  c2Drive(east, east, 'x', 1, eastLimit, C2_AMB_CRUISE, dt);
  if (east.x >= C2_NORTH_DISPATCH_EAST_X) c2AdvanceNorth(sim, northHeld, dt);

  for (const car of cars) {
    const eastRolling = car.type === 'E' && sim.phase !== 'approach';
    const northReleased = car.type === 'N' && (sim.phase === 'northGreen' || sim.phase === 'clear');
    const closingNorthGap = car.type === 'N' && !northReleased && car.homePerp < 2 && !car.yieldPlan && car.pos.z > north.z;
    if ((!eastRolling && !northReleased && !closingNorthGap) || (car.yieldOrigin && car.yieldProgress < 1)) continue;
    const amb = eastRolling ? east : north;
    const { pos, axis, sign, type } = car;
    const needsMerge = northReleased && pos.x < 2.65 && pos.z < 27;
    if (needsMerge) mergeNorthCar(car);
    const ext = c2Footprint(type, car.rotY);
    const heldAtLine = closingNorthGap || (sim.phase === 'clear' && pos.z >= C2_NORTH_STOP);
    if (eastRolling) {
      if (sim.phase === 'eastGreen' && !car.eastCommitted) {
        const timeUntilHandoff = (C2_EAST_CLEAR - east.x) / C2_AMB_CRUISE;
        const timeToCross = (C2_EAST_CLEAR - pos.x) / C2_CAR_CRUISE + 0.65;
        if (pos.x >= C2_EAST_CAR_STOP - 2 && timeToCross <= timeUntilHandoff) {
          car.eastCommitted = true;
          car.receivesBLE = false;
        }
      } else if (sim.phase !== 'eastGreen' && pos.x <= C2_EAST_CAR_STOP) {
        car.eastCommitted = false;
      }
    }
    let limit = eastRolling ? (car.eastCommitted ? C2_EAST_TRAFFIC_EXIT : C2_EAST_CAR_STOP)
      : heldAtLine || needsMerge ? C2_NORTH_STOP : C2_NORTH_DEST;
    if ((northReleased || closingNorthGap) && north.z < pos.z) {
      const ahead = c2Footprint(type, north.rotation, C2_AMBULANCE);
      limit = Math.max(limit, north.z + ext.z + ahead.z + 0.9);
    } else {
      limit = c2FollowLimit(pos, ext, axis, sign, limit, amb, c2Footprint(type, 0, C2_AMBULANCE), 0.9);
    }
    for (const leader of cars) {
      if (leader.type === type && leader !== car) limit = c2FollowLimit(pos, ext, axis, sign, limit, leader.pos, c2Footprint(type, leader.rotY), 1.0);
    }
    c2Drive(car, pos, axis, sign, limit, C2_CAR_CRUISE, dt);
  }

  if (sim.phase === 'approach' && east.x >= -85) sim.phase = 'eastGreen';
  if (northHeld) {
    sim.northStatus = north.z <= C2_NORTH_STOP + 0.01 ? 'Stopped at the red light'
      : !inNorthQueue ? 'Approaching the junction'
      : north.speed > 0.06 ? 'Creeping through traffic' : 'Waiting for a gap';
    if (east.x >= C2_EAST_CLEAR) {
      const corridorClear = !cars.some(c => c.eastCommitted && c.pos.x > C2_EAST_CAR_STOP && c.pos.x - c2Footprint('E', c.rotY).x <= C2_EDGES.right);
      sim.phase = corridorClear ? 'northGreen' : 'eastClearance';
      if (corridorClear) sim.northStatus = 'Green · crossing the junction';
    }
  } else if (north.z <= C2_NORTH_CLEAR) {
    sim.phase = 'clear';
    sim.northStatus = 'Junction clear · hospital-bound';
    sim.traffic = { index: 0, stage: 'green', initial: true, remaining: 5 };
  }
}

function readStandaloneCase2Signals(simulation) {
  const { phase, traffic } = simulation;
  const arm = traffic && C2_NORMAL_ARMS[traffic.index].toLowerCase();
  return {
    phase: traffic ? 'NORMAL_CYCLE' : phase,
    eGreen: phase === 'eastGreen' || (arm === 'e' && traffic.stage === 'green'),
    nGreen: phase === 'northGreen' || (arm === 'n' && traffic.stage === 'green'),
    sGreen: arm === 's' && traffic.stage === 'green',
    wGreen: arm === 'w' && traffic.stage === 'green',
    eYellow: Boolean(traffic?.stage === 'yellow' && arm === 'e'),
    nYellow: Boolean(traffic?.stage === 'yellow' && arm === 'n'),
    sYellow: Boolean(traffic?.stage === 'yellow' && arm === 's'),
    wYellow: Boolean(traffic?.stage === 'yellow' && arm === 'w'),
  };
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
    demoMode: false,
    case2: null,
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
    demoMode: false,
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
    case2: createStandaloneCase2(),
  };

  const emitStandaloneSnapshot = useCallback((s, stepVehicles = false, dt = 0) => {
    if (s.selectedCase === 1) {
      let phase = 'ALL_RED';
      let eGreen = false, wGreen = false, nGreen = false, sGreen = false;
      let eYellow = false, wYellow = false, nYellow = false, sYellow = false;
      let isPreempted = false;

      if (s.running) {
        if (s.c1X >= -85 && s.c1X < 15) {
          phase = 'W_GREEN';
          eGreen = true;
          wGreen = true;
          isPreempted = true;
        } else if (s.c1X >= 15) {
          phase = 'E_RESUME';
          eGreen = true;
        }
      } else {
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
      const vehicles = stepVehicles
        ? stepStandaloneVehicles(s.vehicles, {
            caseId: 1,
            dt,
            ambPos: c1Pos,
            isPreempted,
            nGreen, sGreen, eGreen, wGreen,
          })
        : s.vehicles.map((v) => {
            const geo = vehicleToRoadGeo(v.x, v.z, v.type, 1);
            return {
              id: v.id, type: v.type, x: Number(v.x.toFixed(2)), z: Number(v.z.toFixed(2)),
              speed: Number((v.speed || 0).toFixed(2)), state: v.state, ble: Boolean(v.ble),
              lngLat: geo.lngLat, bearing: Number(geo.bearing.toFixed(1)),
            };
          });

      setState((prev) => ({
        ...prev,
        timestamp: Date.now(),
        selectedCase: 1,
        isStandaloneFallback: true,
        demoMode: s.demoMode,
        dispatch: s.dispatch ?? null,
        case2: null,
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
      return;
    }

    if (s.selectedCase === 2) {
      const c2 = s.case2;
      const handoff = case2MapSnapshot(c2, s.frozen);
      const c2Signals = readStandaloneCase2Signals(c2);
      const vehicles = c2.cars.map((veh) => {
        const geo = vehicleToRoadGeo(veh.pos.x, veh.pos.z, veh.type, 2);
        return {
          id: veh.id,
          type: veh.type,
          x: Number(veh.pos.x.toFixed(2)),
          z: Number(veh.pos.z.toFixed(2)),
          speed: Number((veh.speed || 0).toFixed(2)),
          state: veh.speed > 0.25 ? 'MOVING' : 'IDLE_QUEUE',
          ble: Boolean(veh.receivesBLE),
          lngLat: geo.lngLat,
          bearing: Number(geo.bearing.toFixed(1)),
        };
      });

      setState((prev) => ({
        ...prev,
        timestamp: Date.now(),
        selectedCase: 2,
        isStandaloneFallback: true,
        demoMode: s.demoMode,
        dispatch: s.dispatch ?? null,
        case2: handoff,
        vehicles,
        signals: {
          ...prev.signals,
          ...c2Signals,
          signalPhase: handoff.phaseLabel,
          isPreempted: handoff.phase === 'eastGreen' || handoff.phase === 'northGreen',
        },
      }));
      return;
    }

    const wpName = !s.running
      ? 'Awaiting Dispatch (M.G. Road East)'
      : s.c3NormalCycle
      ? 'Delivered — Normal Traffic Cycle Active'
      : s.c3Wp === 0
      ? 'Leg 1: M.G. Rd East -> Turn 1 (Kamaraj Rd)'
      : s.c3Wp === 1
      ? 'Leg 2: Kamaraj Rd North -> Turn 2 (Cubbon Rd)'
      : s.c3Wp === 2
      ? 'Leg 3: Cubbon Rd West -> Turn 3 (Central St)'
      : s.c3Wp === 3
      ? 'Leg 4: Central St South -> Anil Kumble Circle'
      : 'Leg 5: M.G. Road Westbound Departure (Bypass Complete)';

    const c3GeoA = twinToRoadGeo(2.2, s.c3ZA, { ambId: 'AMB_A' });
    const c3GeoB = twinToRoadGeo(s.c3XB, s.c3ZB, { ambId: 'AMB_B', wpIdx: s.c3Wp });

    let sGreen = s.running && !s.c3NormalCycle;
    let nGreen = s.running && !s.c3NormalCycle;
    let wGreen = false;
    let eGreen = false;
    let sYellow = false, nYellow = false, wYellow = false, eYellow = false;

    if (s.running && s.c3NormalCycle) {
      const isYellow = s.cycleTimer <= 2.5;
      wGreen = s.cycleArmIdx === 0 && !isYellow;
      wYellow = s.cycleArmIdx === 0 && isYellow;
      sGreen = s.cycleArmIdx === 1 && !isYellow;
      sYellow = s.cycleArmIdx === 1 && isYellow;
      eGreen = s.cycleArmIdx === 2 && !isYellow;
      eYellow = s.cycleArmIdx === 2 && isYellow;
      nGreen = s.cycleArmIdx === 3 && !isYellow;
      nYellow = s.cycleArmIdx === 3 && isYellow;
    }

    const isPreempted = s.running && !s.c3NormalCycle;
    const ambAPos = { x: 2.2, y: 0.55, z: s.c3ZA, rotation: 0 };
    const vehicles = stepVehicles
      ? stepStandaloneVehicles(s.vehicles, {
          caseId: 3,
          dt,
          ambPos: ambAPos,
          isPreempted,
          nGreen, sGreen, eGreen, wGreen,
        })
      : s.vehicles.map((v) => {
          const geo = vehicleToRoadGeo(v.x, v.z, v.type, 3);
          return {
            id: v.id, type: v.type, x: Number(v.x.toFixed(2)), z: Number(v.z.toFixed(2)),
            speed: Number((v.speed || 0).toFixed(2)), state: v.state, ble: Boolean(v.ble),
            lngLat: geo.lngLat, bearing: Number(geo.bearing.toFixed(1)),
          };
        });

    setState((prev) => ({
      ...prev,
      timestamp: Date.now(),
      selectedCase: 3,
      isStandaloneFallback: true,
      demoMode: s.demoMode,
      dispatch: s.dispatch ?? null,
      case2: null,
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
        eYellow, wYellow, nYellow, sYellow,
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
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let active = true;
    let requestPending = false;
    let lastTimestamp = 0;
    let lastFallbackTick = performance.now();

    const storedDemo = readStoredDemoMode();
    if (storedDemo) {
      standaloneRef.current.demoMode = true;
      setState((prev) => ({ ...prev, demoMode: true }));
    }

    const receive = (snapshot, local) => {
      if (!active || !snapshot?.timestamp) return;
      if (local) lastLocalPacketRef.current = Date.now();
      if (snapshot.timestamp <= lastTimestamp) return;
      lastTimestamp = snapshot.timestamp;
      lastExternalPacketRef.current = Date.now();
      if (typeof snapshot.demoMode === 'boolean') {
        standaloneRef.current.demoMode = snapshot.demoMode;
      }
      if ([1, 2, 3].includes(snapshot.selectedCase)) {
        if (standaloneRef.current.selectedCase !== snapshot.selectedCase) {
          standaloneRef.current.selectedCase = snapshot.selectedCase;
          standaloneRef.current.running = false;
          standaloneRef.current.frozen = false;
          standaloneRef.current.case2 = createStandaloneCase2();
          standaloneRef.current.vehicles = createStandaloneVehicles(snapshot.selectedCase);
        }
      }
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
      if (ev.key === DEMO_STORAGE_KEY && ev.newValue != null) {
        const enabled = ev.newValue === '1';
        standaloneRef.current.demoMode = enabled;
        setState((prev) => ({ ...prev, demoMode: enabled }));
      } else if (ev.key === STORAGE_KEY && ev.newValue) {
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
      const now = performance.now();
      const dt = Math.min(0.25, Math.max(0.01, (now - lastFallbackTick) / 1000));
      lastFallbackTick = now;
      if (Date.now() - lastExternalPacketRef.current < LIVE_TIMEOUT_MS) return;

      const s = standaloneRef.current;
      if (s.frozen) return;

      if (s.selectedCase === 1) {
        if (s.running) {
          s.c1X += 11 * dt;
          if (s.c1X > 150) {
            s.c1X = -120;
            s.running = false;
          }
        } else {
          // Keep ordinary traffic moving while the standalone HUD awaits dispatch.
          s.cycleTimer -= dt;
          if (s.cycleTimer <= 0) {
            s.cycleArmIdx = (s.cycleArmIdx + 1) % 2;
            s.cycleTimer = 15;
          }
        }
        emitStandaloneSnapshot(s, true, dt);
      } else if (s.selectedCase === 2) {
        let remaining = dt;
        while (remaining > 0) {
          const step = Math.min(remaining, 0.05);
          stepStandaloneCase2(s.case2, step);
          remaining -= step;
        }
        s.running = s.case2.phase !== 'ready' && s.case2.phase !== 'complete';
        emitStandaloneSnapshot(s, false, dt);
      } else {
        const c3Step = 11 * dt;
        if (s.running && !s.c3NormalCycle) {
          s.c3ZA = Math.max(-120, s.c3ZA - c3Step);
          if (s.c3Wp === 0) {
            s.c3XB -= c3Step;
            if (s.c3XB <= 47.0) { s.c3XB = 47.0; s.c3Wp = 1; }
          } else if (s.c3Wp === 1) {
            s.c3ZB -= c3Step;
            if (s.c3ZB <= -60.0) { s.c3ZB = -60.0; s.c3Wp = 2; }
          } else if (s.c3Wp === 2) {
            s.c3XB -= c3Step;
            if (s.c3XB <= -87.0) { s.c3XB = -87.0; s.c3Wp = 3; }
          } else if (s.c3Wp === 3) {
            s.c3ZB += c3Step;
            if (s.c3ZB >= -2.89) { s.c3ZB = -2.89; s.c3Wp = 4; }
          } else {
            s.c3XB = Math.max(-135, s.c3XB - c3Step);
          }

          if (s.c3ZA <= -40 && s.c3Wp === 4 && s.c3XB <= -135) {
            s.c3NormalCycle = true;
            s.cycleArmIdx = 0;
            s.cycleTimer = 15.0;
          }
        } else if (s.running && s.c3NormalCycle) {
          s.cycleTimer -= dt;
          if (s.cycleTimer <= 0) {
            s.cycleArmIdx = (s.cycleArmIdx + 1) % 4;
            s.cycleTimer = 15.0;
          }
        }
        emitStandaloneSnapshot(s, true, dt);
      }
    }, 50);

    return () => {
      active = false;
      bc?.close();
      window.removeEventListener('storage', onStorage);
      clearInterval(fallbackTimer);
      clearInterval(netPollInterval);
    };
  }, [emitStandaloneSnapshot]);

  const sendCommand = useCallback((action, extra = {}) => {
    const cmd = { action, ...extra, ts: Date.now() };
    if (action === 'SET_DEMO_MODE') {
      writeStoredDemoMode(Boolean(extra.enabled));
    }
    if (Date.now() - lastExternalPacketRef.current < LIVE_TIMEOUT_MS) {
      if (lastLocalPacketRef.current > 0 && Date.now() - lastLocalPacketRef.current < LIVE_TIMEOUT_MS) {
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
    const resetStandaloneCase = (targetCase, running = false) => {
      s.selectedCase = targetCase;
      s.dispatch = null;
      s.running = running;
      s.frozen = false;
      s.c1X = -120;
      s.c3ZA = 90;
      s.c3XB = 90;
      s.c3ZB = -2.89;
      s.c3Wp = 0;
      s.c3NormalCycle = false;
      s.cycleArmIdx = 0;
      s.cycleTimer = 15;
      s.case2 = targetCase === 2 && running
        ? { ...createStandaloneCase2(), phase: 'approach', northStatus: 'Approaching the junction' }
        : createStandaloneCase2();
      s.vehicles = createStandaloneVehicles(targetCase);
    };

    if (action === 'SET_DEMO_MODE') {
      s.demoMode = Boolean(extra.enabled);
      writeStoredDemoMode(s.demoMode);
      emitStandaloneSnapshot(s);
    } else if (action === 'FREEZE') {
      s.frozen = !s.frozen;
      emitStandaloneSnapshot(s);
    } else if (action === 'SWITCH_CASE' && [1, 2, 3].includes(extra.caseId)) {
      resetStandaloneCase(extra.caseId, false);
      emitStandaloneSnapshot(s);
    } else if (action === 'DISPATCH_CASE2') {
      resetStandaloneCase(2, true);
      emitStandaloneSnapshot(s);
    } else if (action === 'DISPATCH_DEMO') {
      const target = [1, 2, 3].includes(extra.caseId) ? extra.caseId : s.selectedCase;
      resetStandaloneCase(target, true);
      emitStandaloneSnapshot(s);
    } else if (action === 'RESET_DEMO') {
      resetStandaloneCase(s.selectedCase, false);
      emitStandaloneSnapshot(s);
    }
  }, [emitStandaloneSnapshot]);

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
      cycleArmIdx: 0, cycleTimer: 15, case2: createStandaloneCase2(), vehicles: createStandaloneVehicles(dispatch.caseId),
    });
    emitStandaloneSnapshot(s);
  }, [emitStandaloneSnapshot]);

  return { state, sendCommand, startDispatch };
}

export const useV2XSubscriber = useV2XReceiver;
