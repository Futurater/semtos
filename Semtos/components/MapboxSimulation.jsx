"use client";

import React, { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Geodesic Circle Generator for BLE Wave ──────────────────────────────────
function createGeoJsonCircle(center, radiusInMeters, points = 64) {
  if (!center || !Array.isArray(center) || center.length < 2) {
    return {
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [[]] },
    };
  }
  const coords = {
    latitude: center[1],
    longitude: center[0],
  };
  const km = radiusInMeters / 1000;
  const ret = [];
  const distanceX = km / (111.32 * Math.cos((coords.latitude * Math.PI) / 180));
  const distanceY = km / 110.574;

  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    const x = distanceX * Math.cos(theta);
    const y = distanceY * Math.sin(theta);
    ret.push([coords.longitude + x, coords.latitude + y]);
  }
  ret.push(ret[0]);

  return {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [ret],
    },
  };
}

const ESRI_DARK_STYLE = {
  version: 8,
  name: 'Cyber Dark Twin',
  sources: {
    'esri-dark-base': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, HERE, Garmin, © OpenStreetMap',
    },
    'esri-dark-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Reference/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'esri-base-layer',
      type: 'raster',
      source: 'esri-dark-base',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'esri-labels-layer',
      type: 'raster',
      source: 'esri-dark-labels',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const ESRI_SATELLITE_STYLE = {
  version: 8,
  name: 'Photorealistic Satellite 3D',
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, Maxar, Earthstar Geographics',
    },
    'esri-satellite-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    {
      id: 'satellite-base',
      type: 'raster',
      source: 'esri-satellite',
      minzoom: 0,
      maxzoom: 19,
    },
    {
      id: 'satellite-labels',
      type: 'raster',
      source: 'esri-satellite-labels',
      minzoom: 0,
      maxzoom: 19,
    },
  ],
};

const MAP_STYLES = [
  { id: 'esri-dark', name: 'Cyber Dark Twin (Clean - No Watermarks)', style: ESRI_DARK_STYLE },
  { id: 'esri-satellite', name: 'Satellite 3D Hybrid (Clean - No Watermarks)', style: ESRI_SATELLITE_STYLE },
  { id: 'openfree-liberty', name: 'OpenFreeMap 3D Vector', url: 'https://tiles.openfreemap.org/styles/liberty' },
  { id: 'mapbox-dark', name: 'Mapbox Dark v11 (Token Req.)', url: 'mapbox://styles/mapbox/dark-v11', requiresToken: true },
];

