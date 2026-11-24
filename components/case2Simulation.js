import { MathUtils } from 'three';
import {
  CASE1_AMBULANCE_LANE_Z,
  CASE1_AMBULANCE_SPEED,
  CASE1_AMBULANCE_START_X,
  CASE1_PREEMPTION_X,
  createStandardTrafficQueue,
  NORMAL_TRAFFIC_SPEED,
  TRAFFIC_ROAD_EDGES,
} from './standardTraffic.js';

const EAST_CAR_STOP = -10;
const EAST_CLEAR = 5.85;
const EAST_TRAFFIC_EXIT = 72;
export const CASE2_EAST_YIELD_RADIUS = 12;
const NORTH_STOP = 16.7;
const NORTH_CLEAR = -11.85;
// Place the whole ambulance on the road side of the south entrance facade.
const NORTH_START = 66.2;
const NORTH_DISPATCH_EAST_X = -112;
const NORTH_LANE = 0.81;
const NORTH_PASS_LANE = 2.56;
const NORTH_JUNCTION_LANE = 2.35;
const NORTH_QUEUE_RETURN = 40;
const EAST_DESTINATION = 88;
const NORTH_DESTINATION = -67;
const AMBULANCE_CRUISE = CASE1_AMBULANCE_SPEED - 2;
const CIVILIAN_CRUISE = NORMAL_TRAFFIC_SPEED - 1;
const NORTH_CRAWL_SPEED = 5;
const AMBULANCE = { length: 2.16, width: 0.79 };
const CAR = { length: 1.64, width: 0.70 };
const NORMAL_ARMS = ['E', 'N', 'S', 'W'];
const NORMAL_ROUTES = {
  E: { stop: EAST_CAR_STOP, clear: 7, exit: 72, entry: -79 },
  N: { stop: NORTH_STOP, clear: -13, exit: -58, entry: 61 },
  S: { stop: -14, clear: 15, exit: 61, entry: -58 },
  W: { stop: 11, clear: -8, exit: -79, entry: 72 },
};

// Road elevations sampled along the two routes through the perimeter openings.
const EAST_SURFACE = [[-120, .60], [-102, .60], [-96, .73], [-93, .67], [-90, .13], [-85, .17], [-30, .19], [-15, .17], [0, 0], [16, .13], [58, .19]];
const NORTH_SURFACE = [[-58, 1.75], [-46, 1.51], [-35, 1.04], [-20, .29], [-10, .14], [0, .02], [15, .07], [20, .22], [30, .29], [45, .28], [55, .17], [62, .20], [64, .31], [66.2, .67]];

function elevation(profile, coordinate) {
  for (let i = 1; i < profile.length; i++) {
    const [position, height] = profile[i];
    if (coordinate > position) continue;
    const [start, base] = profile[i - 1];
    return MathUtils.lerp(base, height, MathUtils.clamp((coordinate - start) / (position - start), 0, 1));
  }
  return profile.at(-1)[1];
}

function setRoadHeight(vehicle, type, dt) {
  const target = scenarioRoadHeight(vehicle.x, vehicle.z, type);
  vehicle.y = dt === undefined ? target : MathUtils.damp(vehicle.y, target, 12, dt);
}

export function scenarioRoadHeight(x, z, heading) {
  return heading === 'E' || heading === 'W' ? elevation(EAST_SURFACE, x) : elevation(NORTH_SURFACE, z);
}

function footprint(heading, steering, size = CAR) {
  const sideways = Math.abs(Math.cos(steering)) * size.width + Math.abs(Math.sin(steering)) * size.length;
  const forward = Math.abs(Math.cos(steering)) * size.length + Math.abs(Math.sin(steering)) * size.width;
  return heading === 'E' || heading === 'W' ? { x: forward, z: sideways } : { x: sideways, z: forward };
}

function roadLimits(type) {
  const edges = TRAFFIC_ROAD_EDGES;
  if (type === 'E') return [edges.top, edges.bottom];
  if (type === 'W') return [edges.westBottom, edges.westTop];
  return type === 'N' ? [0, edges.right] : [edges.left, 0];
}

