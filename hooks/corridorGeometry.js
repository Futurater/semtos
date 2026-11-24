// Street geometry © OpenStreetMap contributors, ODbL 1.0. See public/maps/NOTICE.txt.
import paths from './corridor-paths.json';
import lanes from './corridor-lanes.json';

const rad = Math.PI / 180;
export function computeBearing(a, b) {
  return (Math.atan2((b[0] - a[0]) * Math.cos(a[1] * rad), b[1] - a[1]) / rad + 360) % 360;
}
export function offsetLngLatPerp([lng, lat], bearing, meters) {
  return [lng + meters * Math.cos(bearing * rad) / (111320 * Math.cos(lat * rad)),
    lat - meters * Math.sin(bearing * rad) / 111320];
}

// Distances along each recorded carriageway. Simulation axes are linear in metres along the path.
const routes = Object.fromEntries(Object.entries(paths).map(([name, points]) => {
  const distances = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    distances.push(distances[i - 1] + Math.hypot((b[0] - a[0]) * 108480, (b[1] - a[1]) * 111320));
  }
  return [name, { points, distances, length: distances.at(-1) }];
}));

function sample(name, progress, offset) {
  const { points, distances, length } = routes[name];
  const d = Math.max(0, Math.min(1, progress)) * length;
  let i = 1;
  while (i < distances.length - 1 && distances[i] < d) i++;
  const a = points[i - 1], b = points[i];
  const t = (d - distances[i - 1]) / (distances[i] - distances[i - 1]);
  const bearing = computeBearing(a, b);
  const point = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const laneCenter = lanes[name][i - 1] % 2 === 0 ? -1.5 : 0;
  return { lngLat: offsetLngLatPerp(point, bearing, offset ?? laneCenter), bearing };
}

const circleIndex = paths.eastIn.findIndex(([lng]) => lng === 77.6018644);
const circleFraction = routes.eastIn.distances[circleIndex] / routes.eastIn.length;
function avenue(x, east, offset) {
  if (east && x >= 0) return sample('eastOut', x / 150, offset);
  if (east) {
    const progress = x < -120 ? (x + 135) / 15 * circleFraction : circleFraction + (1 - circleFraction) * (x + 120) / 120;
    return sample('eastIn', progress, offset);
  }
  if (x > 0) return sample('westIn', 1 - x / 150, offset);
  return x >= -120 ? sample('westOut', -x / 120, offset) : sample('westExit', (-120 - x) / 15, offset);
}
function crossStreet(z, north, offset) {
  if (north) return z > 0 ? sample('brigadeIn', 1 - z / 90, offset) : sample('northOut', -z / 120, offset);
  return z < 0 ? sample('southIn', 1 + z / 120, offset) : sample('brigadeOut', z / 90, offset);
}
export function vehicleToRoadGeo(x = 0, z = 0, type = 'E', caseId = 1) {
  const eastWest = type === 'E' || type === 'W';
  // Lane spacing is simulated within each mapped carriageway. The Brigade approach is shared.
  const laneMidpoint = caseId === 3 ? 3 : 6;
  const lateral = eastWest ? laneMidpoint - Math.abs(z) : (2.2 - Math.abs(x)) * 0.95;
  const offset = Math.max(-3, Math.min(3, lateral - (!eastWest && z > 0 ? 1.55 : 0)));
  return eastWest ? avenue(x, type === 'E', offset) : crossStreet(z, type === 'N', offset);
}

const detour = [
  ['westIn', 'x', 90, 47], ['northOut', 'z', -2.89, -60],
  ['cubbon', 'x', 47, -87], ['central', 'z', -60, -2.89], ['westExit', 'x', -87, -135],
];
export function twinToRoadGeo(x = 0, z = 0, { ambId, wpIdx = 0 } = {}) {
  if (ambId === 'AMB_A') return crossStreet(z, true, z > 0 ? -1.55 : undefined);
  if (ambId !== 'AMB_B') return avenue(x, true);
  const [name, axis, start, end] = detour[Math.max(0, Math.min(4, wpIdx))];
  return sample(name, ((axis === 'x' ? x : z) - start) / (end - start));
}

export const ROAD_NODES = {
  J0_BRIGADE: paths.brigadeIn.at(-1), CUBBON_KAM: paths.cubbon[0],
  CUBBON_CENT: paths.central[0], ANIL_KUMBLE: paths.westExit[0], MG_CARIAPPA: paths.westIn[0],
  BRIGADE_RES: paths.brigadeIn[0], BRIGADE_CHUR: sample('brigadeIn', 0.7).lngLat,
  KAMARAJ_M: sample('southIn', 0.54).lngLat, MG_METRO: avenue(-28, true, 0).lngLat,
  CUBBON_VEER: sample('cubbon', 42 / 134).lngLat,
};
export const [ORIGIN_LNG, ORIGIN_LAT] = ROAD_NODES.J0_BRIGADE;
export const signalArms = [
  ['W', 'eastIn'], ['E', 'westIn'], ['S', 'brigadeIn'], ['N', 'southIn'],
].map(([arm, name]) => ({ arm, lngLat: sample(name, 1 - 13 / routes[name].length, name === 'brigadeIn' ? -1.55 : 0).lngLat }));

const trafficColors = { open: '#138568', hold: '#bf5751', caution: '#d9901c', detour: '#36768d' };
const lineGeometry = Object.fromEntries(Object.entries(paths).map(([name, points]) => {
  const shared = name === 'brigadeIn' || name === 'brigadeOut';
  // Convert carriageway axes into modelled lane centres at a nominal 3 m spacing.
  // Join contiguous segments with the same mapped lane count to retain each bend.
  const coordinates = [];
  const bearings = points.map((p, i) => computeBearing(
    points[Math.max(0, i - 1)], points[Math.min(points.length - 1, i + 1)]));
  let start = 0;
  while (start < points.length - 1) {
    const count = shared ? 1 : lanes[name][start];
    let end = start + 1;
    while (end < points.length - 1 && (shared || lanes[name][end] === count)) end++;
    for (let lane = 0; lane < count; lane++) {
      const offset = shared ? -1.55 : (lane - (count - 1) / 2) * 3;
      coordinates.push(points.slice(start, end + 1).map((p, i) => offsetLngLatPerp(p, bearings[start + i], offset)));
    }
    start = end;
  }
  return [name, { type: 'MultiLineString', coordinates }];
}));
export function buildRoadTrafficLinesGeoJSON(state) {
  const sig = state?.signals || {};
  const directions = { eastIn: 'e', eastOut: 'e', westIn: 'w', westOut: 'w', westExit: 'w',
    brigadeIn: 'n', northOut: 'n', southIn: 's', brigadeOut: 's' };
  const features = Object.entries(directions).map(([name, arm]) => {
    const status = sig[arm + 'Green'] ? 'open' : sig[arm + 'Yellow'] ? 'caution' : 'hold';
    return { type: 'Feature', properties: { id: name, status, color: trafficColors[status] }, geometry: lineGeometry[name] };
  });
  if (state?.selectedCase === 3) {
    const active = state.case3?.isSimulationRunning && !state.case3?.trafficCycleActive;
    for (const name of ['westIn', 'northOut', 'cubbon', 'central', 'westExit']) {
      const feature = features.find(f => f.properties.id === name);
      const status = active ? 'open' : 'detour';
      if (feature) {
        if (active) Object.assign(feature.properties, { status, color: trafficColors[status] });
      } else features.push({ type: 'Feature', properties: { id: name, status, color: trafficColors[status] }, geometry: lineGeometry[name] });
    }
  }
  return { type: 'FeatureCollection', features };
}