export function MapboxSimulation({
  corridor,
  simState,
  civilianVehicles,
  onDispatch,
  onToggleFreeze,
  onTogglePhoneGps,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLibRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const signalMarkersRef = useRef([]);
  const civilianMarkersRef = useRef(new Map());

  const [cameraMode, setCameraMode] = useState('CHASE');
  const [selectedStyleIndex, setSelectedStyleIndex] = useState(0);
  const [mapboxToken, setMapboxToken] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('semtos_mapbox_token') || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
    }
    return '';
  });
  const [showSettings, setShowSettings] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

  const saveMapboxToken = (token) => {
    setMapboxToken(token);
    if (typeof window !== 'undefined') {
      localStorage.setItem('semtos_mapbox_token', token);
    }
  };

  const cleanupAllMarkers = () => {
    if (ambulanceMarkerRef.current) {
      try { ambulanceMarkerRef.current.remove(); } catch (_) {}
      ambulanceMarkerRef.current = null;
    }
    signalMarkersRef.current.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
    signalMarkersRef.current = [];

    civilianMarkersRef.current.forEach((obj) => {
      try { obj.marker.remove(); } catch (_) {}
    });
    civilianMarkersRef.current.clear();
  };

  // ---- Initialize Map Instance ----
  useEffect(() => {
    let isCancelled = false;
    setMapLoaded(false);
    cleanupAllMarkers();

    async function initMap() {
      try {
        const maplibreglModule = await import('maplibre-gl');
        const maplibregl = maplibreglModule.default || maplibreglModule;
        if (isCancelled || !mapContainerRef.current) return;
        mapLibRef.current = maplibregl;

        const styleObj = MAP_STYLES[selectedStyleIndex] || MAP_STYLES[0];
        let mapStyle = styleObj.style || styleObj.url;

        if (styleObj.requiresToken) {
          if (!mapboxToken) {
            mapStyle = ESRI_DARK_STYLE;
          } else {
            mapStyle = `https://api.mapbox.com/styles/v1/${styleObj.url.replace('mapbox://styles/', '')}?access_token=${mapboxToken}`;
          }
        }

        if (mapRef.current) {
          try { mapRef.current.remove(); } catch (_) {}
          mapRef.current = null;
        }

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: corridor.center,
          zoom: corridor.zoom,
          pitch: corridor.pitch,
          bearing: corridor.bearing,
          antialias: true,
          attributionControl: false,
        });

        map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');

        map.on('load', () => {
          if (isCancelled) return;
          mapRef.current = map;
          setMapLoaded(true);

          setTimeout(() => {
            if (mapRef.current) mapRef.current.resize();
          }, 150);

          // 1. Primary Preemption Route Line
          try {
            map.addSource('preemption-route', {
              type: 'geojson',
              data: {
                type: 'Feature',
                geometry: {
                  type: 'LineString',
                  coordinates: corridor.route,
                },
              },
            });

            map.addLayer({
              id: 'route-glow',
              type: 'line',
              source: 'preemption-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#22c55e',
                'line-width': 14,
                'line-opacity': 0.35,
                'line-blur': 6,
              },
            });

            map.addLayer({
              id: 'route-inner',
              type: 'line',
              source: 'preemption-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#4ade80',
                'line-width': 4.5,
                'line-opacity': 0.95,
              },
            });
          } catch (_) {}

          // 2. Deadlock Bypass Corridor Line (For CASE 03 & Gridlock Rerouting)
          try {
            if (corridor.bypassRoute) {
              map.addSource('bypass-route', {
                type: 'geojson',
                data: {
                  type: 'Feature',
                  geometry: {
                    type: 'LineString',
                    coordinates: corridor.bypassRoute,
                  },
                },
              });

              map.addLayer({
                id: 'bypass-route-line',
                type: 'line',
                source: 'bypass-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                  'line-color': '#f59e0b',
                  'line-width': 4,
                  'line-dasharray': [2, 2],
                  'line-opacity': 0.75,
                },
              });
            }
          } catch (_) {}

          // 3. BLE Broadcast Pulsing Radar Ring
          try {
            const initialCircle = createGeoJsonCircle(corridor.route[0], 110);
            map.addSource('ble-wave', {
              type: 'geojson',
              data: initialCircle,
            });

            map.addLayer({
              id: 'ble-wave-fill',
              type: 'fill',
              source: 'ble-wave',
              paint: {
                'fill-color': '#0284c7',
                'fill-opacity': 0.20,
              },
            });

            map.addLayer({
              id: 'ble-wave-stroke',
              type: 'line',
              source: 'ble-wave',
              paint: {
                'line-color': '#38bdf8',
                'line-width': 2.5,
                'line-dasharray': [2, 2],
                'line-opacity': 0.85,
              },
            });
          } catch (_) {}
        });
      } catch (err) {
        console.error('[MAP-ENGINE] Failed to initialize map:', err);
      }
    }

    initMap();

    const handleResize = () => {
      if (mapRef.current) mapRef.current.resize();
    };
    window.addEventListener('resize', handleResize);

    return () => {
      isCancelled = true;
      window.removeEventListener('resize', handleResize);
      cleanupAllMarkers();
      if (mapRef.current) {
        try { mapRef.current.remove(); } catch (_) {}
        mapRef.current = null;
      }
    };
  }, [corridor, selectedStyleIndex, mapboxToken]);

  // ---- Highlight Bypass Route vs Primary Route When Deadlock Rerouting Toggles ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      const isBypass = Boolean(simState.deadlockRerouteActive);
      if (map.getLayer('route-inner')) {
        map.setPaintProperty('route-inner', 'line-color', isBypass ? '#ef4444' : '#4ade80');
        map.setPaintProperty('route-inner', 'line-opacity', isBypass ? 0.45 : 0.95);
      }
      if (map.getLayer('bypass-route-line')) {
        map.setPaintProperty('bypass-route-line', 'line-color', isBypass ? '#38bdf8' : '#f59e0b');
        map.setPaintProperty('bypass-route-line', 'line-width', isBypass ? 6 : 3.5);
        map.setPaintProperty('bypass-route-line', 'line-opacity', isBypass ? 1.0 : 0.55);
      }
    } catch (_) {}
  }, [simState.deadlockRerouteActive, mapLoaded]);

  // ---- Update BLE Circle Layer & Camera When Ambulance Moves ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !simState.ambulancePosition) return;

    const [lon, lat] = simState.ambulancePosition;
    if (typeof lon !== 'number' || typeof lat !== 'number') return;

    try {
      const bleSource = map.getSource('ble-wave');
      if (bleSource) {
        const circleData = createGeoJsonCircle([lon, lat], simState.bleRadiusMeters || 110);
        bleSource.setData(circleData);
      }
    } catch (_) {}

    if (cameraMode === 'CHASE' && simState.isSimulationRunning && !simState.isFrozen) {
      try {
        map.easeTo({
          center: [lon, lat],
          bearing: simState.ambulanceBearing,
          pitch: 62,
          duration: 80,
          easing: (t) => t,
        });
      } catch (_) {}
    }
  }, [
    simState.ambulancePosition,
    simState.ambulanceBearing,
    simState.bleRadiusMeters,
    simState.isSimulationRunning,
    simState.isFrozen,
    cameraMode,
    mapLoaded,
  ]);

  // ---- Ambulance 3D HTML Marker ----
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibRef.current;
    if (!map || !maplibregl || !mapLoaded || !simState.ambulancePosition) return;

    const [lon, lat] = simState.ambulancePosition;
    if (typeof lon !== 'number' || typeof lat !== 'number') return;

    try {
      if (!ambulanceMarkerRef.current) {
        const el = document.createElement('div');
        el.className = 'ambulance-map-marker';
        el.innerHTML = `
          <div style="position:relative; width:22px; height:42px; display:flex; align-items:center; justify-content:center; pointer-events:none;">
            <div style="position:absolute; top:-28px; width:26px; height:32px; background:linear-gradient(to top, rgba(254,240,138,0.35) 0%, rgba(254,240,138,0) 100%); clip-path:polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%); pointer-events:none;"></div>
            <svg width="22" height="42" viewBox="0 0 22 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.7));">
              <rect x="1" y="2" width="20" height="38" rx="4" fill="#f8fafc" stroke="#dc2626" stroke-width="1.5"/>
              <path d="M4 10 L18 10 L16 6 L6 6 Z" fill="#0f172a"/>
              <rect x="9" y="18" width="4" height="10" rx="0.5" fill="#dc2626"/>
              <rect x="6" y="21" width="10" height="4" rx="0.5" fill="#dc2626"/>
              <circle cx="4.5" cy="3" r="1.5" fill="#fef08a"/>
              <circle cx="17.5" cy="3" r="1.5" fill="#fef08a"/>
            </svg>
            <div style="position:absolute; top:-16px; background:rgba(2,6,23,0.9); border:1px solid #22c55e; border-radius:3px; padding:1px 5px; font-family:monospace; font-size:8px; font-weight:800; color:#22c55e; white-space:nowrap;">
              AMB-108 🚨
            </div>
          </div>
        `;

        const marker = new maplibregl.Marker({
          element: el,
          rotationAlignment: 'map',
          pitchAlignment: 'map',
          anchor: 'center',
        })
          .setLngLat([lon, lat])
          .setRotation(simState.ambulanceBearing)
          .addTo(map);

        ambulanceMarkerRef.current = marker;
      } else {
        ambulanceMarkerRef.current.setLngLat([lon, lat]);
        ambulanceMarkerRef.current.setRotation(simState.ambulanceBearing);
      }
    } catch (_) {}
  }, [simState.ambulancePosition, simState.ambulanceBearing, mapLoaded]);

  // ---- Multi-Intersection Green Wave Traffic Signal Markers (J1, J2, J3) ----
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibRef.current;
    if (!map || !maplibregl || !mapLoaded) return;

    signalMarkersRef.current.forEach((m) => {
      try { m.remove(); } catch (_) {}
    });
    signalMarkersRef.current = [];

    const nodes =
      Array.isArray(simState.intersectionStates) && simState.intersectionStates.length > 0
        ? simState.intersectionStates
        : corridor.intersections;

    nodes.forEach((node) => {
      const status = node.status || (simState.signalPhase === 'W_GREEN' ? 'GREEN_WAVE' : 'RED');
      const isGreen = status === 'GREEN_WAVE' || status === 'CLEARED';
      const isGridlock = status === 'GRIDLOCK_BYPASSED';

      const color = isGridlock ? '#f59e0b' : isGreen ? '#22c55e' : '#ef4444';
      const labelText = isGridlock
        ? '⚠️ GRIDLOCK BYPASSED'
        : status === 'GREEN_WAVE'
        ? '🟢 GREEN WAVE'
        : status === 'CLEARED'
        ? '✓ CLEARED'
        : '🔴 RED';

      try {
        const el = document.createElement('div');
        el.className = 'intersection-signal-marker';
        el.innerHTML = `
          <div style="position:relative; display:flex; flex-direction:column; align-items:center; pointer-events:none;">
            <div style="background:rgba(2,6,23,0.92); border:1px solid ${color}; border-radius:6px; padding:3px 8px; font-family:monospace; color:#ffffff; font-size:9px; white-space:nowrap; box-shadow:0 0 12px ${color}66; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span style="font-weight:900; color:${color}">${node.name}</span>
              <span style="padding:1px 4px; border-radius:3px; background:${color}22; color:${color}; font-weight:700;">
                ${labelText}
              </span>
            </div>
            <div style="width:14px; height:14px; border-radius:50%; background:${color}; border:2px solid #ffffff; box-shadow:0 0 14px ${color};"></div>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(node.coords)
          .addTo(map);

        signalMarkersRef.current.push(marker);
      } catch (_) {}
    });
  }, [corridor, simState.intersectionStates, simState.signalPhase, mapLoaded]);

  // ---- Civilian Vehicle Markers with Lateral Pull-Over Animation ----
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibRef.current;
    if (!map || !maplibregl || !mapLoaded) return;

    const markersMap = civilianMarkersRef.current;

    civilianVehicles.forEach((car, idx) => {
      let markerObj = markersMap.get(car.id);
      const carColor = idx % 3 === 0 ? '#334155' : idx % 3 === 1 ? '#1e293b' : '#475569';

      try {
        if (!markerObj) {
          const el = document.createElement('div');
          el.className = `civilian-car-${car.id}`;
          el.innerHTML = `
            <div style="position:relative; width:18px; height:34px; display:flex; align-items:center; justify-content:center; pointer-events:none;">
              <svg width="18" height="34" viewBox="0 0 18 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,0.6));">
                <rect x="1" y="2" width="16" height="30" rx="3.5" fill="${carColor}" stroke="#64748b" stroke-width="1"/>
                <path d="M3 8 L15 8 L13.5 5 L4.5 5 Z" fill="#020617"/>
                <rect x="3.5" y="10" width="11" height="12" rx="1" fill="#0f172a"/>
              </svg>
              <div id="car-badge-${car.id}" style="display:none; position:absolute; top:-14px; background:#f59e0b; color:#000000; font-family:monospace; font-size:7px; font-weight:900; border-radius:2px; padding:0.5px 3px; white-space:nowrap;">
                PULLED OVER
              </div>
            </div>
          `;

          const marker = new maplibregl.Marker({
            element: el,
            rotationAlignment: 'map',
            pitchAlignment: 'map',
            anchor: 'center',
          })
            .setLngLat(car.currentCoords)
            .setRotation(car.bearing)
            .addTo(map);

          markersMap.set(car.id, { marker, el });
          markerObj = { marker, el };
        }

        markerObj.marker.setLngLat(car.currentCoords);
        markerObj.marker.setRotation(car.bearing);

        const carBadge = document.getElementById(`car-badge-${car.id}`);
        if (carBadge) {
          carBadge.style.display = car.isYielding ? 'block' : 'none';
        }
      } catch (_) {}
    });
  }, [civilianVehicles, mapLoaded]);

  const handleCameraChange = (mode) => {
    setCameraMode(mode);
    const map = mapRef.current;
    if (!map) return;

    if (mode === 'INTERSECTION') {
      const target = corridor.intersections[1] || corridor.intersections[0] || { coords: corridor.center };
      map.flyTo({
        center: target.coords,
        zoom: 17.2,
        pitch: 65,
        bearing: corridor.bearing,
        duration: 1200,
      });
    } else if (mode === 'OVERVIEW') {
      map.flyTo({
        center: corridor.center,
        zoom: 15.2,
        pitch: 45,
        bearing: corridor.bearing,
        duration: 1200,
      });
    }
  };

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none font-mono" style={{ minHeight: '100%', height: '100%', width: '100%' }}>
      <div
        ref={mapContainerRef}
        className="absolute inset-0 w-full h-full"
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* ── Top Left Multi-Intersection Green Wave Telemetry HUD ── */}
      <div className="absolute top-4 left-4 z-20 flex flex-col gap-2 max-w-sm pointer-events-auto">
        <div className="bg-slate-950/92 border border-emerald-500/50 backdrop-blur-md rounded-xl p-3.5 shadow-2xl text-slate-100">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#22c55e]" />
              <span className="text-xs tracking-widest text-emerald-400 font-bold">3D CORRIDOR & GREEN WAVE</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
              V2X: {simState.v2xConnected ? 'ONLINE' : 'SYNCING'}
            </span>
          </div>

          <div className="text-sm font-bold text-white mb-0.5">{corridor.name}</div>
          <div className="text-[11px] text-slate-400 mb-2.5">
            {simState.deadlockRerouteActive
              ? `🔀 Bypass Active: ${simState.bypassName}`
              : `Next Target: ${simState.activeJunctionName}`}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-500">SPEED</div>
              <div className="text-base font-black text-emerald-400">
                {simState.ambulanceSpeedKmh} <span className="text-[10px] font-normal text-slate-400">km/h</span>
              </div>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-500">HEADING</div>
              <div className="text-base font-black text-sky-400">{Math.round(simState.ambulanceBearing)}°</div>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-500">DIST TO NEXT JCT</div>
              <div className="text-base font-black text-amber-400">
                {simState.distanceToNextSignal} <span className="text-[10px] font-normal text-slate-400">m</span>
              </div>
            </div>
            <div className="bg-slate-900/80 p-2 rounded-lg border border-slate-800">
              <div className="text-[9px] text-slate-500">ETA TO NEXT JCT</div>
              <div className="text-base font-black text-rose-400">
                {simState.etaToSignalSeconds} <span className="text-[10px] font-normal text-slate-400">s</span>
              </div>
            </div>
          </div>

          {/* 3-Junction Green Wave Cascade Status List */}
          <div className="mt-2.5 bg-slate-900/90 border border-slate-800 rounded-lg p-2 space-y-1">
            <div className="text-[9px] text-slate-400 font-bold tracking-wider uppercase mb-1">
              MULTI-INTERSECTION GREEN WAVE CASCADE
            </div>
            {(simState.intersectionStates || []).map((node) => (
              <div key={node.id} className="flex items-center justify-between text-[10px]">
                <span className="text-slate-300 truncate max-w-[175px]">{node.name}</span>
                <span
                  className={`font-bold px-1.5 py-0.5 rounded ${
                    node.status === 'GREEN_WAVE'
                      ? 'bg-emerald-950 text-emerald-400 border border-emerald-500/40'
                      : node.status === 'CLEARED'
                      ? 'bg-slate-800 text-emerald-300'
                      : node.status === 'GRIDLOCK_BYPASSED'
                      ? 'bg-amber-950 text-amber-300 border border-amber-500/40'
                      : 'bg-rose-950/60 text-rose-400'
                  }`}
                >
                  {node.status === 'GREEN_WAVE'
                    ? '🟢 GREEN WAVE'
                    : node.status === 'CLEARED'
                    ? '✓ CLEARED'
                    : node.status === 'GRIDLOCK_BYPASSED'
                    ? '🔀 BYPASSED'
                    : '🔴 RED HOLD'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Bottom Floating Controls ── */}
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-2 bg-slate-950/90 border border-slate-800 backdrop-blur-md rounded-2xl p-2 shadow-2xl pointer-events-auto">
        <button
          onClick={onDispatch}
          className="px-4 py-2 rounded-xl font-black text-xs tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(34,197,94,0.4)] transition active:scale-95 flex items-center gap-2"
        >
          <span>▶</span>
          <span>DISPATCH [ENTER]</span>
        </button>

        <button
          onClick={onToggleFreeze}
          className={`px-3 py-2 rounded-xl font-bold text-xs border transition ${
            simState.isFrozen
              ? 'bg-amber-500 text-slate-950 border-amber-400'
              : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
          }`}
        >
          {simState.isFrozen ? 'UNFREEZE [F]' : 'FREEZE [F]'}
        </button>

        <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
          {['CHASE', 'INTERSECTION', 'OVERVIEW', 'FREE'].map((m) => (
            <button
              key={m}
              onClick={() => handleCameraChange(m)}
              className={`px-2.5 py-1 rounded-lg transition font-medium ${
                cameraMode === m
                  ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {m === 'CHASE' ? 'Chase' : m === 'INTERSECTION' ? 'Junction' : m === 'OVERVIEW' ? 'Corridor' : 'Orbit'}
            </button>
          ))}
        </div>

        <button
          onClick={() => setShowSettings(true)}
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
          title="Map & API Settings"
        >
          ⚙️
        </button>
      </div>

      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-slate-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">⚙️ Map & Telemetry Settings</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-lg">
                ✕
              </button>
            </div>
            <div className="mb-4">
              <label className="text-xs text-slate-400 mb-2 block font-semibold">MAP TILE PROVIDER</label>
              <div className="grid grid-cols-1 gap-2">
                {MAP_STYLES.map((style, idx) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyleIndex(idx)}
                    className={`text-left p-2.5 rounded-xl border transition text-xs flex items-center justify-between ${
                      selectedStyleIndex === idx
                        ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300'
                    }`}
                  >
                    <span>{style.name}</span>
                    {selectedStyleIndex === idx && <span className="text-emerald-400">✓</span>}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
            >
              APPLY & CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