function createCase2Traffic() {
  const cars = createStandardTrafficQueue();
  for (const car of cars) {
    if (car.type === 'E') {
      const outside = car.homePerp < CASE1_AMBULANCE_LANE_Z;
      const gaps = outside ? [0, 1.4, -.8, -2.1, .7, 2.4, 1, -.7, 1.6]
        : [.1, -1.3, .8, 2, -.4, -1.7, .9, 2.1, .3];
      const offset = Math.sin(car.id * 2.4) * .13;
      car.pos.z = (outside ? -7.9 : -4.1) + offset;
      car.pos.x -= (outside ? 3.5 : 3) + gaps[car.queueIndex];
      if (car.queueIndex === 2 || (outside && car.queueIndex === 5)) {
        car.pos.z += outside ? .45 : -.45;
      }
      car.yieldPlan = { side: outside ? -8.45 : -3.45, advance: .65, delay: .24 + car.queueIndex % 3 * .08, duration: 1.15 };
    } else if (car.type === 'N') {
      const curbLane = car.homePerp > 2;
      const index = car.queueIndex;
      car.pos.x = curbLane ? 2.65 : .90;
      // Two roughly paired rows and one staggered car in each lane.
      car.pos.z = (curbLane ? [23.5, 29.8, 50] : [22.2, 49.8, 57.2])[index];
      if (curbLane && index === 2) {
        car.yieldPlan = { side: 2.65, advance: 15, range: 15.5, delay: .42, duration: 4.0 };
      } else if (!curbLane && index === 2) {
        car.yieldPlan = { side: .71, advance: .55, range: 6.1, delay: .28, duration: 1.2 };
      } else if (!curbLane && index === 0) {
        car.yieldPlan = { side: 2.65, advance: 4.7, range: 10, delay: .36, duration: 1.8, sideDelay: .46 };
      }
    } else {
      car.pos[car.axis] -= car.sign * 5;
      if (car.type === 'S' && car.homePerp > -2) car.pos.x = -1.35;
    }
    const [min, max] = roadLimits(car.type);
    car.pos[car.perpAxis] = MathUtils.clamp(car.pos[car.perpAxis], min + CAR.width, max - CAR.width);
    car.returnPerp = car.pos[car.perpAxis];
    setRoadHeight(car.pos, car.type);
  }
  return cars;
}

export function createCase2Simulation() {
  const east = { x: CASE1_AMBULANCE_START_X, z: CASE1_AMBULANCE_LANE_Z, rotation: -Math.PI / 2, speed: 0 };
  const north = { x: NORTH_LANE, z: NORTH_START, rotation: 0, speed: 0 };
  setRoadHeight(east, 'E');
  setRoadHeight(north, 'N');
  return { phase: 'ready', northStatus: 'Ready', east, north, cars: createCase2Traffic() };
}

function overlaps(position, extent, other, otherExtent, gap = 0) {
  return Math.abs(position.x - other.x) < extent.x + otherExtent.x + gap &&
    Math.abs(position.z - other.z) < extent.z + otherExtent.z + gap;
}

