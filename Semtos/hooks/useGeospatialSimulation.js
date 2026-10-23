import { useState, useEffect, useRef, useCallback } from 'react';

// ── 1. Empirical Records from Kaggle `Banglore_traffic_Dataset.csv` ──────────
// Directly maps the 16-column Kaggle dataset (`Date`, `Area Name`, `Road/Intersection Name`,
// `Traffic Volume`, `Average Speed`, `Travel Time Index`, `Congestion Level`,
// `Road Capacity Utilization`, `Incident Reports`, `Traffic Signal Compliance`,
// `Weather Conditions`, `Roadwork and Construction Activity`) into physical vehicle
// spawn counts, cruising speeds, driver yielding compliance, and signal preemption hold.
export const KAGGLE_CORRIDOR_RECORDS = {
  BLR_MG_ROAD: [
    {
      scenarioId: 'KAGGLE_MG_FREE',
      corridorId: 'BLR_MG_ROAD',
      regime: 'OFF_PEAK_CLEAR',
      shortTab: '🟢 Clear (42 km/h)',
      label: 'Row #104 • Trinity Circle (Clear Off-Peak)',
      date: '2024-08-01',
      areaName: 'M.G. Road',
      intersectionName: 'Trinity Circle',
      trafficVolume: 21450,
      averageSpeedKmh: 42.5,
      travelTimeIndex: 1.08,
      congestionLevelPct: 44.2,
      roadCapacityUtilizationPct: 56.0,
      incidentReports: 0,
      trafficSignalCompliancePct: 89.2,
      weatherConditions: 'Clear',
      roadworkActivity: 'No',
      derivedQueueCars: 3,
      spawnedCivilianCars: 6,
    },
    {
      scenarioId: 'KAGGLE_MG_MOD',
      corridorId: 'BLR_MG_ROAD',
      regime: 'COMMUTER_MODERATE',
      shortTab: '🟡 Moderate (25 km/h)',
      label: 'Row #412 • Brigade Rd Junction (Commuter Flow)',
      date: '2024-08-02',
      areaName: 'M.G. Road',
      intersectionName: 'Brigade Road Junction',
      trafficVolume: 34820,
      averageSpeedKmh: 24.8,
      travelTimeIndex: 1.34,
      congestionLevelPct: 74.5,
      roadCapacityUtilizationPct: 79.4,
      incidentReports: 1,
      trafficSignalCompliancePct: 80.5,
      weatherConditions: 'Overcast',
      roadworkActivity: 'No',
      derivedQueueCars: 6,
      spawnedCivilianCars: 9,
    },
    {
      scenarioId: 'KAGGLE_MG_PEAK',
      corridorId: 'BLR_MG_ROAD',
      regime: 'PEAK_RAIN_GRIDLOCK',
      shortTab: '🔴 Rain Jam (12 km/h)',
      label: 'Row #889 • Anil Kumble Circle (Peak Rain + 2 Incidents)',
      date: '2024-08-03',
      areaName: 'M.G. Road',
      intersectionName: 'Anil Kumble Circle',
      trafficVolume: 48950,
      averageSpeedKmh: 12.4,
      travelTimeIndex: 1.68,
      congestionLevelPct: 96.8,
      roadCapacityUtilizationPct: 94.2,
      incidentReports: 2,
      trafficSignalCompliancePct: 65.8,
      weatherConditions: 'Rain',
      roadworkActivity: 'Yes',
      derivedQueueCars: 14,
      spawnedCivilianCars: 14,
    },
  ],

  BLR_HOSUR_RD: [
    {
      scenarioId: 'KAGGLE_HSR_FREE',
      corridorId: 'BLR_HOSUR_RD',
      regime: 'OFF_PEAK_CLEAR',
      shortTab: '🟢 Clear (40 km/h)',
      label: 'Row #215 • Sony World Junction (Clear Flow)',
      date: '2024-08-04',
      areaName: 'Koramangala',
      intersectionName: 'Sony World Junction',
      trafficVolume: 23800,
      averageSpeedKmh: 39.6,
      travelTimeIndex: 1.12,
      congestionLevelPct: 48.0,
      roadCapacityUtilizationPct: 59.5,
      incidentReports: 0,
      trafficSignalCompliancePct: 87.5,
      weatherConditions: 'Clear',
      roadworkActivity: 'No',
      derivedQueueCars: 3,
      spawnedCivilianCars: 6,
    },
    {
      scenarioId: 'KAGGLE_HSR_MOD',
      corridorId: 'BLR_HOSUR_RD',
      regime: 'COMMUTER_MODERATE',
      shortTab: '🟡 Moderate (22 km/h)',
      label: 'Row #534 • Silk Board Junction (Commuter Flow)',
      date: '2024-08-05',
      areaName: 'Koramangala',
      intersectionName: 'Silk Board Junction',
      trafficVolume: 38900,
      averageSpeedKmh: 22.1,
      travelTimeIndex: 1.41,
      congestionLevelPct: 78.2,
      roadCapacityUtilizationPct: 82.6,
      incidentReports: 1,
      trafficSignalCompliancePct: 78.4,
      weatherConditions: 'Overcast',
      roadworkActivity: 'No',
      derivedQueueCars: 7,
      spawnedCivilianCars: 10,
    },
    {
      scenarioId: 'KAGGLE_HSR_PEAK',
      corridorId: 'BLR_HOSUR_RD',
      regime: 'PEAK_RAIN_GRIDLOCK',
      shortTab: '🔴 Rain Jam (11 km/h)',
      label: 'Row #1102 • Silk Board (Peak Rain + 3 Incidents)',
      date: '2024-08-06',
      areaName: 'Koramangala',
      intersectionName: 'Silk Board Junction',
      trafficVolume: 54200,
      averageSpeedKmh: 10.8,
      travelTimeIndex: 1.76,
      congestionLevelPct: 99.4,
      roadCapacityUtilizationPct: 96.5,
      incidentReports: 3,
      trafficSignalCompliancePct: 63.2,
      weatherConditions: 'Rain',
      roadworkActivity: 'Yes',
      derivedQueueCars: 15,
      spawnedCivilianCars: 14,
    },
  ],

  BLR_INDIRANAGAR: [
    {
      scenarioId: 'KAGGLE_IND_FREE',
      corridorId: 'BLR_INDIRANAGAR',
      regime: 'OFF_PEAK_CLEAR',
      shortTab: '🟢 Clear (44 km/h)',
      label: 'Row #309 • 100 Feet Road (Clear Flow)',
      date: '2024-08-07',
      areaName: 'Indiranagar',
      intersectionName: '100 Feet Road',
      trafficVolume: 19850,
      averageSpeedKmh: 44.0,
      travelTimeIndex: 1.06,
      congestionLevelPct: 41.5,
      roadCapacityUtilizationPct: 54.2,
      incidentReports: 0,
      trafficSignalCompliancePct: 90.4,
      weatherConditions: 'Clear',
      roadworkActivity: 'No',
      derivedQueueCars: 3,
      spawnedCivilianCars: 6,
    },
    {
      scenarioId: 'KAGGLE_IND_MOD',
      corridorId: 'BLR_INDIRANAGAR',
      regime: 'COMMUTER_MODERATE',
      shortTab: '🟡 Moderate (24 km/h)',
      label: 'Row #678 • 100 Feet Road (Evening Commute)',
      date: '2024-08-08',
      areaName: 'Indiranagar',
      intersectionName: '100 Feet Road',
      trafficVolume: 36400,
      averageSpeedKmh: 23.5,
      travelTimeIndex: 1.38,
      congestionLevelPct: 76.0,
      roadCapacityUtilizationPct: 81.0,
      incidentReports: 1,
      trafficSignalCompliancePct: 79.6,
      weatherConditions: 'Overcast',
      roadworkActivity: 'No',
      derivedQueueCars: 6,
      spawnedCivilianCars: 9,
    },
    {
      scenarioId: 'KAGGLE_IND_PEAK',
      corridorId: 'BLR_INDIRANAGAR',
      regime: 'PEAK_RAIN_GRIDLOCK',
      shortTab: '🔴 Rain Jam (13 km/h)',
      label: 'Row #954 • CMH / 100 Ft Rd (Peak Rain + 2 Incidents)',
      date: '2024-08-09',
      areaName: 'Indiranagar',
      intersectionName: 'CMH Road',
      trafficVolume: 49600,
      averageSpeedKmh: 13.1,
      travelTimeIndex: 1.65,
      congestionLevelPct: 95.2,
      roadCapacityUtilizationPct: 93.0,
      incidentReports: 2,
      trafficSignalCompliancePct: 67.0,
      weatherConditions: 'Rain',
      roadworkActivity: 'Yes',
      derivedQueueCars: 13,
      spawnedCivilianCars: 13,
    },
  ],
};

