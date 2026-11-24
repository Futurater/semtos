import assert from 'node:assert/strict';
import {
  CORRIDOR_POLICY, createDenseFlowScenario, createDenseOncomingScenario, createLaneChangeScenario, createStaggeredOncomingScenario, createSavedDenseFlowScenario,
  HEADINGS, ONCOMING_FLOW_POLICY, requestAmbulanceBackout, scenarioVehicle, stageScenario, stepScenario, validateScenario,
} from '../components/scenarioTraffic.js';

function scenario(seed, touching = false) {
  const vehicles = createDenseOncomingScenario();
  let state = seed + 3;
  const jitter = amplitude => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return (state / 2 ** 32 - .5) * 2 * amplitude;
  };
  if (seed >= 0) {
    for (const vehicle of vehicles) {
      vehicle.x += jitter(1.1);
      vehicle.z += jitter(.18);
      if (seed % 2) {
        vehicle.x *= -1;
        vehicle.heading = vehicle.heading === 'E' ? 'W' : 'E';
        vehicle.rotation = HEADINGS[vehicle.heading].rotation;
      }
    }
  }
  if (touching) vehicles[5].x = vehicles[4].x + (seed % 2 === 1 ? -2.9 : 2.9);
  return vehicles;
}

function replay(seed, touching, reward, layout = scenario(seed, touching)) {
  const editorCoords = layout.map(vehicle => [vehicle.x, vehicle.z]);
  const staged = stageScenario(layout);
  assert.equal(staged.error, '');
  assert.deepEqual(layout.map(vehicle => [vehicle.x, vehicle.z]), editorCoords);
  if (touching) assert.ok(staged.adjusted > 0);
  const vehicles = staged.vehicles;
  const ambulance = vehicles.find(vehicle => vehicle.kind === 'ambulance');
  const yielded = new Set(), held = new Set();
  let elapsed = 0, requestTime = 0, recovered = false, backedUp = false;
  const dt = .04;
  for (; elapsed < 100 && !ambulance.done; elapsed += dt) {
    stepScenario(vehicles, dt, reward);
    assert.equal(validateScenario(vehicles), '');
    recovered ||= Boolean(ambulance.recovery);
    backedUp ||= vehicles.some(vehicle => vehicle.status === 'Backing up to open a gap');
    for (const vehicle of vehicles) {
      if (vehicle.spaceRequest) requestTime += dt;
      if (vehicle.status === 'Yielding') yielded.add(vehicle.id);
      if (vehicle.status === 'Holding the rescue lane') held.add(vehicle.id);
    }
  }
  return { elapsed, requestTime, yielded: yielded.size, held: held.size, complete: Boolean(ambulance.done), recovered, backedUp };
}

function packedJunction(seed) {
  let state = seed;
  const random = () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 2 ** 32;
  };
  return [scenarioVehicle('Ambulance 16', 'ambulance', 2 + random() * 4, -2.65 - random() * 2, 'W'),
    ...[-8.1, -5.85, -3.25].flatMap((z, lane) => Array.from({ length: 5 }, (_, row) =>
      scenarioVehicle(`Car ${lane * 5 + row + 1}`, 'car', -5 - row * 4.65 + (random() - .5) * 3,
        z + (random() - .5) * .9, 'E', (lane + row) % 3))),
  ];
}

