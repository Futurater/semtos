import { TRAFFIC_ROAD_EDGES as edges } from './standardTraffic.js';
import { scenarioRoadHeight } from './case2Simulation.js';

export const HEADINGS = {
  N: { x: 0, z: -1, rotation: 0 },
  E: { x: 1, z: 0, rotation: -Math.PI / 2 },
  S: { x: 0, z: 1, rotation: Math.PI },
  W: { x: -1, z: 0, rotation: Math.PI / 2 },
};

const ROAD = [
  [-124, -87, -7.4, -4.6],                  // western entrance
  [-96, 93, edges.top, edges.bottom],        // avenue, excluding the median
  [-96, 93, edges.westBottom, edges.westTop],
  [-6.8, 6.8, edges.top, edges.westTop],    // junction opening
  [edges.left, edges.right, -72, 67],       // cross street
];
const FIXTURE = { x: -.35, z: 0, halfX: 1.45, halfZ: 1.3 };
const SIZE = {
  car: { length: 1.65, width: .70 },
  ambulance: { length: 2.18, width: .80 },
};
const BUFFER = .20;
const DECEL = 5;
const HEADWAY = .65;
const RESPONSE_RANGE = 18;
const SIDE_OFFSETS = [.85, -.85, 1.35, -1.35, 1.9, -1.9, 2.6, -2.6, 3.5, -3.5];

const clamp = (n, low, high) => Math.max(low, Math.min(high, n));
const axes = ({ heading }) => {
  const forward = HEADINGS[heading];
  return { forward, right: { x: -forward.z, z: forward.x } };
};
const dot = (x, z, v) => x * v.x + z * v.z;
const projection = (a, b, vector) => dot(b.x - a.x, b.z - a.z, vector);
const poseAt = (pose, forward, right, distance, shift) => ({
  ...pose,
  x: pose.x + forward.x * distance + right.x * shift,
  z: pose.z + forward.z * distance + right.z * shift,
});

function footprint(pose) {
  const { length, width } = SIZE[pose.kind];
  const c = Math.abs(Math.cos(pose.rotation));
  const s = Math.abs(Math.sin(pose.rotation));
  return { x: s * length + c * width, z: c * length + s * width };
}

function intersects(a, b, margin = BUFFER) {
  const u = footprint(a), v = footprint(b);
  return Math.abs(a.x - b.x) < u.x + v.x + margin &&
    Math.abs(a.z - b.z) < u.z + v.z + margin;
}

function onRoad(pose) {
  const size = footprint(pose);
  if (Math.abs(pose.x - FIXTURE.x) < size.x + FIXTURE.halfX &&
      Math.abs(pose.z - FIXTURE.z) < size.z + FIXTURE.halfZ) return false;
  for (const x of [pose.x - size.x, pose.x, pose.x + size.x]) {
    for (const z of [pose.z - size.z, pose.z, pose.z + size.z]) {
      if (!ROAD.some(([left, right, top, bottom]) => x >= left && x <= right && z >= top && z <= bottom)) return false;
    }
  }
  return true;
}

export function scenarioVehicle(id, kind, x, z, heading, modelIdx = 0, y = scenarioRoadHeight(x, z, heading)) {
  return { id, kind, x, y, z, heading, modelIdx, rotation: HEADINGS[heading].rotation, speed: 0, status: 'Ready' };
}

export function validateScenario(vehicles) {
  if (!vehicles.some(vehicle => vehicle.kind === 'ambulance')) return 'Add an ambulance to run the scenario.';
  for (let index = 0; index < vehicles.length; index++) {
    const vehicle = vehicles[index];
    if (!onRoad(vehicle)) return `${vehicle.id} needs a position fully on the road.`;
    const other = vehicles.slice(0, index).find(candidate => intersects(vehicle, candidate));
    if (other) return `Leave more space between ${other.id} and ${vehicle.id}.`;
  }
  return '';
}

export function prepareImportedScenario(vehicles) {
  const placed = [];
  let adjusted = 0;
  const ordered = [...vehicles].sort((a, b) => Number(b.kind === 'ambulance') - Number(a.kind === 'ambulance'));
  for (const vehicle of ordered) {
    if (safeAt(vehicle, placed)) {
      placed.push(vehicle);
      continue;
    }
    const size = footprint(vehicle);
    let best, distance = Infinity;
    // Scripted cases may begin inside a facade or use lanes wider than the
    // editable road. Transfer only those placements to the nearest free area.
    for (const [left, right, top, bottom] of ROAD) {
      if (right - left < 2 * size.x || bottom - top < 2 * size.z) continue;
      const x = clamp(vehicle.x, left + size.x, right - size.x);
      const z = clamp(vehicle.z, top + size.z, bottom - size.z);
      for (let u = -10; u <= 10; u++) for (let v = -10; v <= 10; v++) {
        const candidate = { ...vehicle, x: x + u * .5, z: z + v * .5 };
        const delta = Math.hypot(candidate.x - vehicle.x, candidate.z - vehicle.z);
        if (delta < distance && safeAt(candidate, placed)) {
          best = candidate;
          distance = delta;
        }
      }
    }
    if (best) {
      best.y = scenarioRoadHeight(best.x, best.z, best.heading);
      adjusted++;
    }
    placed.push(best || vehicle);
  }
  return { vehicles: placed, adjusted };
}

