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
const COORDINATION_RANGE = 30;
const CORRIDOR_CLEARANCE = 2.05;
const PLAN_INTERVAL = .24;
const FLOW_AMBULANCE_SPEED = 5.4;
const PASSING_SPEED = 4.5;
export const CORRIDOR_POLICY = { open: 8, requests: 1.8, lateral: .28, forward: .15, gapSpeed: 4.6 };
export const ONCOMING_FLOW_POLICY = { ...CORRIDOR_POLICY, movingOncoming: true };

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

export function createDenseOncomingScenario(firstId = 1) {
  const vehicles = [-8.05, -5.75, -3.05].flatMap((lane, row) =>
    [-43, -35, -27, -19].map((x, column) => {
      const index = row * 4 + column;
      return scenarioVehicle(`Car ${firstId + index}`, 'car', x + (row === 1 ? .9 : 0), lane, 'E', index % 3);
    }));
  vehicles.push(scenarioVehicle(`Ambulance ${firstId + vehicles.length}`, 'ambulance', 12, -5.75, 'W'));
  return vehicles;
}

export function createStaggeredOncomingScenario(firstId = 1) {
  let seed = 7;
  const offset = amplitude => {
    seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
    return (seed / 2 ** 32 - .5) * 2 * amplitude;
  };
  const vehicles = [-8.15, -6, -3].flatMap((z, row) =>
    Array.from({ length: 5 }, (_, column) => {
      const index = row * 5 + column;
      return scenarioVehicle(`Car ${firstId + index}`, 'car', -32 + column * 5.1 + offset(1.6), z + offset(.35), 'E', index % 3);
    }));
  vehicles.push(scenarioVehicle(`Ambulance ${firstId + vehicles.length}`, 'ambulance', .5 + offset(2), -6 + offset(.75), 'W'));
  return vehicles;
}

export function createDenseFlowScenario(firstId = 1) {
  const vehicles = [-8.15, -5.85, -3.45].flatMap((z, lane) =>
    Array.from({ length: 5 }, (_, row) => {
      const index = lane * 5 + row;
      const stagger = [0, 2.6, -.8, 1.6, -1.4][row];
      return scenarioVehicle(`Car ${firstId + index}`, 'car', -11 - row * 13 + (lane - 2) * 4.4 + stagger, z, 'E', index % 3);
    }));
  vehicles.push(scenarioVehicle(`Ambulance ${firstId + vehicles.length}`, 'ambulance', 15, -2.65, 'W'));
  return vehicles;
}

export function createSavedDenseFlowScenario() {
  const carPositions = [
    [-23.255134973442573, -8.15, 0.18100684663125677],
    [-30.199999999999996, -8.15, 0.18992727272727272],
    [-34.73763084552766, -8.38610901744322, 0.18827722514708087],
    [-40.71043479675341, -8.526911026260201, 0.18610529643754423],
    [-39.07967649609898, -2.06, 0.186698299455964],
    [-20.758608787943373, -5.85, 0.17767814505059118],
    [-25.799999999999997, -5.85, 0.18439999999999998],
    [-32.09255843586337, -2.351168177282557, 0.18923906965968607],
    [-36.734945508204945, -4.275110619211828, 0.1875509289061073],
    [-42.7798901576376, -6.668673660237453, 0.1853527672154045],
    [-21.375900891238476, -4.0329184129735545, 0.17850120118831797],
    [-25.912131357648228, -2.345188495656282, 0.1845495084768643],
    [-30.197430160656424, -4.520852654060929, 0.18992820721430675],
    [-36.94542931559313, -6.653612101925061, 0.1874743893397843],
    [-40.55639471171373, -4.525403583362714, 0.18616131101392228],
  ];
  const cars = carPositions.map(([x, z, y], index) =>
    scenarioVehicle(`Car ${index + 1}`, 'car', x, z, 'E', index % 3, y));
  const ambulance = scenarioVehicle('Ambulance 16', 'ambulance', -14.346753987888057, -3.8822131809468, 'W', 0, 0.16259654519606465);
  return [...cars, ambulance];
}

export function createLaneChangeScenario(firstId = 1, { roadBlocked = false } = {}) {
  const vehicles = [-5.8, -3.4, -7.4].map((z, index) => ({
    ...scenarioVehicle(`Car ${firstId + index}`, 'car', -3 - index * 19, z, 'E', index),
    parked: true,
    status: 'Parked obstacle',
  }));
  if (roadBlocked) {
    for (const z of [-8.15, -6.1, -4.05, -2.35]) {
      vehicles.push({
        ...scenarioVehicle(`Car ${firstId + vehicles.length}`, 'car', -58, z, 'E', vehicles.length % 3),
        parked: true,
        status: 'Parked obstacle',
      });
    }
  } else {
    vehicles.push(scenarioVehicle(`Car ${firstId + vehicles.length}`, 'car', 16, -5.8, 'W'));
  }
  vehicles.push(scenarioVehicle(`Ambulance ${firstId + vehicles.length}`, 'ambulance', 12, -5.8, 'W'));
  return vehicles;
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

export function stageScenario(vehicles) {
  // A saved layout can contain touching cars. Separate those placements in a
  // copy before running the physics; keep the editor's layout available.
  const offRoad = vehicles.find(vehicle => !onRoad(vehicle));
  if (offRoad) return { vehicles, adjusted: 0, error: `${offRoad.id} needs a position fully on the road.` };
  const placed = [];
  let adjusted = 0;
  const ordered = [...vehicles].sort((a, b) => Number(b.kind === 'ambulance') - Number(a.kind === 'ambulance'));
  for (const vehicle of ordered) {
    if (safeAt(vehicle, placed)) {
      placed.push(vehicle);
      continue;
    }
    const { forward, right } = axes(vehicle);
    let best, bestCost = Infinity;
    for (let along = -12; along <= 12; along++) for (let side = -8; side <= 8; side++) {
      const cost = Math.hypot(along * .25, side * .30);
      if (cost >= bestCost) continue;
      const candidate = poseAt(vehicle, forward, right, along * .25, side * .25);
      if (!safeAt(candidate, placed)) continue;
      best = candidate;
      bestCost = cost;
    }
    if (!best) return { vehicles, adjusted: 0, error: `There is no room to safely separate ${vehicle.id}. Try a nearby open lane.` };
    best.y = scenarioRoadHeight(best.x, best.z, best.heading);
    placed.push(best);
    adjusted++;
  }
  return { vehicles: placed, adjusted, error: validateScenario(placed) };
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
  let blocker;
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
      blocker = other;
    }
  }
  return { room: Math.max(0, room), obstacle: Boolean(blocker), blocker };
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
    const ahead = projection(ambulance, pose, forward) * (ambulance.backingOut ? -1 : 1);
    const approach = ambulance.backingOut
      ? ambulance.trail[Math.max(0, ambulance.trail.length - 12)] ?? ambulance
      : ambulance;
    const lateral = Math.abs(projection(approach, pose, right));
    const range = Math.hypot(ahead, lateral);
    if (ahead >= (ambulance.backingOut ? -6 : -1) && lateral < 3.4 && range < distance) {
      nearest = approach === ambulance ? ambulance : { ...ambulance, x: approach.x, z: approach.z };
      distance = range;
    }
  }
  return nearest;
}

