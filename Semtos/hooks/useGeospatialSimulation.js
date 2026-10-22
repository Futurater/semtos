import { useState, useEffect, useRef, useCallback } from 'react';

// Real-world Corridor Presets
export const CORRIDORS = {
  SF_MARKET: {
    id: 'SF_MARKET',
    name: 'San Francisco - Market St Corridor',
    center: [-122.4085, 37.7840],
    zoom: 17,
    pitch: 62,
    bearing: 48,
    route: [
      [-122.4168, 37.7782], // 8th & Market
      [-122.4138, 37.7803], // 7th & Market
      [-122.4107, 37.7824], // 6th & Market
      [-122.4077, 37.7845], // 5th & Market (Major Junction)
      [-122.4045, 37.7867], // 4th & Market
      [-122.4015, 37.7888], // 3rd & Market (Hospital Area)
    ],
    intersections: [
      {
        id: 'INT_01',
        name: '5th & Market Junction',
        coords: [-122.4077, 37.7845],
        crossStreetBearing: 138,
        distanceAlongRoute: 0,
      },
    ],
  },
  BLR_MG_ROAD: {
    id: 'BLR_MG_ROAD',
    name: 'Bengaluru - MG Road Corridor',
    center: [77.6110, 12.9748],
    zoom: 17,
    pitch: 62,
    bearing: 275,
    route: [
      [77.6200, 12.9738], // Trinity Circle
      [77.6160, 12.9744], // 1 MG Lido Mall
      [77.6110, 12.9748], // Mayo Hall Junction
      [77.6074, 12.9752], // Brigade Road Junction (Signal)
      [77.6030, 12.9756], // Anil Kumble Circle
    ],
    intersections: [
      {
        id: 'INT_BLR_1',
        name: 'Brigade Road Junction',
        coords: [77.6074, 12.9752],
        crossStreetBearing: 185,
        distanceAlongRoute: 0,
      },
    ],
  },
  NYC_5TH_AVE: {
    id: 'NYC_5TH_AVE',
    name: 'New York - 5th Avenue Corridor',
    center: [-73.9782, 40.7574],
    zoom: 17,
    pitch: 62,
    bearing: 29,
    route: [
      [-73.9818, 40.7535], // 42nd & 5th (NYPL)
      [-73.9796, 40.7558], // 45th & 5th
      [-73.9782, 40.7574], // 47th & 5th (Signal)
      [-73.9760, 40.7598], // 50th & 5th (Rockefeller)
      [-73.9738, 40.7621], // 53rd & 5th (MoMA)
    ],
    intersections: [
      {
        id: 'INT_NYC_1',
        name: '5th Ave & 47th St Junction',
        coords: [-73.9782, 40.7574],
        crossStreetBearing: 119,
        distanceAlongRoute: 0,
      },
    ],
  },
};

