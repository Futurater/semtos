// src/app/driver/page.js
"use client";

import React, { useEffect, useRef, useState } from 'react';
import OperationsHeader, { MapCredit } from '../../../components/OperationsHeader';
import { streetStyle, addTrafficLayer } from '../../../components/corridorMap';
import { Navigation, Crosshair, Volume2, VolumeX } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XReceiver,
  ORIGIN_LNG,
  ORIGIN_LAT,
  ROAD_NODES,
  signalArms,
  buildRoadTrafficLinesGeoJSON,
  haversineMeters,
  offsetLngLatPerp,
  twinToRoadGeo,
  vehicleToRoadGeo,
} from '../../../hooks/useV2XSync';

if (typeof window !== 'undefined' && maplibregl.setWorkerUrl) {
  maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
}

// Commuter Phone Presets mapped to real road corridors
const DRIVER_PRESETS = [
  {
    id: 'BRIGADE_APPROACH',
    label: '🚗 Phone 1: Brigade Rd (In Front of Amb A)',
    roadName: 'Brigade Road (South Approach)',
    corridorId: 'BRIGADE_ROAD',
    laneSide: 'Northbound Lane (toward J0 Signal)',
    lngLat: ROAD_NODES.BRIGADE_CHUR,
    type: 'N',
    initX: 2.2,
    initZ: 28.0,
    pullOverPerp: 4.8,
    stopLine: 11.0,
    yieldSide: 'PULL LEFT ON BRIGADE RD — CLEAR AMB-A CORRIDOR',
  },
  {
    id: 'KAMARAJ_NORTH',
    label: '🚗 Phone 2: North Lane (Kamaraj Rd — Non-Conflicting)',
    roadName: 'Kamaraj Road (North Approach)',
    corridorId: 'NORTH_LANE',
    laneSide: 'Southbound Lane (toward J0 Signal)',
    lngLat: ROAD_NODES.KAMARAJ_M,
    type: 'S',
    initX: -2.4,
    initZ: -55.0,
    pullOverPerp: -3.4,
    stopLine: -11.0,
    yieldSide: 'MAINTAIN LANE — NORTH LANE CLEAR',
  },
  {
    id: 'MG_METRO',
    label: '🚗 Commuter on M.G. Road (Case 01 AMB-108 Corridor)',
    roadName: 'Mahatma Gandhi Road',
    corridorId: 'MG_ROAD',
    laneSide: 'Eastbound Lane (toward Trinity)',
    lngLat: ROAD_NODES.MG_METRO,
    type: 'E',
    initX: -28.0,
    initZ: -5.5,
    pullOverPerp: -9.0,
    stopLine: -7.0,
    yieldSide: 'PULL LEFT TOWARD CURB — CLEAR M.G. ROAD LANE',
  },
  {
    id: 'CUBBON_DETOUR',
    label: '🚗 Commuter on Cubbon Road (Case 03 AMB-B Detour)',
    roadName: 'Cubbon Road Detour',
    corridorId: 'CUBBON_ROAD',
    laneSide: 'Westbound Lane (toward Central St)',
    lngLat: ROAD_NODES.CUBBON_VEER,
    type: 'W',
    initX: 5.0,
    initZ: -2.2,
    pullOverPerp: -5.0,
    stopLine: 8.0,
    yieldSide: 'YIELD ON CUBBON RD — AMB-B MACRO-DETOUR ACTIVE',
  },
];

function lerpAngleDeg(fromDeg, toDeg, t) {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return (fromDeg + diff * t + 360) % 360;
}

function commuterToRoadGeo(x, z, preset) {
  if (preset.corridorId !== 'CUBBON_ROAD') return vehicleToRoadGeo(x, z, preset.type);
  const { lngLat, bearing } = twinToRoadGeo(x, z, { ambId: 'AMB_B', wpIdx: 2 });
  return { lngLat: offsetLngLatPerp(lngLat, bearing, z * 0.72), bearing };
}