function blocksCorridor(car, center) {
  return Math.abs(car.z - center) < SIZE.ambulance.width + footprint(car).z + BUFFER;
}

function bankNeighbors(car, queue, center) {
  const { forward, right } = axes(car);
  const requested = [car];
  let leader = car;
  // A request travels up the bank when the first driver has a car ahead.
  while (leader) {
    leader = queue.filter(other => other.kind === 'car' && other.heading === leader.heading &&
      !requested.includes(other) && !blocksCorridor(other, center) &&
      Math.abs(projection(leader, other, right)) < 1.5 &&
      projection(leader, other, forward) > 0 && projection(leader, other, forward) < 7)
      .sort((a, b) => projection(leader, a, forward) - projection(leader, b, forward))[0];
    if (leader) requested.push(leader);
  }
  return requested;
}

function chooseBank(car, vehicles, queue, center, banks, reward) {
  const { forward, right } = axes(car);
  let best;
  for (const bank of banks) {
    if (Math.abs(bank - center) < CORRIDOR_CLEARANCE - .15) continue;
    const shift = (bank - car.z) * right.z;
    for (const advance of [.2, 1.2, 2.4]) {
      const conflicts = new Set();
      let onPavement = true;
      for (const t of [.2, .4, .6, .8, 1]) {
        const candidate = poseAt(car, forward, right, advance * t, shift * t);
        candidate.rotation = forward.rotation - Math.sign(shift) * (t === 1 ? 0 : .17);
        if (!onRoad(candidate)) {
          onPavement = false;
          break;
        }
        for (const other of vehicles) {
          if (other !== car && intersects(candidate, other, .32)) conflicts.add(other);
        }
      }
      if (!onPavement || [...conflicts].some(other =>
        !queue.includes(other) || blocksCorridor(other, center) ||
        Math.abs(other.z - bank) > 1.65
      )) continue;
      const requests = [...new Set([...conflicts].flatMap(other => bankNeighbors(other, queue, center)))];
      if (requests.some(other => roadRoom(other, axes(other).forward, axes(other).right) < .45)) continue;
      // Opening a safe slot now has the highest reward. If both banks need
      // help, prefer the side that disturbs fewer vehicles and moves less.
      const score = (requests.length === 0 ? reward.open : 0) - requests.length * reward.requests -
        Math.abs(shift) * reward.lateral - advance * reward.forward;
      if (!best || score > best.score) best = { target: bank * right.z, advance, requests, score };
    }
  }
  return best;
}

function forecastTraffic(vehicles, driver, time) {
  return vehicles.map(other => {
    if (other === driver || other.parked || other.done || other.backingOut) return other;
    const { forward, right } = axes(other);
    const shift = other.lateralTarget == null ? 0 : other.lateralTarget - dot(other.x, other.z, right);
    const speed = other.movingFlow && shift ? Math.min(other.speed, 3) : other.speed;
    const distance = Math.min(speed * time, other.flowRoom ?? Infinity);
    return poseAt(other, forward, right, distance, clamp(shift, -.3 * distance, .3 * distance));
  });
}

function planFlowMerge(car, vehicles, center, lanes) {
  const { forward, right } = axes(car);
  for (const lane of lanes) {
    if ((center != null && Math.abs(lane - center) < 2.15) || Math.abs(lane - car.z) < .1) continue;
    const shift = (lane - car.z) * right.z;
    const distance = Math.max(4.6, Math.abs(shift) * 3.2);
    const clear = [.15, .3, .5, .7, .85, 1].every(progress => {
      const candidate = poseAt(car, forward, right, distance * progress, shift * progress);
      candidate.rotation = forward.rotation - (progress < 1 ? .17 * Math.sign(shift) : 0);
      const traffic = forecastTraffic(vehicles, car, distance * progress / 3);
      return safeAt(candidate, traffic) && (progress < 1 || forwardRoom(candidate, traffic, forward, right).room >= 1.5);
    });
    if (clear) return lane * right.z;
  }
}

