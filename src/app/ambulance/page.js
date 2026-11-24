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
  rotor.style.cssText = 'width:38px;height:38px;display:flex;align-items:center;justify-content:center;transition:transform 0.06s linear;filter:drop-shadow(0 3px 8px rgba(0,0,0,0.65));';
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
  tag.innerText = label;

  wrapper.appendChild(pulse);
  wrapper.appendChild(rotor);
  wrapper.appendChild(tag);
  return wrapper;
}

export default function AmbulanceSatelliteCockpit() {
  const { state, sendCommand, startDispatch } = useV2XReceiver();
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLoadedRef = useRef(false);
  const lastTrafficStyle = useRef('');
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState(false);

  const amb1MarkerRef = useRef(null);
  const ambAMarkerRef = useRef(null);
  const ambBMarkerRef = useRef(null);
  const signalMarkersRef = useRef({});
  const waypointMarkersRef = useRef([]);

  const [activeUnit, setActiveUnit] = useState('AMB_B'); // 'AMB_1' | 'AMB_A' | 'AMB_B'
  const [cameraMode, setCameraMode] = useState('OVERVIEW'); // 'OVERVIEW' | 'FOLLOW' | 'JUNCTION' | 'FREE'
  const [mapStyleMode, setMapStyleMode] = useState('STREETS'); // 'STREETS' | 'HYBRID' | 'SATELLITE'

  useEffect(() => {
    if (state.selectedCase === 1) {
      setActiveUnit('AMB_1');
    } else if (state.selectedCase === 3 && activeUnit === 'AMB_1') {
      setActiveUnit('AMB_B');
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
      mapLoadedRef.current = true;
      setMapReady(true);

      // ── Dynamic Red-to-Green Traffic Corridor Lines Source & Layers ──
      addTrafficLayer(map, 'traffic-corridor-lines', buildRoadTrafficLinesGeoJSON(state));

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
    });

    mapRef.current = map;
    return () => {
      mapLoadedRef.current = false;
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
      map.setMaxBounds(mapStyleMode === 'STREETS' ? [[77.597,12.97],[77.615,12.982]] : null);
      map.setLayoutProperty('street-labels', 'visibility', mapStyleMode === 'STREETS' ? 'visible' : 'none');
      map.moveLayer('traffic-corridor-lines-ink', mapStyleMode === 'STREETS' ? 'street-labels' : undefined);
      map.setLayoutProperty('google-hybrid-layer', 'visibility', mapStyleMode === 'HYBRID' ? 'visible' : 'none');
      map.setLayoutProperty('google-satellite-layer', 'visibility', mapStyleMode === 'SATELLITE' ? 'visible' : 'none');
    } catch (_) {}
  }, [mapStyleMode, mapReady]);

  // ── Update 2D Traffic Lines, Signal Lights & Road-Snapped 2D Ambulances at 20Hz ──
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoadedRef.current) return;

    // 1. Update Dynamic Red-to-Green Traffic Corridor Lines on the Roads
    const trafficSrc = map.getSource('traffic-corridor-lines');
    const traffic = buildRoadTrafficLinesGeoJSON(state);
    const signature = traffic.features.map(f => f.properties.color).join('|');
    if (trafficSrc && signature !== lastTrafficStyle.current) {
      trafficSrc.setData(traffic);
      lastTrafficStyle.current = signature;
    }

    // 2. Show/Hide Case 03 Waypoint Badges & Update Progress Status
    const curWp = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
    waypointMarkersRef.current.forEach(({ el, idx, label }) => {
      el.style.display = state.selectedCase === 3 ? 'block' : 'none';
      if (state.selectedCase === 3) {
        const isDone = curWp >= idx;
        const isCurrent = curWp === idx - 1;
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

    // 4. Update 2D Ambulance Positions & Exact Road Bearing Rotation
    const set2DRotation = (markerRef, bearingDeg) => {
      const el = markerRef.current?.getElement();
      const rotor = el?.querySelector('.amb-2d-rotor');
      if (rotor) {
        rotor.style.transform = `rotate(${bearingDeg}deg)`;
      }
    };

    if (state.selectedCase === 1) {
      amb1MarkerRef.current.getElement().style.display = 'flex';
      ambAMarkerRef.current.getElement().style.display = 'none';
      ambBMarkerRef.current.getElement().style.display = 'none';

      const p1 = state.case1?.ambulancePosition || { x: -120, z: -6.0 };
      const geo1 = twinToRoadGeo(p1.x, p1.z, { ambId: 'AMB_1' });
      amb1MarkerRef.current.setLngLat(geo1.lngLat);
      set2DRotation(amb1MarkerRef, geo1.bearing);

      if (cameraMode === 'FOLLOW') {
        map.easeTo({ center: geo1.lngLat, zoom: 16.4, pitch: 0, bearing: 0, duration: 120 });
      }
    } else {
      amb1MarkerRef.current.getElement().style.display = 'none';
      ambAMarkerRef.current.getElement().style.display = 'flex';
      ambBMarkerRef.current.getElement().style.display = 'flex';

      const pA = state.case3?.ambulanceA?.position || { x: 2.2, z: 90 };
      const geoA = twinToRoadGeo(pA.x, pA.z, { ambId: 'AMB_A' });

      const pB = state.case3?.ambulanceB?.position || { x: 90, z: -2.89 };
      const wpB = state.case3?.ambulanceB?.currentWaypointIdx ?? 0;
      const geoB = twinToRoadGeo(pB.x, pB.z, { ambId: 'AMB_B', wpIdx: wpB });

      ambAMarkerRef.current.setLngLat(geoA.lngLat);
      set2DRotation(ambAMarkerRef, geoA.bearing);

      ambBMarkerRef.current.setLngLat(geoB.lngLat);
      set2DRotation(ambBMarkerRef, geoB.bearing);

      if (cameraMode === 'FOLLOW') {
        const target = activeUnit === 'AMB_A' ? geoA.lngLat : geoB.lngLat;
        map.easeTo({ center: target, zoom: 16.3, pitch: 0, bearing: 0, duration: 120 });
      }
    }
  }, [state, activeUnit, cameraMode, mapReady]);

  const setViewPreset = (mode) => {
    setCameraMode(mode);
    const map = mapRef.current;
    if (!map) return;
    if (mode === 'JUNCTION') {
      map.flyTo({ center: [ORIGIN_LNG, ORIGIN_LAT], zoom: 16.8, pitch: 0, bearing: 0, duration: 700 });
    } else if (mode === 'OVERVIEW') {
      map.flyTo({ center: [77.6062, 12.9762], zoom: 15.6, pitch: 0, bearing: 0, duration: 700 });
    }
  };

  const isCase1 = state.selectedCase === 1;
  const activeTelemetry = isCase1
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
    : activeUnit === 'AMB_A'
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
  const isRunning = isCase1 ? state.case1?.isSimulationRunning : state.case3?.isSimulationRunning;
  return <main className="operations map-workspace">
    <OperationsHeader active="/ambulance"/>
    <div className="map-layout">
      <aside className="route-panel">
        <div className="route-heading"><span className="kicker"><span className="index-rule"/> Ambulance desk</span>
          <h1>{isCase1 ? 'M.G. Road' : activeUnit === 'AMB_A' ? 'Brigade Road' : 'Cubbon detour'}</h1>
          <p><Radio size={15}/>{state.dispatch?.units[!isCase1 && activeUnit === 'AMB_B' ? 1 : 0]?.vehicleId || (isCase1 ? 'Unit 108' : activeUnit === 'AMB_A' ? 'Unit A' : 'Unit B')} <span className="middot">/</span> {state.isStandaloneFallback ? 'Standalone' : 'Twin live'}</p>
        </div>
        <section className="advisory"><div><i className="status-dot"/><strong>{isRunning ? 'Dispatch active' : 'Ready for coordination'}</strong></div>
          <p>{isRunning ? activeTelemetry.instruction : 'Standing by at the start of the corridor.'}</p></section>
        <div className="drive-controls ambulance-controls">
          <div className="readings"><div><small>Junction distance</small><strong>{activeTelemetry.dist} m</strong></div><div><small>Signal priority</small><strong>{state.signals?.isPreempted ? 'Active' : 'Standby'}</strong></div></div>
          <div className="field-row"><label className="field">Scenario<select value={state.selectedCase} onChange={e => sendCommand('SWITCH_CASE', {caseId:Number(e.target.value)})}>
            <option value={1}>01 · Priority corridor</option><option value={3}>03 · Dual response</option></select></label>
            {!isCase1 && <label className="field">Vehicle<select value={activeUnit} onChange={e => setActiveUnit(e.target.value)}><option value="AMB_A">Unit A</option><option value="AMB_B">Unit B</option></select></label>}</div>
          <CoordinationQueue className="primary-action" start={startDispatch} currentDispatchId={state.dispatch?.id} busy={isRunning && (isCase1 || !state.case3?.trafficCycleActive)}/>
          <details className="signal-detail"><summary>Junction signals</summary><div className="arm-grid">{arms.map(([label, key]) => {
            const phase = state.signals?.[key+'Green'] ? 'Open' : state.signals?.[key+'Yellow'] ? 'Changing' : 'Hold';
            return <div key={key}><span>{label}</span><b data-phase={phase}>{phase}</b></div>;
          })}</div></details>
          {!isCase1 && <details className="signal-detail"><summary>Detour progress</summary><ol>{['M.G. Road','Kamaraj Road','Cubbon Road','Central Street','West departure'].map((name,i) =>
            <li key={name} aria-current={i===leg ? 'step' : undefined}>{name} {i===leg ? '· Current' : i<leg ? '· Passed' : ''}</li>)}</ol></details>}
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