export function addScenarioVehicles(vehicles, kind, count, heading, firstId) {
  const result = [...vehicles];
  const lateral = heading === 'E' || heading === 'W';
  const lanes = lateral ? [-6, -3.6, -8, 3.6, 6, 8] : [1.1, 2.55, -1.1, -2.55];
  const origin = { E: -30, W: 30, N: 32, S: -32 }[heading];
  const slots = [origin];
  for (let i = 1; i <= 21; i++) slots.push(origin + i * 6, origin - i * 6);
  // Fill the chosen lane first so a batch can be rearranged one car at a time.
  for (const lane of lanes) {
    for (const longitudinal of slots) {
      const added = result.length - vehicles.length;
      if (added === count) return result;
      const id = `${kind === 'car' ? 'Car' : 'Ambulance'} ${firstId + added}`;
      const v = scenarioVehicle(id, kind, lateral ? longitudinal : lane, lateral ? lane : longitudinal, heading, (firstId + added) % 3);
      if (onRoad(v) && !result.some(other => intersects(v, other, .45))) result.push(v);
    }
  }
  return result;
}

function safeAt(pose, vehicles, horizon = 0) {
  return onRoad(pose) && !vehicles.some(other => {
    if (other.id === pose.id) return false;
    if (intersects(pose, other)) return true;
    if (!horizon || other.speed < .1) return false;
    const heading = HEADINGS[other.heading];
    // Check both the approaching vehicle and the space it can reach while
    // this driver changes lanes.
    for (const t of [horizon * .35, horizon * .7, horizon]) {
      const predicted = { ...other, x: other.x + heading.x * other.speed * t, z: other.z + heading.z * other.speed * t };
      if (intersects(pose, predicted, .45)) return true;
    }
    return false;
  });
}

function forwardRoom(pose, vehicles, forward, right) {
  const own = footprint(pose);
  let room = 22;
  let obstacle = false;
  for (const other of vehicles) {
    if (other.id === pose.id) continue;
    const gap = projection(pose, other, forward);
    if (gap <= 0) continue;
    const ext = footprint(other);
    const lateral = Math.abs(projection(pose, other, right));
    if (lateral >= dot(own.x + ext.x, own.z + ext.z, { x: Math.abs(right.x), z: Math.abs(right.z) }) + BUFFER) continue;
    const projected = gap - dot(own.x + ext.x, own.z + ext.z, { x: Math.abs(forward.x), z: Math.abs(forward.z) }) - BUFFER;
    if (projected < room) {
      room = projected;
      obstacle = true;
    }
  }
  return { room: Math.max(0, room), obstacle };
}

function roadRoom(pose, forward, right) {
  const level = { ...pose, rotation: forward.rotation };
  for (let distance = .3; distance < 10; distance += .5) {
    if (!onRoad(poseAt(level, forward, right, distance, 0))) return distance - .3;
  }
  return 10;
}

function nearestAmbulance(pose, vehicles) {
  let nearest, distance = RESPONSE_RANGE;
  for (const ambulance of vehicles) {
    if (ambulance.kind !== 'ambulance' || ambulance.done) continue;
    const { forward, right } = axes(ambulance);
    const ahead = projection(ambulance, pose, forward);
    const lateral = Math.abs(projection(ambulance, pose, right));
    const range = Math.hypot(ahead, lateral);
    if (ahead >= -1 && lateral < 3.4 && range < distance) {
      nearest = ambulance;
      distance = range;
    }
  }
  return nearest;
}