function coordinateMovingFlow(ambulance, vehicles, queue, banks) {
  const { forward, right } = axes(ambulance);
  const approaching = queue.filter(car => HEADINGS[car.heading].x === -forward.x);
  if (!approaching.length) return false;
  const left = banks[right.z > 0 ? 0 : 1] + right.z * .38;
  const rightBank = banks[right.z > 0 ? 1 : 0] - right.z * .20;
  const center = ambulance.laneChange?.end.z ?? ambulance.z;
  const insideLane = rightBank - right.z * 2.25;
  if (ambulance.waiting > 6) ambulance.flowFallbackX = ambulance.x;
  if (Math.abs(ambulance.x - (ambulance.flowFallbackX ?? Infinity)) < 8) return false;
  // Keep steering predictable while cars merge around the ambulance's current line.
  if (!ambulance.laneChange && Math.abs(left - center) > .08) {
    const moveLeft = planFlowMerge(ambulance, vehicles, null, [left]);
    if (moveLeft != null) ambulance.lateralTarget = moveLeft;
    else if (Math.abs(left - center) > 1.15) return false;
  }
  ambulance.movingFlow = true;
  ambulance.flowRoom = Infinity;
  approaching.sort((a, b) => projection(ambulance, a, forward) - projection(ambulance, b, forward));
  const firstBlocker = approaching.find(car => projection(ambulance, car, forward) >= 0 && blocksCorridor(car, center));
  // The closest merging driver takes the next slot. A driver behind that slot
  // eases off while drivers ahead keep going and open the gap.
  if (firstBlocker && Math.abs(firstBlocker.x - ambulance.x) < 28) {
    const slot = firstBlocker.lateralTarget == null ? insideLane : -right.z * firstBlocker.lateralTarget;
    for (const car of approaching) {
      const following = projection(firstBlocker, car, forward);
      if (following >= 5 && following < 12 && Math.abs(car.z - slot) < 1.15) {
        car.flowRoom = Math.min(car.flowRoom, Math.max(0, following - 5));
      }
    }
  }
  for (const car of approaching) {
    car.movingFlow = true;
    const distance = projection(ambulance, car, forward);
    if (distance < 0 || !blocksCorridor(car, center)) continue;
    // Use the closest lane on the ambulance's right first. A wider merge or
    // the other bank can work when a nearby driver already occupies that gap.
    if (car.lateralTarget == null) {
      const merge = planFlowMerge(car, vehicles, center, [insideLane, rightBank, left]);
      if (merge != null) {
        car.flowHomeZ ??= car.z;
        car.lateralTarget = merge;
      }
    }
    if (car.lateralTarget == null) car.flowRoom = Math.min(car.flowRoom, Math.max(0, distance - 11));
    const longitudinalSize = footprint(ambulance).x + footprint(car).x + BUFFER;
    const merging = car.lateralTarget != null;
    const buffer = Math.max(merging ? 6.8 : 10.5, longitudinalSize + 1);
    ambulance.flowRoom = Math.min(ambulance.flowRoom, Math.max(0, distance - buffer));
  }
  return true;
}

function restoreFlowLanes(vehicles, ambulances) {
  for (const car of vehicles) {
    if (car.flowHomeZ == null || car.done || car.parked) continue;
    if (Math.abs(car.z - car.flowHomeZ) < .1) {
      if (car.lateralTarget == null) car.flowHomeZ = undefined;
      continue;
    }
    const { forward } = axes(car);
    const clearOfAmbulance = ambulances.every(ambulance =>
      Math.abs(ambulance.z - car.flowHomeZ) > 4 || projection(ambulance, car, forward) > 9);
    if (!clearOfAmbulance) continue;
    if (car.lateralTarget == null) car.lateralTarget = planFlowMerge(car, vehicles, null, [car.flowHomeZ]);
    if (car.lateralTarget != null) car.movingFlow = true;
  }
}

function coordinateCorridors(vehicles, dt, reward) {
  const { movingOncoming } = reward;
  const ambulances = vehicles.filter(vehicle => vehicle.kind === 'ambulance' && !vehicle.done);
  if (!ambulances.some(vehicle => (vehicle.corridorClock ?? 0) <= 0)) {
    for (const vehicle of ambulances) vehicle.corridorClock -= dt;
    return;
  }
  for (const car of vehicles) {
    car.corridorHold = false;
    car.spaceRequest = null;
    car.movingFlow = false;
    car.flowRoom = Infinity;
  }
  for (const ambulance of ambulances) {
    ambulance.corridorClock = PLAN_INTERVAL;
    ambulance.corridorActive = false;
    if (ambulance.backingOut || ambulance.x < -94 || !HEADINGS[ambulance.heading].x) continue;
    const strip = ROAD.find(([, , top, bottom], index) => (index === 1 || index === 2) && ambulance.z >= top && ambulance.z <= bottom);
    if (!strip) continue;
    const [, , top, bottom] = strip;
    const banks = [top + 1.03, bottom - 1.03];
    const center = movingOncoming || ambulance.changedLane ? ambulance.laneChange?.end.z ?? ambulance.z
      : clamp(ambulance.corridorZ ?? ambulance.z, banks[0] + CORRIDOR_CLEARANCE, banks[1] - CORRIDOR_CLEARANCE);
    const { forward, right } = axes(ambulance);
    const queue = vehicles.filter(car => {
      const distance = projection(ambulance, car, forward);
      return car.kind === 'car' && !car.parked && !car.done && HEADINGS[car.heading].x &&
        car.z >= top && car.z <= bottom && distance >= -3 && distance <= (movingOncoming ? 38 : COORDINATION_RANGE);
    });
    if (movingOncoming && coordinateMovingFlow(ambulance, vehicles, queue, banks)) continue;
    const blockers = queue.filter(car => blocksCorridor(car, center) && projection(ambulance, car, forward) > -1)
      .sort((a, b) => projection(ambulance, a, forward) - projection(ambulance, b, forward));
    if (!blockers.length || (queue.length < 4 && ambulance.corridorZ == null)) continue;
    ambulance.corridorZ = center;
    ambulance.corridorActive = true;
    for (const car of queue) {
      // Keep the ambulance's route clear while letting the parallel lanes
      // drain. Holding those lanes prevents nearby drivers from opening gaps.
      car.corridorHold = !movingOncoming || blocksCorridor(car, center) || blocksCorridor(car, ambulance.z);
      if (!car.corridorHold) car.movingFlow = true;
    }

    if (!movingOncoming && !ambulance.changedLane && !ambulance.laneChange && Math.abs(ambulance.z - center) > .035 && ambulance.lateralTarget == null) {
      const next = { ...ambulance, z: center };
      if (safeAt(next, vehicles, .7)) ambulance.lateralTarget = center * right.z;
    }
    const car = blockers[0];
    if (car.corridorYield && car.lateralTarget != null) continue;
    // Vary drivers' response time and avoid moving cars already outside the
    // rescue lane unless a neighbor asks them to open a specific gap.
    car.corridorReaction = (car.corridorReaction ?? 0) + PLAN_INTERVAL;
    const response = .24 + (car.id.length + car.id.charCodeAt(car.id.length - 1)) % 4 * .14;
    if (car.corridorReaction < response) continue;
    const plan = chooseBank(car, vehicles, queue, center, banks, reward);
    if (!plan) continue;
    if (plan.requests.length) {
      for (const other of plan.requests) other.spaceRequest = car.id;
    } else {
      car.lateralTarget = plan.target;
      car.corridorYield = true;
      car.corridorAdvance = dot(car.x, car.z, HEADINGS[car.heading]) + plan.advance;
    }
  }
  if (movingOncoming) restoreFlowLanes(vehicles, ambulances);
}

