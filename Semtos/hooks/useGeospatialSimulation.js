import { useState, useEffect, useRef, useCallback } from 'react';

// ── Real-World Multi-Intersection Corridor & Bypass Presets ──────────────────
export const CORRIDORS = {
  BLR_MG_ROAD: {
    id: 'BLR_MG_ROAD',
    name: 'Bengaluru - MG Road Corridor',
    center: [77.6110, 12.9748],
    zoom: 16.5,
    pitch: 62,
    bearing: 275,
    route: [
      [77.6200, 12.9738], // Trinity Circle
      [77.6160, 12.9744], // 1 MG Lido Mall
      [77.6110, 12.9748], // J1: Mayo Hall Junction
      [77.6074, 12.9752], // J2: Brigade Road Junction
      [77.6030, 12.9756], // J3: Anil Kumble Circle
    ],
    bypassRoute: [
      [77.6200, 12.9738], // Trinity Circle
      [77.6160, 12.9744], // 1 MG Lido Mall
      [77.6115, 12.9722], // Residency Road Bypass (South Parallel)
      [77.6068, 12.9718], // Richmond Circle Connector
      [77.6030, 12.9756], // Anil Kumble Circle
    ],
    bypassName: 'Residency Rd – St. Marks Rd Emergency Bypass',
    intersections: [
      {
        id: 'INT_BLR_1',
        name: 'J1: Mayo Hall Junction',
        coords: [77.6110, 12.9748],
        crossStreetBearing: 185,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_2',
        name: 'J2: Brigade Road Junction',
        coords: [77.6074, 12.9752],
        crossStreetBearing: 185,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_3',
        name: 'J3: Anil Kumble Circle',
        coords: [77.6030, 12.9756],
        crossStreetBearing: 185,
        distanceAlongRoute: 0,
      },
    ],
  },
  SF_MARKET: {
    id: 'SF_MARKET',
    name: 'San Francisco - Market St Corridor',
    center: [-122.4085, 37.7840],
    zoom: 16.5,
    pitch: 62,
    bearing: 48,
    route: [
      [-122.4168, 37.7782], // 8th & Market
      [-122.4138, 37.7803], // J1: 7th & Market
      [-122.4107, 37.7824], // 6th & Market
      [-122.4077, 37.7845], // J2: 5th & Market
      [-122.4045, 37.7867], // 4th & Market
      [-122.4015, 37.7888], // J3: 3rd & Market
    ],
    bypassRoute: [
      [-122.4168, 37.7782],
      [-122.4135, 37.7768], // Mission St Parallel Bypass
      [-122.4060, 37.7820],
      [-122.4015, 37.7888],
    ],
    bypassName: 'Mission St – 4th St Parallel Bypass',
    intersections: [
      {
        id: 'INT_SF_1',
        name: 'J1: 7th & Market Junction',
        coords: [-122.4138, 37.7803],
        crossStreetBearing: 138,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_SF_2',
        name: 'J2: 5th & Market Junction',
        coords: [-122.4077, 37.7845],
        crossStreetBearing: 138,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_SF_3',
        name: 'J3: 3rd & Market Junction',
        coords: [-122.4015, 37.7888],
        crossStreetBearing: 138,
        distanceAlongRoute: 0,
      },
    ],
  },
  NYC_5TH_AVE: {
    id: 'NYC_5TH_AVE',
    name: 'New York - 5th Avenue Corridor',
    center: [-73.9782, 40.7574],
    zoom: 16.5,
    pitch: 62,
    bearing: 29,
    route: [
      [-73.9818, 40.7535], // 42nd & 5th
      [-73.9796, 40.7558], // J1: 45th & 5th
      [-73.9782, 40.7574], // J2: 47th & 5th
      [-73.9760, 40.7598], // J3: 50th & 5th
      [-73.9738, 40.7621], // 53rd & 5th
    ],
    bypassRoute: [
      [-73.9818, 40.7535],
      [-73.9775, 40.7518], // Madison Ave Bypass
      [-73.9730, 40.7580],
      [-73.9738, 40.7621],
    ],
    bypassName: 'Madison Avenue Emergency Green Corridor',
    intersections: [
      {
        id: 'INT_NYC_1',
        name: 'J1: 5th Ave & 45th St',
        coords: [-73.9796, 40.7558],
        crossStreetBearing: 119,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_NYC_2',
        name: 'J2: 5th Ave & 47th St',
        coords: [-73.9782, 40.7574],
        crossStreetBearing: 119,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_NYC_3',
        name: 'J3: 5th Ave & 50th St',
        coords: [-73.9760, 40.7598],
        crossStreetBearing: 119,
        distanceAlongRoute: 0,
      },
    ],
  },
};