if (process.argv.includes('--calibrate')) {
  const training = [-1, 0, 1, 3, 4, 6];
  const candidates = [CORRIDOR_POLICY];
  for (const gapSpeed of [2.8, 3.4, 4.2, 4.6]) for (const requests of [1.2, 2.4]) {
    candidates.push({ ...CORRIDOR_POLICY, requests, gapSpeed });
  }
  const results = candidates.map(reward => {
    const runs = training.map((seed, index) => replay(seed, index === 2, reward));
    const loss = runs.reduce((sum, run) => sum + run.elapsed + .18 * run.requestTime + (run.complete ? 0 : 300), 0) / runs.length;
    return { reward, loss: Number(loss.toFixed(3)), completed: runs.filter(run => run.complete).length };
  });
  console.log(results.sort((a, b) => a.loss - b.loss));
} else {
  for (const seed of [-1, 2, 5, 7, 8, 9]) {
    const result = replay(seed, seed === 7, CORRIDOR_POLICY);
    assert.ok(result.complete, `Ambulance stalled on layout ${seed}`);
    assert.ok(result.yielded >= 3 && result.requestTime > 0 && result.held > 0);
    console.log(`Layout ${seed}: ambulance finished in ${result.elapsed.toFixed(1)} s; ${result.yielded} cars yielded.`);
  }
  const packed = [-8.1, -6.15, -3.2].flatMap((z, row) => Array.from({ length: 6 }, (_, i) =>
    scenarioVehicle(`Car ${row * 6 + i + 1}`, 'car', -20 - (5 - i) * 6.4 + (row === 1 ? .55 : 0), z, 'E')));
  packed.push(scenarioVehicle('Ambulance 19', 'ambulance', 10, -6.3, 'W'));
  const packedResult = replay(-1, false, CORRIDOR_POLICY, packed);
  assert.ok(packedResult.complete && packedResult.yielded >= 5 && packedResult.requestTime > 0);
  console.log(`18-car queue: ambulance finished in ${packedResult.elapsed.toFixed(1)} s.`);
  const jam = replay(-1, false, CORRIDOR_POLICY, createStaggeredOncomingScenario());
  assert.ok(jam.complete && jam.recovered && jam.backedUp, 'The staggered 15-car jam must recover without moving cars through an obstruction.');
  console.log(`Staggered 15-car jam: ambulance finished in ${jam.elapsed.toFixed(1)} s with recovery maneuvers.`);
  assert.ok(replay(-1, false, ONCOMING_FLOW_POLICY, createStaggeredOncomingScenario()).complete);
  for (const seed of [7, 56, 168, 230]) {
    const { vehicles, error } = stageScenario(packedJunction(seed));
    assert.equal(error, '');
    const [ambulance, ...cars] = vehicles;
    let coordinated = false, reversed = false, flowing = false;
    let stopped = 0, longestStop = 0, tick = 0;
    for (; tick < 1600 && !ambulance.done; tick++) {
      stepScenario(vehicles, .04, ONCOMING_FLOW_POLICY);
      assert.equal(validateScenario(vehicles), '');
      coordinated ||= Boolean(ambulance.recovery?.moves.some(move => move.yieldFor && move.yieldFor !== ambulance.id));
      reversed ||= cars.some(car => car.status === 'Backing up to open a gap');
      flowing ||= Boolean(ambulance.recovery && cars.some(car => car.speed > 1));
      stopped = ambulance.speed < .15 ? stopped + 1 : 0;
      longestStop = Math.max(longestStop, stopped);
    }
    assert.ok(ambulance.done && longestStop * .04 < 9, `Packed junction ${seed} still stalled.`);
    if (seed === 56) assert.ok(coordinated && reversed && flowing, 'A neighboring driver must open space while other lanes keep moving.');
    console.log(`Packed junction ${seed}: completed in ${(tick * .04).toFixed(1)} s, longest wait ${(longestStop * .04).toFixed(1)} s.`);
  }
  for (const direction of [1, -1]) {
    const layout = createDenseFlowScenario().map(vehicle => direction === 1 ? vehicle : scenarioVehicle(
      vehicle.id, vehicle.kind, -vehicle.x, -vehicle.z, vehicle.kind === 'car' ? 'W' : 'E', vehicle.modelIdx,
    ));
    const { vehicles, error } = stageScenario(layout);
    assert.equal(error, '');
    const ambulance = vehicles.find(vehicle => vehicle.kind === 'ambulance');
    const yielded = new Set(), passed = new Set(), rejoined = new Set();
    let movingDuringYield = false;
    let stoppedTicks = 0;
    let consecutiveStop = 0, longestStop = 0, closestApproach = Infinity;
    for (let i = 0; i < 1000 && !ambulance.done; i++) {
      stepScenario(vehicles, .04, ONCOMING_FLOW_POLICY);
      assert.equal(validateScenario(vehicles), '');
      assert.ok(Math.abs(ambulance.z - layout.at(-1).z) < .24, 'Ambulance should keep to the left in the dense example.');
      consecutiveStop = ambulance.speed < .15 ? consecutiveStop + 1 : 0;
      if (consecutiveStop) stoppedTicks++;
      longestStop = Math.max(longestStop, consecutiveStop);
      const movingCars = vehicles.filter(vehicle => vehicle.kind === 'car' && vehicle.speed > .5);
      movingDuringYield ||= movingCars.length >= 6 && movingCars.some(car => car.status === 'Yielding');
      for (const car of vehicles.filter(vehicle => vehicle.kind === 'car')) {
        const ahead = (ambulance.x - car.x) * direction;
        if (ahead > 0 && Math.abs(ambulance.z - car.z) < 1.5) closestApproach = Math.min(closestApproach, ahead);
        if (car.flowHomeZ != null) yielded.add(car.id);
        if (Math.abs(car.x - ambulance.x) < .3) {
          assert.ok((ambulance.z - car.z) * direction > 1.6, `${car.id} passed on the wrong side.`);
          passed.add(car.id);
        }
        if (yielded.has(car.id) && car.flowHomeZ == null) rejoined.add(car.id);
      }
    }
    assert.ok(ambulance.done && stoppedTicks * .04 < 6);
    assert.ok(longestStop * .04 < 1.2 && closestApproach < 7, 'The ambulance should close in instead of waiting far back.');
    assert.equal(passed.size, 15);
    assert.ok(yielded.size >= 5 && rejoined.size >= 4 && movingDuringYield);
  }
  console.log('Dense one-way flow: all 15 cars passed safely in both orientations while traffic kept moving.');
  const passingLayout = [
    scenarioVehicle('Ambulance', 'ambulance', 14, -2.65, 'W'),
    { ...scenarioVehicle('Parked car', 'car', -4, -2.85, 'E'), parked: true },
    scenarioVehicle('Oncoming car', 'car', -16, -6, 'E'),
  ];
  const movingPass = stageScenario(passingLayout);
  assert.equal(movingPass.error, '');
  const [passingAmbulance, , oncoming] = movingPass.vehicles;
  let pickedGapInTraffic = false;
  for (let i = 0; i < 1200 && !passingAmbulance.done; i++) {
    stepScenario(movingPass.vehicles, .04, ONCOMING_FLOW_POLICY);
    assert.equal(validateScenario(movingPass.vehicles), '');
    pickedGapInTraffic ||= Boolean(passingAmbulance.laneChange && passingAmbulance.movingFlow && oncoming.speed > .5);
  }
  assert.ok(passingAmbulance.done && pickedGapInTraffic, 'The ambulance should use a safe gap while oncoming traffic is moving.');
  console.log('Moving pass: ambulance steered around a blocked lane while oncoming traffic was moving.');

  const medianLayout = [scenarioVehicle('Ambulance', 'ambulance', 12, -2.35, 'W'),
    ...[[-9, -3.87], [-17, -5.2], [-19, -8.2]].map(([x, z], index) => ({
      ...scenarioVehicle(`Parked car ${index + 1}`, 'car', x, z, 'E'), parked: true,
    })),
    scenarioVehicle('Oncoming car', 'car', -30, -6.5, 'E'),
  ];
  const medianPass = stageScenario(medianLayout);
  assert.equal(medianPass.error, '');
  const medianAmbulance = medianPass.vehicles[0];
  let usedSmallCorrection = false;
  for (let i = 0; i < 200 && medianAmbulance.x > -15; i++) {
    stepScenario(medianPass.vehicles, .04, ONCOMING_FLOW_POLICY);
    assert.equal(validateScenario(medianPass.vehicles), '');
    if (!medianAmbulance.laneChange) continue;
    const { start, end } = medianAmbulance.laneChange;
    usedSmallCorrection ||= end.z - start.z > .08 && end.z - start.z < .4;
  }
  assert.ok(medianAmbulance.x <= -15 && usedSmallCorrection, 'Take the narrow median-side gap without waiting for the road to empty.');
  console.log('Median-side pass: small steering correction cleared a narrow gap while staying on the road.');
  const offRoad = scenario(-1);
  offRoad[0].z = -11;
  assert.match(stageScenario(offRoad).error, /fully on the road/);

  for (const reverse of [false, true]) {
    const { vehicles, error } = stageScenario(createLaneChangeScenario());
    assert.equal(error, '');
    const ambulance = vehicles.find(vehicle => vehicle.kind === 'ambulance');
    const dispatch = { x: ambulance.x, z: ambulance.z };
    const changes = new Set();
    let reversed = false;
    for (let i = 0; i < 1800 && !ambulance.done; i++) {
      stepScenario(vehicles, .04);
      assert.equal(validateScenario(vehicles), '');
      if (ambulance.laneChange) changes.add(ambulance.laneChange.end.z);
      if (reverse && !reversed && ambulance.x < -9) {
        assert.ok(requestAmbulanceBackout(vehicles));
        reversed = true;
      }
    }
    assert.ok(ambulance.done);
    if (reverse) {
      assert.ok(reversed);
      assert.deepEqual({ x: ambulance.x, z: ambulance.z }, dispatch);
      console.log('Reverse out: ambulance retraced its approach to dispatch without overlap.');
    } else {
      assert.ok(changes.size >= 2);
      console.log('Lane-change example: ambulance used multiple gaps without overlap.');
    }
  }

  const blocked = stageScenario(createLaneChangeScenario(1, { roadBlocked: true }));
  assert.equal(blocked.error, '');
  const ambulance = blocked.vehicles.find(vehicle => vehicle.kind === 'ambulance');
  const dispatch = { x: ambulance.x, z: ambulance.z };
  const atRoadblock = () => ambulance.x < -50 && ambulance.waiting > 3;
  for (let i = 0; i < 1800 && !atRoadblock(); i++) {
    stepScenario(blocked.vehicles, .04);
    assert.equal(validateScenario(blocked.vehicles), '');
  }
  assert.ok(atRoadblock(), 'The ambulance must stop at a full-width roadblock.');
  assert.ok(requestAmbulanceBackout(blocked.vehicles));
  for (let i = 0; i < 2200 && !ambulance.done; i++) {
    stepScenario(blocked.vehicles, .04);
    assert.equal(validateScenario(blocked.vehicles), '');
  }
  assert.equal(ambulance.status, 'Back at dispatch point');
  assert.deepEqual({ x: ambulance.x, z: ambulance.z }, dispatch);
  console.log('Roadblock example: ambulance stopped at the obstruction and reversed safely to dispatch.');
}

const saved = replay(-1, false, ONCOMING_FLOW_POLICY, createSavedDenseFlowScenario());
assert.ok(saved.complete, 'The saved workbench preset must run to completion.');
console.log('Saved workbench preset: ambulance completed without leaving the road or overlapping vehicles.');