function recoveryPose(start, end, progress) {
  const heading = HEADINGS[start.heading];
  const sideways = (end.z - start.z) * heading.x;
  const along = (end.x - start.x) * heading.x;
  const steering = Math.sign(sideways) * Math.sign(along || 1) * .10 * Math.sin(Math.PI * progress);
  return {
    ...start,
    x: start.x + (end.x - start.x) * progress,
    z: start.z + (end.z - start.z) * progress,
    rotation: heading.rotation - steering,
  };
}

function recoveryMoveIsSafe(start, end, vehicles) {
  const steps = Math.ceil(Math.hypot(end.x - start.x, end.z - start.z) / .24);
  for (let i = 1; i <= steps; i++) {
    if (!safeAt(recoveryPose(start, end, i / steps), vehicles)) return false;
  }
  return true;
}

function yieldPath(start, end) {
  const distance = Math.hypot(end.x - start.x, end.z - start.z);
  const steps = Math.ceil(distance / .3);
  const samples = [];
  for (let step = 1; step <= steps; step++) {
    const sample = recoveryPose(start, end, step / steps);
    if (!onRoad(sample)) return null;
    samples.push(sample);
  }
  return samples;
}

function planYieldChain(ambulance, vehicles) {
  const { forward, right } = axes(ambulance);
  const { blocker, room: currentRoom } = forwardRoom(ambulance, vehicles, forward, right);
  if (blocker?.kind !== 'car' || blocker.parked || blocker.done || projection(ambulance, blocker, forward) > 14) return;
  const strip = ROAD.slice(1, 3).find(([, , top, bottom]) => blocker.z >= top && blocker.z <= bottom);
  if (!strip) return;
  const [, , top, bottom] = strip;
  const nearby = vehicles.filter(vehicle => Math.abs(vehicle.x - blocker.x) < 26);
  let remainingChecks = 600;

  function reserveMove(actor, target, poses, moves, waitingFor, requester) {
    if (remainingChecks-- <= 0) return;
    const path = yieldPath(actor, target);
    if (!path) return;
    const [neighbor] = poses.filter(other => other.id !== actor.id && path.some(sample => intersects(sample, other)))
      .sort((a, b) => Math.hypot(a.x - actor.x, a.z - actor.z) - Math.hypot(b.x - actor.x, b.z - actor.z));
    if (!neighbor) {
      const { forward } = axes(actor);
      const distance = Math.hypot(target.x - actor.x, target.z - actor.z);
      return {
        poses: poses.map(vehicle => vehicle.id === actor.id ? target : vehicle),
        moves: [...moves, { id: actor.id, x: target.x, z: target.z, yieldFor: requester }],
        cost: distance + (projection(actor, target, forward) < 0 ? .7 : 0),
      };
    }
    if (waitingFor.length >= 3 || neighbor.kind !== 'car' || neighbor.parked || neighbor.done ||
        waitingFor.includes(neighbor.id) || moves.some(move => move.id === neighbor.id)) return;

    const { forward, right } = axes(neighbor);
    const movesAlong = [1.8, 3.8, -1.8, -3.8, 5.2, -5.2];
    const options = movesAlong.map(step => poseAt(neighbor, forward, right, step, 0));
    for (const step of [2.4, -2.4]) {
      for (const side of [-1.05, 1.05]) options.push(poseAt(neighbor, forward, right, step, side));
    }
    for (const option of options) {
      // The neighbor's new position must vacate the space that was requested.
      if (path.some(sample => intersects(sample, option))) continue;
      const support = reserveMove(neighbor, option, poses, moves, [...waitingFor, actor.id], actor.id);
      if (!support) continue;
      const result = reserveMove(actor, target, support.poses, support.moves, waitingFor, requester);
      if (result) return { ...result, cost: result.cost + support.cost + .45 };
    }
  }

  let best;
  const { forward: carForward } = axes(blocker);
  const clearance = SIZE.ambulance.width + SIZE.car.width + BUFFER + .18;
  for (const z of [ambulance.z - clearance, ambulance.z + clearance, top + 1.03, bottom - 1.03]) {
    if (z < top + .9 || z > bottom - .9) continue;
    const advances = Math.abs(z - blocker.z) < .85
      ? [.45, .9, 1.5, -.45, -.9, -1.5]
      : [1.5, 2.8, -1.5, -2.8];
    for (const advance of advances) {
      const target = { ...blocker, x: blocker.x + carForward.x * advance, z, rotation: carForward.rotation };
      const result = reserveMove(blocker, target, nearby, [], [], ambulance.id);
      if (!result) continue;
      const room = forwardRoom(ambulance, result.poses, forward, right).room;
      if (room < currentRoom + .65) continue;
      const score = room * 1.35 - result.cost;
      if (!best || score > best.score) best = { moves: result.moves, score };
    }
  }
  return best?.moves;
}