// Top-down rotating civilian car SVG marker
function createCivilianCarElement() {
  const el = document.createElement('div');
  el.style.cssText = 'width:22px;height:22px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:20;';
  el.innerHTML = `
    <div class="car-rotor" style="width:18px;height:18px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.65));">
      <svg width="16" height="22" viewBox="0 0 16 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="1" width="12" height="22" rx="3.5" class="car-body" fill="#cbd5e1" stroke="#0f172a" stroke-width="1.5"/>
        <path d="M3.5 6.5 C3.5 4.5, 12.5 4.5, 12.5 6.5 L11.5 9.5 L4.5 9.5 Z" fill="#0f172a"/>
        <rect x="4" y="15" width="8" height="3" rx="1" fill="#1e293b"/>
        <rect x="3" y="21.2" width="3" height="1.5" rx="0.5" class="car-brake" fill="#64748b"/>
        <rect x="10" y="21.2" width="3" height="1.5" rx="0.5" class="car-brake" fill="#64748b"/>
      </svg>
    </div>
  `;
  return el;
}

// Top-down rotating Commuter ("YOU") car SVG marker
function createDriverCarElement() {
  const el = document.createElement('div');
  el.style.cssText = 'position:absolute;width:44px;height:44px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:45;';
  el.innerHTML = `
    <div class="you-pulse" style="position:absolute;width:40px;height:40px;border-radius:50%;background:rgba(59,130,246,0.22);border:2px solid #3b82f6;"></div>
    <div class="car-rotor" style="width:26px;height:26px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 8px rgba(37,99,235,0.8));">
      <svg width="20" height="28" viewBox="0 0 16 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="2" y="1" width="12" height="22" rx="3.5" fill="#3b82f6" stroke="#ffffff" stroke-width="1.8"/>
        <path d="M3.5 6.5 C3.5 4.5, 12.5 4.5, 12.5 6.5 L11.5 9.5 L4.5 9.5 Z" fill="#020617"/>
        <rect x="4" y="15" width="8" height="3" rx="1" fill="#1e3a8a"/>
      </svg>
    </div>
    <div style="position:absolute;top:-16px;background:#1d4ed8;color:#fff;border:1px solid #93c5fd;font-family:monospace;font-size:8px;font-weight:900;padding:1px 5px;border-radius:4px;white-space:nowrap;">YOU</div>
  `;
  return el;
}