// ── Geodesic Math Helpers ──────────────────────────────────────────────────
function haversineDistanceMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function calculateBearing([lon1, lat1], [lon2, lat2]) {
  const toRad = Math.PI / 180;
  const y = Math.sin((lon2 - lon1) * toRad) * Math.cos(lat2 * toRad);
  const x =
    Math.cos(lat1 * toRad) * Math.sin(lat2 * toRad) -
    Math.sin(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.cos((lon2 - lon1) * toRad);
  return (Math.atan2(y, x) * (180 / Math.PI) + 360) % 360;
}

function offsetCoordinates([lon, lat], bearingDeg, distanceMeters) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const bearingRad = (bearingDeg + 90) * toRad;
  const lat1 = lat * toRad;
  const lon1 = lon * toRad;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(distanceMeters / R) +
    Math.cos(lat1) * Math.sin(distanceMeters / R) * Math.cos(bearingRad)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(bearingRad) * Math.sin(distanceMeters / R) * Math.cos(lat1),
      Math.cos(distanceMeters / R) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [lon2 * (180 / Math.PI), lat2 * (180 / Math.PI)];
}

export function useGeospatialSimulation(selectedCorridorKey = 'BLR_MG_ROAD') {
  const corridor = CORRIDORS[selectedCorridorKey] || CORRIDORS.BLR_MG_ROAD;

  const routeDistancesRef = useRef([]);
  const totalRouteMetersRef = useRef(0);
  const deadlockRerouteRef = useRef(false);

  const initRouteDistances = useCallback(
    (useBypass = false) => {
      const activeRoute =
        useBypass && corridor.bypassRoute ? corridor.bypassRoute : corridor.route;
      const dists = [0];
      let sum = 0;
      for (let i = 0; i < activeRoute.length - 1; i++) {
        const segLen = haversineDistanceMeters(activeRoute[i], activeRoute[i + 1]);
        sum += segLen;
        dists.push(sum);
      }
      routeDistancesRef.current = dists;
      totalRouteMetersRef.current = sum;

      corridor.intersections.forEach((intNode) => {
        let closestDist = 0;
        let minDist = Infinity;
        for (let i = 0; i < corridor.route.length; i++) {
          const d = haversineDistanceMeters(intNode.coords, corridor.route[i]);
          if (d < minDist) {
            minDist = d;
            closestDist = dists[Math.min(i, dists.length - 1)] || 0;
          }
        }
        intNode.distanceAlongRoute = closestDist;
      });
    },
    [corridor]
  );

  useEffect(() => {
    initRouteDistances(deadlockRerouteRef.current);
  }, [initRouteDistances]);

  const [simState, setSimState] = useState({
    isSimulationRunning: false,
    isFrozen: false,
    useRealPhoneGps: false,
    deadlockRerouteActive: false,
    bypassName: corridor.bypassName,
    ambulancePosition: corridor.route[0],
    ambulanceBearing: 0,
    ambulanceSpeedKmh: 0,
    distanceToNextSignal: 0,
    etaToSignalSeconds: 0,
    activeJunctionName: corridor.intersections[0]?.name || 'Junction 1',
    intersectionStates: corridor.intersections.map((n) => ({
      id: n.id,
      name: n.name,
      coords: n.coords,
      status: 'RED', // 'RED' | 'GREEN_WAVE' | 'CLEARED' | 'GRIDLOCK_BYPASSED'
    })),
    bleRadiusMeters: 110,
    signalPhase: 'NORMAL_CYCLE',
    nGreen: true,
    sGreen: true,
    eGreen: false,
    wGreen: false,
    activeAlert: false,
    v2xConnected: false,
  });

  const [civilianVehicles, setCivilianVehicles] = useState([]);

  const simRunningRef = useRef(false);
  const isFrozenRef = useRef(false);
  const distanceCoveredRef = useRef(0);
  const speedMpsRef = useRef(15.0); // ~54 km/h
  const wsRef = useRef(null);
  const preemptionFiredRef = useRef(false);
  const clearanceFiredRef = useRef(false);

  const initCivilianVehicles = useCallback(() => {
    const route = corridor.route;
    const cars = [];
    let carId = 1;

    const positionsAlongRoute = [0.22, 0.38, 0.52, 0.68, 0.82];
    const totalDist = totalRouteMetersRef.current || 1000;

    positionsAlongRoute.forEach((pct) => {
      const targetDist = totalDist * pct;
      const dists = routeDistancesRef.current;
      let segIdx = 0;
      for (let i = 0; i < dists.length - 1; i++) {
        if (targetDist >= dists[i] && targetDist <= dists[i + 1]) {
          segIdx = i;
          break;
        }
      }
      const p1 = route[segIdx] || route[0];
      const p2 = route[segIdx + 1] || route[1] || p1;
      const segStart = dists[segIdx] || 0;
      const segLen = (dists[segIdx + 1] || 1) - segStart;
      const frac = segLen > 0 ? (targetDist - segStart) / segLen : 0;
      const lon = p1[0] + (p2[0] - p1[0]) * frac;
      const lat = p1[1] + (p2[1] - p1[1]) * frac;
      const bearing = calculateBearing(p1, p2);

      cars.push({
        id: carId++,
        originalCoords: [lon, lat],
        currentCoords: [lon, lat],
        bearing,
        laneOffsetMeters: 0,
        targetOffsetMeters: 0,
        isYielding: false,
        type: 'SEDAN',
      });
    });

    setCivilianVehicles(cars);
  }, [corridor]);

  useEffect(() => {
    initCivilianVehicles();
  }, [initCivilianVehicles]);

  // Reset simulation whenever corridor changes
  useEffect(() => {
    simRunningRef.current = false;
    distanceCoveredRef.current = 0;
    preemptionFiredRef.current = false;
    clearanceFiredRef.current = false;
    speedMpsRef.current = 15.0;

    const startPos = corridor.route[0] || [0, 0];
    const secondPos = corridor.route[1] || startPos;
    const initialBearing = calculateBearing(startPos, secondPos);

    initRouteDistances(deadlockRerouteRef.current);
    initCivilianVehicles();

    setSimState((prev) => ({
      ...prev,
      isSimulationRunning: false,
      isFrozen: false,
      bypassName: corridor.bypassName,
      ambulancePosition: startPos,
      ambulanceBearing: initialBearing,
      ambulanceSpeedKmh: 0,
      distanceToNextSignal: 0,
      etaToSignalSeconds: 0,
      activeJunctionName: corridor.intersections[0]?.name || 'Junction 1',
      intersectionStates: corridor.intersections.map((n) => ({
        id: n.id,
        name: n.name,
        coords: n.coords,
        status: 'RED',
      })),
      signalPhase: 'NORMAL_CYCLE',
      nGreen: true,
      sGreen: true,
      eGreen: false,
      wGreen: false,
      activeAlert: false,
    }));
  }, [corridor, initRouteDistances, initCivilianVehicles]);

  // ---- Connect to Authoritative V2X Server (Syncs Phone 1 & YOLOv8 Deadlock) ----
  useEffect(() => {
    let ws = null;
    let reconnectTimer = null;
    let unmounted = false;

    function connect() {
      if (unmounted) return;
      try {
        const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';
        ws = new WebSocket(`ws://${host}:4081`);
        wsRef.current = ws;

        ws.onopen = () => {
          setSimState((prev) => ({ ...prev, v2xConnected: true }));
        };

        ws.onclose = () => {
          setSimState((prev) => ({ ...prev, v2xConnected: false }));
          if (!unmounted) reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setSimState((prev) => ({ ...prev, v2xConnected: false }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            // 1. Sync Deadlock Rerouting from YOLOv8 or Server
            if (data.event === 'V2X_DEADLOCK_REROUTE' || data.event === 'YOLO_QUEUE_STATE') {
              const isDeadlock =
                data.event === 'V2X_DEADLOCK_REROUTE'
                  ? Boolean(data.deadlockDetected)
                  : Boolean(data.routing?.deadlockRerouteActive);

              deadlockRerouteRef.current = isDeadlock;
              initRouteDistances(isDeadlock);

              setSimState((prev) => ({
                ...prev,
                deadlockRerouteActive: isDeadlock,
                intersectionStates: prev.intersectionStates.map((node, idx) => ({
                  ...node,
                  status: isDeadlock && idx === 1 ? 'GRIDLOCK_BYPASSED' : node.status,
                })),
              }));
            }

            // 2. Sync Live Ambulance Position from Phone 1 (/ambulance) — works for BOTH Indoor Replay & Live GPS!
            if (
              (data.event === 'AMBULANCE_TELEMETRY' || data.event === 'GPS_BROADCAST') &&
              typeof data.lat === 'number' &&
              typeof data.lng === 'number'
            ) {
              setSimState((prev) => ({
                ...prev,
                isSimulationRunning: true,
                ambulancePosition: [data.lng, data.lat],
                ambulanceBearing: data.heading ?? prev.ambulanceBearing,
                ambulanceSpeedKmh: data.speedKmh ?? prev.ambulanceSpeedKmh,
                distanceToNextSignal: data.distanceToSignal ?? prev.distanceToNextSignal,
                etaToSignalSeconds: data.etaSeconds ?? prev.etaToSignalSeconds,
                signalPhase: data.preemptionActive ? 'W_GREEN' : data.signalPhase || prev.signalPhase,
              }));
            }

            // 3. Auto-start local map run if Phone 1 triggers SIMULATION_STARTED
            if (data.event === 'SIMULATION_STARTED' && !simRunningRef.current) {
              simRunningRef.current = true;
              distanceCoveredRef.current = 0;
              setSimState((prev) => ({ ...prev, isSimulationRunning: true }));
            }
          } catch (_) {}
        };
      } catch (_) {
        if (!unmounted) reconnectTimer = setTimeout(connect, 3000);
      }
    }

    connect();

    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (ws) ws.close();
    };
  }, [initRouteDistances]);

  const sendV2X = useCallback((packet) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ ...packet, timestamp: Date.now() }));
      } catch (e) {
        console.warn('[GEOSPATIAL-V2X] Failed to send packet:', e);
      }
    }
  }, []);

  const dispatchAmbulance = useCallback(() => {
    simRunningRef.current = true;
    distanceCoveredRef.current = 0;
    preemptionFiredRef.current = false;
    clearanceFiredRef.current = false;
    speedMpsRef.current = 15.0;

    const activeRoute =
      deadlockRerouteRef.current && corridor.bypassRoute
        ? corridor.bypassRoute
        : corridor.route;

    setSimState((prev) => ({
      ...prev,
      isSimulationRunning: true,
      ambulancePosition: activeRoute[0],
      ambulanceSpeedKmh: 54,
      signalPhase: 'NORMAL_CYCLE',
      activeAlert: false,
    }));

    sendV2X({ event: 'SIMULATION_STARTED', corridor: corridor.id });
  }, [corridor, sendV2X]);

  const toggleFreeze = useCallback(() => {
    isFrozenRef.current = !isFrozenRef.current;
    setSimState((prev) => ({ ...prev, isFrozen: isFrozenRef.current }));
  }, []);

  const toggleRealPhoneGps = useCallback(() => {
    setSimState((prev) => {
      const next = !prev.useRealPhoneGps;
      if (next) {
        simRunningRef.current = false;
      }
      return { ...prev, useRealPhoneGps: next, isSimulationRunning: next };
    });
  }, []);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.code === 'Enter') {
        e.preventDefault();
        dispatchAmbulance();
      }
      if (e.code === 'KeyF') {
        toggleFreeze();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [dispatchAmbulance, toggleFreeze]);

  // ---- Main Geospatial Multi-Intersection Green Wave Simulation Loop ----
  useEffect(() => {
    const TICK_MS = 50;
    const interval = setInterval(() => {
      if (!simRunningRef.current || isFrozenRef.current) return;

      const activeRoute =
        deadlockRerouteRef.current && corridor.bypassRoute
          ? corridor.bypassRoute
          : corridor.route;
      const totalDist = totalRouteMetersRef.current;
      const dists = routeDistancesRef.current;
      if (!totalDist || dists.length < 2) return;

      const deltaMeters = speedMpsRef.current * (TICK_MS / 1000);
      distanceCoveredRef.current += deltaMeters;
      const curDist = distanceCoveredRef.current;

      if (curDist >= totalDist) {
        simRunningRef.current = false;
        setSimState((prev) => ({
          ...prev,
          isSimulationRunning: false,
          ambulancePosition: activeRoute[0],
          ambulanceSpeedKmh: 0,
          signalPhase: 'NORMAL_CYCLE',
          nGreen: true,
          sGreen: true,
          eGreen: false,
          wGreen: false,
          activeAlert: false,
          intersectionStates: corridor.intersections.map((n) => ({
            id: n.id,
            name: n.name,
            coords: n.coords,
            status: 'RED',
          })),
        }));
        initCivilianVehicles();
        return;
      }

      let segIdx = 0;
      for (let i = 0; i < dists.length - 1; i++) {
        if (curDist >= dists[i] && curDist <= dists[i + 1]) {
          segIdx = i;
          break;
        }
      }

      const p1 = activeRoute[segIdx];
      const p2 = activeRoute[segIdx + 1] || p1;
      const segStartDist = dists[segIdx];
      const segLen = dists[segIdx + 1] - segStartDist;
      const frac = segLen > 0 ? (curDist - segStartDist) / segLen : 0;

      const curLon = p1[0] + (p2[0] - p1[0]) * frac;
      const curLat = p1[1] + (p2[1] - p1[1]) * frac;
      const bearing = calculateBearing(p1, p2);

      // Evaluate Multi-Intersection Green Wave across all 3 corridor junctions
      let upcomingNode = corridor.intersections[corridor.intersections.length - 1];
      let upcomingDist = 0;

      const updatedIntStates = corridor.intersections.map((node, idx) => {
        const dToNode = haversineDistanceMeters([curLon, curLat], node.coords);
        const passed = curDist > node.distanceAlongRoute + 25;

        if (deadlockRerouteRef.current && idx === 1) {
          return {
            id: node.id,
            name: node.name,
            coords: node.coords,
            status: 'GRIDLOCK_BYPASSED',
          };
        }

        if (passed) {
          return {
            id: node.id,
            name: node.name,
            coords: node.coords,
            status: 'CLEARED',
          };
        }

        if (dToNode <= 380) {
          return {
            id: node.id,
            name: node.name,
            coords: node.coords,
            status: 'GREEN_WAVE',
          };
        }

        return {
          id: node.id,
          name: node.name,
          coords: node.coords,
          status: 'RED',
        };
      });

      // Find nearest upcoming intersection that hasn't been passed yet
      for (let i = 0; i < corridor.intersections.length; i++) {
        const node = corridor.intersections[i];
        if (curDist <= node.distanceAlongRoute + 20) {
          upcomingNode = node;
          upcomingDist = Math.max(0, node.distanceAlongRoute - curDist);
          break;
        }
      }

      const etaSeconds =
        speedMpsRef.current > 0 ? Math.round(upcomingDist / speedMpsRef.current) : 0;
      const anyGreenWave = updatedIntStates.some((n) => n.status === 'GREEN_WAVE');
      const phase = anyGreenWave ? 'W_GREEN' : 'NORMAL_CYCLE';

      if (anyGreenWave && !preemptionFiredRef.current) {
        preemptionFiredRef.current = true;
        sendV2X({
          event: 'V2X_ALERT_TRIGGER',
          intersection: upcomingNode.name,
          distanceMeters: Math.round(upcomingDist),
          etaSeconds,
        });
      }

      if (curDist >= totalDist * 0.88 && !clearanceFiredRef.current) {
        clearanceFiredRef.current = true;
        sendV2X({
          event: 'V2X_CLEARANCE_CONFIRMED',
          intersection: upcomingNode.name,
        });
      }

      const speedKmh = Math.round(speedMpsRef.current * 3.6);

      const BLE_RADIUS = 110;
      setCivilianVehicles((prevCars) =>
        prevCars.map((car) => {
          const dToAmb = haversineDistanceMeters([curLon, curLat], car.originalCoords);
          const inBleRadius = dToAmb <= BLE_RADIUS && curDist < totalDist * 0.92;
          const targetOffset = inBleRadius ? 3.5 : 0;
          const newOffset = car.laneOffsetMeters + (targetOffset - car.laneOffsetMeters) * 0.15;
          const displacedCoords = offsetCoordinates(car.originalCoords, car.bearing, newOffset);

          return {
            ...car,
            laneOffsetMeters: newOffset,
            targetOffsetMeters: targetOffset,
            currentCoords: displacedCoords,
            isYielding: inBleRadius,
          };
        })
      );

      setSimState((prev) => ({
        ...prev,
        ambulancePosition: [curLon, curLat],
        ambulanceBearing: bearing,
        ambulanceSpeedKmh: speedKmh,
        distanceToNextSignal: Math.round(upcomingDist),
        etaToSignalSeconds: etaSeconds,
        activeJunctionName: upcomingNode.name,
        intersectionStates: updatedIntStates,
        signalPhase: phase,
        nGreen: !anyGreenWave,
        sGreen: !anyGreenWave,
        eGreen: anyGreenWave,
        wGreen: anyGreenWave,
        activeAlert: anyGreenWave,
      }));

      sendV2X({
        event: 'AMBULANCE_TELEMETRY',
        lat: curLat,
        lng: curLon,
        speedKmh,
        heading: Math.round(bearing),
        distanceToSignal: Math.round(upcomingDist),
        etaSeconds,
        intersection: upcomingNode.name,
        signalPhase: phase,
        preemptionActive: anyGreenWave,
      });
    }, TICK_MS);

    return () => clearInterval(interval);
  }, [corridor, sendV2X, initCivilianVehicles]);

  return {
    corridor,
    simState,
    civilianVehicles,
    dispatchAmbulance,
    toggleFreeze,
    toggleRealPhoneGps,
  };
}