function planRecovery(ambulance, vehicles) {
  const { forward } = axes(ambulance);
  // Replan from the ambulance's actual footprint. A centerline that would
  // clear a car on paper can still jam a vehicle that hasn't reached it.
  const center = ambulance.z;
  const blocker = vehicles.filter(car => car.kind === 'car' && !car.parked && !car.done && HEADINGS[car.heading].x &&
    blocksCorridor(car, center) && projection(ambulance, car, forward) > 0)
    .sort((a, b) => projection(ambulance, a, forward) - projection(ambulance, b, forward))[0];
  if (!blocker || projection(ambulance, blocker, forward) > 10) return;
  const strip = ROAD.slice(1, 3).find(([, , top, bottom]) => center >= top && center <= bottom);
  if (!strip) return;

  const banks = [strip[2] + 1.03, strip[3] - 1.03];
  const nearby = [blocker, ...vehicles.filter(car => car.kind === 'car' && car !== blocker &&
    !car.parked && !car.done && HEADINGS[car.heading].x && Math.abs(car.x - blocker.x) < 12 &&
    car.z > strip[2] && car.z < strip[3]).sort((a, b) => Math.abs(a.x - blocker.x) - Math.abs(b.x - blocker.x)).slice(0, 8)];
  nearby.push(ambulance);
  const index = vehicles.indexOf(blocker);
  const visited = new Set();
  let beam = [{ poses: vehicles, moves: [], cost: 0 }];

  // Search several short maneuvers together. A driver can temporarily give
  // up a little space so a neighbor can leave the ambulance's path next.
  for (let depth = 0; depth < 5; depth++) {
    const candidates = [];
    for (const state of beam) {
      for (const original of nearby) {
        const actor = state.poses.find(car => car.id === original.id);
        const isAmbulance = actor.id === ambulance.id;
        const dxs = isAmbulance ? [-1.2 * forward.x, -2.4 * forward.x]
          : [-3.2, -1.6, -.65, 0, .65, 1.6, 3.2];
        for (const dx of dxs) {
          const zs = [actor.z];
          if (!isAmbulance) {
            zs.push(actor.z - .65, actor.z + .65);
            if (actor.id === blocker.id || Math.abs(dx) <= .65) zs.push(...banks);
          }
          for (const z of zs) {
            const end = { ...actor, x: actor.x + dx, z, rotation: HEADINGS[actor.heading].rotation };
            const distance = Math.hypot(dx, z - actor.z);
            if (distance < .1 || !recoveryMoveIsSafe(actor, end, state.poses)) continue;
            const poses = state.poses.map(car => car === actor ? end : car);
            const key = nearby.map(car => {
              const pose = poses.find(item => item.id === car.id);
              return `${Math.round(pose.x * 5)},${Math.round(pose.z * 5)}`;
            }).join('/');
            if (visited.has(key)) continue;
            visited.add(key);
            const moves = [...state.moves, { id: actor.id, x: end.x, z: end.z }];
            if (!blocksCorridor(poses[index], center)) return moves;
            const current = poses[index];
            const blockedBanks = banks.map(bank => {
              const slot = { ...current, z: bank };
              return poses.filter(other => other.id !== current.id && intersects(slot, other, .25)).length;
            });
            const cost = state.cost + distance * (isAmbulance ? 1.25 : .4);
            const rank = cost + Math.min(...blockedBanks) * 4 +
              Math.min(...banks.map(bank => Math.abs(bank - current.z))) * 1.8;
            candidates.push({ poses, moves, cost, rank });
          }
        }
      }
    }
    beam = candidates.sort((a, b) => a.rank - b.rank).slice(0, 14);
    if (!beam.length) break;
  }
}

function runRecovery(vehicles, dt, policy) {
  const ambulance = vehicles.find(vehicle => vehicle.recovery);
  if (!ambulance) return false;
  const recovery = ambulance.recovery;
  const move = recovery.moves[0];
  const vehicle = vehicles.find(item => item.id === move.id);
  recovery.start ??= { id: vehicle.id, kind: vehicle.kind, heading: vehicle.heading, x: vehicle.x, z: vehicle.z };
  const distance = Math.hypot(move.x - recovery.start.x, move.z - recovery.start.z);
  const along = projection(recovery.start, move, HEADINGS[vehicle.heading]);
  const speed = policy.movingOncoming ? (along < -.2 ? 1.5 : 2) : 1.15;
  recovery.progress = Math.min(1, recovery.progress + speed * dt / distance);
  const eased = recovery.progress ** 2 * (3 - 2 * recovery.progress);
  const next = recoveryPose(recovery.start, move, eased);

  if (!safeAt(next, vehicles)) {
    ambulance.recovery = null;
    return false;
  }
  Object.assign(vehicle, { x: next.x, z: next.z, rotation: next.rotation, y: scenarioRoadHeight(next.x, next.z, vehicle.heading) });
  vehicle.status = along < -.2 ? 'Backing up to open a gap'
    : Math.abs(move.z - recovery.start.z) > .3 ? 'Shifting safely to open a gap' : 'Creeping forward to open a gap';
  if (vehicle !== ambulance) ambulance.status = move.yieldFor ? `${vehicle.id} is opening a gap` : 'Waiting for the recovery gap';
  if (policy.movingOncoming) {
    for (const car of vehicles) {
      if (car.kind !== 'car' || car === vehicle || car.parked || car.done) continue;
      const distanceToPlan = Math.abs(car.x - ambulance.x) < 10 || recovery.moves.some(destination =>
        Math.hypot(car.x - destination.x, car.z - destination.z) < 9);
      if (!distanceToPlan) {
        car.corridorHold = false;
        driveVehicle(car, vehicles, dt, policy);
      } else if (recovery.moves.some(destination => destination.id === car.id)) {
        const helper = recovery.moves.find(destination => destination.yieldFor === car.id);
        car.status = `Waiting for ${helper?.id ?? vehicle.id} to open a gap`;
      }
    }
  }
  if (recovery.progress >= 1) {
    recovery.moves.shift();
    recovery.progress = 0;
    recovery.start = null;
    if (!recovery.moves.length) {
      ambulance.recovery = null;
      ambulance.waiting = 0;
      ambulance.corridorClock = 0;
    }
  }
  return true;
}

