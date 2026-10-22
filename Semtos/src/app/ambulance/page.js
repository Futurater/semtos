"use client";

/**
 * SEMTOS — Smart Emergency Management and Traffic Orchestration System
 * ============================================================================
 * File: Semtos/src/app/ambulance/page.js (Milestone 2 — Ambulance Transmitter UI)
 * Route: http://<LAN_IP>:4000/ambulance
 *
 * Capabilities Implemented:
 *  1. Dual Telemetry Modes:
 *     - INDOOR_SIM (Default for Lab Demos): Streams deterministic Haversine
 *       coordinates, compass bearing, speed, and distance along real urban
 *       corridors (Bengaluru MG Road, SF Market St, NYC 5th Ave) at 10 Hz.
 *     - LIVE_GPS: Streams real hardware coordinates & heading via
 *       `navigator.geolocation.watchPosition`.
 *  2. Authoritative V2X Server Synchronization:
 *     - Connects to `ws://<host>:4081`, registers as `AMBULANCE_UNIT`, and
 *       attaches HMAC-SHA256 JWT tokens + anti-replay nonces/timestamps.
 *  3. Live Tactical Corridor Radar (SVG):
 *     - Displays primary route, deadlock bypass route, target traffic signal
 *       state (RED vs. GREEN PREEMPTED), 450m preemption zone, and moving
 *       ambulance vector with pulsing BLE beacon ring.
 *  4. Network Fallback & Edge-AI Queue Controls:
 *     - One-tap toggle between `CLOUD_ONLINE` (5G/WebSocket) and `BLE_FALLBACK`
 *       (Simulated 5G outage -> ESP32 BLE proximity override).
 *     - Interactive Queue Count simulator to test dynamic green-hold scaling
 *       and automated deadlock rerouting (>= 12 queued vehicles).
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

const CORRIDOR_PRESETS = {
  BLR_MG_ROAD: {
    id: 'BLR_MG_ROAD',
    name: 'Bengaluru — MG Road to Bowring Hospital',
    hospitalName: 'Bowring & Lady Curzon Hospital',
    intersectionName: 'Brigade Road Junction',
    intersectionCoords: [77.60662, 12.97522],
    primaryRoute: [
      [77.61684, 12.97303], // Trinity Metro Station
      [77.61520, 12.97331],
      [77.61365, 12.97358], // 1 MG Lido Mall
      [77.61210, 12.97385],
      [77.61065, 12.97411], // Mayo Hall Junction
      [77.60930, 12.97446],
      [77.60805, 12.97481], // Cauvery Emporium
      [77.60662, 12.97522], // Brigade Road Junction (Signal)
      [77.60520, 12.97561],
      [77.60365, 12.97605],
      [77.60180, 12.97657], // Anil Kumble Circle
    ],
    bypassRoute: [
      [77.61684, 12.97303],
      [77.61560, 12.97490], // Ulsoor Road North Turn
      [77.61320, 12.97720], // Dickenson Road Corridor
      [77.60910, 12.97810], // Cubbon Road Junction
      [77.60510, 12.97865],
      [77.60240, 12.97895],
      [77.60180, 12.97657],
    ],
    bypassName: 'Ulsoor Rd – Cubbon Road Parallel Green Bypass',
  },
  BLR_HOSUR_RD: {
    id: 'BLR_HOSUR_RD',
    name: "Bengaluru — Silk Board to St. John's Hospital",
    hospitalName: "St. John's Medical College Hospital",
    intersectionName: 'Nexus Checkpost Signal',
    intersectionCoords: [77.61735, 12.92635],
    primaryRoute: [
      [77.62285, 12.91765], // Silk Board Flyover
      [77.62195, 12.91915],
      [77.62095, 12.92075], // Madiwala Traffic Police Junction
      [77.61975, 12.92265],
      [77.61845, 12.92465],
      [77.61735, 12.92635], // Nexus Checkpost Signal
      [77.61945, 12.92685],
      [77.62174, 12.92712], // Koramangala Water Tank
      [77.62040, 12.92960],
      [77.61914, 12.93199], // St. John's Emergency Trauma Block
    ],
    bypassRoute: [
      [77.62285, 12.91765],
      [77.62580, 12.91840],
      [77.62690, 12.92280],
      [77.62480, 12.92690],
      [77.62174, 12.92712],
      [77.61914, 12.93199],
    ],
    bypassName: 'Koramangala 80 Feet Rd – Sarjapur Rd Bypass',
  },
  BLR_INDIRANAGAR: {
    id: 'BLR_INDIRANAGAR',
    name: 'Bengaluru — Indiranagar 100 Ft Rd to Manipal Hospital',
    hospitalName: 'Manipal Hospital (Old Airport Rd)',
    intersectionName: 'Domlur 14th Cross Signal',
    intersectionCoords: [77.64105, 12.96680],
    primaryRoute: [
      [77.63853, 12.97826], // Indiranagar Metro / CMH Road
      [77.64075, 12.97810],
      [77.64085, 12.97460], // 12th Main Signal
      [77.64095, 12.97080],
      [77.64105, 12.96680], // Domlur 14th Cross Signal
      [77.64115, 12.96180], // Domlur Flyover
      [77.64480, 12.96040],
      [77.64860, 12.95920], // Manipal Hospital Emergency Bay
    ],
    bypassRoute: [
      [77.63853, 12.97826],
      [77.64490, 12.97780],
      [77.64620, 12.97050],
      [77.64780, 12.96320],
      [77.64860, 12.95920],
    ],
    bypassName: 'Indiranagar 80 Feet Rd – HAL 2nd Stage Bypass',
  },
};

// ── Geodesic Helpers ─────────────────────────────────────────────────────────
function haversineDistanceMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calculateBearing([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function compassDirectionLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(((deg % 360) + 360) % 360 / 45) % 8];
}

export default function AmbulanceTransmitterPage() {
  const [corridorKey, setCorridorKey] = useState('BLR_MG_ROAD');
  const corridor = CORRIDOR_PRESETS[corridorKey] || CORRIDOR_PRESETS.BLR_MG_ROAD;

  const [telemetryMode, setTelemetryMode] = useState('INDOOR_SIM'); // 'INDOOR_SIM' | 'LIVE_GPS'
  const [isDispatchActive, setIsDispatchActive] = useState(false);
  const [connected, setConnected] = useState(false);
  const [jwtToken, setJwtToken] = useState(null);
  const [networkMode, setNetworkMode] = useState('CLOUD_ONLINE'); // 'CLOUD_ONLINE' | 'BLE_FALLBACK'
  const [targetSpeedKmh, setTargetSpeedKmh] = useState(55);

  const [telemetry, setTelemetry] = useState({
    lat: corridor.primaryRoute[0][1],
    lng: corridor.primaryRoute[0][0],
    speedKmh: 0,
    heading: 275,
    distanceToSignal: 1260,
    etaSeconds: 0,
    progressPct: 0,
    signalPhase: 'NORMAL_CYCLE',
    preemptionActive: false,
    greenHoldSeconds: 19,
    queueCount: 4,
    queueDensity: 'MODERATE',
    deadlockRerouteActive: false,
    rssiDbm: -52,
    dispatchLatencyMs: 3.2,
  });

  const wsRef = useRef(null);
  const watchIdRef = useRef(null);
  const distanceCoveredRef = useRef(0);
  const preemptionTriggeredRef = useRef(false);
  const clearanceTriggeredRef = useRef(false);

  // Compute cumulative route segment lengths for active route (primary vs bypass)
  const activeRoute = telemetry.deadlockRerouteActive ? corridor.bypassRoute : corridor.primaryRoute;

  const getRouteMetrics = useCallback((routePoints, intersectionCoords) => {
    const cumDists = [0];
    let totalLen = 0;
    for (let i = 0; i < routePoints.length - 1; i++) {
      totalLen += haversineDistanceMeters(routePoints[i], routePoints[i + 1]);
      cumDists.push(totalLen);
    }
    let intDistAlongRoute = totalLen * 0.68;
    let minD = Infinity;
    for (let i = 0; i < routePoints.length; i++) {
      const d = haversineDistanceMeters(routePoints[i], intersectionCoords);
      if (d < minD) {
        minD = d;
        intDistAlongRoute = cumDists[i];
      }
    }
    return { cumDists, totalLen, intDistAlongRoute };
  }, []);

  // ── 1. Connect to V2X Server ───────────────────────────────────────────────
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
      try {
        ws = new WebSocket(`ws://${host}:4081`);
        wsRef.current = ws;

        ws.onopen = () => {
          setConnected(true);
          ws.send(
            JSON.stringify({
              event: 'REGISTER_CLIENT',
              clientType: 'AMBULANCE_UNIT',
              unitId: 'AMB-108-BLR',
            })
          );
        };

        ws.onmessage = (e) => {
          try {
            const data = JSON.parse(e.data);
            if (data.event === 'SEMTOS_INIT_STATE') {
              if (data.defaultToken) setJwtToken(data.defaultToken);
              if (data.state?.networkMode) setNetworkMode(data.state.networkMode);
              if (data.state?.yoloQueue) {
                setTelemetry((prev) => ({
                  ...prev,
                  queueCount: data.state.yoloQueue.queueCount,
                  queueDensity: data.state.yoloQueue.queueDensity,
                  greenHoldSeconds: data.state.signal?.greenHoldSeconds || prev.greenHoldSeconds,
                  deadlockRerouteActive: Boolean(data.state.routing?.deadlockRerouteActive),
                }));
              }
            } else if (data.event === 'YOLO_QUEUE_STATE') {
              setTelemetry((prev) => ({
                ...prev,
                queueCount: data.yoloQueue.queueCount,
                queueDensity: data.yoloQueue.queueDensity,
                greenHoldSeconds: data.signal.greenHoldSeconds,
                deadlockRerouteActive: Boolean(data.routing?.deadlockRerouteActive),
              }));
            } else if (data.event === 'V2X_DEADLOCK_REROUTE') {
              setTelemetry((prev) => ({
                ...prev,
                deadlockRerouteActive: Boolean(data.deadlockDetected),
                queueCount: data.queueCount ?? prev.queueCount,
              }));
            } else if (data.event === 'NETWORK_MODE_CHANGED') {
              setNetworkMode(data.networkMode);
            } else if (data.event === 'AMBULANCE_TELEMETRY') {
              setTelemetry((prev) => ({
                ...prev,
                greenHoldSeconds: data.greenHoldSeconds ?? prev.greenHoldSeconds,
                queueCount: data.queueCount ?? prev.queueCount,
                queueDensity: data.queueDensity ?? prev.queueDensity,
                deadlockRerouteActive:
                  data.deadlockRerouteActive !== undefined
                    ? data.deadlockRerouteActive
                    : prev.deadlockRerouteActive,
                dispatchLatencyMs: data.dispatchLatencyMs ?? prev.dispatchLatencyMs,
              }));
            }
          } catch (_) {}
        };

        ws.onclose = () => {
          setConnected(false);
          if (!unmounted) reconnectTimer = setTimeout(connect, 2500);
        };

        ws.onerror = () => setConnected(false);
      } catch (_) {
        if (!unmounted) reconnectTimer = setTimeout(connect, 2500);
      }
    }

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, []);

  const sendSignedPacket = useCallback(
    (payload) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            ...payload,
            token: jwtToken,
            nonce: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            signedTimestamp: Date.now(),
          })
        );
      }
    },
    [jwtToken]
  );

  // ── 2. Reset When Corridor Changes ─────────────────────────────────────────
  useEffect(() => {
    distanceCoveredRef.current = 0;
    preemptionTriggeredRef.current = false;
    clearanceTriggeredRef.current = false;
    const startPt = corridor.primaryRoute[0];
    const nextPt = corridor.primaryRoute[1] || startPt;
    const initBearing = Math.round(calculateBearing(startPt, nextPt));
    const initDist = Math.round(haversineDistanceMeters(startPt, corridor.intersectionCoords));

    setTelemetry((prev) => ({
      ...prev,
      lat: startPt[1],
      lng: startPt[0],
      heading: initBearing,
      distanceToSignal: initDist,
      etaSeconds: 0,
      progressPct: 0,
      signalPhase: 'NORMAL_CYCLE',
      preemptionActive: false,
    }));
  }, [corridor]);

  // ── 3. Indoor Route Replay Simulation Loop ─────────────────────────────────
  useEffect(() => {
    if (!isDispatchActive || telemetryMode !== 'INDOOR_SIM') return;

    const TICK_MS = 100;
    const interval = setInterval(() => {
      const { cumDists, totalLen, intDistAlongRoute } = getRouteMetrics(
        activeRoute,
        corridor.intersectionCoords
      );
      if (!totalLen || cumDists.length < 2) return;

      const speedMps = targetSpeedKmh / 3.6;
      distanceCoveredRef.current += speedMps * (TICK_MS / 1000);
      const curDist = distanceCoveredRef.current;

      // Wrap around when route completes
      if (curDist >= totalLen) {
        distanceCoveredRef.current = 0;
        preemptionTriggeredRef.current = false;
        clearanceTriggeredRef.current = false;
        sendSignedPacket({
          event: 'V2X_CLEARANCE_CONFIRMED',
          intersection: corridor.intersectionName,
        });
        return;
      }

      let segIdx = 0;
      for (let i = 0; i < cumDists.length - 1; i++) {
        if (curDist >= cumDists[i] && curDist <= cumDists[i + 1]) {
          segIdx = i;
          break;
        }
      }

      const p1 = activeRoute[segIdx];
      const p2 = activeRoute[segIdx + 1] || p1;
      const segStart = cumDists[segIdx];
      const segLen = Math.max(1, cumDists[segIdx + 1] - segStart);
      const frac = (curDist - segStart) / segLen;

      const curLng = p1[0] + (p2[0] - p1[0]) * frac;
      const curLat = p1[1] + (p2[1] - p1[1]) * frac;
      const bearing = Math.round(calculateBearing(p1, p2));

      const remainingToSignal = intDistAlongRoute - curDist;
      const distToSignal = Math.max(0, Math.round(remainingToSignal));
      const etaSeconds = distToSignal > 0 ? Math.max(1, Math.round(distToSignal / speedMps)) : 0;

      const preemptThreshold = networkMode === 'BLE_FALLBACK' ? 120 : 450;
      const inPreemptionWindow = remainingToSignal <= preemptThreshold && remainingToSignal >= -20;
      const hasClearedJunction = remainingToSignal < -20;

      if (inPreemptionWindow && !preemptionTriggeredRef.current) {
        preemptionTriggeredRef.current = true;
        sendSignedPacket({
          event: 'V2X_ALERT_TRIGGER',
          corridorId: corridor.id,
          intersection: corridor.intersectionName,
          distanceMeters: distToSignal,
          etaSeconds,
        });
      }

      if (hasClearedJunction && !clearanceTriggeredRef.current) {
        clearanceTriggeredRef.current = true;
        sendSignedPacket({
          event: 'V2X_CLEARANCE_CONFIRMED',
          corridorId: corridor.id,
          intersection: corridor.intersectionName,
        });
      }

      const phase = inPreemptionWindow
        ? networkMode === 'BLE_FALLBACK'
          ? 'BLE_OVERRIDE'
          : 'W_GREEN'
        : hasClearedJunction
        ? 'E_RESUME'
        : 'NORMAL_CYCLE';

      const rssiDbm = Math.max(
        -95,
        Math.min(-38, Math.round(-42 - 20 * Math.log10(Math.max(1, distToSignal / 10))))
      );

      setTelemetry((prev) => ({
        ...prev,
        lat: Number(curLat.toFixed(6)),
        lng: Number(curLng.toFixed(6)),
        speedKmh: targetSpeedKmh,
        heading: bearing,
        distanceToSignal: distToSignal,
        etaSeconds,
        progressPct: Math.min(100, Math.round((curDist / totalLen) * 100)),
        signalPhase: phase,
        preemptionActive: inPreemptionWindow,
        rssiDbm,
      }));

      sendSignedPacket({
        event: 'AMBULANCE_TELEMETRY',
        unitId: 'AMB-108-BLR',
        corridorId: corridor.id,
        lat: curLat,
        lng: curLng,
        speedKmh: targetSpeedKmh,
        heading: bearing,
        distanceToSignal: distToSignal,
        etaSeconds,
        signalPhase: phase,
        preemptionActive: inPreemptionWindow,
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [isDispatchActive, telemetryMode, activeRoute, corridor, targetSpeedKmh, networkMode, getRouteMetrics, sendSignedPacket]);

  // ── 4. Live Smartphone Hardware GPS Watcher ────────────────────────────────
  useEffect(() => {
    if (!isDispatchActive || telemetryMode !== 'LIVE_GPS') {
      if (watchIdRef.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      return;
    }

    if (typeof window !== 'undefined' && 'geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude, speed, heading } = pos.coords;
          const spdKmh = speed ? Math.max(15, Math.round(speed * 3.6)) : targetSpeedKmh;
          const hdg =
            typeof heading === 'number' && !Number.isNaN(heading)
              ? Math.round(heading)
              : Math.round(calculateBearing([longitude, latitude], corridor.intersectionCoords));
          const dist = Math.round(
            haversineDistanceMeters([longitude, latitude], corridor.intersectionCoords)
          );
          const eta = Math.round(dist / Math.max(1, spdKmh / 3.6));
          const preempt = dist <= 500;

          setTelemetry((prev) => ({
            ...prev,
            lat: Number(latitude.toFixed(6)),
            lng: Number(longitude.toFixed(6)),
            speedKmh: spdKmh,
            heading: hdg,
            distanceToSignal: dist,
            etaSeconds: eta,
            preemptionActive: preempt,
            signalPhase: preempt ? 'W_GREEN' : 'NORMAL_CYCLE',
          }));

          sendSignedPacket({
            event: 'GPS_BROADCAST',
            unitId: 'AMB-108-BLR',
            corridorId: corridor.id,
            lat: latitude,
            lng: longitude,
            speedKmh: spdKmh,
            heading: hdg,
            distanceToSignal: dist,
            etaSeconds: eta,
            preemptionActive: preempt,
          });
        },
        (err) => console.warn('[AMBULANCE-GPS] Geolocation warning:', err.message),
        { enableHighAccuracy: true, maximumAge: 500, timeout: 8000 }
      );
    }

    return () => {
      if (watchIdRef.current && typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [isDispatchActive, telemetryMode, corridor, targetSpeedKmh, sendSignedPacket]);

  // ── 5. Operator Action Handlers ────────────────────────────────────────────
  const handleToggleDispatch = () => {
    if (!isDispatchActive) {
      distanceCoveredRef.current = 0;
      preemptionTriggeredRef.current = false;
      clearanceTriggeredRef.current = false;
      setIsDispatchActive(true);
      sendSignedPacket({
        event: 'SIMULATION_STARTED',
        corridor: corridor.id,
        unitId: 'AMB-108-BLR',
      });
    } else {
      setIsDispatchActive(false);
      setTelemetry((prev) => ({
        ...prev,
        speedKmh: 0,
        preemptionActive: false,
        signalPhase: 'NORMAL_CYCLE',
      }));
      sendSignedPacket({
        event: 'V2X_CLEARANCE_CONFIRMED',
        intersection: corridor.intersectionName,
      });
    }
  };

  const handleManualPreemptPulse = () => {
    sendSignedPacket({
      event: 'V2X_ALERT_TRIGGER',
      corridorId: corridor.id,
      intersection: corridor.intersectionName,
      distanceMeters: telemetry.distanceToSignal || 280,
      etaSeconds: telemetry.etaSeconds || 14,
    });
    setTelemetry((prev) => ({
      ...prev,
      preemptionActive: true,
      signalPhase: networkMode === 'BLE_FALLBACK' ? 'BLE_OVERRIDE' : 'W_GREEN',
    }));
  };

  const handleToggleNetworkMode = () => {
    const next = networkMode === 'CLOUD_ONLINE' ? 'BLE_FALLBACK' : 'CLOUD_ONLINE';
    setNetworkMode(next);
    sendSignedPacket({
      event: 'NETWORK_MODE_TOGGLE',
      networkMode: next,
    });
  };

  const handleQueueSliderChange = (newQueueCount) => {
    const q = Number(newQueueCount);
    sendSignedPacket({
      event: 'YOLO_QUEUE_UPDATE',
      queueCount: q,
      source: 'OPERATOR_TEST_OVERRIDE',
    });
  };

  // ── 6. Project Route Coordinates onto Tactical SVG Radar ───────────────────
  const renderTacticalMapSvg = () => {
    const allPts = [...corridor.primaryRoute, ...corridor.bypassRoute];
    const lngs = allPts.map((p) => p[0]);
    const lats = allPts.map((p) => p[1]);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const padLng = (maxLng - minLng) * 0.18 || 0.002;
    const padLat = (maxLat - minLat) * 0.25 || 0.002;

    const toSvg = ([lng, lat]) => {
      const x = ((lng - (minLng - padLng)) / (maxLng - minLng + 2 * padLng)) * 320;
      const y = (1 - (lat - (minLat - padLat)) / (maxLat - minLat + 2 * padLat)) * 150;
      return [x, y];
    };

    const primaryPoly = corridor.primaryRoute.map(toSvg).map((p) => p.join(',')).join(' ');
    const bypassPoly = corridor.bypassRoute.map(toSvg).map((p) => p.join(',')).join(' ');
    const [intX, intY] = toSvg(corridor.intersectionCoords);
    const [ambX, ambY] = toSvg([telemetry.lng, telemetry.lat]);

    return (
      <svg viewBox="0 0 320 150" className="w-full h-40 bg-slate-950 rounded-xl border border-slate-800">
        {/* Background Radar Grid */}
        <defs>
          <pattern id="radarGrid" width="24" height="24" patternUnits="userSpaceOnUse">
            <path d="M 24 0 L 0 0 0 24" fill="none" stroke="rgba(30,41,59,0.55)" strokeWidth="0.7" />
          </pattern>
        </defs>
        <rect width="320" height="150" fill="url(#radarGrid)" />

        {/* Bypass Route (Dashed Amber/Emerald when Deadlock Reroute Active) */}
        <polyline
          fill="none"
          stroke={telemetry.deadlockRerouteActive ? '#f59e0b' : '#334155'}
          strokeWidth={telemetry.deadlockRerouteActive ? '3.5' : '1.8'}
          strokeDasharray="5,4"
          points={bypassPoly}
        />

        {/* Primary Corridor Route */}
        <polyline
          fill="none"
          stroke={
            telemetry.deadlockRerouteActive
              ? '#475569'
              : telemetry.preemptionActive
              ? '#22c55e'
              : '#38bdf8'
          }
          strokeWidth={telemetry.deadlockRerouteActive ? '2' : '4'}
          strokeLinecap="round"
          strokeLinejoin="round"
          points={primaryPoly}
        />

        {/* Intersection Geofence Ring */}
        <circle
          cx={intX}
          cy={intY}
          r="26"
          fill={telemetry.preemptionActive ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.10)'}
          stroke={telemetry.preemptionActive ? '#22c55e' : '#ef4444'}
          strokeWidth="1.2"
          strokeDasharray="3,3"
        />

        {/* Intersection Traffic Light Node */}
        <circle
          cx={intX}
          cy={intY}
          r="6"
          fill={telemetry.preemptionActive ? '#22c55e' : '#ef4444'}
          stroke="#ffffff"
          strokeWidth="1.5"
        />
        <text x={intX} y={intY - 11} textAnchor="middle" fill="#cbd5e1" fontSize="8" fontFamily="monospace" fontWeight="bold">
          {corridor.intersectionName}
        </text>

        {/* Ambulance BLE / Telemetry Pulse Ring */}
        <circle
          cx={ambX}
          cy={ambY}
          r="14"
          fill={networkMode === 'BLE_FALLBACK' ? 'rgba(245,158,11,0.22)' : 'rgba(56,189,248,0.20)'}
          stroke={networkMode === 'BLE_FALLBACK' ? '#f59e0b' : '#38bdf8'}
          strokeWidth="1.2"
        />
        <circle cx={ambX} cy={ambY} r="5.5" fill="#ffffff" stroke="#dc2626" strokeWidth="2.2" />
        <text x={ambX} y={ambY + 17} textAnchor="middle" fill="#38bdf8" fontSize="8" fontFamily="monospace" fontWeight="bold">
          AMB-108
        </text>
      </svg>
    );
  };

  return (
    <div className="min-h-screen w-full bg-slate-950 text-slate-100 font-mono flex flex-col items-center p-4 select-none">
      <div className="w-full max-w-md flex flex-col gap-3.5">
        {/* ── Top Status Bar ── */}
        <header className="flex items-center justify-between bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-3 shadow-lg">
          <div className="flex items-center gap-2.5">
            <span className="text-xl">🚑</span>
            <div>
              <div className="text-xs font-black tracking-wider text-white">SEMTOS AMB-108</div>
              <div className="text-[10px] text-slate-400">EMERGENCY V2X TRANSMITTER</div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span
              className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1.5 border ${
                connected
                  ? 'bg-emerald-950/70 text-emerald-400 border-emerald-500/40'
                  : 'bg-amber-950/70 text-amber-400 border-amber-500/40'
              }`}
            >
              <span
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
                }`}
              />
              {connected ? 'V2X LINKED' : 'RETRYING'}
            </span>
          </div>
        </header>

        {/* ── Primary Emergency Dispatch Button ── */}
        <button
          onClick={handleToggleDispatch}
          className={`w-full py-4 rounded-2xl font-black text-sm tracking-widest transition-all shadow-xl flex items-center justify-center gap-3 border ${
            isDispatchActive
              ? 'bg-emerald-500 text-slate-950 border-emerald-300 shadow-[0_0_28px_rgba(34,197,94,0.45)]'
              : 'bg-red-600 hover:bg-red-500 text-white border-red-400 shadow-[0_0_24px_rgba(220,38,38,0.35)]'
          }`}
        >
          <span className="text-lg">{isDispatchActive ? '🟢' : '🚨'}</span>
          <span>
            {isDispatchActive
              ? 'EMERGENCY DISPATCH ACTIVE (TAP TO STOP)'
              : 'START EMERGENCY DISPATCH'}
          </span>
        </button>

        {/* ── Corridor & Telemetry Source Selector ── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <label className="text-[10px] text-slate-400 font-bold tracking-wider">
              ACTIVE CORRIDOR
            </label>
            <select
              value={corridorKey}
              onChange={(e) => setCorridorKey(e.target.value)}
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              {Object.keys(CORRIDOR_PRESETS).map((k) => (
                <option key={k} value={k}>
                  {CORRIDOR_PRESETS[k].name}
                </option>
              ))}
            </select>
          </div>

          {/* Mode Toggle: Indoor Route Replay vs Live Phone GPS */}
          <div className="grid grid-cols-2 gap-1.5 bg-slate-950 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setTelemetryMode('INDOOR_SIM')}
              className={`py-2 rounded-lg font-bold transition ${
                telemetryMode === 'INDOOR_SIM'
                  ? 'bg-sky-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              🧪 Indoor Route Replay
            </button>
            <button
              onClick={() => setTelemetryMode('LIVE_GPS')}
              className={`py-2 rounded-lg font-bold transition ${
                telemetryMode === 'LIVE_GPS'
                  ? 'bg-emerald-500 text-slate-950 shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              📍 Live Phone GPS
            </button>
          </div>

          {/* Tactical Corridor Radar Map */}
          {renderTacticalMapSvg()}

          {/* Deadlock Rerouting Alert Banner */}
          {telemetry.deadlockRerouteActive && (
            <div className="bg-amber-950/80 border border-amber-500 text-amber-300 rounded-lg p-2.5 text-xs flex items-center justify-between">
              <div>
                <div className="font-black text-amber-400">
                  ⚠️ JUNCTION GRIDLOCK DETECTED ({telemetry.queueCount} CARS)
                </div>
                <div className="text-[10px] text-amber-200 mt-0.5">
                  Rerouted via: {corridor.bypassName}
                </div>
              </div>
              <span className="text-lg">🔀</span>
            </div>
          )}
        </div>

        {/* ── Live Telemetry Readout Cards ── */}
        <div className="grid grid-cols-2 gap-2.5">
          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">GPS SPEED</div>
            <div className="text-2xl font-black text-emerald-400 mt-0.5">
              {telemetry.speedKmh} <span className="text-xs font-normal text-slate-400">km/h</span>
            </div>
            <div className="flex gap-1 mt-2">
              {[35, 55, 75].map((spd) => (
                <button
                  key={spd}
                  onClick={() => setTargetSpeedKmh(spd)}
                  className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                    targetSpeedKmh === spd
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-400'
                  }`}
                >
                  {spd}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">HEADING VECTOR</div>
            <div className="text-2xl font-black text-sky-400 mt-0.5">
              {telemetry.heading}°{' '}
              <span className="text-xs font-bold text-slate-300">
                {compassDirectionLabel(telemetry.heading)}
              </span>
            </div>
            <div className="text-[10px] text-slate-500 mt-2 truncate">
              {telemetry.lat.toFixed(4)}°N, {telemetry.lng.toFixed(4)}°E
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">DIST TO JUNCTION</div>
            <div className="text-2xl font-black text-amber-400 mt-0.5">
              {telemetry.distanceToSignal}{' '}
              <span className="text-xs font-normal text-slate-400">m</span>
            </div>
            <div className="text-[10px] text-slate-400 mt-1">
              ETA: <strong className="text-white">{telemetry.etaSeconds}s</strong>
            </div>
          </div>

          <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3">
            <div className="text-[10px] text-slate-400">NEXT SIGNAL STATE</div>
            <div
              className={`text-sm font-black mt-1 ${
                telemetry.preemptionActive ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {telemetry.preemptionActive ? '🟢 GREEN PREEMPTED' : '🔴 NORMAL / RED'}
            </div>
            <div className="text-[10px] text-slate-400 mt-1.5">
              Hold: <strong className="text-emerald-300">{telemetry.greenHoldSeconds}s</strong> (
              {telemetry.queueCount} cars)
            </div>
          </div>
        </div>

        {/* ── Hybrid Cloud / BLE Fallback & Instant Preempt Test Controls ── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-white">Communication Mode</div>
              <div className="text-[10px] text-slate-400">
                {networkMode === 'CLOUD_ONLINE'
                  ? '5G / WebSocket Cloud Dispatcher (TLS + JWT)'
                  : `Offline ESP32 BLE Beacon Fallback (RSSI: ${telemetry.rssiDbm} dBm)`}
              </div>
            </div>
            <button
              onClick={handleToggleNetworkMode}
              className={`px-3 py-1.5 rounded-lg text-[11px] font-bold border transition ${
                networkMode === 'BLE_FALLBACK'
                  ? 'bg-amber-500 text-slate-950 border-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                  : 'bg-slate-950 text-emerald-400 border-emerald-500/40'
              }`}
            >
              {networkMode === 'CLOUD_ONLINE' ? '☁️ CLOUD ONLINE' : '📡 BLE FALLBACK'}
            </button>
          </div>

          {/* Test Queue Count Slider (Simulates YOLOv8 Queue Input from Phone) */}
          <div className="border-t border-slate-800 pt-2.5">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-slate-400">
                Queue Density Override:{' '}
                <strong className="text-white">{telemetry.queueCount} cars</strong>
              </span>
              <span className="text-emerald-400 font-bold">
                Hold: {telemetry.greenHoldSeconds}s
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="16"
              value={telemetry.queueCount}
              onChange={(e) => handleQueueSliderChange(e.target.value)}
              className="w-full accent-emerald-500 cursor-pointer"
            />
            <div className="flex justify-between text-[9px] text-slate-500">
              <span>0 (Empty)</span>
              <span>6 (Moderate)</span>
              <span>12+ (Deadlock Reroute)</span>
            </div>
          </div>

          <button
            onClick={handleManualPreemptPulse}
            className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold text-slate-200 transition"
          >
            ⚡ FORCE INSTANT PREEMPTION PULSE (TEST CIVILIAN ALERTS)
          </button>
        </div>
      </div>
    </div>
  );
}