function findOpening(pose, vehicles, ambulance, forward, right) {
  const oldRoom = Math.min(forwardRoom(pose, vehicles, forward, right).room, roadRoom(pose, forward, right));
  const ambulanceRight = ambulance && axes(ambulance).right;
  const initialOffset = ambulance && Math.abs(projection(ambulance, pose, ambulanceRight));
  let best, bestScore = -Infinity;
  for (const shift of SIDE_OFFSETS) {
    const distance = Math.min(1.8, oldRoom);
    const target = poseAt(pose, forward, right, distance, shift);
    const yaw = pose.rotation - clamp(Math.atan2(shift, 2), -.30, .30);
    const clearance = ambulance && Math.abs(projection(ambulance, target, ambulanceRight));
    if (ambulance && (clearance < 1.9 || clearance < initialOffset + .45)) continue;
    const targetRoom = Math.min(forwardRoom(target, vehicles, forward, right).room, roadRoom(target, forward, right));
    if (!ambulance && targetRoom < oldRoom + 2.5) continue;
    if (![.2, .4, .6, .8, 1].every(t => safeAt(
      { ...poseAt(pose, forward, right, distance * t, shift * t), rotation: t === 1 ? pose.rotation : yaw },
      vehicles, 1.05,
    ))) continue;
    const score = (ambulance ? clearance * .38 : 0) - Math.abs(shift) * .26;
    if (score > bestScore) {
      best = dot(target.x, target.z, right);
      bestScore = score;
    }
  }
  return best;
}

function driveVehicle(pose, vehicles, dt) {
  if (pose.done) return;
  const { forward, right } = axes(pose);
  const rotation = forward.rotation;
  const ahead = forwardRoom(pose, vehicles, forward, right);
  const pavement = roadRoom(pose, forward, right);
  const room = Math.min(ahead.room, pavement);
  const ambulance = pose.kind === 'car' && nearestAmbulance(pose, vehicles);
  const needsSpace = ambulance && Math.abs(projection(ambulance, pose, axes(ambulance).right)) < 1.95;
  const canPass = pose.waiting > .7 && (pose.kind === 'ambulance' || pavement === 0);
  pose.recheck = Math.max(0, (pose.recheck ?? 0) - dt);
  if (!pose.recheck && pose.lateralTarget == null && (needsSpace || canPass)) {
    pose.lateralTarget = findOpening({ ...pose, rotation }, vehicles, ambulance, forward, right);
    pose.recheck = .25;
  }
  let shift = pose.lateralTarget == null ? 0 : pose.lateralTarget - dot(pose.x, pose.z, right);
  if (Math.abs(shift) < .045) {
    pose.lateralTarget = undefined;
    shift = 0;
  }

  const cruise = pose.kind === 'ambulance' ? 8.5 : 5.5;
  const brakingSpeed = Math.sqrt((DECEL * HEADWAY) ** 2 + 2 * DECEL * room) - DECEL * HEADWAY;
  const targetSpeed = Math.min(cruise, brakingSpeed, shift ? 2.1 : ambulance ? (needsSpace ? .7 : 0) : cruise);
  const speed = pose.speed + clamp(targetSpeed - pose.speed, -7 * dt, 3.5 * dt);
  const forwardStep = Math.min(speed * dt, room);
  const lateralStep = clamp(shift, -1.35 * dt, 1.35 * dt);
  const steering = rotation - clamp(Math.atan2(lateralStep, Math.max(forwardStep, .04)), -.28, .28);
  const candidate = { ...poseAt(pose, forward, right, forwardStep, lateralStep), rotation: steering };
  const straight = { ...poseAt(pose, forward, right, forwardStep, 0), rotation };
  const moved = (forwardStep > 0 || lateralStep !== 0) && safeAt(candidate, vehicles);
  const rolled = !moved && forwardStep > 0 && safeAt(straight, vehicles);
  if (moved || rolled) Object.assign(pose, moved ? candidate : straight);
  if (moved || rolled) {
    const roadY = scenarioRoadHeight(pose.x, pose.z, pose.heading);
    pose.y += (roadY - pose.y) * (1 - Math.exp(-10 * dt));
  }
  if (lateralStep && !moved) pose.lateralTarget = undefined;
  pose.speed = moved || rolled ? speed : 0;
  pose.waiting = pose.speed < .2 ? (pose.waiting ?? 0) + dt : 0;
  pose.status = shift && moved ? (pose.kind === 'car' ? 'Yielding' : 'Passing')
    : ambulance ? (needsSpace ? 'Waiting for a gap' : 'Holding for ambulance')
    : pose.speed > .2 ? 'Driving' : 'Waiting for clearance';

  const atBoundary = pose.heading === 'E' ? pose.x > 86
    : pose.heading === 'W' ? pose.x < -86
    : pose.heading === 'N' ? pose.z < -66 : pose.z > 61;
  if (atBoundary && pavement === 0 && !ahead.obstacle && !shift && pose.waiting > .5) {
    pose.done = true;
    pose.status = 'End of road';
  }
}

export function stepScenario(vehicles, dt) {
  for (const vehicle of vehicles) if (vehicle.kind === 'car') driveVehicle(vehicle, vehicles, dt);
  for (const vehicle of vehicles) if (vehicle.kind === 'ambulance') driveVehicle(vehicle, vehicles, dt);
}