function checkRecovery(vehicles, dt, policy) {
  if (vehicles.some(vehicle => vehicle.recovery)) return;
  for (const ambulance of vehicles) {
    if (ambulance.kind !== 'ambulance' || ambulance.done || ambulance.laneChange || ambulance.backingOut || !HEADINGS[ambulance.heading].x) continue;
    if (ambulance.movingFlow && !policy.movingOncoming) continue;
    ambulance.recoveryClock = Math.max(0, (ambulance.recoveryClock ?? 0) - dt);
    if ((ambulance.waiting ?? 0) < (policy.movingOncoming ? 1.25 : 2.3) || ambulance.recoveryClock > 0) continue;
    ambulance.recoveryClock = policy.movingOncoming ? 1.2 : 2.5;
    // Traffic that has not moved cannot produce a different rescue plan.
    const positions = policy.movingOncoming && vehicles.filter(vehicle => Math.abs(vehicle.x - ambulance.x) < 34)
      .map(vehicle => `${vehicle.id}:${vehicle.x.toFixed(1)},${vehicle.z.toFixed(1)},${vehicle.rotation.toFixed(2)}`).join('|');
    if (positions && positions === ambulance.failedRecoveryLayout) continue;
    const moves = (policy.movingOncoming && planYieldChain(ambulance, vehicles)) || planRecovery(ambulance, vehicles);
    if (!moves) {
      if (positions) ambulance.failedRecoveryLayout = positions;
      continue;
    }
    ambulance.failedRecoveryLayout = undefined;
    for (const vehicle of vehicles) {
      if (!policy.movingOncoming || moves.some(move => move.id === vehicle.id) || Math.abs(vehicle.x - ambulance.x) < 12) vehicle.speed = 0;
      vehicle.lateralTarget = undefined;
      vehicle.corridorYield = false;
      vehicle.spaceRequest = null;
    }
    ambulance.recovery = { moves, progress: 0, start: null };
    return;
  }
}

function laneChangePose(start, end, progress) {
  const smooth = progress * progress * (3 - 2 * progress);
  const { forward, right } = axes(start);
  const sideways = projection(start, end, right);
  const length = projection(start, end, forward);
  return {
    ...poseAt(start, forward, right, length * progress, sideways * smooth),
    rotation: forward.rotation - Math.atan2(6 * progress * (1 - progress) * sideways, length),
  };
}

function planAmbulanceProgress(ambulance, vehicles) {
  const { forward, right } = axes(ambulance);
  const { room, blocker } = forwardRoom(ambulance, vehicles, forward, right);
  const pavement = roadRoom(ambulance, forward, right);
  if (room > (blocker?.parked ? 16 : 12) && pavement >= 8) return;
  if (pavement >= 8 && blocker?.movingFlow && blocker.speed > .5 && blocker.lateralTarget != null &&
      Math.abs(blocker.lateralTarget * HEADINGS[blocker.heading].x - ambulance.z) > 2.15 &&
      (ambulance.waiting ?? 0) < .65) return;

  const start = { id: ambulance.id, kind: ambulance.kind, heading: ambulance.heading, x: ambulance.x, z: ambulance.z };
  const nearby = vehicles.filter(vehicle => vehicle !== ambulance &&
    Math.hypot(vehicle.x - start.x, vehicle.z - start.z) < 28);
  const offsets = [-.2, .2, -.35, .35, -.7, .7, -1.1, 1.1, -1.6, 1.6, -2.3, 2.3, -3, 3];
  if (blocker) {
    const ext = footprint(blocker);
    const side = projection(start, blocker, right);
    const clearance = SIZE.ambulance.width + Math.abs(right.x) * ext.x + Math.abs(right.z) * ext.z + BUFFER;
    offsets.push(side - clearance - .005, side + clearance + .005);
  }
  let best;
  for (const speed of [PASSING_SPEED, 2.8]) {
    const predictions = new Map();
    const trafficAt = distance => {
      if (!predictions.has(distance)) {
        const initialSpeed = ambulance.speed;
        const acceleration = speed < initialSpeed ? -DECEL : 3.5;
        const accelerationDistance = (speed ** 2 - initialSpeed ** 2) / (2 * acceleration);
        const time = distance <= accelerationDistance
          ? (Math.sqrt(initialSpeed ** 2 + 2 * acceleration * distance) - initialSpeed) / acceleration
          : (speed - initialSpeed) / acceleration + (distance - accelerationDistance) / speed;
        predictions.set(distance, forecastTraffic(nearby, ambulance, time));
      }
      return predictions.get(distance);
    };
    const straightLimit = Math.min(pavement, blocker?.parked ? room : Infinity, 10);
    let straightRoom = 0;
    for (let distance = .4; distance <= straightLimit; distance += .4) {
      const pose = { ...poseAt(start, forward, right, distance, 0), rotation: forward.rotation };
      if (!safeAt(pose, trafficAt(distance))) break;
      straightRoom = distance;
    }
    if (speed === PASSING_SPEED && straightRoom >= 7.5 && !blocker?.parked) return;

    for (const offset of offsets) {
      for (const distance of [2.4, 4.4, 6.4, 8.4]) {
        if (Math.abs(offset) / distance > .43) continue;
        const end = { ...poseAt(start, forward, right, distance, offset), rotation: forward.rotation };
        if (!onRoad(end)) continue;
        const exitRoom = Math.min(forwardRoom(end, trafficAt(distance), forward, right).room, roadRoom(end, forward, right));
        if (exitRoom < .6) continue;
        // Reward forward progress and usable space beyond the turn. Keep small
        // steering corrections cheap so a narrow gap can beat waiting in place.
        const score = distance + Math.min(exitRoom, 5) * .75 - Math.abs(offset) * .95 + speed * .45;
        if (score <= straightRoom + 2.6 + speed * .45 || score <= (best?.score ?? -Infinity)) continue;
        let clear = true;
        for (let step = .4; step <= distance + .01; step += .4) {
          if (safeAt(laneChangePose(start, end, Math.min(1, step / distance)), trafficAt(step))) continue;
          clear = false;
          break;
        }
        if (clear) best = { start, end, distance, progress: 0, speed, score };
      }
    }
  }
  return best;
}