// ── Geodesic Math Helpers ──────────────────────────────────────────────────
function haversineDistanceMeters([lon1, lat1], [lon2, lat2]) {
  const R = 6371000; // Earth radius in meters
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

// Compute point offset perpendicularly (meters) from line bearing
function offsetCoordinates([lon, lat], bearingDeg, distanceMeters) {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const bearingRad = (bearingDeg + 90) * toRad; // perpendicular right
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

export function useGeospatialSimulation(selectedCorridorKey = 'SF_MARKET') {
  const corridor = CORRIDORS[selectedCorridorKey] || CORRIDORS.SF_MARKET;

  // Prepare segment distances
  const routeDistancesRef = useRef([]);
  const totalRouteMetersRef = useRef(0);

  const initRouteDistances = useCallback(() => {
    const route = corridor.route;
    const dists = [0];
    let sum = 0;
    for (let i = 0; i < route.length - 1; i++) {
      const segLen = haversineDistanceMeters(route[i], route[i + 1]);
      sum += segLen;
      dists.push(sum);
    }
    routeDistancesRef.current = dists;
    totalRouteMetersRef.current = sum;

    // Attach intersection distances
    corridor.intersections.forEach(intNode => {
      let closestDist = 0;
      let minDist = Infinity;
      for (let i = 0; i < route.length; i++) {
        const d = haversineDistanceMeters(intNode.coords, route[i]);
        if (d < minDist) {
          minDist = d;
          closestDist = dists[i];
        }
      }
      intNode.distanceAlongRoute = closestDist;
    });
  }, [corridor]);

  useEffect(() => {
    initRouteDistances();
  }, [initRouteDistances]);

  // ---- Simulation State ----------------------------------------------------
  const [simState, setSimState] = useState({
    isSimulationRunning: false,
    isFrozen: false,
    useRealPhoneGps: false,
    ambulancePosition: corridor.route[0],
    ambulanceBearing: 0,
    ambulanceSpeedKmh: 0,
    distanceToNextSignal: 0,
    etaToSignalSeconds: 0,
    bleRadiusMeters: 100,
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
  const speedMpsRef = useRef(14.0); // ~50 km/h
  const wsRef = useRef(null);
  const preemptionFiredRef = useRef(false);
  const clearanceFiredRef = useRef(false);

  // Initialize civilian vehicles along the route
  const initCivilianVehicles = useCallback(() => {
    const route = corridor.route;
    const cars = [];
    let carId = 1;

    const positionsAlongRoute = [0.25, 0.40, 0.52, 0.65, 0.78];
    const totalDist = totalRouteMetersRef.current || 1000;

    positionsAlongRoute.forEach(pct => {
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
      const p2 = route[segIdx + 1] || route[1];
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
        bearing: bearing,
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
    speedMpsRef.current = 14.0;

    const startPos = corridor.route[0] || [0, 0];
    const secondPos = corridor.route[1] || startPos;
    const initialBearing = calculateBearing(startPos, secondPos);

    setSimState(prev => ({
      ...prev,
      isSimulationRunning: false,
      isFrozen: false,
      ambulancePosition: startPos,
      ambulanceBearing: initialBearing,
      ambulanceSpeedKmh: 0,
      distanceToNextSignal: 0,
      etaToSignalSeconds: 0,
      signalPhase: 'NORMAL_CYCLE',
      nGreen: true, sGreen: true, eGreen: false, wGreen: false,
      activeAlert: false,
    }));

    initRouteDistances();
    initCivilianVehicles();
  }, [corridor, initRouteDistances, initCivilianVehicles]);

  // ---- Connect to V2X Server -----------------------------------------------
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
          setSimState(prev => ({ ...prev, v2xConnected: true }));
        };

        ws.onclose = () => {
          setSimState(prev => ({ ...prev, v2xConnected: false }));
          if (!unmounted) reconnectTimer = setTimeout(connect, 3000);
        };

        ws.onerror = () => {
          setSimState(prev => ({ ...prev, v2xConnected: false }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.event === 'GPS_BROADCAST' && data.lat && data.lng) {
              setSimState(prev => {
                if (!prev.useRealPhoneGps) return prev;
                return {
                  ...prev,
                  ambulancePosition: [data.lng, data.lat],
                  ambulanceBearing: data.heading || prev.ambulanceBearing,
                  ambulanceSpeedKmh: data.speedKmh || prev.ambulanceSpeedKmh,
                };
              });
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
  }, []);

  const sendV2X = useCallback((packet) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ ...packet, timestamp: Date.now() }));
      } catch (e) {
        console.warn('[GEOSPATIAL-V2X] Failed to send packet:', e);
      }
    }
  }, []);

  // ---- Dispatch / Control Actions -----------------------------------------
  const dispatchAmbulance = useCallback(() => {
    simRunningRef.current = true;
    distanceCoveredRef.current = 0;
    preemptionFiredRef.current = false;
    clearanceFiredRef.current = false;
    speedMpsRef.current = 14.0; // ~50 km/h

    setSimState(prev => ({
      ...prev,
      isSimulationRunning: true,
      ambulancePosition: corridor.route[0],
      ambulanceSpeedKmh: 50,
      signalPhase: 'NORMAL_CYCLE',
      activeAlert: false,
    }));

    sendV2X({ event: 'SIMULATION_STARTED', corridor: corridor.id });
  }, [corridor, sendV2X]);

  const toggleFreeze = useCallback(() => {
    isFrozenRef.current = !isFrozenRef.current;
    setSimState(prev => ({ ...prev, isFrozen: isFrozenRef.current }));
  }, []);

  const toggleRealPhoneGps = useCallback(() => {
    setSimState(prev => {
      const next = !prev.useRealPhoneGps;
      if (next) {
        simRunningRef.current = false;
      }
      return { ...prev, useRealPhoneGps: next, isSimulationRunning: next };
    });
  }, []);

  // Keyboard shortcut listener: Enter = Dispatch, F = Freeze
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

  // ---- Main Geospatial Simulation Loop -------------------------------------
  useEffect(() => {
    const TICK_MS = 50;
    const interval = setInterval(() => {
      if (!simRunningRef.current || isFrozenRef.current) return;

      const totalDist = totalRouteMetersRef.current;
      const dists = routeDistancesRef.current;
      const route = corridor.route;
      if (!totalDist || dists.length < 2) return;

      const deltaMeters = speedMpsRef.current * (TICK_MS / 1000);
      distanceCoveredRef.current += deltaMeters;
      const curDist = distanceCoveredRef.current;

      if (curDist >= totalDist) {
        simRunningRef.current = false;
        setSimState(prev => ({
          ...prev,
          isSimulationRunning: false,
          ambulancePosition: route[0],
          ambulanceSpeedKmh: 0,
          signalPhase: 'NORMAL_CYCLE',
          nGreen: true, sGreen: true, eGreen: false, wGreen: false,
          activeAlert: false,
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

      const p1 = route[segIdx];
      const p2 = route[segIdx + 1];
      const segStartDist = dists[segIdx];
      const segLen = dists[segIdx + 1] - segStartDist;
      const frac = segLen > 0 ? (curDist - segStartDist) / segLen : 0;

      const curLon = p1[0] + (p2[0] - p1[0]) * frac;
      const curLat = p1[1] + (p2[1] - p1[1]) * frac;
      const bearing = calculateBearing(p1, p2);

      const nextIntersection = corridor.intersections[0];
      let distToSignal = 0;
      let etaSeconds = 0;
      let phase = 'NORMAL_CYCLE';
      let nG = true, sG = true, eG = false, wG = false;

      if (nextIntersection) {
        distToSignal = Math.max(0, nextIntersection.distanceAlongRoute - curDist);
        etaSeconds = speedMpsRef.current > 0 ? Math.round(distToSignal / speedMpsRef.current) : 0;

        if (distToSignal <= 160 && curDist < nextIntersection.distanceAlongRoute + 15) {
          phase = 'W_GREEN';
          nG = false; sG = false; eG = true; wG = true;

          if (!preemptionFiredRef.current) {
            preemptionFiredRef.current = true;
            sendV2X({
              event: 'V2X_ALERT_TRIGGER',
              intersection: nextIntersection.name,
              distanceMeters: Math.round(distToSignal),
              etaSeconds: etaSeconds,
            });
          }
        }
        else if (curDist >= nextIntersection.distanceAlongRoute + 15 && curDist < nextIntersection.distanceAlongRoute + 70) {
          phase = 'E_RESUME';
          nG = false; sG = false; eG = true; wG = true;
          speedMpsRef.current = 18.0;

          if (!clearanceFiredRef.current) {
            clearanceFiredRef.current = true;
            sendV2X({
              event: 'V2X_CLEARANCE_CONFIRMED',
              intersection: nextIntersection.name,
            });
          }
        }
        else if (curDist >= nextIntersection.distanceAlongRoute + 70) {
          phase = 'N_RELEASE';
          nG = true; sG = true; eG = false; wG = false;
        }
      }

      const speedKmh = Math.round(speedMpsRef.current * 3.6);

      const BLE_RADIUS = 100;
      setCivilianVehicles(prevCars => {
        return prevCars.map(car => {
          const dToAmb = haversineDistanceMeters([curLon, curLat], car.originalCoords);
          const inBleRadius = dToAmb <= BLE_RADIUS && curDist < totalDist * 0.9;

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
        });
      });

      setSimState(prev => ({
        ...prev,
        ambulancePosition: [curLon, curLat],
        ambulanceBearing: bearing,
        ambulanceSpeedKmh: speedKmh,
        distanceToNextSignal: Math.round(distToSignal),
        etaToSignalSeconds: etaSeconds,
        signalPhase: phase,
        nGreen: nG, sGreen: sG, eGreen: eG, wGreen: wG,
        activeAlert: phase === 'W_GREEN',
      }));

      sendV2X({
        event: 'AMBULANCE_TELEMETRY',
        lat: curLat,
        lng: curLon,
        speedKmh: speedKmh,
        heading: Math.round(bearing),
        distanceToSignal: Math.round(distToSignal),
        etaSeconds: etaSeconds,
        signalPhase: phase,
        preemptionActive: phase === 'W_GREEN',
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