function updateYieldingCars({ cars, east, north, phase }, northHeld, dt) {
  for (const car of cars) {
    if (!car.yieldPlan) continue;
    const eastbound = car.type === 'E';
    const ambulance = eastbound ? east : north;
    const { axis, perpAxis, sign, pos } = car;
    const distance = (pos[axis] - ambulance[axis]) * sign;
    const reactionDistance = eastbound ? CASE2_EAST_YIELD_RADIUS : car.yieldPlan.range;
    const canStart = eastbound ? phase === 'eastGreen' && !car.eastCommitted && pos.x < EAST_CAR_STOP - 2 : northHeld;
    const nearAmbulance = canStart && Math.hypot(distance, pos[perpAxis] - ambulance[perpAxis]) <= reactionDistance;
    car.receivesBLE = nearAmbulance && distance >= -2;
    if (car.yieldProgress === 1) continue;

    if (!car.yieldOrigin) {
      if (!nearAmbulance || distance < 0) continue;
      const reaction = (car.reactionTime ?? 0) + dt;
      car.reactionTime = reaction;
      if (reaction < car.yieldPlan.delay) continue;
      car.yieldOrigin = pos.clone();
      car.yieldProgress = 0;
    }

    const { side, advance, duration, sideDelay = 0 } = car.yieldPlan;
    const progress = Math.min(1, car.yieldProgress + dt / duration);
    const eased = MathUtils.smoothstep(progress, 0, 1);
    const sideways = MathUtils.smoothstep(progress, sideDelay, 1);
    const goingRight = (side - car.yieldOrigin[perpAxis]) * sign;
    const desiredSteering = Math.sign(goingRight) * (eastbound
      ? -.28 * Math.sin(Math.PI * progress)
      : .24 * Math.sin(Math.PI * sideways));
    const lateral = MathUtils.lerp(car.yieldOrigin[perpAxis], side, sideways);
    const steering = car.type === 'N' ? northRoadYaw(lateral, desiredSteering, CAR) : desiredSteering;
    const extent = footprint(car.type, steering);
    const [min, max] = roadLimits(car.type);
    const next = {
      [axis]: car.yieldOrigin[axis] + sign * advance * eased,
      [perpAxis]: MathUtils.clamp(lateral, min + extent[perpAxis], max - extent[perpAxis]),
    };
    if (overlaps(next, extent, ambulance, footprint(car.type, eastbound ? 0 : north.rotation, AMBULANCE), .11)) continue;
    if (cars.some(other => other !== car && overlaps(next, extent, other.pos, footprint(other.type, other.rotY), .11))) continue;

    car.speed = Math.abs(next[axis] - pos[axis]) / dt;
    pos[axis] = next[axis];
    pos[perpAxis] = next[perpAxis];
    car.rotY = steering;
    car.yieldProgress = progress;
  }
}

function drive(vehicle, position, axis, sign, limit, cruise, dt) {
  const room = Math.max(0, (limit - position[axis]) * sign);
  const targetSpeed = Math.min(cruise, Math.sqrt(2 * 7 * room));
  vehicle.speed += MathUtils.clamp(targetSpeed - vehicle.speed, -8 * dt, 5.5 * dt);
  const step = Math.min(vehicle.speed * dt, room);
  position[axis] += sign * step;
  if (step === room) vehicle.speed = 0;
}

function followLimit(position, extent, axis, sign, limit, leader, leaderExtent, gap) {
  const perp = axis === 'x' ? 'z' : 'x';
  if ((leader[axis] - position[axis]) * sign <= 0) return limit;
  if (Math.abs(leader[perp] - position[perp]) >= extent[perp] + leaderExtent[perp] + .10) return limit;
  const safeLimit = leader[axis] - sign * (extent[axis] + leaderExtent[axis] + gap);
  return sign === 1 ? Math.min(limit, safeLimit) : Math.max(limit, safeLimit);
}

function ambulanceLimit(cars, ambulance, type, axis, sign, limit) {
  const extent = footprint(type, type === 'N' ? ambulance.rotation : 0, AMBULANCE);
  for (const car of cars) {
    if (car.type === type) {
      limit = followLimit(ambulance, extent, axis, sign, limit, car.pos, footprint(type, car.rotY), .45);
    }
  }
  return limit;
}

function northRoadYaw(x, yaw, size) {
  const room = Math.min(x, TRAFFIC_ROAD_EDGES.right - x);
  const safeYaw = Math.asin(MathUtils.clamp((room - size.width) / size.length, 0, 1));
  return MathUtils.clamp(yaw, -safeYaw, safeYaw);
}

function northApproachX(z) {
  const moveRight = MathUtils.smoothstep(NORTH_START - z, 0, 4.5);
  const moveLeft = MathUtils.smoothstep(45.3 - z, 0, 45.3 - NORTH_QUEUE_RETURN);
  return MathUtils.lerp(NORTH_LANE, NORTH_PASS_LANE, moveRight * (1 - moveLeft));
}