function chooseAmbulanceGap(ambulance, vehicles) {
  const { forward, right } = axes(ambulance);
  const { room, blocker } = forwardRoom(ambulance, vehicles, forward, right);
  const inFlow = ambulance.movingFlow;
  if (room > (inFlow && !blocker?.parked ? 8 : 14)) return;
  let best;
  const start = { id: ambulance.id, kind: ambulance.kind, heading: ambulance.heading, x: ambulance.x, z: ambulance.z };
  for (const offset of [-2.4, 2.4, -1.55, 1.55, -3.2, 3.2]) {
    for (const distance of [4.5, 6.5, 8.5]) {
      const end = { ...poseAt(start, forward, right, distance, offset), rotation: forward.rotation };
      const traffic = inFlow ? forecastTraffic(vehicles, ambulance, distance / 3) : vehicles;
      const exitRoom = Math.min(
        forwardRoom(end, traffic, forward, right).room,
        roadRoom(end, forward, right),
      );
      // Prefer a useful opening that leaves space to stop after merging.
      if (exitRoom < 2.5 || distance + exitRoom < room + 3) continue;
      if (inFlow && !blocker?.parked) {
        const straight = poseAt(start, forward, right, distance, 0);
        if (forwardRoom(straight, traffic, forward, right).room >= exitRoom - 2 &&
            !traffic.some(other => other.id !== ambulance.id && intersects(straight, other))) continue;
      }
      const steps = Math.ceil(distance / .30);
      let clear = true;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const time = distance * t / 3;
        const sample = laneChangePose(start, end, t);
        const clearAtTime = inFlow ? safeAt(sample, forecastTraffic(vehicles, ambulance, time)) : safeAt(sample, vehicles, time);
        if (!clearAtTime) {
          clear = false;
          break;
        }
      }
      const score = distance + exitRoom - .8 * Math.abs(offset);
      if (clear && (!best || score > best.score)) best = { start, end, distance, progress: 0, score };
    }
  }
  return best;
}

function storeAmbulanceTrail(ambulance) {
  const point = { x: ambulance.x, z: ambulance.z, rotation: ambulance.rotation };
  ambulance.trail ??= [];
  const last = ambulance.trail.at(-1);
  if (!last || Math.hypot(point.x - last.x, point.z - last.z) >= .30) ambulance.trail.push(point);
}

export function requestAmbulanceBackout(vehicles) {
  const ambulance = vehicles.find(vehicle => vehicle.kind === 'ambulance' && !vehicle.done);
  if (!ambulance || ambulance.backingOut || !ambulance.trail?.length) return false;
  for (const vehicle of vehicles) vehicle.recovery = null;
  ambulance.backingOut = true;
  ambulance.laneChange = null;
  ambulance.lateralTarget = undefined;
  ambulance.speed = 0;
  ambulance.corridorClock = 0;
  return true;
}