// Top-down rotating Ambulance SVG marker
function create2DAmbulanceElement(label, borderColor, badgeBg) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;width:48px;height:48px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:60;';

  const pulse = document.createElement('div');
  pulse.style.cssText = `
    position:absolute;width:44px;height:44px;border-radius:50%;
    background:${borderColor}33;border:2px solid ${borderColor};
    animation:ambPulseDriver 1.1s infinite ease-out;
  `;

  const rotor = document.createElement('div');
  rotor.className = 'amb-2d-rotor';
  rotor.style.cssText = 'width:34px;height:34px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.7));';
  rotor.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="2" width="20" height="32" rx="5" fill="#ffffff" stroke="${borderColor}" stroke-width="2.5"/>
      <path d="M10 9 C10 6, 26 6, 26 9 L25 13 L11 13 Z" fill="#0f172a"/>
      <rect x="16" y="16" width="4" height="10" rx="1" fill="#ef4444"/>
      <rect x="13" y="19" width="10" height="4" rx="1" fill="#ef4444"/>
      <rect x="11" y="13.2" width="6.5" height="2.2" rx="1" fill="#ef4444"/>
      <rect x="18.5" y="13.2" width="6.5" height="2.2" rx="1" fill="#3b82f6"/>
    </svg>
  `;

  const tag = document.createElement('div');
  tag.style.cssText = `
    position:absolute;top:-18px;white-space:nowrap;
    background:${badgeBg};color:#fff;border:1.5px solid ${borderColor};
    font-family:monospace;font-size:9px;font-weight:900;
    padding:1px 6px;border-radius:4px;box-shadow:0 2px 6px rgba(0,0,0,0.7);
  `;
  tag.className = 'ambulance-marker-label';
  tag.innerText = label;

  wrapper.appendChild(pulse);
  wrapper.appendChild(rotor);
  wrapper.appendChild(tag);
  return wrapper;
}

export default function CivilianDriverPhoneHUD() {
  const { state, sendCommand } = useV2XReceiver();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const trafficStyleRef = useRef('');

  const driverMarkerRef = useRef(null);
  const ambMarkerARef = useRef(null);
  const ambMarkerBRef = useRef(null);
  const carMarkersRef = useRef(new Map());
  const signalMarkersRef = useRef({});

  // Smooth 60fps animation targets & current interpolated positions
  const animTargetsRef = useRef({
    cars: new Map(), // id -> { targetLngLat, curLngLat, targetBearing, curBearing, state, ble }
    ambA: { targetLngLat: null, curLngLat: null, targetBearing: 0, curBearing: 0, visible: true },
    ambB: { targetLngLat: null, curLngLat: null, targetBearing: 0, curBearing: 0, visible: false },
    driver: { lngLat: DRIVER_PRESETS[0].lngLat, bearing: 0, x: DRIVER_PRESETS[0].initX, z: DRIVER_PRESETS[0].initZ, speed: 0 },
  });

  const [presetIdx, setPresetIdx] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [followMe, setFollowMe] = useState(true);
  const [mapReady, setMapReady] = useState(false);
  const [mapUnavailable, setMapUnavailable] = useState(false);
  const [driverLiveLngLat, setDriverLiveLngLat] = useState(DRIVER_PRESETS[0].lngLat);
  const lastSpokenAlertRef = useRef(false);

  const activePreset = DRIVER_PRESETS[presetIdx] || DRIVER_PRESETS[0];
  const stateRef = useRef(state);
  const presetRef = useRef(activePreset);
  const followMeRef = useRef(followMe);

  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => {
    presetRef.current = activePreset;
    const geo = commuterToRoadGeo(activePreset.initX, activePreset.initZ, activePreset);
    animTargetsRef.current.driver = {
      ...geo,
      x: activePreset.initX,
      z: activePreset.initZ,
      speed: 0,
    };
    setDriverLiveLngLat(geo.lngLat);
  }, [activePreset]);
  useEffect(() => { followMeRef.current = followMe; }, [followMe]);

  const single = state.selectedCase === 1;
  const handoff = state.selectedCase === 2 ? state.case2 : null;
  const running = handoff ? handoff.isSimulationRunning : single ? state.case1?.isSimulationRunning :
    state.case3?.isSimulationRunning && !state.case3?.trafficCycleActive;
  const posA = handoff?.east?.position ?? (single ? state.case1?.ambulancePosition : state.case3?.ambulanceA?.position);
  const posB = handoff?.north?.position ?? state.case3?.ambulanceB?.position;
  const leg = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
  const geoA = handoff?.east ?? twinToRoadGeo(posA?.x, posA?.z, { ambId: single ? 'AMB_1' : 'AMB_A' });
  const geoB = handoff?.north ?? (single ? null : twinToRoadGeo(posB?.x, posB?.z, { ambId: 'AMB_B', wpIdx: leg }));
  const cubbon = state.selectedCase === 3 && activePreset.corridorId === 'CUBBON_ROAD';
  const onAvenue = activePreset.corridorId === 'MG_ROAD';
  const onBrigade = activePreset.corridorId === 'BRIGADE_ROAD';
  const tracksSecond = cubbon || Boolean(handoff && onBrigade);
  const sameCorridor = handoff ? onAvenue || onBrigade : single ? onAvenue : onBrigade || (cubbon && leg === 2);
  const driver = animTargetsRef.current.driver;
  const hasPassed = handoff ? (onBrigade ? posB?.z <= driver.z - 4 : posA?.x > driver.x + 5) :
    single ? posA?.x > driver.x + 5 :
    cubbon ? leg > 2 || (leg === 2 && posB?.x <= driver.x - 4) : posA?.z <= driver.z - 4;
  const passedHere = running && (sameCorridor || cubbon) && hasPassed;
  const unitName = handoff ? (tracksSecond ? 'Northbound ambulance' : 'Eastbound ambulance') :
    state.dispatch?.units?.[tracksSecond ? 1 : 0]?.vehicleId || (single ? 'Ambulance 108' : cubbon ? 'Unit B' : 'Unit A');
  const distanceMeters = Math.round(haversineMeters(driverLiveLngLat, (tracksSecond ? geoB : geoA).lngLat));
  const isEmergencyNear = Boolean(running && sameCorridor && !hasPassed && distanceMeters <= 260);
  const subBanner = passedHere ? 'The unit has cleared your position. Resume when the signal permits.' :
    sameCorridor ? unitName + ' is ' + distanceMeters + ' m behind you.' : 'The response unit is on another approach.';

  const isEmergencyNearRef = useRef(isEmergencyNear);
  useEffect(() => { isEmergencyNearRef.current = isEmergencyNear; }, [isEmergencyNear]);

  // Web Speech API Voice Alert
  useEffect(() => {
    if (!voiceEnabled || typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    if (isEmergencyNear && !lastSpokenAlertRef.current) {
      lastSpokenAlertRef.current = true;
      try {
        window.speechSynthesis.cancel();
        const utter = new SpeechSynthesisUtterance(
          `Emergency Alert! ${unitName} approaching ${distanceMeters} meters behind you. ${activePreset.yieldSide}.`
        );
        utter.rate = 1.05;
        window.speechSynthesis.speak(utter);
      } catch (_) {}
    } else if (!isEmergencyNear) {
      lastSpokenAlertRef.current = false;
    }
  }, [isEmergencyNear, distanceMeters, unitName, activePreset.yieldSide, voiceEnabled]);

  // ── Initialize 2D Google Map + 60fps Marker Animation Loop ──
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const initialCenter = presetRef.current.lngLat;
    const carMarkers = carMarkersRef.current;
    let map;
    try {
      map = new maplibregl.Map({
        container: mapContainerRef.current,
        style: streetStyle,
        center: initialCenter,
        zoom: 17.8,
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        attributionControl: false,
      });
    } catch {
      setMapUnavailable(true);
      return;
    }
    map.setMaxBounds([[77.597, 12.97], [77.615, 12.982]]);
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();

    map.on('style.load', () => {
      mapLoadedRef.current = true;

      addTrafficLayer(map, 'driver-traffic-lines', buildRoadTrafficLinesGeoJSON(stateRef.current));

      signalArms.forEach((sig) => {
        const el = document.createElement('div');
        el.className = 'junction-signal';
        el.title = sig.arm + ' approach';
        const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat(sig.lngLat).addTo(map);
        signalMarkersRef.current[sig.arm] = { marker: m, el };
      });

      // Commuter Phone Marker ("YOU")
      const drvEl = createDriverCarElement();
      driverMarkerRef.current = new maplibregl.Marker({ element: drvEl, anchor: 'center' })
        .setLngLat(initialCenter)
        .addTo(map);

      // Ambulance A Marker (Cyan/Red)
      const ambAEl = create2DAmbulanceElement('AMB-A', '#ef4444', '#450a0a');
      ambMarkerARef.current = new maplibregl.Marker({ element: ambAEl, anchor: 'center' })
        .setLngLat(ROAD_NODES.ANIL_KUMBLE)
        .addTo(map);

      // Ambulance B Marker (Amber - Case 03)
      const ambBEl = create2DAmbulanceElement('AMB-B', '#f59e0b', '#451a03');
      ambBEl.style.display = 'none';
      ambMarkerBRef.current = new maplibregl.Marker({ element: ambBEl, anchor: 'center' })
        .setLngLat(ROAD_NODES.MG_CARIAPPA)
        .addTo(map);
      setMapReady(true);
    });

    mapRef.current = map;

    // ── 60fps Smooth Interpolation & Commuter Kinematics Loop ──
    let rafId = null;
    let lastTs = performance.now();
    let lastDistUiSync = 0;

    const animate = (now) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      if (mapLoadedRef.current) {
        const targets = animTargetsRef.current;
        const t = 1 - Math.exp(-dt * 12);

        // 1. Interpolate all civilian cars smoothly
        targets.cars.forEach((entry, id) => {
          const markerObj = carMarkersRef.current.get(id);
          if (!markerObj) return;

          if (Math.abs(entry.curLngLat[0] - entry.targetLngLat[0]) < 1e-8 &&
              Math.abs(entry.curLngLat[1] - entry.targetLngLat[1]) < 1e-8 &&
              Math.abs(((entry.targetBearing - entry.curBearing + 540) % 360) - 180) < 0.1) return;

          entry.curLngLat = [
            entry.curLngLat[0] + (entry.targetLngLat[0] - entry.curLngLat[0]) * t,
            entry.curLngLat[1] + (entry.targetLngLat[1] - entry.curLngLat[1]) * t,
          ];
          entry.curBearing = lerpAngleDeg(entry.curBearing, entry.targetBearing, t);

          markerObj.marker.setLngLat(entry.curLngLat);
          if (markerObj.rotor) {
            markerObj.rotor.style.transform = `rotate(${entry.curBearing}deg)`;
          }
        });

        // 2. Interpolate Ambulance A & B
        const updateAmb = (ambObj, markerRef) => {
          if (!markerRef.current || !ambObj.targetLngLat) return;
          const el = markerRef.current.getElement();
          el.style.display = ambObj.visible ? 'flex' : 'none';
          if (!ambObj.visible) return;

          if (!ambObj.curLngLat) ambObj.curLngLat = [...ambObj.targetLngLat];
          ambObj.curLngLat = [
            ambObj.curLngLat[0] + (ambObj.targetLngLat[0] - ambObj.curLngLat[0]) * t,
            ambObj.curLngLat[1] + (ambObj.targetLngLat[1] - ambObj.curLngLat[1]) * t,
          ];
          ambObj.curBearing = lerpAngleDeg(ambObj.curBearing, ambObj.targetBearing, t);
          markerRef.current.setLngLat(ambObj.curLngLat);
          const rotor = el.querySelector('.amb-2d-rotor');
          if (rotor) rotor.style.transform = `rotate(${ambObj.curBearing}deg)`;
        };

        updateAmb(targets.ambA, ambMarkerARef);
        updateAmb(targets.ambB, ambMarkerBRef);

        // 3. Animate Commuter ("YOU") Car realistically along its road
        const st = stateRef.current;
        const p = presetRef.current;
        const drv = targets.driver;
        const sig = st.signals || {};
        const isFrozen = (st.selectedCase === 2 ? st.case2 : st.selectedCase === 1 ? st.case1 : st.case3)?.isFrozen;

        if (!isFrozen) {
          const onCubbon = p.corridorId === 'CUBBON_ROAD';
          const isGreen = onCubbon || (
            p.type === 'N' ? Boolean(sig.nGreen) :
            p.type === 'S' ? Boolean(sig.sGreen) :
            p.type === 'E' ? Boolean(sig.eGreen) : Boolean(sig.wGreen));

          const eastWest = p.type === 'E' || p.type === 'W';
          const axisVal = eastWest ? drv.x : drv.z;
          const sign = (p.type === 'E' || p.type === 'S') ? 1 : -1;
          const distStop = (p.stopLine - axisVal) * sign;
          const inJunc = !onCubbon && drv.x > -5 && drv.x < 3.5 && drv.z > -9.5 && drv.z < 9.5;

          let targetSpd = 0;
          let targetPerp = eastWest ? p.initZ : p.initX;

          if (isEmergencyNearRef.current) {
            targetSpd = 0;
            targetPerp = p.pullOverPerp; // Pull over to curb!
          } else if (inJunc || isGreen || distStop < 0 || distStop > 18) {
            targetSpd = 5.5;
          } else if (distStop > 2) {
            targetSpd = 5.5 * Math.max(0, Math.min(1, distStop / 18));
          }

          drv.speed += (targetSpd - drv.speed) * Math.min(1, dt * 4.5);
          const step = !isGreen && !inJunc && distStop >= 0
            ? Math.min(drv.speed * dt, Math.max(0, distStop - 1))
            : drv.speed * dt;
          if (eastWest) {
            drv.x += step * sign;
            drv.z += (targetPerp - drv.z) * Math.min(1, dt * 2.5);
            if (onCubbon && drv.x < -87) drv.x = 47;
            else if (drv.x > 65) drv.x = -65;
          } else {
            drv.z += step * sign;
            drv.x += (targetPerp - drv.x) * Math.min(1, dt * 2.5);
            if (drv.z < -65) drv.z = 65;
            if (drv.z > 65) drv.z = -65;
          }

          const dGeo = commuterToRoadGeo(drv.x, drv.z, p);
          drv.lngLat = dGeo.lngLat;
          drv.bearing = dGeo.bearing;
        }

        if (driverMarkerRef.current) {
          driverMarkerRef.current.setLngLat(drv.lngLat);
          const el = driverMarkerRef.current.getElement();
          const rotor = el.querySelector('.car-rotor');
          if (rotor) rotor.style.transform = `rotate(${drv.bearing}deg)`;
          const pulse = el.querySelector('.you-pulse');
          if (pulse) {
            pulse.style.borderColor = isEmergencyNearRef.current ? '#ef4444' : '#3b82f6';
            pulse.style.background = isEmergencyNearRef.current ? 'rgba(239,68,68,0.28)' : 'rgba(59,130,246,0.22)';
          }
        }

        if (followMeRef.current && mapRef.current &&
            haversineMeters(map.getCenter().toArray(), drv.lngLat) > 0.15) {
          mapRef.current.setCenter(drv.lngLat);
        }

        // Throttle React distance pill updates to ~5Hz
        if (now - lastDistUiSync > 200) {
          lastDistUiSync = now;
          setDriverLiveLngLat([...drv.lngLat]);
        }
      }

      rafId = requestAnimationFrame(animate);
    };

    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      carMarkers.forEach((m) => m.marker.remove());
      carMarkers.clear();
      mapLoadedRef.current = false;
      trafficStyleRef.current = '';
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Sync Telemetry State -> Animation Targets, Signal Dots & Traffic Lines ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const targets = animTargetsRef.current;

    // 1. Update Civilian Vehicle Pool
    const incomingVehicles = state.vehicles || [];
    const activeIds = new Set();

    incomingVehicles.forEach((veh) => {
      if (!veh.lngLat) return;
      activeIds.add(veh.id);

      if (!carMarkersRef.current.has(veh.id)) {
        const el = createCivilianCarElement();
        el.classList.add('civilian-marker');
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(veh.lngLat)
          .addTo(map);
        carMarkersRef.current.set(veh.id, {
          marker,
          rotor: el.querySelector('.car-rotor'),
          body: el.querySelector('.car-body'),
          brakes: el.querySelectorAll('.car-brake'),
        });
        targets.cars.set(veh.id, {
          targetLngLat: veh.lngLat,
          curLngLat: [...veh.lngLat],
          targetBearing: veh.bearing || 0,
          curBearing: veh.bearing || 0,
        });
      } else {
        const entry = targets.cars.get(veh.id);
        if (haversineMeters(entry.targetLngLat, veh.lngLat) > 80) {
          entry.curLngLat = [...veh.lngLat];
          entry.curBearing = veh.bearing || 0;
          carMarkersRef.current.get(veh.id).marker.setLngLat(entry.curLngLat);
        }
        entry.targetLngLat = veh.lngLat;
        entry.targetBearing = veh.bearing || 0;
      }

      const marker = carMarkersRef.current.get(veh.id);
      const braking = veh.state === 'IDLE_QUEUE' || veh.state === 'SLOWING_FORWARD';
      const bodyColor = veh.ble ? '#34d399' : braking ? '#cbd5e1' : '#e2e8f0';
      const brakeColor = veh.ble ? '#facc15' : braking ? '#ef4444' : '#64748b';
      if (marker.body?.getAttribute('fill') !== bodyColor) marker.body?.setAttribute('fill', bodyColor);
      marker.brakes.forEach(light => { if (light.getAttribute('fill') !== brakeColor) light.setAttribute('fill', brakeColor); });
      const heading = `rotate(${targets.cars.get(veh.id).curBearing}deg)`;
      if (marker.rotor && marker.rotor.style.transform !== heading) marker.rotor.style.transform = heading;
    });

    // Remove stale cars when switching cases
    carMarkersRef.current.forEach((obj, id) => {
      if (!activeIds.has(id)) {
        obj.marker.remove();
        carMarkersRef.current.delete(id);
        targets.cars.delete(id);
      }
    });

    // 2. Update Ambulance Targets
    const labelA = ambMarkerARef.current?.getElement().querySelector('.ambulance-marker-label');
    const labelB = ambMarkerBRef.current?.getElement().querySelector('.ambulance-marker-label');
    if (labelA) labelA.textContent = state.selectedCase === 2 ? 'Eastbound' : state.selectedCase === 1 ? 'AMB-108' : 'AMB-A';
    if (labelB) labelB.textContent = state.selectedCase === 2 ? 'Northbound' : 'AMB-B';
    if (geoA?.lngLat) {
      if (targets.ambA.targetLngLat && haversineMeters(targets.ambA.targetLngLat, geoA.lngLat) > 80) {
        targets.ambA.curLngLat = null;
        targets.ambA.curBearing = geoA.bearing;
      }
      targets.ambA.targetLngLat = geoA.lngLat;
      targets.ambA.targetBearing = geoA.bearing || 0;
      targets.ambA.visible = true;
    }
    if (geoB?.lngLat) {
      if (!targets.ambB.visible ||
          (targets.ambB.targetLngLat && haversineMeters(targets.ambB.targetLngLat, geoB.lngLat) > 80)) {
        targets.ambB.curLngLat = null;
        targets.ambB.curBearing = geoB.bearing;
      }
      targets.ambB.targetLngLat = geoB.lngLat;
      targets.ambB.targetBearing = geoB.bearing || 0;
      targets.ambB.visible = true;
    } else {
      targets.ambB.visible = false;
    }

    // 3. Update 4-Way Signal Indicators
    const sig = state.signals || {};
    const armStates = {
      N: { green: sig.sGreen, yellow: sig.sYellow },
      S: { green: sig.nGreen, yellow: sig.nYellow },
      E: { green: sig.wGreen, yellow: sig.wYellow },
      W: { green: sig.eGreen, yellow: sig.eYellow },
    };
    Object.entries(armStates).forEach(([arm, st]) => {
      const item = signalMarkersRef.current[arm];
      if (!item) return;
      const col = st.green ? '#22c55e' : st.yellow ? '#facc15' : '#ef4444';
      item.el.style.background = col;
      item.el.title = arm + (st.green ? " · Open" : st.yellow ? " · Changing" : " · Hold");
    });

    // 4. Update Dynamic Road Traffic Lines
    const src = map.getSource('driver-traffic-lines');
    const traffic = buildRoadTrafficLinesGeoJSON(state);
    const styleKey = traffic.features.map(({ properties }) => `${properties.id}:${properties.color}`).join('|');
    if (src && styleKey !== trafficStyleRef.current) {
      src.setData(traffic);
      trafficStyleRef.current = styleKey;
    }
  }, [state, mapReady, geoA?.lngLat, geoA?.bearing, geoB?.lngLat, geoB?.bearing]);

  const road = ['Brigade Road', 'Kamaraj Road', 'Mahatma Gandhi Road', 'Cubbon Road'][presetIdx];
  const direction = { N: 'Northbound', S: 'Southbound', E: 'Eastbound', W: 'Westbound' }[activePreset.type];
  const notice = isEmergencyNear ? 'Move to the curb' : passedHere ? 'Ambulance has passed' :
    running ? 'Monitoring your lane' : 'Lane clear';
  const toggleCamera = () => {
    const next = !followMe;
    setFollowMe(next);
    if (next) {
      mapRef.current?.setZoom(17.8);
      mapRef.current?.setCenter(driverLiveLngLat);
    } else {
      mapRef.current?.flyTo({ center: [ORIGIN_LNG, ORIGIN_LAT], zoom: 17, duration: 350 });
    }
  };
  return <main className="operations map-workspace">
    <OperationsHeader active="/driver" />
    <div className="map-layout">
      <aside className="route-panel">
        <div className="route-heading">
          <span className="kicker"><span className="index-rule"/> Commuter map</span>
          <h1>{road}</h1><p><Navigation size={15}/> {direction} <span className="middot">/</span> Central Bengaluru</p>
        </div>
        <section className={'advisory ' + (isEmergencyNear ? 'urgent' : '')} aria-live="polite">
          <div><i className="status-dot"/><strong>{notice}</strong></div>
          <p>{running ? subBanner : handoff?.phaseLabel || 'Monitoring the corridor for approaching ambulances.'}</p>
        </section>
        <div className="drive-controls">
          <div className="readings"><div><small>Traffic feed</small><strong><i className="status-dot"/>{state.isStandaloneFallback ? 'Standalone' : 'Twin live'}</strong></div>
            <div><small>Vehicles</small><strong>{state.vehicles?.length || 0}</strong></div>
            <div><small>Scenario</small><strong>0{state.selectedCase}</strong></div></div>
          <label className="field">Commuter road<select aria-label="Commuter road" value={presetIdx}
            onChange={e => setPresetIdx(Number(e.target.value))}>
            {['Brigade Road · Northbound','Kamaraj Road · Southbound','M.G. Road · Eastbound','Cubbon Road · Westbound'].map((name,i) => <option key={name} value={i}>{name}</option>)}
          </select></label>
          <div className="action-row">
            <button className="icon-action" aria-label="Voice alerts" aria-pressed={voiceEnabled} onClick={() => setVoiceEnabled(!voiceEnabled)}>{voiceEnabled ? <Volume2 size={18}/> : <VolumeX size={18}/>}</button>
            <button
              type="button"
              className="demo-toggle"
              aria-pressed={Boolean(state.demoMode)}
              onClick={() => sendCommand('SET_DEMO_MODE', { enabled: !state.demoMode })}
            >
              Demo mode: {state.demoMode ? 'On' : 'Off'}
            </button>
          </div>
          {(state.demoMode || state.selectedCase === 2) && (
            <div className="action-row">
              <button
                type="button"
                className="primary-action"
                disabled={state.selectedCase === 2 ? Boolean(handoff?.isSimulationRunning) : Boolean(running)}
                onClick={() => sendCommand(state.selectedCase === 2 ? 'DISPATCH_CASE2' : 'DISPATCH_DEMO', { caseId: state.selectedCase })}
              >
                {state.selectedCase === 2
                  ? (handoff?.phase === 'complete' ? 'Run handoff again' : handoff?.isSimulationRunning ? 'Handoff running' : 'Run handoff')
                  : running ? 'Demo running' : (state.selectedCase === 3 && state.case3?.trafficCycleActive) ? 'Run demo again' : 'Run demo'}
              </button>
              {(state.selectedCase === 2 ? Boolean(handoff?.isSimulationRunning) : Boolean(state.case1?.isSimulationRunning || state.case3?.isSimulationRunning)) && (
                <button
                  type="button"
                  className="queue-secondary"
                  onClick={() => sendCommand('FREEZE')}
                >
                  {(state.selectedCase === 2 ? handoff?.isFrozen : state.selectedCase === 1 ? state.case1?.isFrozen : state.case3?.isFrozen) ? 'Resume' : 'Pause'}
                </button>
              )}
              {(state.selectedCase === 2 ? (handoff?.phase && handoff.phase !== 'ready') : Boolean(state.case1?.isSimulationRunning || state.case3?.isSimulationRunning)) && (
                <button
                  type="button"
                  className="queue-secondary"
                  onClick={() => sendCommand('RESET_DEMO')}
                >
                  Reset
                </button>
              )}
            </div>
          )}
          <label className="field">Scenario<select value={state.selectedCase} onChange={e => sendCommand('SWITCH_CASE', { caseId: Number(e.target.value) })}>
            <option value={1}>01 · Priority corridor</option>
            <option value={2}>02 · Priority handoff</option>
            <option value={3}>03 · Dual response</option>
          </select></label>
        </div>
      </aside>
      <section className="map-stage" aria-label="Live commuter map"><div className="map-canvas" ref={mapContainerRef}/>
        <div className="map-key"><span><i/>Open</span><span><i/>Hold</span><span><i/>Changing</span></div>
        {mapUnavailable && <p className="map-error" role="status">This map needs WebGL. Traffic alerts and controls are available.</p>}
        <div className="map-tools"><button aria-label={followMe ? 'Show junction' : 'Follow commuter'} aria-pressed={followMe} onClick={toggleCamera}>
          {followMe ? <Crosshair size={16}/> : <Navigation size={16}/>} {followMe ? 'Junction view' : 'Follow me'}</button></div>
        <MapCredit/>
      </section>
    </div>
  </main>;
}