function advanceNorth(simulation, northHeld, dt) {
  const { north, cars } = simulation;
  const limit = ambulanceLimit(cars, north, 'N', 'z', -1, northHeld ? NORTH_STOP : NORTH_DESTINATION);
  const next = { x: north.x, z: north.z, speed: north.speed };
  drive(next, next, 'z', -1, limit, northHeld ? NORTH_CRAWL_SPEED : AMBULANCE_CRUISE, dt);
  if (next.z === north.z) {
    north.speed = next.speed;
    return;
  }

  next.x = next.z >= 14.6 ? northApproachX(next.z)
    : MathUtils.lerp(NORTH_LANE, NORTH_JUNCTION_LANE, MathUtils.smoothstep(14.6 - next.z, 0, 8.6));
  const yaw = -Math.atan2(next.x - north.x, north.z - next.z);
  const rotation = northRoadYaw(next.x, yaw, AMBULANCE);
  const extent = footprint('N', rotation, AMBULANCE);

  // Apply the steering and forward step together, only if the gap is open.
  if (cars.some(car => overlaps(next, extent, car.pos, footprint(car.type, car.rotY), .12))) {
    north.speed = 0;
    return;
  }
  north.x = next.x;
  north.z = next.z;
  north.speed = next.speed;
  north.rotation = rotation;
}

function mergeNorthboundCar(car, cars, north, dt) {
  const next = { x: Math.min(2.65, car.pos.x + 1.15 * dt), z: car.pos.z };
  const rotation = northRoadYaw(next.x, -.19, CAR);
  const extent = footprint('N', rotation);
  if (overlaps(next, extent, north, footprint('N', north.rotation, AMBULANCE), .2)) return;
  if (cars.some(other => other !== car && overlaps(next, extent, other.pos, footprint(other.type, other.rotY), .2))) return;
  car.pos.x = next.x;
  car.rotY = next.x === 2.65 ? 0 : rotation;
}

function canCrossBeforeHandoff(car, east) {
  const timeUntilHandoff = (EAST_CLEAR - east.x) / AMBULANCE_CRUISE;
  const timeToCross = (EAST_CLEAR - car.pos.x) / CIVILIAN_CRUISE + .65;
  return car.pos.x >= EAST_CAR_STOP - 2 && timeToCross <= timeUntilHandoff;
}

function updateCivilianTraffic({ cars, east, north, phase }, dt) {
  for (const car of cars) {
    const eastRolling = car.type === 'E' && phase !== 'approach';
    const northReleased = car.type === 'N' && (phase === 'northGreen' || phase === 'clear');
    const closingNorthGap = car.type === 'N' && !northReleased && car.homePerp < 2 &&
      !car.yieldPlan && car.pos.z > north.z;
    if ((!eastRolling && !northReleased && !closingNorthGap) || (car.yieldOrigin && car.yieldProgress < 1)) continue;
    const ambulance = eastRolling ? east : north;
    const { pos, axis, sign, type } = car;
    const needsMerge = northReleased && pos.x < 2.65 && pos.z < 27;
    if (needsMerge) mergeNorthboundCar(car, cars, north, dt);
    const extent = footprint(type, car.rotY);
    const heldAtLine = closingNorthGap || (phase === 'clear' && pos.z >= NORTH_STOP);
    if (eastRolling) {
      if (phase === 'eastGreen' && !car.eastCommitted && canCrossBeforeHandoff(car, east)) {
        car.eastCommitted = true;
        car.receivesBLE = false;
      } else if (phase !== 'eastGreen' && pos.x <= EAST_CAR_STOP) {
        car.eastCommitted = false;
      }
    }
    let limit = eastRolling ? (car.eastCommitted ? EAST_TRAFFIC_EXIT : EAST_CAR_STOP)
      : heldAtLine || needsMerge ? NORTH_STOP : NORTH_DESTINATION;
    if ((northReleased || closingNorthGap) && north.z < pos.z) {
      // Keep the northbound cars behind the ambulance while it steers around
      // the fixtures in the center of the intersection.
      const ahead = footprint(type, north.rotation, AMBULANCE);
      limit = Math.max(limit, north.z + extent.z + ahead.z + .9);
    } else {
      limit = followLimit(pos, extent, axis, sign, limit, ambulance, footprint(type, 0, AMBULANCE), .9);
    }
    for (const leader of cars) {
      if (leader.type === type && leader !== car) {
        limit = followLimit(pos, extent, axis, sign, limit, leader.pos, footprint(type, leader.rotY), 1.0);
      }
    }
    drive(car, pos, axis, sign, limit, CIVILIAN_CRUISE, dt);
  }
}