function followAmbulanceManeuver(ambulance, vehicles, dt) {
  if (ambulance.backingOut) {
    const target = ambulance.trail.at(-1);
    const distance = target ? Math.hypot(target.x - ambulance.x, target.z - ambulance.z) : 0;
    if (!target || (ambulance.trail.length === 1 && distance <= .025)) {
      ambulance.done = true;
      ambulance.status = 'Back at dispatch point';
      return;
    }
    const fraction = distance ? Math.min(1, 1.75 * dt / distance) : 1;
    const next = {
      ...ambulance, x: ambulance.x + (target.x - ambulance.x) * fraction,
      z: ambulance.z + (target.z - ambulance.z) * fraction,
      rotation: ambulance.rotation + (target.rotation - ambulance.rotation) * fraction,
    };
    if (!safeAt(next, vehicles, .24)) {
      ambulance.status = 'Waiting for reverse clearance';
      return;
    }
    Object.assign(ambulance, { x: next.x, z: next.z, rotation: next.rotation, y: scenarioRoadHeight(next.x, next.z, ambulance.heading) });
    if (fraction === 1 && ambulance.trail.length > 1) ambulance.trail.pop();
    ambulance.status = 'Reversing along approach';
    return;
  }
  const path = ambulance.laneChange;
  let speed = path.speed
    ? ambulance.speed + clamp(path.speed - ambulance.speed, -DECEL * dt, 3.5 * dt)
    : Math.min(3, ambulance.speed + 2.2 * dt);
  if (path.speed) {
    const lookahead = Math.min((1 - path.progress) * path.distance, speed * .44 + speed ** 2 / (2 * DECEL));
    let clearDistance = 0;
    for (const fraction of [.35, .7, 1]) {
      const distance = lookahead * fraction;
      const sample = laneChangePose(path.start, path.end, path.progress + distance / path.distance);
      if (!safeAt(sample, forecastTraffic(vehicles, ambulance, distance / Math.max(1, speed)))) break;
      clearDistance = distance;
    }
    if (clearDistance < lookahead) speed = Math.min(speed, Math.sqrt(2 * DECEL * clearDistance));
  }
  const progress = Math.min(1, path.progress + speed * dt / path.distance);
  const next = laneChangePose(path.start, path.end, progress);
  if (!speed || !safeAt(next, vehicles, path.speed ? 0 : .24)) {
    ambulance.speed = 0;
    ambulance.laneChange = null;
    ambulance.status = 'Braking for lane-change traffic';
    return;
  }
  Object.assign(ambulance, { x: next.x, z: next.z, rotation: next.rotation, speed, y: scenarioRoadHeight(next.x, next.z, ambulance.heading) });
  path.progress = progress;
  ambulance.waiting = 0;
  ambulance.status = projection(path.start, path.end, axes(ambulance).right) > 0 ? 'Taking a gap to the right' : 'Taking a gap to the left';
  if (progress === 1) {
    ambulance.laneChange = null;
    ambulance.corridorZ = ambulance.z;
  }
  storeAmbulanceTrail(ambulance);
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

function driveVehicle(pose, vehicles, dt, policy) {
  if (pose.done || pose.parked) return;
  const { forward, right } = axes(pose);
  const rotation = forward.rotation;
  const ahead = forwardRoom(pose, vehicles, forward, right);
  const pavement = roadRoom(pose, forward, right);
  const maneuverRoom = pose.corridorYield ? Math.max(0, pose.corridorAdvance - dot(pose.x, pose.z, forward)) : Infinity;
  const waitingRoom = pose.corridorActive && ahead.obstacle ? Math.max(0, ahead.room - .85) : ahead.room;
  const room = Math.min(waitingRoom, pavement, maneuverRoom, pose.flowRoom ?? Infinity);
  const ambulance = pose.kind === 'car' && !pose.movingFlow && nearestAmbulance(pose, vehicles);
  const needsSpace = ambulance && Math.abs(projection(ambulance, pose, axes(ambulance).right)) < 1.95;
  const canPass = pose.waiting > .7 && (pose.kind === 'ambulance' || pavement === 0) &&
    !pose.corridorActive && !pose.corridorHold && !pose.movingFlow;
  pose.recheck = Math.max(0, (pose.recheck ?? 0) - dt);
  if (!pose.recheck && pose.lateralTarget == null && ((needsSpace && !pose.corridorHold) || canPass)) {
    pose.lateralTarget = findOpening({ ...pose, rotation }, vehicles, ambulance, forward, right);
    pose.recheck = .25;
  }
  let shift = pose.lateralTarget == null ? 0 : pose.lateralTarget - dot(pose.x, pose.z, right);
  if (Math.abs(shift) < .045) {
    pose.lateralTarget = undefined;
    pose.corridorYield = false;
    shift = 0;
  }

  const cruise = pose.kind === 'ambulance' ? (pose.movingFlow ? FLOW_AMBULANCE_SPEED : pose.corridorActive ? 4.4 : 6.6) : 5.5;
  const brakingSpeed = Math.sqrt((DECEL * HEADWAY) ** 2 + 2 * DECEL * room) - DECEL * HEADWAY;
  const desired = shift ? (pose.movingFlow ? 3 : 2.1)
    : pose.spaceRequest ? policy.gapSpeed
    : pose.corridorHold ? 0
    : ambulance ? (needsSpace ? .7 : 0) : cruise;
  const targetSpeed = Math.min(cruise, brakingSpeed, desired);
  const speed = pose.speed + clamp(targetSpeed - pose.speed, -7 * dt, 3.5 * dt);
  const forwardStep = Math.min(speed * dt, room);
  const lateralLimit = pose.movingFlow ? Math.min(.95 * dt, forwardStep * .37) : 1.35 * dt;
  const lateralStep = clamp(shift, -lateralLimit, lateralLimit);
  const maxSteering = pose.corridorYield || pose.movingFlow ? .17 : .28;
  const steering = rotation - clamp(Math.atan2(lateralStep, Math.max(forwardStep, .04)), -maxSteering, maxSteering);
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
    : pose.spaceRequest ? (pose.speed > .2 ? 'Making room for a neighbor' : 'Waiting to open a gap')
    : pose.corridorHold ? (needsSpace ? 'Waiting for a gap' : 'Holding the rescue lane')
    : ambulance ? (needsSpace ? 'Waiting for a gap' : 'Holding for ambulance')
    : pose.corridorActive && pose.speed > .2 ? 'Creeping through the corridor'
    : pose.speed > .2 ? 'Driving' : 'Waiting for clearance';

  const atBoundary = pose.heading === 'E' ? pose.x > 86
    : pose.heading === 'W' ? pose.x < -86
    : pose.heading === 'N' ? pose.z < -66 : pose.z > 61;
  if (atBoundary && pavement === 0 && !ahead.obstacle && !shift && pose.waiting > .5) {
    pose.done = true;
    pose.status = 'End of road';
  }
}

export function stepScenario(vehicles, dt, policy = CORRIDOR_POLICY) {
  const recovering = vehicles.some(vehicle => vehicle.recovery);
  if (policy.movingOncoming && !recovering) coordinateCorridors(vehicles, dt, policy);
  for (const ambulance of vehicles) {
    if (ambulance.kind !== 'ambulance' || ambulance.done || ambulance.backingOut) continue;
    storeAmbulanceTrail(ambulance);
    ambulance.gapClock = (ambulance.gapClock ?? 0) - dt;
    if (recovering || ambulance.laneChange || ambulance.gapClock > 0) continue;
    ambulance.gapClock = policy.movingOncoming ? .12 : .36;
    const gap = policy.movingOncoming
      ? planAmbulanceProgress(ambulance, vehicles) ?? chooseAmbulanceGap(ambulance, vehicles)
      : chooseAmbulanceGap(ambulance, vehicles);
    if (!gap) continue;
    ambulance.laneChange = gap;
    ambulance.lateralTarget = undefined;
    ambulance.changedLane = true;
  }
  checkRecovery(vehicles, dt, policy);
  if (runRecovery(vehicles, dt, policy)) return;
  if (!policy.movingOncoming) coordinateCorridors(vehicles, dt, policy);
  for (const vehicle of vehicles) if (vehicle.kind === 'car') driveVehicle(vehicle, vehicles, dt, policy);
  for (const vehicle of vehicles) {
    if (vehicle.kind !== 'ambulance' || vehicle.done) continue;
    if (vehicle.laneChange || vehicle.backingOut) followAmbulanceManeuver(vehicle, vehicles, dt);
    else driveVehicle(vehicle, vehicles, dt, policy);
  }
}
