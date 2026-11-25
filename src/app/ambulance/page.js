// src/app/ambulance/page.js
"use client";

import React, { useEffect, useRef, useState } from 'react';
import CoordinationQueue from '../../../components/CoordinationQueue';
import OperationsHeader, { MapCredit } from '../../../components/OperationsHeader';
import { streetStyle, addTrafficLayer } from '../../../components/corridorMap';
import { Crosshair, Radio, Layers } from 'lucide-react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  useV2XReceiver,
  ORIGIN_LNG,
  ORIGIN_LAT,
  ROAD_NODES,
  signalArms,
  buildRoadTrafficLinesGeoJSON,
  twinToRoadGeo,
  haversineMeters,
} from '../../../hooks/useV2XSync';

if (typeof window !== 'undefined') {
  window.maplibregl = maplibregl;
  if (maplibregl.setWorkerUrl) {
    maplibregl.setWorkerUrl('/maplibre/maplibre-gl-worker.mjs');
  }
}

// ── Free Google Maps 2D Tile Style (Streets, Hybrid Satellite, Pure Satellite) ──
const GOOGLE_2D_MAP_STYLE = {
  ...streetStyle,
  sources: {
    ...streetStyle.sources,
    'google-streets': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,
      attribution: '© Google Maps',
    },
    'google-hybrid': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,
      attribution: '© Google Maps Satellite',
    },
    'google-satellite': {
      type: 'raster',
      tiles: [
        'https://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
        'https://mt1.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}',
      ],
      tileSize: 256,
      maxzoom: 21,
      attribution: '© Google Satellite',
    },
  },
  layers: [
    ...streetStyle.layers,
    {
      id: 'google-streets-layer',
      type: 'raster',
      source: 'google-streets',
      layout: { visibility: 'none' },
    },
    {
      id: 'google-hybrid-layer',
      type: 'raster',
      source: 'google-hybrid',
      layout: { visibility: 'none' },
    },
    {
      id: 'google-satellite-layer',
      type: 'raster',
      source: 'google-satellite',
      layout: { visibility: 'none' },
    },
  ],
};

// ── Clean 2D Top-Down Ambulance SVG Icon (Rotates 100% along Road Bearing) ──
function create2DAmbulanceElement(label, borderColor, badgeBg) {
  const wrapper = document.createElement('div');
  wrapper.style.cssText = 'position:absolute;width:54px;height:54px;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:60;';

  const pulse = document.createElement('div');
  pulse.style.cssText = `
    position:absolute;width:50px;height:50px;border-radius:50%;
    background:${borderColor}33;border:2px solid ${borderColor};
    animation:ambPulse2D 1.1s infinite ease-out;
  `;

  const rotor = document.createElement('div');
  rotor.className = 'amb-2d-rotor';
  rotor.style.cssText = 'width:38px;height:38px;display:flex;align-items:center;justify-content:center;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.65));';
  rotor.innerHTML = `
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
      <!-- White 2D Top-Down Ambulance Chassis Pointing North (0 deg) -->
      <rect x="8" y="2" width="20" height="32" rx="5" fill="#ffffff" stroke="${borderColor}" stroke-width="2.5"/>
      <!-- Front Windshield (North / Top) -->
      <path d="M10 9 C10 6, 26 6, 26 9 L25 13 L11 13 Z" fill="#0f172a"/>
      <!-- Red Emergency Cross on Roof -->
      <rect x="16" y="16" width="4" height="10" rx="1" fill="#ef4444"/>
      <rect x="13" y="19" width="10" height="4" rx="1" fill="#ef4444"/>
      <!-- Flashing Roof Lightbar -->
      <rect x="11" y="13.2" width="6.5" height="2.2" rx="1" fill="#ef4444"/>
      <rect x="18.5" y="13.2" width="6.5" height="2.2" rx="1" fill="#3b82f6"/>
    </svg>
  `;

  const tag = document.createElement('div');
  tag.style.cssText = `
    position:absolute;top:-22px;white-space:nowrap;
    background:${badgeBg};color:#fff;border:1.5px solid ${borderColor};
    font-family:monospace;font-size:10px;font-weight:900;
    padding:2px 7px;border-radius:5px;letter-spacing:0.6px;
    box-shadow:0 2px 8px rgba(0,0,0,0.7);
  `;
  tag.className = 'ambulance-marker-label';
  tag.innerText = label;

  wrapper.appendChild(pulse);
  wrapper.appendChild(rotor);
  wrapper.appendChild(tag);
  return wrapper;
}