function eastTrafficCleared(cars) {
  return !cars.some(car => car.eastCommitted && car.pos.x > EAST_CAR_STOP &&
    car.pos.x - footprint('E', car.rotY).x <= TRAFFIC_ROAD_EDGES.right);
}

function keepsJunction(car) {
  const { stop, clear } = NORMAL_ROUTES[car.type];
  const coordinate = car.pos[car.axis];
  return (coordinate - stop) * car.sign > .001 && (coordinate - clear) * car.sign < 0;
}

function stepNormalTraffic(simulation, dt) {
  const { cars, east, north, traffic, phase } = simulation;
  const activeArm = NORMAL_ARMS[traffic.index];
  const ambulances = phase === 'complete' ? [] : [[east, 'E', 0], [north, 'N', north.rotation]];
  for (const car of cars) {
    const { stop, exit, entry } = NORMAL_ROUTES[car.type];
    const { pos, axis, sign, type, perpAxis } = car;
    if (type === 'N' && pos.z >= NORTH_STOP - .001 && pos.z < 28 && pos.x < 2.65) mergeNorthboundCar(car, cars, north, dt);
    if (type === 'S' && pos.z <= stop + .001 && pos.z > -26 && pos.x > -2.55) {
      const next = { x: Math.max(-2.55, pos.x - dt), z: pos.z };
      if (!cars.some(other => other !== car && overlaps(next, footprint(type, 0), other.pos, footprint(other.type, other.rotY), .2))) pos.x = next.x;
    }
    const approachingFixture = (type === 'N' && pos.x < 2.2) || (type === 'S' && pos.x > -2.5);
    const extent = footprint(type, car.rotY);
    const allowed = keepsJunction(car) || (traffic.stage === 'green' && activeArm === type && !approachingFixture);
    const beyondStop = (pos[axis] - stop) * sign > .001;
    let limit = allowed || beyondStop ? exit : stop;
    for (const other of cars) {
      if (other !== car && other.type === type) limit = followLimit(pos, extent, axis, sign, limit, other.pos, footprint(type, other.rotY), 1.0);
    }
    for (const [ambulance, direction, yaw] of ambulances) {
      if (direction === type) limit = followLimit(pos, extent, axis, sign, limit, ambulance, footprint(direction, yaw, AMBULANCE), .8);
    }
    const next = { ...pos, speed: car.speed };
    drive(next, next, axis, sign, limit, CIVILIAN_CRUISE, dt);
    if (!cars.some(other => other !== car && overlaps(next, extent, other.pos, footprint(other.type, other.rotY), .10)) &&
      !ambulances.some(([a, dir, yaw]) => overlaps(next, extent, a, footprint(dir, yaw, AMBULANCE), .10))) {
      pos[axis] = next[axis];
      car.speed = next.speed;
    } else car.speed = 0;
    if (pos[axis] !== exit || phase !== 'complete') continue;
    const spawn = { ...pos, [axis]: entry, [perpAxis]: car.returnPerp };
    if (cars.some(other => other !== car && overlaps(spawn, footprint(type, 0), other.pos, footprint(other.type, other.rotY), 1.2))) continue;
    pos.set(spawn.x, spawn.y, spawn.z);
    car.rotY = 0;
    setRoadHeight(pos, type);
  }
  traffic.remaining -= dt;
  if (traffic.remaining > 0) return;
  if (traffic.stage === 'green') {
    traffic.stage = traffic.initial ? 'clearance' : 'yellow';
    traffic.remaining = traffic.initial ? .5 : 2.5;
  } else if (traffic.stage === 'yellow') {
    traffic.stage = 'clearance';
    traffic.remaining = .5;
  } else if (!cars.some(keepsJunction)) {
    traffic.index = (traffic.index + 1) % NORMAL_ARMS.length;
    traffic.initial = false;
    traffic.stage = 'green';
    traffic.remaining = 12.5;
  }
}