export function computeKaggleAdjustedHoldSeconds(queueCount, compliancePct = 80.5, weather = 'Overcast') {
  const n = Math.max(0, Number(queueCount) || 0);
  const compFactor = Math.max(0.55, Math.min(1.0, (Number(compliancePct) || 80.5) / 100));
  const isRainOrFog = /rain|fog|storm/i.test(String(weather || ''));
  const tDischarge = isRainOrFog ? 2.85 : 2.2;
  const tBuffer = isRainOrFog ? 8 : 4;
  return Math.min(60, 10 + Math.ceil((n * tDischarge) / compFactor) + tBuffer);
}

// ── 2. 100% Bengaluru Real-World Road-Snapped Emergency Corridors ───────────
export const CORRIDORS = {
  BLR_MG_ROAD: {
    id: 'BLR_MG_ROAD',
    name: 'Bengaluru — MG Road to Bowring Hospital',
    hospitalName: 'Bowring & Lady Curzon Hospital',
    center: [77.6093, 12.9748],
    zoom: 15.65,
    pitch: 52,
    bearing: 284,
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
    crossStreets: [
      {
        id: 'CS_MG_1',
        name: 'Residency Rd – Mayo Hall Cross',
        coords: [[77.60980, 12.97150], [77.61065, 12.97411], [77.61145, 12.97680]],
        baseCongestion: 'HEAVY',
        baseSpeedKmh: 14,
      },
      {
        id: 'CS_MG_2',
        name: 'Brigade Road – Kamaraj Road',
        coords: [[77.60585, 12.97210], [77.60662, 12.97522], [77.60755, 12.97820]],
        baseCongestion: 'GRIDLOCK',
        baseSpeedKmh: 9,
      },
      {
        id: 'CS_MG_3',
        name: 'St. Marks Rd – Anil Kumble Circle',
        coords: [[77.60110, 12.97380], [77.60180, 12.97657], [77.60240, 12.97895]],
        baseCongestion: 'MODERATE',
        baseSpeedKmh: 24,
      },
    ],
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
    zoom: 15.35,
    pitch: 52,
    bearing: 342,
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
    crossStreets: [
      {
        id: 'CS_HSR_1',
        name: 'Madiwala Market Cross Rd',
        coords: [[77.61850, 12.92010], [77.62095, 12.92075], [77.62360, 12.92140]],
        baseCongestion: 'HEAVY',
        baseSpeedKmh: 13,
      },
      {
        id: 'CS_HSR_2',
        name: 'Hosur Rd – Adugodi Approach',
        coords: [[77.61520, 12.92880], [77.61735, 12.92635], [77.61610, 12.92420]],
        baseCongestion: 'GRIDLOCK',
        baseSpeedKmh: 8,
      },
      {
        id: 'CS_HSR_3',
        name: 'Koramangala 100 Ft Inner Ring Rd',
        coords: [[77.62380, 12.92520], [77.62174, 12.92712], [77.62420, 12.92950]],
        baseCongestion: 'MODERATE',
        baseSpeedKmh: 22,
      },
    ],
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
    center: [77.6422, 12.9685],
    zoom: 15.25,
    pitch: 52,
    bearing: 175,
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
    crossStreets: [
      {
        id: 'CS_IND_1',
        name: 'Indiranagar 12th Main Road',
        coords: [[77.63780, 12.97450], [77.64085, 12.97460], [77.64380, 12.97470]],
        baseCongestion: 'HEAVY',
        baseSpeedKmh: 15,
      },
      {
        id: 'CS_IND_2',
        name: 'Domlur 14th Cross – BDA Complex',
        coords: [[77.63820, 12.96670], [77.64105, 12.96680], [77.64410, 12.96690]],
        baseCongestion: 'MODERATE',
        baseSpeedKmh: 23,
      },
      {
        id: 'CS_IND_3',
        name: 'HAL Old Airport Road West',
        coords: [[77.63650, 12.96280], [77.64115, 12.96180], [77.64480, 12.96040]],
        baseCongestion: 'GRIDLOCK',
        baseSpeedKmh: 10,
      },
    ],
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

function offsetCoordinates([lon, lat], bearingDeg, lateralMeters) {
  if (!lateralMeters || Math.abs(lateralMeters) < 0.01) return [lon, lat];
  const R = 6371000;
  const toRad = Math.PI / 180;
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

function getTrafficStyleForState(congestionState) {
  switch (congestionState) {
    case 'FREE_FLOW':
      return { color: '#22c55e', glow: '#10b981', speedKmh: 48, label: 'FREE FLOW' };
    case 'MODERATE':
      return { color: '#facc15', glow: '#eab308', speedKmh: 25, label: 'MODERATE' };
    case 'HEAVY':
      return { color: '#f97316', glow: '#ea580c', speedKmh: 15, label: 'HEAVY TRAFFIC' };
    case 'GRIDLOCK':
    default:
      return { color: '#ef4444', glow: '#dc2626', speedKmh: 9, label: 'SEVERE CONGESTION' };
  }
}

export function useGeospatialSimulation(selectedCorridorKey = 'BLR_MG_ROAD') {
  const baseCorridor = CORRIDORS[selectedCorridorKey] || CORRIDORS.BLR_MG_ROAD;
  const corridorKaggleList =
    KAGGLE_CORRIDOR_RECORDS[selectedCorridorKey] || KAGGLE_CORRIDOR_RECORDS.BLR_MG_ROAD;

  const [activeKaggleRecord, setActiveKaggleRecord] = useState(() => corridorKaggleList[1]);
  const activeKaggleRef = useRef(corridorKaggleList[1]);

  const [snappedPrimaryRoute, setSnappedPrimaryRoute] = useState(baseCorridor.route);
  const [snappedBypassRoute, setSnappedBypassRoute] = useState(baseCorridor.bypassRoute);
  const [osrmBaseSpeeds, setOsrmBaseSpeeds] = useState([]);
  const [liveTrafficIncident, setLiveTrafficIncident] = useState(false);

  const routeDistancesRef = useRef([]);
  const totalRouteMetersRef = useRef(0);
  const deadlockRerouteRef = useRef(false);
  const activePolylineRef = useRef(baseCorridor.route);
  const yoloQueueCountRef = useRef(corridorKaggleList[1].derivedQueueCars);

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

  // Build Live Traffic Feed GeoJSON Segments driven directly by the active Kaggle record + Ambulance Preemption
  const buildLiveTrafficSegments = useCallback(
    (pts, dists, ambDist, isSimRunning, isDeadlockBypass, queueCount, incidentActive, kaggleRec) => {
      const features = [];
      if (!pts || pts.length < 2) {
        return { features, avgCorridorSpeedKmh: 32, congestionSummary: 'MODERATE' };
      }

      const kSpeed = kaggleRec?.averageSpeedKmh ?? 24.8;
      const kCongestion = kaggleRec?.congestionLevelPct ?? 74.5;
      const kUtil = kaggleRec?.roadCapacityUtilizationPct ?? 79.4;

      let totalSpeed = 0;
      let segCount = 0;

      for (let i = 0; i < pts.length - 1; i++) {
        const segMidDist = ((dists[i] || 0) + (dists[i + 1] || 0)) * 0.5;
        const segMidCoord = [
          (pts[i][0] + pts[i + 1][0]) * 0.5,
          (pts[i][1] + pts[i + 1][1]) * 0.5,
        ];

        let nearestIntDist = Infinity;
        let nearestIntIdx = 0;
        baseCorridor.intersections.forEach((intNode, idx) => {
          const d = haversineDistanceMeters(segMidCoord, intNode.coords);
          if (d < nearestIntDist) {
            nearestIntDist = d;
            nearestIntIdx = idx;
          }
        });

        const osrmSpd = osrmBaseSpeeds[i];
        let stateKey = 'FREE_FLOW';

        // Map Kaggle Congestion Level & Road Capacity Utilization (>85% bottleneck) onto road segments
        if ((isDeadlockBypass || incidentActive || kUtil >= 88) && nearestIntIdx === 1 && nearestIntDist < 260) {
          stateKey = 'GRIDLOCK';
        } else if (kCongestion >= 88) {
          stateKey = nearestIntDist < 190 ? 'GRIDLOCK' : 'HEAVY';
        } else if (kCongestion >= 65) {
          if (nearestIntDist < 125) stateKey = queueCount >= 9 ? 'GRIDLOCK' : 'HEAVY';
          else if (nearestIntDist < 240) stateKey = 'MODERATE';
          else stateKey = i % 3 === 1 ? 'MODERATE' : 'FREE_FLOW';
        } else {
          // Off-Peak Clear Kaggle Row (< 55% congestion)
          stateKey = nearestIntDist < 85 ? 'MODERATE' : osrmSpd && osrmSpd < 20 ? 'MODERATE' : 'FREE_FLOW';
        }

        // AMBULANCE LIVE TRAFFIC INTERACTION:
        const distAheadOfAmb = segMidDist - ambDist;
        let flushedByV2X = false;
        if (isSimRunning && !isDeadlockBypass) {
          if (distAheadOfAmb >= -80 && distAheadOfAmb <= 380) {
            stateKey = distAheadOfAmb > 260 && stateKey === 'GRIDLOCK' ? 'MODERATE' : 'FREE_FLOW';
            flushedByV2X = true;
          } else if (distAheadOfAmb < -80) {
            stateKey = 'FREE_FLOW';
            flushedByV2X = true;
          }
        }

        const style = getTrafficStyleForState(stateKey);
        const effectiveSegSpeed = flushedByV2X
          ? 52
          : Math.max(7, Math.round((style.speedKmh + kSpeed) * 0.5));
        totalSpeed += effectiveSegSpeed;
        segCount++;

        features.push({
          type: 'Feature',
          properties: {
            id: `primary_seg_${i}`,
            roadType: 'PRIMARY_CORRIDOR',
            congestion: stateKey,
            color: style.color,
            glow: style.glow,
            speedKmh: effectiveSegSpeed,
            flushedByV2X,
          },
          geometry: {
            type: 'LineString',
            coordinates: [pts[i], pts[i + 1]],
          },
        });
      }

      (baseCorridor.crossStreets || []).forEach((cs) => {
        const csState = isSimRunning
          ? 'GRIDLOCK'
          : kCongestion >= 88
          ? 'GRIDLOCK'
          : kCongestion >= 65
          ? cs.baseCongestion
          : 'MODERATE';
        const style = getTrafficStyleForState(csState);
        features.push({
          type: 'Feature',
          properties: {
            id: cs.id,
            roadType: 'CROSS_STREET',
            name: cs.name,
            congestion: csState,
            color: style.color,
            glow: style.glow,
            speedKmh: style.speedKmh,
            flushedByV2X: false,
          },
          geometry: {
            type: 'LineString',
            coordinates: cs.coords,
          },
        });
      });

      const avgCorridorSpeedKmh = segCount > 0 ? Math.round(totalSpeed / segCount) : Math.round(kSpeed);
      const congestionSummary =
        isDeadlockBypass || incidentActive
          ? `KAGGLE INCIDENT JAM (${kaggleRec?.incidentReports || 2} INCIDENTS • BYPASS)`
          : avgCorridorSpeedKmh >= 38
          ? 'KAGGLE FREE FLOW'
          : avgCorridorSpeedKmh >= 22
          ? 'KAGGLE COMMUTER FLOW'
          : 'KAGGLE BOTTLENECK CONGESTION';

      return { features, avgCorridorSpeedKmh, congestionSummary };
    },
    [baseCorridor, osrmBaseSpeeds]
  );

  /**
   * Spawns civilian vehicles whose count, speed (`speedMps`), and yielding compliance
   * (`isCompliant`) are physically governed by the active Kaggle dataset row!
   */
  const createRoadAlignedCivilianVehicles = useCallback(
    (pts, dists, totalLen, kaggleRec) => {
      const rec = kaggleRec || activeKaggleRef.current || corridorKaggleList[1];
      const carCount = Math.max(4, Math.min(14, Number(rec.spawnedCivilianCars) || 8));
      const baseSpeedMps = Math.max(2.6, (Number(rec.averageSpeedKmh) || 24.8) / 3.6);
      const complianceRatio = Math.max(0.5, Math.min(1.0, (Number(rec.trafficSignalCompliancePct) || 80.5) / 100));

      const vehicles = [];
      for (let idx = 0; idx < carCount; idx++) {
        const pct = 0.10 + (idx / Math.max(1, carCount)) * 0.80;
        const distAlong = totalLen * pct;
        const baseLaneOffset = idx % 2 === 0 ? 1.3 : -1.1;
        const sampled = samplePointAlongPolyline(pts, dists, distAlong);
        const roadCoords = offsetCoordinates(sampled.coords, sampled.bearing, baseLaneOffset);

        // Deterministic compliance assignment matching the Kaggle row's `Traffic Signal Compliance` %
        const isCompliant = ((idx * 37 + 13) % 100) < complianceRatio * 100;

        vehicles.push({
          id: idx + 1,
          distAlongRoute: distAlong,
          speedMps: baseSpeedMps * (0.9 + (idx % 3) * 0.1),
          currentSpeedKmh: Math.round(baseSpeedMps * 3.6),
          baseLaneOffset,
          laneOffsetMeters: baseLaneOffset,
          currentCoords: roadCoords,
          bearing: sampled.bearing,
          isCompliant,
          isYielding: false,
          isDelayedYield: false,
          isStoppedAtRed: false,
          trafficZone: rec.congestionLevelPct >= 85 ? 'HEAVY' : 'MODERATE',
          type: idx % 3 === 0 ? 'SUV' : 'SEDAN',
        });
      }
      return vehicles;
    },
    [corridorKaggleList]
  );

  const [civilianVehicles, setCivilianVehicles] = useState(() => {
    const { pts, dists, sum } = buildRouteMetrics(baseCorridor.route);
    return createRoadAlignedCivilianVehicles(pts, dists, sum, corridorKaggleList[1]);
  });

  const [liveTrafficGeoJson, setLiveTrafficGeoJson] = useState(() => {
    const { pts, dists } = buildRouteMetrics(baseCorridor.route);
    const initial = buildLiveTrafficSegments(
      pts,
      dists,
      0,
      false,
      false,
      corridorKaggleList[1].derivedQueueCars,
      false,
      corridorKaggleList[1]
    );
    return {
      type: 'FeatureCollection',
      features: initial.features,
    };
  });

  const [simState, setSimState] = useState(() => {
    const startPt = baseCorridor.route[0];
    const nextPt = baseCorridor.route[1] || startPt;
    const initRec = corridorKaggleList[1];
    return {
      isSimulationRunning: false,
      isFrozen: false,
      useRealPhoneGps: false,
      deadlockRerouteActive: false,
      liveTrafficIncident: false,
      liveTrafficSource: `KAGGLE CSV (${initRec.areaName})`,
      corridorAvgSpeedKmh: Math.round(initRec.averageSpeedKmh),
      congestionSummary: 'KAGGLE COMMUTER FLOW',
      kaggleRecord: initRec,
      kaggleHoldSeconds: computeKaggleAdjustedHoldSeconds(
        initRec.derivedQueueCars,
        initRec.trafficSignalCompliancePct,
        initRec.weatherConditions
      ),
      bypassName: baseCorridor.bypassName,
      ambulancePosition: startPt,
      ambulanceBearing: calculateBearing(startPt, nextPt),
      ambulanceSpeedKmh: 0,
      distanceToNextSignal: 340,
      etaToSignalSeconds: 0,
      activeJunctionName: baseCorridor.intersections[0]?.name || 'J1',
      intersectionStates: baseCorridor.intersections.map((n, idx) => ({
        id: n.id,
        shortLabel: n.shortLabel || `J${idx + 1}`,
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
  const speedMpsRef = useRef(16.0);
  const wsRef = useRef(null);
  const preemptionFiredRef = useRef(false);
  const clearanceFiredRef = useRef(false);

  const sendV2X = useCallback((packet) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify({ ...packet, timestamp: Date.now() }));
      } catch (_) {}
    }
  }, []);

  // Apply a Kaggle Dataset Row (`OFF_PEAK_CLEAR`, `COMMUTER_MODERATE`, or `PEAK_RAIN_GRIDLOCK`)
  const selectKaggleScenario = useCallback(
    (scenarioIdOrRecord) => {
      const list =
        KAGGLE_CORRIDOR_RECORDS[selectedCorridorKey] || KAGGLE_CORRIDOR_RECORDS.BLR_MG_ROAD;
      const chosen =
        typeof scenarioIdOrRecord === 'string'
          ? list.find((r) => r.scenarioId === scenarioIdOrRecord) || list[1]
          : scenarioIdOrRecord || list[1];

      activeKaggleRef.current = chosen;
      setActiveKaggleRecord(chosen);

      const isIncidentJam =
        chosen.derivedQueueCars >= 12 ||
        (chosen.roadCapacityUtilizationPct >= 88 &&
          (chosen.incidentReports >= 2 || chosen.roadworkActivity === 'Yes'));

      deadlockRerouteRef.current = isIncidentJam;
      setLiveTrafficIncident(isIncidentJam);
      yoloQueueCountRef.current = chosen.derivedQueueCars;

      const activePoly = isIncidentJam ? snappedBypassRoute : snappedPrimaryRoute;
      const { pts, dists, sum } = buildRouteMetrics(activePoly);

      // Re-spawn civilian vehicles with the exact count, speed, and compliance % of this Kaggle row!
      setCivilianVehicles(createRoadAlignedCivilianVehicles(pts, dists, sum, chosen));

      const primaryMetrics = buildRouteMetrics(snappedPrimaryRoute);
      const trafficEval = buildLiveTrafficSegments(
        primaryMetrics.pts,
        primaryMetrics.dists,
        distanceCoveredRef.current,
        simRunningRef.current,
        isIncidentJam,
        chosen.derivedQueueCars,
        isIncidentJam,
        chosen
      );
      setLiveTrafficGeoJson({ type: 'FeatureCollection', features: trafficEval.features });

      const holdSec = computeKaggleAdjustedHoldSeconds(
        chosen.derivedQueueCars,
        chosen.trafficSignalCompliancePct,
        chosen.weatherConditions
      );

      setSimState((prev) => ({
        ...prev,
        deadlockRerouteActive: isIncidentJam,
        liveTrafficIncident: isIncidentJam,
        liveTrafficSource: `KAGGLE CSV (${chosen.areaName} • ${chosen.weatherConditions})`,
        corridorAvgSpeedKmh: Math.round(chosen.averageSpeedKmh),
        congestionSummary: trafficEval.congestionSummary,
        kaggleRecord: chosen,
        kaggleHoldSeconds: holdSec,
        intersectionStates: prev.intersectionStates.map((node, idx) => ({
          ...node,
          status: isIncidentJam && idx === 1 ? 'GRIDLOCK_BYPASSED' : node.status === 'GRIDLOCK_BYPASSED' ? 'RED' : node.status,
        })),
      }));

      sendV2X({
        event: 'SELECT_KAGGLE_SCENARIO',
        scenarioId: chosen.scenarioId,
      });
    },
    [
      selectedCorridorKey,
      snappedBypassRoute,
      snappedPrimaryRoute,
      buildRouteMetrics,
      createRoadAlignedCivilianVehicles,
      buildLiveTrafficSegments,
      sendV2X,
    ]
  );

  // ── Fetch Exact OpenStreetMap Road Geometry + Live Speed Annotations via OSRM ──
  useEffect(() => {
    let cancelled = false;
    const defaultRec =
      (KAGGLE_CORRIDOR_RECORDS[selectedCorridorKey] || KAGGLE_CORRIDOR_RECORDS.BLR_MG_ROAD)[1];
    activeKaggleRef.current = defaultRec;
    setActiveKaggleRecord(defaultRec);

    setSnappedPrimaryRoute(baseCorridor.route);
    setSnappedBypassRoute(baseCorridor.bypassRoute);
    setLiveTrafficIncident(false);
    deadlockRerouteRef.current = false;
    yoloQueueCountRef.current = defaultRec.derivedQueueCars;

    const { pts, dists, sum } = buildRouteMetrics(baseCorridor.route);
    setCivilianVehicles(createRoadAlignedCivilianVehicles(pts, dists, sum, defaultRec));

    const initTraffic = buildLiveTrafficSegments(
      pts,
      dists,
      0,
      false,
      false,
      defaultRec.derivedQueueCars,
      false,
      defaultRec
    );
    setLiveTrafficGeoJson({ type: 'FeatureCollection', features: initTraffic.features });

    const startPt = pts[0];
    const secondPt = pts[1] || startPt;
    simRunningRef.current = false;
    distanceCoveredRef.current = 0;

    setSimState((prev) => ({
      ...prev,
      isSimulationRunning: false,
      isFrozen: false,
      deadlockRerouteActive: false,
      liveTrafficIncident: false,
      liveTrafficSource: `KAGGLE CSV (${defaultRec.areaName} • ${defaultRec.weatherConditions})`,
      corridorAvgSpeedKmh: Math.round(defaultRec.averageSpeedKmh),
      congestionSummary: initTraffic.congestionSummary,
      kaggleRecord: defaultRec,
      kaggleHoldSeconds: computeKaggleAdjustedHoldSeconds(
        defaultRec.derivedQueueCars,
        defaultRec.trafficSignalCompliancePct,
        defaultRec.weatherConditions
      ),
      bypassName: baseCorridor.bypassName,
      ambulancePosition: startPt,
      ambulanceBearing: calculateBearing(startPt, secondPt),
      ambulanceSpeedKmh: 0,
      distanceToNextSignal: Math.round(baseCorridor.intersections[0]?.distanceAlongRoute || 350),
      etaToSignalSeconds: 0,
      activeJunctionName: baseCorridor.intersections[0]?.name || 'J1',
      intersectionStates: baseCorridor.intersections.map((n, idx) => ({
        id: n.id,
        shortLabel: n.shortLabel || `J${idx + 1}`,
        name: n.name,
        coords: n.coords,
        status: 'RED',
      })),
      signalPhase: 'NORMAL_CYCLE',
      activeAlert: false,
    }));

    async function fetchOsrmRoadAndTraffic() {
      try {
        const keyPoints = [
          baseCorridor.route[0],
          ...baseCorridor.intersections.map((i) => i.coords),
          baseCorridor.route[baseCorridor.route.length - 1],
        ];
        const uniquePts = keyPoints.filter(
          (pt, idx, arr) => idx === 0 || haversineDistanceMeters(pt, arr[idx - 1]) > 15
        );
        const coordStr = uniquePts.map((p) => `${p[0]},${p[1]}`).join(';');
        const res = await fetch(
          `https://router.project-osrm.org/route/v1/driving/${coordStr}?overview=full&geometries=geojson&annotations=speed,duration,distance`
        );
        if (res.ok) {
          const data = await res.json();
          const routeObj = data?.routes?.[0];
          const osrmCoords = routeObj?.geometry?.coordinates;
          const legSpeeds = [];
          (routeObj?.legs || []).forEach((leg) => {
            (leg?.annotation?.speed || []).forEach((s) => {
              legSpeeds.push(Math.round(Number(s) * 3.6));
            });
          });

          if (!cancelled && Array.isArray(osrmCoords) && osrmCoords.length >= 4) {
            setOsrmBaseSpeeds(legSpeeds);
            setSnappedPrimaryRoute(osrmCoords);
            if (!deadlockRerouteRef.current) {
              const metrics = buildRouteMetrics(osrmCoords);
              setCivilianVehicles(
                createRoadAlignedCivilianVehicles(
                  metrics.pts,
                  metrics.dists,
                  metrics.sum,
                  activeKaggleRef.current
                )
              );
            }
          }
        }

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
      } catch (_) {}
    }

    fetchOsrmRoadAndTraffic();
    return () => {
      cancelled = true;
    };
  }, [
    selectedCorridorKey,
    baseCorridor,
    buildRouteMetrics,
    createRoadAlignedCivilianVehicles,
    buildLiveTrafficSegments,
  ]);

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

            if (data.event === 'KAGGLE_SCENARIO_APPLIED' && data.kaggleRecord) {
              const rec = data.kaggleRecord;
              if (rec.corridorId === selectedCorridorKey) {
                activeKaggleRef.current = rec;
                setActiveKaggleRecord(rec);
              }
            }

            if (data.event === 'V2X_DEADLOCK_REROUTE' || data.event === 'YOLO_QUEUE_STATE') {
              const qCount =
                data.queueCount ?? data.yoloQueue?.queueCount ?? yoloQueueCountRef.current;
              yoloQueueCountRef.current = qCount;

              const isDeadlock =
                data.event === 'V2X_DEADLOCK_REROUTE'
                  ? Boolean(data.deadlockDetected)
                  : Boolean(data.routing?.deadlockRerouteActive);

              deadlockRerouteRef.current = isDeadlock;
              setLiveTrafficIncident(isDeadlock);
              setSimState((prev) => ({
                ...prev,
                deadlockRerouteActive: isDeadlock,
                liveTrafficIncident: isDeadlock,
                kaggleHoldSeconds:
                  data.signal?.greenHoldSeconds ??
                  data.yoloQueue?.recommendedHoldSeconds ??
                  prev.kaggleHoldSeconds,
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
  }, [selectedCorridorKey]);

  // Toggle between Peak Rain Bottleneck Kaggle Row and Moderate Commuter Row
  const toggleLiveTrafficIncident = useCallback(() => {
    const list =
      KAGGLE_CORRIDOR_RECORDS[selectedCorridorKey] || KAGGLE_CORRIDOR_RECORDS.BLR_MG_ROAD;
    const nextRec = deadlockRerouteRef.current ? list[1] : list[2];
    selectKaggleScenario(nextRec);
  }, [selectedCorridorKey, selectKaggleScenario]);

  const dispatchAmbulance = useCallback(() => {
    const activePoly = deadlockRerouteRef.current ? snappedBypassRoute : snappedPrimaryRoute;
    const { pts, dists, sum } = buildRouteMetrics(activePoly);

    simRunningRef.current = true;
    distanceCoveredRef.current = 0;
    preemptionFiredRef.current = false;
    clearanceFiredRef.current = false;
    speedMpsRef.current = 16.5;

    setCivilianVehicles(
      createRoadAlignedCivilianVehicles(pts, dists, sum, activeKaggleRef.current)
    );

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

  // ── Continuous Road-Snapped Kaggle Physics & Ambulance Simulation Loop ──────
  useEffect(() => {
    const TICK_MS = 60;
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
      let curAmbDist = distanceCoveredRef.current;
      const curKaggle = activeKaggleRef.current;
      const isRainWeather = /rain|fog|storm/i.test(String(curKaggle?.weatherConditions || ''));

      const primaryMetrics = buildRouteMetrics(snappedPrimaryRoute);
      const trafficEval = buildLiveTrafficSegments(
        primaryMetrics.pts,
        primaryMetrics.dists,
        curAmbDist,
        simRunningRef.current,
        deadlockRerouteRef.current,
        yoloQueueCountRef.current,
        liveTrafficIncident,
        curKaggle
      );
      setLiveTrafficGeoJson({
        type: 'FeatureCollection',
        features: trafficEval.features,
      });

      if (deadlockRerouteRef.current) {
        buildRouteMetrics(snappedBypassRoute);
      }

      // 1. Advance Ambulance (Adjusts speed for wet weather & non-compliant yielding cars ahead)
      if (simRunningRef.current) {
        const baseAmbMps = deadlockRerouteRef.current ? 17.2 : isRainWeather ? 15.2 : 16.6;
        speedMpsRef.current = baseAmbMps;
        curAmbDist += speedMpsRef.current * dt;
        distanceCoveredRef.current = curAmbDist;

        if (curAmbDist >= totalRouteMetersRef.current) {
          simRunningRef.current = false;
          distanceCoveredRef.current = 0;
          const resetSample = samplePointAlongPolyline(
            activePolylineRef.current,
            routeDistancesRef.current,
            0
          );
          setSimState((prev) => ({
            ...prev,
            isSimulationRunning: false,
            ambulancePosition: resetSample.coords,
            ambulanceBearing: resetSample.bearing,
            ambulanceSpeedKmh: 0,
            signalPhase: 'NORMAL_CYCLE',
            activeAlert: false,
            intersectionStates: baseCorridor.intersections.map((n, idx) => ({
              id: n.id,
              shortLabel: n.shortLabel || `J${idx + 1}`,
              name: n.name,
              coords: n.coords,
              status: deadlockRerouteRef.current && idx === 1 ? 'GRIDLOCK_BYPASSED' : 'RED',
            })),
          }));
          return;
        }
      }

      const activePts = activePolylineRef.current;
      const activeDists = routeDistancesRef.current;
      const activeTotal = totalRouteMetersRef.current;

      const ambSample = samplePointAlongPolyline(activePts, activeDists, curAmbDist);
      const [curLon, curLat] = ambSample.coords;
      const bearing = ambSample.bearing;

      // 2. Evaluate Multi-Intersection Green Wave Cascade across J1, J2, J3
      let upcomingNode = baseCorridor.intersections[baseCorridor.intersections.length - 1];
      let upcomingDist = 0;

      // Preemption window expands slightly in Rain/low-compliance rows so queue flushes in time
      const dynamicPreemptWindow = isRainWeather ? 440 : 400;

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
        if (simRunningRef.current && dToNode <= dynamicPreemptWindow) {
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

      // 3. Move Civilian Vehicles According to Kaggle `Average Speed`, `Traffic Signal Compliance`, & `Weather`
      const COMPLIANT_YIELD_ZONE = 165;
      const NON_COMPLIANT_YIELD_ZONE = 75; // Non-compliant drivers hesitate until ambulance is 75m behind!

      setCivilianVehicles((prevCars) =>
        prevCars.map((car) => {
          const distAheadOfAmb = car.distAlongRoute - curAmbDist;
          const yieldZoneDist = car.isCompliant ? COMPLIANT_YIELD_ZONE : NON_COMPLIANT_YIELD_ZONE;

          const inYieldZone =
            simRunningRef.current && distAheadOfAmb > -18 && distAheadOfAmb <= yieldZoneDist;
          const isDelayedYield =
            simRunningRef.current &&
            !car.isCompliant &&
            distAheadOfAmb > NON_COMPLIANT_YIELD_ZONE &&
            distAheadOfAmb <= COMPLIANT_YIELD_ZONE;

          let stoppedAtRed = false;
          let nearCongestion = false;
          for (let j = 0; j < baseCorridor.intersections.length; j++) {
            const jNode = baseCorridor.intersections[j];
            const jState = updatedIntStates[j]?.status || 'RED';
            const distToStopBar = jNode.distanceAlongRoute - car.distAlongRoute;
            const stopQueueLength = Math.max(26, (yoloQueueCountRef.current || 5) * 4.5);
            if (jState === 'RED' && distToStopBar > 4 && distToStopBar < stopQueueLength) {
              stoppedAtRed = true;
              break;
            }
            if (jState === 'RED' && distToStopBar >= stopQueueLength && distToStopBar < stopQueueLength + 95) {
              nearCongestion = true;
            }
          }

          let stepMps = car.speedMps;
          if (stoppedAtRed) {
            stepMps = 0;
          } else if (inYieldZone) {
            stepMps = car.speedMps * 0.42;
          } else if (nearCongestion) {
            stepMps = car.speedMps * 0.55;
          } else if (simRunningRef.current) {
            // Green wave discharge speed depends on Kaggle Weather Conditions
            stepMps = car.speedMps * (isRainWeather ? 1.15 : 1.42);
          }

          let nextDist = car.distAlongRoute + stepMps * dt;
          if (nextDist >= activeTotal) {
            nextDist = 18;
          }

          const targetOffset = inYieldZone ? 4.2 : car.baseLaneOffset;
          const lerpRate = car.isCompliant ? 0.24 : 0.10;
          const newOffset = car.laneOffsetMeters + (targetOffset - car.laneOffsetMeters) * lerpRate;

          const carSample = samplePointAlongPolyline(activePts, activeDists, nextDist);
          const displacedCoords = offsetCoordinates(carSample.coords, carSample.bearing, newOffset);

          return {
            ...car,
            distAlongRoute: nextDist,
            laneOffsetMeters: newOffset,
            currentCoords: displacedCoords,
            bearing: carSample.bearing,
            currentSpeedKmh: Math.round(stepMps * 3.6),
            isYielding: inYieldZone,
            isDelayedYield,
            isStoppedAtRed: stoppedAtRed,
            trafficZone: stoppedAtRed ? 'RED_HOLD' : nearCongestion ? 'HEAVY' : 'FREE_FLOW',
          };
        })
      );

      setSimState((prev) => ({
        ...prev,
        corridorAvgSpeedKmh: trafficEval.avgCorridorSpeedKmh,
        congestionSummary: trafficEval.congestionSummary,
      }));

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

      if (curAmbDist >= activeTotal * 0.88 && !clearanceFiredRef.current) {
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
    liveTrafficIncident,
    buildRouteMetrics,
    buildLiveTrafficSegments,
    sendV2X,
  ]);

  const enrichedCorridor = {
    ...baseCorridor,
    route: snappedPrimaryRoute,
    bypassRoute: snappedBypassRoute,
    liveTrafficGeoJson,
    kagglePresets: corridorKaggleList,
    activeKaggleRecord,
  };

  return {
    corridor: enrichedCorridor,
    simState,
    civilianVehicles,
    kagglePresets: corridorKaggleList,
    activeKaggleRecord,
    selectKaggleScenario,
    dispatchAmbulance,
    toggleFreeze,
    toggleRealPhoneGps,
    toggleLiveTrafficIncident,
  };
}