function lerpAngleDeg(fromDeg, toDeg, t) {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return (fromDeg + diff * t + 360) % 360;
}

export default function AmbulanceSatelliteCockpit() {
  const { state, sendCommand, startDispatch } = useV2XReceiver();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const lastTrafficStyle = useRef('');
  const hadHandoffVehiclesRef = useRef(false);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const amb1MarkerRef = useRef(null);
  const ambAMarkerRef = useRef(null);
  const ambBMarkerRef = useRef(null);
  const signalMarkersRef = useRef({});
  const waypointMarkersRef = useRef([]);
  const animTargetsRef = useRef({
    amb1: { targetLngLat: null, curLngLat: null, targetBearing: 0, curBearing: 0, visible: false },
    ambA: { targetLngLat: null, curLngLat: null, targetBearing: 0, curBearing: 0, visible: false },
    ambB: { targetLngLat: null, curLngLat: null, targetBearing: 0, curBearing: 0, visible: false },
  });

  const [activeUnit, setActiveUnit] = useState('AMB_B'); // 'AMB_1' | 'AMB_A' | 'AMB_B'
  const [cameraMode, setCameraMode] = useState('OVERVIEW'); // 'OVERVIEW' | 'FOLLOW' | 'JUNCTION' | 'FREE'
  const [mapStyleMode, setMapStyleMode] = useState('STREETS'); // 'STREETS' | 'HYBRID' | 'SATELLITE'
  const effectiveUnit = state.selectedCase === 1 ? 'AMB_1'
    : activeUnit === 'AMB_1' ? (state.selectedCase === 2 ? 'AMB_A' : 'AMB_B') : activeUnit;
  const stateRef = useRef(state);
  const cameraModeRef = useRef(cameraMode);
  const activeUnitRef = useRef(effectiveUnit);
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { cameraModeRef.current = cameraMode; }, [cameraMode]);
  useEffect(() => { activeUnitRef.current = effectiveUnit; }, [effectiveUnit]);

  useEffect(() => {
    if (state.selectedCase === 1 && activeUnit !== 'AMB_1') {
      setActiveUnit('AMB_1');
    } else if (state.selectedCase !== 1 && activeUnit === 'AMB_1') {
      setActiveUnit(state.selectedCase === 2 ? 'AMB_A' : 'AMB_B');
    }
  }, [state.selectedCase, activeUnit]);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.target?.closest?.('input, textarea, select, dialog, [contenteditable]')) return;
      if (e.code === 'KeyF') {
        sendCommand('FREEZE');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [sendCommand]);

  // ── Initialize Pure 2D Top-Down Google Map (pitch: 0, bearing: 0) ──
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    let map;
    try { map = new maplibregl.Map({
      container: mapContainerRef.current,
      style: GOOGLE_2D_MAP_STYLE,
      center: [77.6055, 12.9765],
      zoom: 15.6,
      pitch: 0,
      bearing: 0,
      maxPitch: 0, // Lock strictly to 2D Top-Down so roads and ambulances never distort
      attributionControl: false,
    });

    } catch { setMapError(true); return; }
    map.dragRotate.disable();
    map.touchZoomRotate.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
    if (typeof window !== 'undefined') {
      window.__SEMTOS_MAP__ = map;
    }

    map.on('style.load', () => {
      // ── Dynamic Red-to-Green Traffic Corridor Lines Source & Layers ──
      addTrafficLayer(map, 'traffic-corridor-lines', buildRoadTrafficLinesGeoJSON(stateRef.current));
      map.addSource('handoff-vehicles', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
      map.addLayer({
        id: 'handoff-vehicles', type: 'circle', source: 'handoff-vehicles',
        paint: {
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 15, 1.5, 18, 3.5],
          'circle-color': ['case', ['get', 'yielding'], '#d9901c', '#425f70'],
          'circle-stroke-color': '#fffdf5', 'circle-stroke-width': 0.7,
        },
      });

      signalArms.forEach((sig) => {
        const el = document.createElement('div');
        el.className = 'junction-signal';
        el.title = sig.arm + ' approach';
        const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat(sig.lngLat)
          .addTo(map);
        signalMarkersRef.current[sig.arm] = { marker, el };
      });

      // ── Case 03 Waypoint Badges on the Exact Real-Road Intersections ──
      const wps = [
        { id: 'WP1', idx: 1, label: 'WP1: KAMARAJ RD TURN',     lngLat: ROAD_NODES.J0_BRIGADE, color: '#f59e0b' },
        { id: 'WP2', idx: 2, label: 'WP2: CUBBON RD TURN',      lngLat: ROAD_NODES.CUBBON_KAM, color: '#38bdf8' },
        { id: 'WP3', idx: 3, label: 'WP3: CENTRAL ST TURN',     lngLat: ROAD_NODES.CUBBON_CENT, color: '#38bdf8' },
        { id: 'WP4', idx: 4, label: 'WP4: ANIL KUMBLE REJOIN',  lngLat: ROAD_NODES.ANIL_KUMBLE, color: '#22c55e' },
      ];

      wps.forEach((wp) => {
        const el = document.createElement('div');
        el.className = 'map-waypoint';
        el.title = wp.label;
        el.textContent = String(wp.idx);
        const m = new maplibregl.Marker({ element: el, anchor: 'bottom', offset: [0, -10] })
          .setLngLat(wp.lngLat)
          .addTo(map);
        waypointMarkersRef.current.push({ marker: m, el, idx: wp.idx, label: wp.label });
      });

      // ── Create 2D Top-Down Ambulance Markers ──
      const el1 = create2DAmbulanceElement('AMB-108 (M.G. ROAD)', '#22c55e', '#052e16');
      amb1MarkerRef.current = new maplibregl.Marker({ element: el1, anchor: 'center' })
        .setLngLat(ROAD_NODES.ANIL_KUMBLE)
        .addTo(map);

      const elA = create2DAmbulanceElement('AMB-A (BRIGADE RD)', '#3b82f6', '#172554');
      ambAMarkerRef.current = new maplibregl.Marker({ element: elA, anchor: 'center' })
        .setLngLat(ROAD_NODES.BRIGADE_RES)
        .addTo(map);

      const elB = create2DAmbulanceElement('AMB-B (REROUTE)', '#f59e0b', '#451a03');
      ambBMarkerRef.current = new maplibregl.Marker({ element: elB, anchor: 'center' })
        .setLngLat(ROAD_NODES.MG_CARIAPPA)
        .addTo(map);

      mapLoadedRef.current = true;
      setMapReady(true);
    });

    mapRef.current = map;

    let rafId = null;
    let lastTs = performance.now();
    const animate = (now) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;

      if (mapLoadedRef.current) {
        const t = 1 - Math.exp(-dt * 12);
        const targets = animTargetsRef.current;

        const stepAmb = (obj, markerRef) => {
          const marker = markerRef.current;
          if (!marker) return null;
          const el = marker.getElement();
          const wantDisplay = obj.visible ? 'flex' : 'none';
          if (el.style.display !== wantDisplay) el.style.display = wantDisplay;
          if (!obj.visible || !obj.targetLngLat) return null;

          if (!obj.curLngLat) obj.curLngLat = [...obj.targetLngLat];
          obj.curLngLat = [
            obj.curLngLat[0] + (obj.targetLngLat[0] - obj.curLngLat[0]) * t,
            obj.curLngLat[1] + (obj.targetLngLat[1] - obj.curLngLat[1]) * t,
          ];
          obj.curBearing = lerpAngleDeg(obj.curBearing, obj.targetBearing, t);
          marker.setLngLat(obj.curLngLat);
          const rotor = el.querySelector('.amb-2d-rotor');
          if (rotor) rotor.style.transform = `rotate(${obj.curBearing}deg)`;
          return obj.curLngLat;
        };

        const pos1 = stepAmb(targets.amb1, amb1MarkerRef);
        const posA = stepAmb(targets.ambA, ambAMarkerRef);
        const posB = stepAmb(targets.ambB, ambBMarkerRef);

        if (cameraModeRef.current === 'FOLLOW') {
          const unit = activeUnitRef.current;
          const followTarget = unit === 'AMB_1' ? pos1 : unit === 'AMB_A' ? posA : posB;
          if (followTarget && haversineMeters(map.getCenter().toArray(), followTarget) > 0.15) {
            map.setCenter(followTarget);
          }
        }
      }

      rafId = requestAnimationFrame(animate);
    };
    rafId = requestAnimationFrame(animate);

    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      mapLoadedRef.current = false;
      lastTrafficStyle.current = '';
      waypointMarkersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // ── Switch Google Maps 2D Tile Layer (Streets / Hybrid / Pure Satellite) ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;
    try {
      map.setLayoutProperty('landmarks', 'visibility', mapStyleMode === 'STREETS' ? 'visible' : 'none');
      map.setMaxBounds(mapStyleMode === 'STREETS' ? [[77.590, 12.966], [77.622, 12.986]] : null);
      map.setLayoutProperty('street-labels', 'visibility', mapStyleMode === 'STREETS' ? 'visible' : 'none');
      map.moveLayer('traffic-corridor-lines-ink', mapStyleMode === 'STREETS' ? 'street-labels' : 'handoff-vehicles');
      map.setLayoutProperty('google-hybrid-layer', 'visibility', mapStyleMode === 'HYBRID' ? 'visible' : 'none');
      map.setLayoutProperty('google-satellite-layer', 'visibility', mapStyleMode === 'SATELLITE' ? 'visible' : 'none');
    } catch (_) {}
  }, [mapStyleMode, mapReady]);

  // ── Update 2D Traffic Lines, Signal Lights & Road-Snapped 2D Ambulances at 20Hz ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    // 1. Update Dynamic Red-to-Green Traffic Corridor Lines on the Roads
    const trafficSrc = map.getSource('traffic-corridor-lines');
    const traffic = buildRoadTrafficLinesGeoJSON(state);
    const signature = `${state.selectedCase}|${traffic.features.map(f => f.properties.color).join('|')}`;
    if (trafficSrc && signature !== lastTrafficStyle.current) {
      trafficSrc.setData(traffic);
      lastTrafficStyle.current = signature;
    }

    const handoff = state.selectedCase === 2 ? state.case2 : null;
    if (handoff) {
      hadHandoffVehiclesRef.current = true;
      map.getSource('handoff-vehicles')?.setData({
        type: 'FeatureCollection',
        features: (state.vehicles || []).map(vehicle => ({
          type: 'Feature', properties: { yielding: vehicle.ble },
          geometry: { type: 'Point', coordinates: vehicle.lngLat },
        })),
      });
    } else if (hadHandoffVehiclesRef.current) {
      hadHandoffVehiclesRef.current = false;
      map.getSource('handoff-vehicles')?.setData({ type: 'FeatureCollection', features: [] });
    }

    // 2. Show/Hide Case 03 Waypoint Badges & Update Progress Status
    const curWp = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
    const c3Done = Boolean(state.case3?.trafficCycleActive);
    waypointMarkersRef.current.forEach(({ el, idx }) => {
      el.style.display = state.selectedCase === 3 ? 'block' : 'none';
      if (state.selectedCase === 3) {
        const isDone = c3Done || curWp >= idx;
        const isCurrent = !c3Done && curWp === idx - 1;
        el.dataset.state = isDone ? 'passed' : isCurrent ? 'current' : 'pending';
      }
    });

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

    // 4. Feed Smooth 60fps Ambulance Targets
    const targets = animTargetsRef.current;
    const setTarget = (obj, geo, visible) => {
      if (!visible || !geo?.lngLat) {
        obj.visible = false;
        return;
      }
      if (!obj.visible || (obj.targetLngLat && haversineMeters(obj.targetLngLat, geo.lngLat) > 80)) {
        obj.curLngLat = [...geo.lngLat];
        obj.curBearing = geo.bearing || 0;
      }
      obj.targetLngLat = geo.lngLat;
      obj.targetBearing = geo.bearing || 0;
      obj.visible = true;
    };

    if (state.selectedCase === 1) {
      const p1 = state.case1?.ambulancePosition || { x: -120, z: -6.0 };
      const geo1 = twinToRoadGeo(p1.x, p1.z, { ambId: 'AMB_1' });
      setTarget(targets.amb1, geo1, true);
      setTarget(targets.ambA, null, false);
      setTarget(targets.ambB, null, false);
    } else {
      const pA = state.case3?.ambulanceA?.position || { x: 2.2, z: 90 };
      const geoA = handoff?.east ?? (state.selectedCase === 3 ? twinToRoadGeo(pA.x, pA.z, { ambId: 'AMB_A' }) : null);

      const pB = state.case3?.ambulanceB?.position || { x: 90, z: -2.89 };
      const wpB = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
      const geoB = handoff?.north ?? (state.selectedCase === 3 ? twinToRoadGeo(pB.x, pB.z, { ambId: 'AMB_B', wpIdx: wpB }) : null);

      const labelA = ambAMarkerRef.current?.getElement().querySelector('.ambulance-marker-label');
      const labelB = ambBMarkerRef.current?.getElement().querySelector('.ambulance-marker-label');
      if (labelA) labelA.textContent = handoff ? 'Eastbound' : 'AMB-A (BRIGADE RD)';
      if (labelB) labelB.textContent = handoff ? 'Northbound' : 'AMB-B (REROUTE)';

      setTarget(targets.amb1, null, false);
      setTarget(targets.ambA, geoA, Boolean(geoA));
      setTarget(targets.ambB, geoB, Boolean(geoB));
    }
  }, [state, mapReady]);

  const setViewPreset = (mode) => {
    setCameraMode(mode);
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'JUNCTION') {
      map.flyTo({ center: [ORIGIN_LNG, ORIGIN_LAT], zoom: 16.8, pitch: 0, bearing: 0, duration: 500 });
    } else if (mode === 'OVERVIEW') {
      map.flyTo({ center: [77.6062, 12.9762], zoom: 15.6, pitch: 0, bearing: 0, duration: 500 });
    } else if (mode === 'FOLLOW') {
      const targets = animTargetsRef.current;
      const target = effectiveUnit === 'AMB_1' ? targets.amb1.targetLngLat
        : effectiveUnit === 'AMB_A' ? targets.ambA.targetLngLat : targets.ambB.targetLngLat;
      if (target) map.easeTo({ center: target, zoom: 16.3, pitch: 0, bearing: 0, duration: 300 });
    }
  };

  const isCase1 = state.selectedCase === 1;
  const handoff = state.selectedCase === 2 ? state.case2 : null;
  const handoffUnit = handoff && (effectiveUnit === 'AMB_A' ? handoff.east : handoff.north);
  const activeTelemetry = handoffUnit ? {
    dist: Math.round(haversineMeters(handoffUnit.lngLat, [ORIGIN_LNG, ORIGIN_LAT])),
    instruction: handoffUnit.instruction,
  } : isCase1
    ? {
        name: 'AMB-108 (M.G. Road Priority)',
        status: state.signals?.isPreempted
          ? 'GREEN CORRIDOR ACTIVE'
          : state.case1?.isSimulationRunning
          ? 'APPROACHING RED TRAFFIC LINE'
          : 'STANDBY AT ANIL KUMBLE CIRCLE',
        dist: state.case1?.distanceToJunction ?? 120,
        instruction:
          state.case1?.distanceToJunction > 85
            ? 'Red Traffic Line Ahead on M.G. Road — Approaching Preemption Zone'
            : state.case1?.distanceToJunction > 0
            ? 'Signal Preempted! Red Traffic Line Turned GREEN on M.G. Road'
            : 'Junction Cleared — Sequential Traffic Release Active',
        color: state.signals?.isPreempted ? '#22c55e' : '#38bdf8',
      }
    : effectiveUnit === 'AMB_A'
    ? {
        name: 'Ambulance A (Brigade Rd -> Kamaraj Rd)',
        status: state.case3?.ambulanceA?.status || 'IDLE_STANDBY',
        dist: Math.round(state.case3?.ambulanceA?.distanceToJunction ?? 90),
        instruction: 'Proceed Straight North on Brigade Rd -> Kamaraj Rd Green Corridor',
        color: '#3b82f6',
      }
    : {
        name: 'Ambulance B (Kamaraj -> Cubbon -> Anil Kumble Detour)',
        status: state.case3?.ambulanceB?.status || 'IDLE_STANDBY',
        dist: Math.round(
          Math.hypot(
            state.case3?.ambulanceB?.position?.x || 0,
            state.case3?.ambulanceB?.position?.z || 0
          )
        ),
        instruction: state.case3?.ambulanceB?.waypointName || 'Awaiting Dispatch on M.G. Road East',
        color: '#f59e0b',
      };

  const arms = [['North', 's'], ['East', 'w'], ['South', 'n'], ['West', 'e']];
  const leg = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
  const c3Complete = Boolean(state.case3?.trafficCycleActive);
  const isRunning = handoff ? handoff.isSimulationRunning : isCase1 ? state.case1?.isSimulationRunning : state.case3?.isSimulationRunning;
  const title = handoff ? 'Priority handoff' : isCase1 ? 'M.G. Road' : effectiveUnit === 'AMB_A' ? 'Brigade Road' : 'Cubbon detour';
  const unitLabel = handoff ? (effectiveUnit === 'AMB_A' ? 'Eastbound unit' : 'Northbound unit') :
    state.dispatch?.units?.[!isCase1 && effectiveUnit === 'AMB_B' ? 1 : 0]?.vehicleId || (isCase1 ? 'Unit 108' : effectiveUnit === 'AMB_A' ? 'Unit A' : 'Unit B');
  return <main className="operations map-workspace">
    <OperationsHeader active="/ambulance"/>
    <div className="map-layout">
      <aside className="route-panel">
        <div className="route-heading"><span className="kicker"><span className="index-rule"/> Ambulance desk</span>
          <h1>{title}</h1>
          <p><Radio size={15}/>{unitLabel} <span className="middot">/</span> {state.isStandaloneFallback ? 'Standalone' : 'Twin live'}</p>
        </div>
        <section className="advisory"><div><i className="status-dot"/><strong>{handoff?.phaseLabel || (isRunning ? 'Dispatch active' : 'Ready for coordination')}</strong></div>
          <p>{(isRunning || handoff) ? activeTelemetry.instruction : 'Standing by at the start of the corridor.'}</p></section>
        <div className="drive-controls ambulance-controls">
          <div className="readings"><div><small>Junction distance</small><strong>{activeTelemetry.dist} m</strong></div><div><small>Signal priority</small><strong>{state.signals?.isPreempted ? 'Active' : 'Standby'}</strong></div></div>
          <div className="field-row"><label className="field">Scenario<select value={state.selectedCase} onChange={e => sendCommand('SWITCH_CASE', {caseId:Number(e.target.value)})}>
            <option value={1}>01 · Priority corridor</option>
            <option value={2}>02 · Priority handoff</option>
            <option value={3}>03 · Dual response</option></select></label>
            {!isCase1 && <label className="field">Vehicle<select value={effectiveUnit} onChange={e => setActiveUnit(e.target.value)}><option value="AMB_A">{handoff ? "Eastbound" : "Unit A"}</option><option value="AMB_B">{handoff ? "Northbound" : "Unit B"}</option></select></label>}</div>
          <div className="action-row">
            <button
              type="button"
              className="demo-toggle"
              aria-pressed={Boolean(state.demoMode)}
              onClick={() => sendCommand('SET_DEMO_MODE', { enabled: !state.demoMode })}
            >
              Demo mode: {state.demoMode ? 'On · skip intake' : 'Off · hospital queue'}
            </button>
          </div>
          {state.selectedCase === 2 ? (
            <div className="action-row">
              <button type="button" className="primary-action" disabled={Boolean(handoff?.isSimulationRunning)} onClick={() => sendCommand('DISPATCH_CASE2')}>
                {handoff?.phase === 'complete' ? 'Run handoff again' : handoff?.isSimulationRunning ? 'Handoff running' : 'Run handoff simulation'}
              </button>
              {handoff?.isSimulationRunning && (
                <button type="button" className="queue-secondary" onClick={() => sendCommand('FREEZE')}>
                  {handoff.isFrozen ? 'Resume [F]' : 'Pause [F]'}
                </button>
              )}
              {handoff?.phase && handoff.phase !== 'ready' && (
                <button type="button" className="queue-secondary" onClick={() => sendCommand('RESET_DEMO')}>
                  Reset
                </button>
              )}
            </div>
          ) : state.demoMode ? (
            <div className="action-row">
              <button
                type="button"
                className="primary-action"
                disabled={Boolean(isRunning && (state.selectedCase !== 3 || !c3Complete))}
                onClick={() => sendCommand('DISPATCH_DEMO', { caseId: state.selectedCase })}
              >
                {isRunning && (state.selectedCase !== 3 || !c3Complete)
                  ? 'Demo running'
                  : (state.selectedCase === 3 && c3Complete) ? 'Run demo again' : 'Run demo'}
              </button>
              {isRunning && (
                <button type="button" className="queue-secondary" onClick={() => sendCommand('FREEZE')}>
                  {(isCase1 ? state.case1?.isFrozen : state.case3?.isFrozen) ? 'Resume [F]' : 'Pause [F]'}
                </button>
              )}
              {isRunning && (
                <button type="button" className="queue-secondary" onClick={() => sendCommand('RESET_DEMO')}>
                  Reset
                </button>
              )}
            </div>
          ) : (
            <CoordinationQueue className="primary-action" start={startDispatch} currentDispatchId={state.dispatch?.id} busy={isRunning && (state.selectedCase !== 3 || !state.case3?.trafficCycleActive)}/>
          )}
          <details className="signal-detail"><summary>Junction signals</summary><div className="arm-grid">{arms.map(([label, key]) => {
            const phase = state.signals?.[key+'Green'] ? 'Open' : state.signals?.[key+'Yellow'] ? 'Changing' : 'Hold';
            return <div key={key}><span>{label}</span><b data-phase={phase}>{phase}</b></div>;
          })}</div></details>
          {state.selectedCase === 3 && <details className="signal-detail"><summary>Detour progress</summary><ol>{['M.G. Road','Kamaraj Road','Cubbon Road','Central Street','West departure'].map((name,i) =>
            <li key={name} aria-current={!c3Complete && i===leg ? 'step' : undefined}>{name} {(c3Complete || i<leg) ? '· Passed' : i===leg ? '· Current' : ''}</li>)}</ol></details>}
        </div>
      </aside>
      <section className="map-stage" aria-label="Ambulance corridor map"><div ref={mapContainerRef} className="map-canvas"/>
        <div className="map-key"><span><i/>Open</span><span><i/>Hold</span><span><i/>Changing</span></div>
        <div className="map-tools"><label><Crosshair size={15}/><select aria-label="Ambulance camera" value={cameraMode} onChange={e=>setViewPreset(e.target.value)}>
          <option value="OVERVIEW">Overview</option><option value="FOLLOW">Follow unit</option><option value="JUNCTION">Junction</option><option value="FREE">Free pan</option></select></label>
          <label><Layers size={15}/><select aria-label="Map layer" value={mapStyleMode} onChange={e=>setMapStyleMode(e.target.value)}>
            <option value="STREETS">Streets</option><option value="HYBRID">Hybrid</option><option value="SATELLITE">Satellite</option></select></label></div>
        {mapError && <p role="status" className="map-error">This map needs WebGL. Dispatch controls are available.</p>}
        <MapCredit imagery={mapStyleMode !== 'STREETS'}/>
      </section>
    </div>
  </main>;
}