export function case2TrafficSignal(simulation) {
  const { phase, traffic } = simulation;
  const arm = traffic && NORMAL_ARMS[traffic.index].toLowerCase();
  return {
    phase: traffic ? 'NORMAL_CYCLE' : phase,
    eGreen: phase === 'eastGreen' || (arm === 'e' && traffic.stage === 'green'),
    nGreen: phase === 'northGreen' || (arm === 'n' && traffic.stage === 'green'),
    sGreen: arm === 's' && traffic.stage === 'green',
    wGreen: arm === 'w' && traffic.stage === 'green',
    ...(traffic?.stage === 'yellow' ? { [`${arm}Yellow`]: true } : {}),
  };
}

export function stepCase2(simulation, dt) {
  if (dt <= 0 || simulation.phase === 'ready') return;
  if (simulation.traffic) {
    if (simulation.phase !== 'complete') {
      drive(simulation.east, simulation.east, 'x', 1, EAST_DESTINATION, AMBULANCE_CRUISE, dt);
      advanceNorth(simulation, false, dt);
      setRoadHeight(simulation.east, 'E', dt);
      setRoadHeight(simulation.north, 'N', dt);
      if (simulation.north.z <= NORTH_DESTINATION && simulation.east.x >= EAST_DESTINATION) simulation.phase = 'complete';
    }
    stepNormalTraffic(simulation, dt);
    for (const car of simulation.cars) setRoadHeight(car.pos, car.type, dt);
    return;
  }

  const { cars, east, north } = simulation;
  const northHeld = simulation.phase !== 'northGreen' && simulation.phase !== 'clear';
  updateYieldingCars(simulation, northHeld, dt);

  const eastLimit = ambulanceLimit(cars, east, 'E', 'x', 1, EAST_DESTINATION);
  const inNorthQueue = north.z < 63 && northHeld;
  drive(east, east, 'x', 1, eastLimit, AMBULANCE_CRUISE, dt);
  if (east.x >= NORTH_DISPATCH_EAST_X) advanceNorth(simulation, northHeld, dt);
  updateCivilianTraffic(simulation, dt);
  setRoadHeight(east, 'E', dt);
  setRoadHeight(north, 'N', dt);
  for (const car of cars) setRoadHeight(car.pos, car.type, dt);

  if (simulation.phase === 'approach' && east.x >= CASE1_PREEMPTION_X) simulation.phase = 'eastGreen';
  if (northHeld) {
    simulation.northStatus = north.z <= NORTH_STOP + .01 ? 'Stopped at the red light'
      : !inNorthQueue ? 'Approaching the junction'
      : north.speed > .06 ? 'Creeping through traffic' : 'Waiting for a gap';
    if (east.x >= EAST_CLEAR) {
      const corridorClear = eastTrafficCleared(cars);
      simulation.phase = corridorClear ? 'northGreen' : 'eastClearance';
      if (corridorClear) simulation.northStatus = 'Green · crossing the junction';
    }
  } else if (north.z <= NORTH_CLEAR) {
    simulation.phase = 'clear';
    simulation.northStatus = 'Junction clear · hospital-bound';
    simulation.traffic = { index: 0, stage: 'green', initial: true, remaining: 5 };
  }
}
