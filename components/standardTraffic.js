import { Vector3 } from 'three';

export const NORMAL_TRAFFIC_SPEED = 7;
export const CASE1_AMBULANCE_SPEED = 12;
export const CASE1_AMBULANCE_START_X = -120;
export const CASE1_AMBULANCE_LANE_Z = -6;
export const CASE1_PREEMPTION_X = -85;
export const TRAFFIC_SPAWN_DISTANCE = 50;
export const TRAFFIC_ROAD_EDGES = {
  top: -9.58,
  bottom: -1.24,
  westTop: 9.58,
  westBottom: 1.24,
  left: -3.69,
  right: 3.44,
};

export function createStandardTrafficQueue() {
  const distance = TRAFFIC_SPAWN_DISTANCE;
  const lanes = [
    { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perpHome: 2.5, pullOverPerp: 3.1, stopLine: 11, wrapPos: -distance - 20, startPos: distance },
    { dir: 'N', axis: 'z', perpAxis: 'x', sign: -1, perpHome: 1.0, pullOverPerp: 2.5, stopLine: 11, wrapPos: -distance - 20, startPos: distance },
    { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1, perpHome: -3.1, pullOverPerp: -3.4, stopLine: -11, wrapPos: distance, startPos: -distance - 10 },
    { dir: 'S', axis: 'z', perpAxis: 'x', sign: 1, perpHome: -1.8, pullOverPerp: -3.2, stopLine: -11, wrapPos: distance, startPos: -distance - 10 },
    { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1, perpHome: -7.5, pullOverPerp: -9.0, stopLine: -7, wrapPos: distance, startPos: -distance - 10 },
    { dir: 'E', axis: 'x', perpAxis: 'z', sign: 1, perpHome: -4.5, pullOverPerp: -2.0, stopLine: -7, wrapPos: distance, startPos: -distance - 10 },
    { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perpHome: 4.5, pullOverPerp: 1.5, stopLine: 6, wrapPos: -distance - 10, startPos: distance },
    { dir: 'W', axis: 'x', perpAxis: 'z', sign: -1, perpHome: 7.5, pullOverPerp: 9.0, stopLine: 6, wrapPos: -distance - 10, startPos: distance },
  ];

  const cars = [];
  for (const [laneIndex, lane] of lanes.entries()) {
    const count = lane.dir === 'E' ? 9 : lane.axis === 'z' ? 3 : 4;
    const stagger = (laneIndex % 2) * 5;
    const spacing = lane.dir === 'E' ? 7 : 8;
    for (let index = 0; index < count; index++) {
      const longitudinal = lane.stopLine - lane.sign * (2 + stagger + index * spacing);
      const id = cars.length + 1;
      cars.push({
        id,
        type: lane.dir,
        queueIndex: index,
        modelIdx: (id + 1) % 3,
        axis: lane.axis,
        perpAxis: lane.perpAxis,
        sign: lane.sign,
        homePerp: lane.perpHome,
        pullOverPerp: lane.pullOverPerp,
        targetPerp: lane.perpHome,
        wrapPos: lane.wrapPos,
        startPos: lane.startPos,
        stopLine: lane.stopLine,
        pos: new Vector3(lane.axis === 'x' ? longitudinal : lane.perpHome, 0.2, lane.axis === 'z' ? longitudinal : lane.perpHome),
        rotY: 0,
        receivesBLE: false,
        speed: 0,
        state: 'IDLE_QUEUE',
      });
    }
  }
  return cars;
}
