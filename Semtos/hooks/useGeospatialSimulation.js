import { useState, useEffect, useRef, useCallback } from 'react';

// ── 100% Bengaluru Real-World Road-Snapped Emergency Corridors ───────────────
export const CORRIDORS = {
  BLR_MG_ROAD: {
    id: 'BLR_MG_ROAD',
    name: 'Bengaluru — MG Road to Bowring Hospital',
    hospitalName: 'Bowring & Lady Curzon Hospital',
    center: [77.6088, 12.9747],
    zoom: 16.6,
    pitch: 62,
    bearing: 284,
    // High-density waypoints snapped to Mahatma Gandhi Road centerline
    route: [
      [77.61684, 12.97303], // Trinity Metro Station (Start)
      [77.61520, 12.97331], // Trinity - Lido Approach
      [77.61365, 12.97358], // 1 MG Lido Mall
      [77.61210, 12.97385], // Utility Building Approach
      [77.61065, 12.97411], // J1: Mayo Hall Junction
      [77.60930, 12.97446], // Garuda / Kamaraj Rd Cross
      [77.60805, 12.97481], // Cauvery Emporium
      [77.60662, 12.97522], // J2: Brigade Road Junction
      [77.60520, 12.97561], // Metro Plaza MG Road
      [77.60365, 12.97605], // Spencer's / Barton Centre
      [77.60180, 12.97657], // J3: Anil Kumble Circle (Bowring Turnoff)
    ],
    // Bypass via Dickenson Road -> Cubbon Road (North Parallel Road in Bengaluru)
    bypassRoute: [
      [77.61684, 12.97303], // Trinity Metro Station
      [77.61560, 12.97490], // Ulsoor Road North Turn
      [77.61320, 12.97720], // Dickenson Road Corridor
      [77.60910, 12.97810], // Kamaraj Road / Cubbon Road Junction
      [77.60510, 12.97865], // Cubbon Road Westbound
      [77.60240, 12.97895], // BRV Parade Ground / Minsk Square
      [77.60180, 12.97657], // Rejoin at Anil Kumble Circle
    ],
    bypassName: 'Ulsoor Rd – Cubbon Road Parallel Green Bypass',
    intersections: [
      {
        id: 'INT_BLR_MG_1',
        shortLabel: 'J1',
        name: 'J1: Mayo Hall Junction',
        coords: [77.61065, 12.97411],
        crossStreetBearing: 194,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_MG_2',
        shortLabel: 'J2',
        name: 'J2: Brigade Road Junction',
        coords: [77.60662, 12.97522],
        crossStreetBearing: 194,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_MG_3',
        shortLabel: 'J3',
        name: 'J3: Anil Kumble Circle',
        coords: [77.60180, 12.97657],
        crossStreetBearing: 194,
        distanceAlongRoute: 0,
      },
    ],
  },

  BLR_HOSUR_RD: {
    id: 'BLR_HOSUR_RD',
    name: "Bengaluru — Silk Board to St. John's Hospital",
    hospitalName: "St. John's Medical College Hospital (Koramangala)",
    center: [77.6208, 12.9248],
    zoom: 16.0,
    pitch: 62,
    bearing: 342,
    // Snapped along Hosur Main Road (NH 48) -> Madiwala -> Koramangala Water Tank -> St. John's
    route: [
      [77.62285, 12.91765], // Silk Board Flyover Northbound Ramp
      [77.62195, 12.91915], // Roopena Agrahara Bus Stop
      [77.62095, 12.92075], // J1: Madiwala Traffic Police Junction
      [77.61975, 12.92265], // Madiwala Underpass / Ayyappa Temple
      [77.61845, 12.92465], // Total Mall / Hosur Rd Service Merge
      [77.61735, 12.92635], // J2: Forum / Nexus Mall Checkpost
      [77.61945, 12.92685], // Sarjapur Road East Turn
      [77.62174, 12.92712], // J3: Koramangala Water Tank Junction
      [77.62040, 12.92960], // St. John's Hospital Main Gate
      [77.61914, 12.93199], // St. John's Emergency Trauma Block
    ],
    bypassRoute: [
      [77.62285, 12.91765], // Silk Board
      [77.62580, 12.91840], // Outer Ring Road (Agara Direction)
      [77.62690, 12.92280], // Koramangala 1st Block 80 Feet Rd
      [77.62480, 12.92690], // Krupanidhi / Sarjapur Rd Approach
      [77.62174, 12.92712], // Koramangala Water Tank
      [77.61914, 12.93199], // St. John's Emergency Block
    ],
    bypassName: 'Koramangala 80 Feet Rd – Sarjapur Rd Emergency Bypass',
    intersections: [
      {
        id: 'INT_BLR_HSR_1',
        shortLabel: 'J1',
        name: 'J1: Madiwala Police Junction',
        coords: [77.62095, 12.92075],
        crossStreetBearing: 72,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_HSR_2',
        shortLabel: 'J2',
        name: 'J2: Nexus Checkpost Signal',
        coords: [77.61735, 12.92635],
        crossStreetBearing: 72,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_HSR_3',
        shortLabel: 'J3',
        name: 'J3: Koramangala Water Tank',
        coords: [77.62174, 12.92712],
        crossStreetBearing: 72,
        distanceAlongRoute: 0,
      },
    ],
  },

  BLR_INDIRANAGAR: {
    id: 'BLR_INDIRANAGAR',
    name: 'Bengaluru — Indiranagar 100 Ft Rd to Manipal Hospital',
    hospitalName: 'Manipal Hospital (HAL Old Airport Road)',
    center: [77.6412, 12.9685],
    zoom: 16.0,
    pitch: 62,
    bearing: 175,
    // Snapped along Indiranagar 100 Feet Road Southbound -> Domlur Flyover -> Old Airport Rd
    route: [
      [77.63853, 12.97826], // Indiranagar Metro / CMH Road Junction
      [77.64075, 12.97810], // 100 Feet Road & CMH Signal
      [77.64085, 12.97460], // J1: 12th Main Indiranagar Signal
      [77.64095, 12.97080], // 80 Feet Road / Sony World Approach
      [77.64105, 12.96680], // J2: Domlur BDA / 14th Cross Signal
      [77.64115, 12.96180], // J3: Domlur Flyover & Old Airport Rd
      [77.64480, 12.96040], // Kodihalli / Leela Palace Signal
      [77.64860, 12.95920], // Manipal Hospital Emergency Bay
    ],
    bypassRoute: [
      [77.63853, 12.97826], // Indiranagar Metro
      [77.64490, 12.97780], // Old Madras Rd / 80 Feet Rd Parallel
      [77.64620, 12.97050], // New Thippasandra / HAL 2nd Stage 80 Ft Rd
      [77.64780, 12.96320], // Suranjan Das Road Connector
      [77.64860, 12.95920], // Manipal Hospital Emergency Bay
    ],
    bypassName: 'Indiranagar 80 Feet Rd – HAL 2nd Stage Bypass',
    intersections: [
      {
        id: 'INT_BLR_IND_1',
        shortLabel: 'J1',
        name: 'J1: 12th Main 100 Ft Rd Signal',
        coords: [77.64085, 12.97460],
        crossStreetBearing: 85,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_IND_2',
        shortLabel: 'J2',
        name: 'J2: Domlur 14th Cross Signal',
        coords: [77.64105, 12.96680],
        crossStreetBearing: 85,
        distanceAlongRoute: 0,
      },
      {
        id: 'INT_BLR_IND_3',
        shortLabel: 'J3',
        name: 'J3: Domlur Flyover Junction',
        coords: [77.64115, 12.96180],
        crossStreetBearing: 85,
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

/**
 * Displaces a [lon, lat] point laterally perpendicular to `bearingDeg`.
 * Positive `lateralMeters` shifts left (Indian keep-left shoulder); negative shifts right.
 */
function offsetCoordinates([lon, lat], bearingDeg, lateralMeters) {
  if (!lateralMeters || Math.abs(lateralMeters) < 0.01) return [lon, lat];
  const R = 6371000;
  const toRad = Math.PI / 180;
  // Left shoulder is (bearing - 90) degrees
  const perpBearingRad = ((bearingDeg - 90 + 360) % 360) * toRad;
  const lat1 = lat * toRad;
  const lon1 = lon * toRad;
  const angDist = lateralMeters / R;

  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angDist) +
    Math.cos(lat1) * Math.sin(angDist) * Math.cos(perpBearingRad)
  );
  const lon2 =
    lon1 +
    Math.atan2(
      Math.sin(perpBearingRad) * Math.sin(angDist) * Math.cos(lat1),
      Math.cos(angDist) - Math.sin(lat1) * Math.sin(lat2)
    );

  return [lon2 * (180 / Math.PI), lat2 * (180 / Math.PI)];
}

/**
 * Interpolates [lon, lat] and forward bearing at `targetDist` meters along a polyline.
 */
function samplePointAlongPolyline(routePoints, cumDists, targetDist) {
  if (!routePoints || routePoints.length === 0) {
    return { coords: [77.61065, 12.97411], bearing: 284 };
  }
  if (routePoints.length === 1 || !cumDists || cumDists.length < 2) {
    return { coords: routePoints[0], bearing: 284 };
  }
  const totalLen = cumDists[cumDists.length - 1] || 1;
  const clamped = Math.max(0, Math.min(totalLen, targetDist));

  let segIdx = 0;
  for (let i = 0; i < cumDists.length - 1; i++) {
    if (clamped >= cumDists[i] && clamped <= cumDists[i + 1]) {
      segIdx = i;
      break;
    }
  }

  const p1 = routePoints[segIdx];
  const p2 = routePoints[segIdx + 1] || p1;
  const segStart = cumDists[segIdx];
  const segLen = Math.max(0.01, cumDists[segIdx + 1] - segStart);
  const frac = (clamped - segStart) / segLen;

  const lon = p1[0] + (p2[0] - p1[0]) * frac;
  const lat = p1[1] + (p2[1] - p1[1]) * frac;
  const bearing = calculateBearing(p1, p2);
  return { coords: [lon, lat], bearing };
}

export function useGeospatialSimulation(selectedCorridorKey = 'BLR_MG_ROAD') {
  const baseCorridor = CORRIDORS[selectedCorridorKey] || CORRIDORS.BLR_MG_ROAD;

  // Store OSRM road-snapped polylines (defaults immediately to our verified high-density road points)
  const [snappedPrimaryRoute, setSnappedPrimaryRoute] = useState(baseCorridor.route);
  const [snappedBypassRoute, setSnappedBypassRoute] = useState(baseCorridor.bypassRoute);

  const routeDistancesRef = useRef([]);
  const totalRouteMetersRef = useRef(0);
  const deadlockRerouteRef = useRef(false);
  const activePolylineRef = useRef(baseCorridor.route);

  // Build cumulative distance lookup table for any polyline
  const buildRouteMetrics = useCallback(
    (polyline) => {
      const pts = Array.isArray(polyline) && polyline.length >= 2 ? polyline : baseCorridor.route;
      activePolylineRef.current = pts;
      const dists = [0];
      let sum = 0;
      for (let i = 0; i < pts.length - 1; i++) {
        sum += haversineDistanceMeters(pts[i], pts[i + 1]);
        dists.push(sum);
      }
      routeDistancesRef.current = dists;
      totalRouteMetersRef.current = sum;

      // Snap each intersection's `distanceAlongRoute` to the closest vertex along the road
      baseCorridor.intersections.forEach((intNode) => {
        let closestDist = sum * 0.5;
        let minDist = Infinity;
        for (let i = 0; i < pts.length; i++) {
          const d = haversineDistanceMeters(intNode.coords, pts[i]);
          if (d < minDist) {
            minDist = d;
            closestDist = dists[i] || 0;
          }
        }
        intNode.distanceAlongRoute = closestDist;
      });

      return { pts, dists, sum };
    },
    [baseCorridor]
  );

  // Create 7 civilian vehicles that actively drive along the road corridor
  const createRoadAlignedCivilianVehicles = useCallback(
    (pts, dists, totalLen) => {
      const fracciones = [0.16, 0.27, 0.39, 0.50, 0.62, 0.74, 0.85];
      return fracciones.map((pct, idx) => {
        const distAlong = totalLen * pct;
        // Slight baseline lane offset so cars drive in a clean left/right lane formation on the road
        const baseLaneOffset = idx % 2 === 0 ? 1.2 : -1.1;
        const sampled = samplePointAlongPolyline(pts, dists, distAlong);
        const roadCoords = offsetCoordinates(sampled.coords, sampled.bearing, baseLaneOffset);
        return {
          id: idx + 1,
          distAlongRoute: distAlong,
          speedMps: 6.5 + (idx % 3) * 0.8, // ~24-30 km/h normal commuter speed
          baseLaneOffset,
          laneOffsetMeters: baseLaneOffset,
          currentCoords: roadCoords,
          bearing: sampled.bearing,
          isYielding: false,
          isStoppedAtRed: false,
          type: idx === 2 ? 'SUV' : 'SEDAN',
        };
      });
    },
    []
  );

  const [civilianVehicles, setCivilianVehicles] = useState(() => {
    const { pts, dists, sum } = buildRouteMetrics(baseCorridor.route);
    return createRoadAlignedCivilianVehicles(pts, dists, sum);
  });

  const [simState, setSimState] = useState(() => {
    const startPt = baseCorridor.route[0];
    const nextPt = baseCorridor.route[1] || startPt;
    return {
      isSimulationRunning: false,
      isFrozen: false,
      useRealPhoneGps: false,
      deadlockRerouteActive: false,
      bypassName: baseCorridor.bypassName,
      ambulancePosition: startPt,
      ambulanceBearing: calculateBearing(startPt, nextPt),
      ambulanceSpeedKmh: 0,
      distanceToNextSignal: 340,
      etaToSignalSeconds: 0,
      activeJunctionName: baseCorridor.intersections[0]?.name || 'J1',
      intersectionStates: baseCorridor.intersections.map((n) => ({
        id: n.id,
        shortLabel: n.shortLabel || 'J',
        name: n.name,
        coords: n.coords,
        status: 'RED',
      })),
      bleRadiusMeters: 110,
      signalPhase: 'NORMAL_CYCLE',
      nGreen: true,
      sGreen: true,
      eGreen: false,
      wGreen: false,
      activeAlert: false,
      v2xConnected: false,
    };
  });

  const simRunningRef = useRef(false);
  const isFrozenRef = useRef(false);
  const distanceCoveredRef = useRef(0);
  const speedMpsRef = useRef(16.5); // ~60 km/h emergency response speed
  const wsRef = useRef(null);
  const preemptionFiredRef = useRef(false);
  const clearanceFiredRef = useRef(false);

  // ── Fetch Exact OpenStreetMap Road Geometry via OSRM Driving API ───────────
  useEffect(() => {
    let cancelled = false;
    setSnappedPrimaryRoute(baseCorridor.route);
    setSnappedBypassRoute(baseCorridor.bypassRoute);

    const { pts, dists, sum } = buildRouteMetrics(baseCorridor.route);
    setCivilianVehicles(createRoadAlignedCivilianVehicles(pts, dists, sum));

    const startPt = pts[0];
    const secondPt = pts[1] || startPt;
    simRunningRef.current = false;
    distanceCoveredRef.current = 0;

    setSimState((prev) => ({
      ...prev,
      isSimulationRunning: false,
      isFrozen: false,
      bypassName: baseCorridor.bypassName,
      ambulancePosition: startPt,
      ambulanceBearing: calculateBearing(startPt, secondPt),
      ambulanceSpeedKmh: 0,
      distanceToNextSignal: Math.round(baseCorridor.intersections[0]?.distanceAlongRoute || 350),
      etaToSignalSeconds: 0,
      activeJunctionName: baseCorridor.intersections[0]?.name || 'J1',
      intersectionStates: baseCorridor.intersections.map((n) => ({
        id: n.id,
        shortLabel: n.shortLabel || 'J',
        name: n.name,
        coords: n.coords,
        status: 'RED',
      })),
      signalPhase: 'NORMAL_CYCLE',
      activeAlert: false,
    }));

    // Query OSRM in the browser so the polyline follows every exact curve of Bengaluru's streets
    async function fetchOsrmRoadGeometry() {
      try {
        const keyPoints = [
          baseCorridor.route[0],
          ...baseCorridor.intersections.map((i) => i.coords),
          baseCorridor.route[baseCorridor.route.length - 1],
        ];
        // Deduplicate adjacent identical points
        const uniquePts = keyPoints.filter(
          (pt, idx, arr) =>
            idx === 0 || haversineDistanceMeters(pt, arr[idx - 1]) > 15
        );
        const coordStr = uniquePts.map((p) => `${p[0]},${p[1]}`).join(';');
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson`
        );
        if (res.ok) {
          const data = await res.json();
          const osrmCoords = data?.routes?.[0]?.geometry?.coordinates;
          if (!cancelled && Array.isArray(osrmCoords) && osrmCoords.length >= 4) {
            setSnappedPrimaryRoute(osrmCoords);
            if (!deadlockRerouteRef.current) {
              const metrics = buildRouteMetrics(osrmCoords);
              setCivilianVehicles(
                createRoadAlignedCivilianVehicles(metrics.pts, metrics.dists, metrics.sum)
              );
            }
          }
        }

        // Also snap the Bypass Route via OSRM
        if (baseCorridor.bypassRoute && baseCorridor.bypassRoute.length >= 2) {
          const bypassStr = baseCorridor.bypassRoute.map((p) => `${p[0]},${p[1]}`).join(';');
          const resBypass = await fetch(
            `https://router.project-osrm.org/route/v1/driving/${bypassStr}?overview=full&geometries=geojson`
          );
          if (resBypass.ok) {
            const bData = await resBypass.json();
            const bCoords = bData?.routes?.[0]?.geometry?.coordinates;
            if (!cancelled && Array.isArray(bCoords) && bCoords.length >= 4) {
              setSnappedBypassRoute(bCoords);
              if (deadlockRerouteRef.current) {
                buildRouteMetrics(bCoords);
              }
            }
          }
        }
      } catch (_) {
        // Offline fallback: already initialized with high-density Google-Maps-verified road coordinates
      }
    }

    fetchOsrmRoadGeometry();
    return () => {
      cancelled = true;
    };
  }, [baseCorridor, buildRouteMetrics, createRoadAlignedCivilianVehicles]);

  // ---- Connect to Authoritative V2X Server ----
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

            if (data.event === 'V2X_DEADLOCK_REROUTE' || data.event === 'YOLO_QUEUE_STATE') {
              const isDeadlock =
                data.event === 'V2X_DEADLOCK_REROUTE'
                  ? Boolean(data.deadlockDetected)
                  : Boolean(data.routing?.deadlockRerouteActive);

              deadlockRerouteRef.current = isDeadlock;
              setSimState((prev) => ({
                ...prev,
                deadlockRerouteActive: isDeadlock,
                intersectionStates: prev.intersectionStates.map((node, idx) => ({
                  ...node,
                  status: isDeadlock && idx === 1 ? 'GRIDLOCK_BYPASSED' : node.status,
                })),
              }));
            }

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
  }, []);

  const sendV2X = useCallback((packet) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ ...packet, timestamp: Date.now() }));
      } catch (_) {}
    }
  }, []);

  const dispatchAmbulance = useCallback(() => {
    const activePoly = deadlockRerouteRef.current ? snappedBypassRoute : snappedPrimaryRoute;
    const { pts, dists, sum } = buildRouteMetrics(activePoly);

    simRunningRef.current = true;
    distanceCoveredRef.current = 0;
    preemptionFiredRef.current = false;
    clearanceFiredRef.current = false;
    speedMpsRef.current = 16.5;

    setCivilianVehicles(createRoadAlignedCivilianVehicles(pts, dists, sum));

    const startSample = samplePointAlongPolyline(pts, dists, 0);
    setSimState((prev) => ({
      ...prev,
      isSimulationRunning: true,
      ambulancePosition: startSample.coords,
      ambulanceBearing: startSample.bearing,
      ambulanceSpeedKmh: 58,
      signalPhase: 'NORMAL_CYCLE',
      activeAlert: false,
    }));

    sendV2X({ event: 'SIMULATION_STARTED', corridor: baseCorridor.id });
  }, [
    snappedBypassRoute,
    snappedPrimaryRoute,
    buildRouteMetrics,
    createRoadAlignedCivilianVehicles,
    baseCorridor.id,
    sendV2X,
  ]);

  const toggleFreeze = useCallback(() => {
    isFrozenRef.current = !isFrozenRef.current;
    setSimState((prev) => ({ ...prev, isFrozen: isFrozenRef.current }));
  }, []);

  const toggleRealPhoneGps = useCallback(() => {
    setSimState((prev) => {
      const next = !prev.useRealPhoneGps;
      if (next) simRunningRef.current = false;
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

  // ── Continuous Road-Snapped Traffic & Ambulance Simulation Loop ────────────
  useEffect(() => {
    const TICK_MS = 50;
    const interval = setInterval(() => {
      if (isFrozenRef.current) return;

      const activePoly = deadlockRerouteRef.current ? snappedBypassRoute : snappedPrimaryRoute;
      if (activePolylineRef.current !== activePoly) {
        buildRouteMetrics(activePoly);
      }

      const pts = activePolylineRef.current;
      const dists = routeDistancesRef.current;
      const totalDist = totalRouteMetersRef.current;
      if (!totalDist || dists.length < 2) return;

      const dt = TICK_MS / 1000;

      // 1. Advance Ambulance if Dispatched
      let curAmbDist = distanceCoveredRef.current;
      if (simRunningRef.current) {
        curAmbDist += speedMpsRef.current * dt;
        distanceCoveredRef.current = curAmbDist;

        if (curAmbDist >= totalDist) {
          simRunningRef.current = false;
          distanceCoveredRef.current = 0;
          const resetSample = samplePointAlongPolyline(pts, dists, 0);
          setSimState((prev) => ({
            ...prev,
            isSimulationRunning: false,
            ambulancePosition: resetSample.coords,
            ambulanceBearing: resetSample.bearing,
            ambulanceSpeedKmh: 0,
            signalPhase: 'NORMAL_CYCLE',
            activeAlert: false,
            intersectionStates: baseCorridor.intersections.map((n) => ({
              id: n.id,
              shortLabel: n.shortLabel || 'J',
              name: n.name,
              coords: n.coords,
              status: 'RED',
            })),
          }));
          return;
        }
      }

      const ambSample = samplePointAlongPolyline(pts, dists, curAmbDist);
      const [curLon, curLat] = ambSample.coords;
      const bearing = ambSample.bearing;

      // 2. Evaluate Multi-Intersection Green Wave Cascade across J1, J2, J3
      let upcomingNode = baseCorridor.intersections[baseCorridor.intersections.length - 1];
      let upcomingDist = 0;

      const updatedIntStates = baseCorridor.intersections.map((node, idx) => {
        const dToNode = haversineDistanceMeters([curLon, curLat], node.coords);
        const passed = simRunningRef.current && curAmbDist > node.distanceAlongRoute + 20;

        if (deadlockRerouteRef.current && idx === 1) {
          return {
            id: node.id,
            shortLabel: node.shortLabel || `J${idx + 1}`,
            name: node.name,
            coords: node.coords,
            status: 'GRIDLOCK_BYPASSED',
          };
        }
        if (passed) {
          return {
            id: node.id,
            shortLabel: node.shortLabel || `J${idx + 1}`,
            name: node.name,
            coords: node.coords,
            status: 'CLEARED',
          };
        }
        if (simRunningRef.current && dToNode <= 400) {
          return {
            id: node.id,
            shortLabel: node.shortLabel || `J${idx + 1}`,
            name: node.name,
            coords: node.coords,
            status: 'GREEN_WAVE',
          };
        }
        return {
          id: node.id,
          shortLabel: node.shortLabel || `J${idx + 1}`,
          name: node.name,
          coords: node.coords,
          status: 'RED',
        };
      });

      for (let i = 0; i < baseCorridor.intersections.length; i++) {
        const node = baseCorridor.intersections[i];
        if (curAmbDist <= node.distanceAlongRoute + 15) {
          upcomingNode = node;
          upcomingDist = Math.max(0, node.distanceAlongRoute - curAmbDist);
          break;
        }
      }

      // 3. Move Civilian Vehicles Smoothly Along the Exact Road Geometry
      const BLE_ALERT_ZONE = 150;
      setCivilianVehicles((prevCars) =>
        prevCars.map((car) => {
          const distAheadOfAmb = car.distAlongRoute - curAmbDist;
          const inYieldZone =
            simRunningRef.current && distAheadOfAmb > -18 && distAheadOfAmb <= BLE_ALERT_ZONE;

          // Check if car is approaching a RED intersection stop bar
          let stoppedAtRed = false;
          for (let j = 0; j < baseCorridor.intersections.length; j++) {
            const jNode = baseCorridor.intersections[j];
            const jState = updatedIntStates[j]?.status || 'RED';
            const distToStopBar = jNode.distanceAlongRoute - car.distAlongRoute;
            if (jState === 'RED' && distToStopBar > 4 && distToStopBar < 26) {
              stoppedAtRed = true;
              break;
            }
          }

          // Advance car along the road (slow down slightly when yielding to left shoulder)
          let stepMps = stoppedAtRed ? 0 : inYieldZone ? car.speedMps * 0.45 : car.speedMps;
          let nextDist = car.distAlongRoute + stepMps * dt;
          if (nextDist >= totalDist) {
            nextDist = 20;
          }

          // When yielding, shift smoothly to left shoulder (+4.2m left of centerline)
          const targetOffset = inYieldZone ? 4.2 : car.baseLaneOffset;
          const newOffset = car.laneOffsetMeters + (targetOffset - car.laneOffsetMeters) * 0.18;

          const carSample = samplePointAlongPolyline(pts, dists, nextDist);
          const displacedCoords = offsetCoordinates(carSample.coords, carSample.bearing, newOffset);

          return {
            ...car,
            distAlongRoute: nextDist,
            laneOffsetMeters: newOffset,
            currentCoords: displacedCoords,
            bearing: carSample.bearing,
            isYielding: inYieldZone,
            isStoppedAtRed: stoppedAtRed,
          };
        })
      );

      if (!simRunningRef.current) return;

      const etaSeconds =
        speedMpsRef.current > 0 ? Math.round(upcomingDist / speedMpsRef.current) : 0;
      const anyGreenWave = updatedIntStates.some((n) => n.status === 'GREEN_WAVE');
      const phase = anyGreenWave ? 'W_GREEN' : 'NORMAL_CYCLE';

      if (anyGreenWave && !preemptionFiredRef.current) {
        preemptionFiredRef.current = true;
        sendV2X({
          event: 'V2X_ALERT_TRIGGER',
          corridorId: baseCorridor.id,
          intersection: upcomingNode.name,
          distanceMeters: Math.round(upcomingDist),
          etaSeconds,
        });
      }

      if (curAmbDist >= totalDist * 0.88 && !clearanceFiredRef.current) {
        clearanceFiredRef.current = true;
        sendV2X({
          event: 'V2X_CLEARANCE_CONFIRMED',
          corridorId: baseCorridor.id,
          intersection: upcomingNode.name,
        });
      }

      const speedKmh = Math.round(speedMpsRef.current * 3.6);

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
        corridorId: baseCorridor.id,
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
  }, [
    baseCorridor,
    snappedPrimaryRoute,
    snappedBypassRoute,
    buildRouteMetrics,
    sendV2X,
  ]);

  // Expose corridor with live OSRM-snapped polylines so MapboxSimulation draws exact road curves
  const enrichedCorridor = {
    ...baseCorridor,
    route: snappedPrimaryRoute,
    bypassRoute: snappedBypassRoute,
  };

  return {
    corridor: enrichedCorridor,
    simState,
    civilianVehicles,
    dispatchAmbulance,
    toggleFreeze,
    toggleRealPhoneGps,
  };
}
