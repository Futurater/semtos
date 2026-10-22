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

  // ---- Cleanup Markers Helper ----
  const cleanupAllMarkers = () => {
    if (ambulanceMarkerRef.current) {
      try { ambulanceMarkerRef.current.remove(); } catch (_) {}
      ambulanceMarkerRef.current = null;
    }
    signalMarkersRef.current.forEach(m => {
      try { m.remove(); } catch (_) {}
    });
    signalMarkersRef.current = [];

    civilianMarkersRef.current.forEach(obj => {
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

        map.on('error', (e) => {
          console.warn('[MAP-ENGINE] Map warning:', e);
        });

        map.on('load', () => {
          if (isCancelled) return;
          mapRef.current = map;
          setMapLoaded(true);

          // Trigger container resize to ensure dimensions
          setTimeout(() => {
            if (mapRef.current) mapRef.current.resize();
          }, 150);

          // 1. Add 3D Extruded Buildings Layer if source exists
          try {
            if (map.getSource('openmaptiles') || map.getSource('composite')) {
              const sourceName = map.getSource('openmaptiles') ? 'openmaptiles' : 'composite';
              map.addLayer({
                id: '3d-buildings',
                source: sourceName,
                'source-layer': 'building',
                filter: ['==', 'extrude', 'true'],
                type: 'fill-extrusion',
                minzoom: 14,
                paint: {
                  'fill-extrusion-color': '#0f172a',
                  'fill-extrusion-height': 25,
                  'fill-extrusion-base': 0,
                  'fill-extrusion-opacity': 0.85,
                },
              });
            }
          } catch (_) {}

          // 2. Add Preemption Route Line
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

            // Outer glow
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

            // Inner neon line
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

          // 3. Add BLE Broadcast Pulsing Radar Ring
          try {
            const initialCircle = createGeoJsonCircle(corridor.route[0], 100);
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

  // ---- Update BLE Circle Layer & Camera When Ambulance Moves ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !simState.ambulancePosition) return;

    const [lon, lat] = simState.ambulancePosition;
    if (typeof lon !== 'number' || typeof lat !== 'number') return;

    // Update BLE Wave GeoJSON
    try {
      const bleSource = map.getSource('ble-wave');
      if (bleSource) {
        const circleData = createGeoJsonCircle([lon, lat], simState.bleRadiusMeters || 100);
        bleSource.setData(circleData);
      }
    } catch (_) {}

    // Camera chase mode
    if (cameraMode === 'CHASE' && simState.isSimulationRunning && !simState.isFrozen) {
      try {
        map.easeTo({
          center: [lon, lat],
          bearing: simState.ambulanceBearing,
          pitch: 62,
          duration: 80,
          easing: t => t,
        });
      } catch (_) {}
    }
  }, [simState.ambulancePosition, simState.ambulanceBearing, simState.bleRadiusMeters, simState.isSimulationRunning, simState.isFrozen, cameraMode, mapLoaded]);

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
            <!-- Forward Headlight Beams on Asphalt -->
            <div style="position:absolute; top:-28px; width:26px; height:32px; background:linear-gradient(to top, rgba(254,240,138,0.35) 0%, rgba(254,240,138,0) 100%); clip-path:polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%); pointer-events:none;"></div>

            <!-- Vehicle Body -->
            <svg width="22" height="42" viewBox="0 0 22 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.7));">
              <!-- Shadow & Base Body -->
              <rect x="1" y="2" width="20" height="38" rx="4" fill="#f8fafc" stroke="#dc2626" stroke-width="1.5"/>
              <!-- Front Windshield -->
              <path d="M4 10 L18 10 L16 6 L6 6 Z" fill="#0f172a"/>
              <!-- Side Windows -->
              <rect x="2.5" y="13" width="2" height="8" rx="0.5" fill="#1e293b"/>
              <rect x="17.5" y="13" width="2" height="8" rx="0.5" fill="#1e293b"/>
              <!-- Rear Windows -->
              <rect x="4" y="34" width="5" height="2" rx="0.5" fill="#0f172a"/>
              <rect x="13" y="34" width="5" height="2" rx="0.5" fill="#0f172a"/>
              <!-- Red Emergency Cross on Roof -->
              <rect x="9" y="18" width="4" height="10" rx="0.5" fill="#dc2626"/>
              <rect x="6" y="21" width="10" height="4" rx="0.5" fill="#dc2626"/>
              <!-- Front Headlights -->
              <circle cx="4.5" cy="3" r="1.5" fill="#fef08a"/>
              <circle cx="17.5" cy="3" r="1.5" fill="#fef08a"/>
              <!-- Rear Tail Lights -->
              <rect x="2" y="38" width="3" height="1.5" fill="#ef4444"/>
              <rect x="17" y="38" width="3" height="1.5" fill="#ef4444"/>
            </svg>

            <!-- Roof LED Strobe Bar -->
            <div style="position:absolute; top:12px; width:14px; height:5px; display:flex; justify-content:space-between; padding:0 1px;">
              <div style="width:5px; height:5px; border-radius:50%; background:#ef4444; box-shadow:0 0 12px #ef4444, 0 0 20px #ef4444; animation:strobeRed 0.35s infinite alternate;"></div>
              <div style="width:5px; height:5px; border-radius:50%; background:#3b82f6; box-shadow:0 0 12px #3b82f6, 0 0 20px #3b82f6; animation:strobeBlue 0.35s infinite alternate-reverse;"></div>
            </div>

            <!-- Floating Label -->
            <div style="position:absolute; top:-16px; background:rgba(2,6,23,0.9); border:1px solid #22c55e; border-radius:3px; padding:1px 5px; font-family:monospace; font-size:8px; font-weight:800; color:#22c55e; white-space:nowrap; box-shadow:0 0 8px rgba(34,197,94,0.5);">
              AMB-01 🚨
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

  // ---- Traffic Signal Intersections Markers ----
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibRef.current;
    if (!map || !maplibregl || !mapLoaded) return;

    signalMarkersRef.current.forEach(m => {
      try { m.remove(); } catch (_) {}
    });
    signalMarkersRef.current = [];

    corridor.intersections.forEach(node => {
      const isPreempted = simState.signalPhase === 'W_GREEN';
      const isResume = simState.signalPhase === 'E_RESUME';
      const isAvenueGreen = isPreempted || isResume;

      try {
        const el = document.createElement('div');
        el.className = 'intersection-signal-marker';
        el.innerHTML = `
          <div style="position:relative; display:flex; flex-direction:column; align-items:center; pointer-events:none;">
            <!-- Compact Floating Signal Badge -->
            <div style="background:rgba(2,6,23,0.92); border:1px solid ${isAvenueGreen ? '#22c55e' : '#ef4444'}; border-radius:6px; padding:3px 8px; font-family:monospace; color:#ffffff; font-size:9px; white-space:nowrap; box-shadow:0 0 12px ${isAvenueGreen ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.4)'}; margin-bottom:4px; display:flex; align-items:center; gap:6px;">
              <span style="font-weight:900; color:${isAvenueGreen ? '#22c55e' : '#f87171'}">${node.name}</span>
              <span style="padding:1px 4px; border-radius:3px; background:${isAvenueGreen ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}; color:${isAvenueGreen ? '#22c55e' : '#ef4444'}; font-weight:700;">
                ${isAvenueGreen ? '🟢 AVE OPEN' : '🔴 RED'}
              </span>
            </div>
            <!-- Signal Gantry Disc -->
            <div style="width:14px; height:14px; border-radius:50%; background:${isAvenueGreen ? '#22c55e' : '#ef4444'}; border:2px solid #ffffff; box-shadow:0 0 14px ${isAvenueGreen ? '#22c55e' : '#ef4444'};"></div>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(node.coords)
          .addTo(map);

        signalMarkersRef.current.push(marker);
      } catch (_) {}
    });
  }, [corridor, simState.signalPhase, mapLoaded]);

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
              <!-- Headlight Beams -->
              <div style="position:absolute; top:-20px; width:20px; height:24px; background:linear-gradient(to top, rgba(254,240,138,0.25) 0%, rgba(254,240,138,0) 100%); clip-path:polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%); pointer-events:none;"></div>

              <!-- Car Chassis -->
              <svg width="18" height="34" viewBox="0 0 18 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 3px 5px rgba(0,0,0,0.6));">
                <rect x="1" y="2" width="16" height="30" rx="3.5" fill="${carColor}" stroke="#64748b" stroke-width="1"/>
                <!-- Front Windshield -->
                <path d="M3 8 L15 8 L13.5 5 L4.5 5 Z" fill="#020617"/>
                <!-- Roof -->
                <rect x="3.5" y="10" width="11" height="12" rx="1" fill="#0f172a"/>
                <!-- Rear Windshield -->
                <path d="M4.5 24 L13.5 24 L15 26 L3 26 Z" fill="#020617"/>
                <!-- Headlights -->
                <circle cx="3.5" cy="3" r="1.2" fill="#fef08a"/>
                <circle cx="14.5" cy="3" r="1.2" fill="#fef08a"/>
                <!-- Tail Lights -->
                <rect x="2" y="30" width="3" height="1" fill="#ef4444"/>
                <rect x="13" y="30" width="3" height="1" fill="#ef4444"/>
              </svg>

              <!-- Hazard Blinkers (Active on Yield) -->
              <div id="car-hazard-${car.id}" style="display:none; position:absolute; width:100%; height:100%;">
                <div style="position:absolute; top:2px; left:-2px; width:4px; height:4px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b; animation:hazardBlink 0.4s infinite;"></div>
                <div style="position:absolute; top:2px; right:-2px; width:4px; height:4px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b; animation:hazardBlink 0.4s infinite;"></div>
                <div style="position:absolute; bottom:2px; left:-2px; width:4px; height:4px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b; animation:hazardBlink 0.4s infinite;"></div>
                <div style="position:absolute; bottom:2px; right:-2px; width:4px; height:4px; border-radius:50%; background:#f59e0b; box-shadow:0 0 8px #f59e0b; animation:hazardBlink 0.4s infinite;"></div>
              </div>

              <!-- Yield Pill Badge -->
              <div id="car-badge-${car.id}" style="display:none; position:absolute; top:-14px; background:#f59e0b; color:#000000; font-family:monospace; font-size:7px; font-weight:900; border-radius:2px; padding:0.5px 3px; white-space:nowrap; box-shadow:0 0 6px #f59e0b;">
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

        const carHazard = document.getElementById(`car-hazard-${car.id}`);
        if (carHazard) {
          carHazard.style.display = car.isYielding ? 'block' : 'none';
        }

        const carBadge = document.getElementById(`car-badge-${car.id}`);
        if (carBadge) {
          carBadge.style.display = car.isYielding ? 'block' : 'none';
        }
      } catch (_) {}
    });
  }, [civilianVehicles, mapLoaded]);

  // ---- Camera Mode Handlers ----
  const handleCameraChange = (mode) => {
    setCameraMode(mode);
    const map = mapRef.current;
    if (!map) return;

    if (mode === 'INTERSECTION') {
      const target = corridor.intersections[0] || { coords: corridor.center };
      map.flyTo({
        center: target.coords,
        zoom: 17.5,
        pitch: 65,
        bearing: corridor.bearing,
        duration: 1200,
      });
    } else if (mode === 'OVERVIEW') {
      map.flyTo({
        center: corridor.center,
        zoom: 15.5,
        pitch: 45,
        bearing: corridor.bearing,
        duration: 1200,
      });
    }
  };

  const currentStyle = MAP_STYLES[selectedStyleIndex] || MAP_STYLES[0];

  return (
    <div className="relative w-full h-full bg-slate-950 overflow-hidden select-none font-mono" style={{ minHeight: '100%', height: '100%', width: '100%' }}>
      {/* ── Map Canvas ── */}
      <div
        ref={mapContainerRef}
        className={`absolute inset-0 w-full h-full ${currentStyle.isDarkFilter ? 'map-canvas-dark-filter' : ''}`}
        style={{ width: '100%', height: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      />

      {/* ── Top Left Telemetry HUD ── */}
      <div className="absolute top-5 left-5 z-20 flex flex-col gap-2 max-w-sm pointer-events-auto">
        <div className="bg-slate-950/90 border border-emerald-500/50 backdrop-blur-md rounded-xl p-4 shadow-2xl text-slate-100">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2 mb-3">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_8px_#22c55e]" />
              <span className="text-xs tracking-widest text-emerald-400 font-bold">GEOSPATIAL DIGITAL TWIN</span>
            </div>
            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
              V2X: {simState.v2xConnected ? 'ONLINE' : 'CONNECTING'}
            </span>
          </div>

          <div className="text-base font-bold text-white mb-1">{corridor.name}</div>
          <div className="text-xs text-slate-400 mb-3">
            {simState.isSimulationRunning ? 'Corridor preemption active — tracking emergency route' : 'System ready for dispatch'}
          </div>

          {/* Telemetry Metrics Grid */}
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-500 font-medium">SPEED</div>
              <div className="text-lg font-black text-emerald-400">{simState.ambulanceSpeedKmh} <span className="text-xs font-normal text-slate-400">km/h</span></div>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-500 font-medium">HEADING</div>
              <div className="text-lg font-black text-sky-400">{Math.round(simState.ambulanceBearing)}°</div>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-500 font-medium">DIST TO SIGNAL</div>
              <div className="text-lg font-black text-amber-400">{simState.distanceToNextSignal} <span className="text-xs font-normal text-slate-400">m</span></div>
            </div>
            <div className="bg-slate-900/80 p-2.5 rounded-lg border border-slate-800">
              <div className="text-[10px] text-slate-500 font-medium">ETA TO JUNCTION</div>
              <div className="text-lg font-black text-rose-400">{simState.etaToSignalSeconds} <span className="text-xs font-normal text-slate-400">s</span></div>
            </div>
          </div>

          {/* Preemption Status Banner */}
          <div className={`mt-3 p-2.5 rounded-lg text-center text-xs font-bold border transition-colors ${
            simState.signalPhase === 'W_GREEN'
              ? 'bg-rose-950/60 border-rose-500 text-rose-300 shadow-[0_0_16px_rgba(244,63,94,0.3)] animate-pulse'
              : simState.signalPhase === 'E_RESUME'
              ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300'
              : 'bg-slate-900/80 border-slate-800 text-slate-400'
          }`}>
            {simState.signalPhase === 'W_GREEN' && '🚨 PREEMPTION ACTIVE: CORRIDOR FLUSHED GREEN'}
            {simState.signalPhase === 'E_RESUME' && '⚡ JUNCTION CLEARED: SEQUENTIAL RESTORE'}
            {simState.signalPhase === 'NORMAL_CYCLE' && '🚦 NORMAL CYCLE: STANDBY FOR DISPATCH'}
            {simState.signalPhase === 'N_RELEASE' && '🟢 SEQUENTIAL RELEASE: NORTH ARTERIAL'}
          </div>
        </div>
      </div>

      {/* ── Bottom Floating Controls ── */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 flex flex-wrap items-center gap-2 bg-slate-950/90 border border-slate-800 backdrop-blur-md rounded-2xl p-2.5 shadow-2xl pointer-events-auto">
        <button
          onClick={onDispatch}
          className="px-5 py-2.5 rounded-xl font-black text-xs tracking-wider bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-[0_0_20px_rgba(34,197,94,0.4)] transition active:scale-95 flex items-center gap-2"
        >
          <span>▶</span>
          <span>DISPATCH AMBULANCE</span>
          <span className="text-[10px] opacity-75 font-normal">[ENTER]</span>
        </button>

        <button
          onClick={onToggleFreeze}
          className={`px-4 py-2.5 rounded-xl font-bold text-xs tracking-wider border transition active:scale-95 ${
            simState.isFrozen
              ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-[0_0_16px_#f59e0b]'
              : 'bg-slate-900 text-slate-200 border-slate-700 hover:bg-slate-800'
          }`}
        >
          {simState.isFrozen ? 'UNFREEZE [F]' : 'FREEZE [F]'}
        </button>

        <div className="h-6 w-[1px] bg-slate-800 mx-1" />

        <div className="flex bg-slate-900 rounded-xl p-1 border border-slate-800 text-xs">
          <button
            onClick={() => handleCameraChange('CHASE')}
            className={`px-3 py-1.5 rounded-lg transition font-medium ${
              cameraMode === 'CHASE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            Chase Cam
          </button>
          <button
            onClick={() => handleCameraChange('INTERSECTION')}
            className={`px-3 py-1.5 rounded-lg transition font-medium ${
              cameraMode === 'INTERSECTION' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            Intersection
          </button>
          <button
            onClick={() => handleCameraChange('OVERVIEW')}
            className={`px-3 py-1.5 rounded-lg transition font-medium ${
              cameraMode === 'OVERVIEW' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => handleCameraChange('FREE')}
            className={`px-3 py-1.5 rounded-lg transition font-medium ${
              cameraMode === 'FREE' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'text-slate-400 hover:text-white'
            }`}
          >
            3D Orbit
          </button>
        </div>

        <div className="h-6 w-[1px] bg-slate-800 mx-1" />

        <button
          onClick={() => setShowSettings(true)}
          className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 transition"
          title="Map & API Settings"
        >
          ⚙️
        </button>
      </div>

      {/* ── Settings Modal (Mapbox Token & Styles) ── */}
      {showSettings && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md p-4 pointer-events-auto">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 max-w-md w-full shadow-2xl text-slate-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>⚙️</span> Map & API Settings
              </h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-white text-lg">✕</button>
            </div>

            <div className="mb-5">
              <label className="text-xs text-slate-400 mb-2 block font-semibold">MAP TILE PROVIDER</label>
              <div className="grid grid-cols-1 gap-2">
                {MAP_STYLES.map((style, idx) => (
                  <button
                    key={style.id}
                    onClick={() => setSelectedStyleIndex(idx)}
                    className={`text-left p-3 rounded-xl border transition text-xs flex items-center justify-between ${
                      selectedStyleIndex === idx
                        ? 'bg-emerald-950/50 border-emerald-500 text-emerald-300'
                        : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <div>
                      <div className="font-bold">{style.name}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-0.5">{style.requiresToken ? 'Requires Mapbox Token' : 'Instant 100% Free Access'}</div>
                    </div>
                    {selectedStyleIndex === idx && <span className="text-emerald-400">✓</span>}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5">
              <label className="text-xs text-slate-400 mb-1 block font-semibold">MAPBOX ACCESS TOKEN (OPTIONAL)</label>
              <input
                type="text"
                value={mapboxToken}
                onChange={(e) => saveMapboxToken(e.target.value)}
                placeholder="pk.eyJ1Ijo..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg p-2.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
              />
              <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                Mapbox GL provides 50,000 monthly map loads for free. If left blank, the simulation uses high-performance vector tiles at zero cost.
              </p>
            </div>

            <div className="mb-6 bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-center justify-between">
              <div>
                <div className="text-xs font-bold text-white">Broadcast Real Phone GPS</div>
                <div className="text-[10px] text-slate-500">Stream real location from phone companion</div>
              </div>
              <button
                onClick={onTogglePhoneGps}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                  simState.useRealPhoneGps
                    ? 'bg-emerald-500 text-slate-950 shadow-[0_0_12px_#22c55e]'
                    : 'bg-slate-800 text-slate-400 border border-slate-700'
                }`}
              >
                {simState.useRealPhoneGps ? 'ENABLED' : 'DISABLED'}
              </button>
            </div>

            <button
              onClick={() => setShowSettings(false)}
              className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold rounded-xl text-xs transition"
            >
              SAVE & APPLY
            </button>
          </div>
        </div>
      )}

      <style>{`
        .map-canvas-dark-filter .maplibregl-canvas {
          filter: invert(90%) hue-rotate(180deg) brightness(85%) contrast(120%);
        }
        @keyframes strobeRed {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.15; transform: scale(0.85); }
        }
        @keyframes strobeBlue {
          0%, 100% { opacity: 0.15; transform: scale(0.85); }
          50% { opacity: 1; transform: scale(1.1); }
        }
        @keyframes hazardBlink {
          0%, 100% { opacity: 1; transform: scale(1.1); }
          50% { opacity: 0.1; transform: scale(0.8); }
        }
      `}</style>
    </div>
  );
}
