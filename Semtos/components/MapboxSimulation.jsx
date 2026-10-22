"use client";

import React, { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── Geodesic Circle Generator for BLE Radar Dome ────────────────────────────
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

const ESRI_SATELLITE_STYLE = {
  version: 8,
  name: 'Bengaluru Satellite 3D Hybrid',
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      attribution: '© Esri, Maxar',
    },
    'esri-satellite-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
    'esri-places-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
    },
  },
  layers: [
    { id: 'satellite-base', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 19 },
    { id: 'satellite-roads', type: 'raster', source: 'esri-satellite-labels', minzoom: 0, maxzoom: 19 },
    { id: 'satellite-places', type: 'raster', source: 'esri-places-labels', minzoom: 0, maxzoom: 19 },
  ],
};

const ESRI_DARK_STYLE = {
  version: 8,
  name: 'Cyber Dark Raster',
  sources: {
    'esri-dark-base': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
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
    { id: 'esri-base-layer', type: 'raster', source: 'esri-dark-base', minzoom: 0, maxzoom: 19 },
    { id: 'esri-labels-layer', type: 'raster', source: 'esri-dark-labels', minzoom: 0, maxzoom: 19 },
  ],
};

// Default to OpenFreeMap 3D Vector (True 3D Extruded Bengaluru Buildings + Vector Roads)
const MAP_STYLES = [
  {
    id: 'openfree-3d-bengaluru',
    name: 'Bengaluru 3D Vector Buildings (Default)',
    url: 'https://tiles.openfreemap.org/styles/liberty',
  },
  {
    id: 'esri-satellite',
    name: 'Bengaluru Photorealistic Satellite + Roads',
    style: ESRI_SATELLITE_STYLE,
  },
  {
    id: 'esri-dark',
    name: 'Dark Tactical Raster',
    style: ESRI_DARK_STYLE,
  },
];

export function MapboxSimulation({
  corridor,
  simState,
  civilianVehicles,
  onDispatch,
  onToggleFreeze,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLibRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const signalMarkersRef = useRef([]);
  const civilianMarkersRef = useRef(new Map());

  const [cameraMode, setCameraMode] = useState('CHASE');
  const [selectedStyleIndex, setSelectedStyleIndex] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);

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

  // ---- Initialize 3D MapLibre Instance Centered on Bengaluru ----
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
        const mapStyle = styleObj.style || styleObj.url;

        if (mapRef.current) {
          try { mapRef.current.remove(); } catch (_) {}
          mapRef.current = null;
        }

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: mapStyle,
          center: corridor.center,
          zoom: corridor.zoom || 16.5,
          pitch: corridor.pitch || 62,
          bearing: corridor.bearing || 284,
          antialias: true,
          attributionControl: false,
        });

        map.on('load', () => {
          if (isCancelled) return;
          mapRef.current = map;

          // Restyle vector layers into a sleek Dark Smart-City 3D Twin aesthetic if using OpenFreeMap
          try {
            const layers = map.getStyle()?.layers || [];
            layers.forEach((layer) => {
              if (layer.type === 'background') {
                map.setPaintProperty(layer.id, 'background-color', '#060d1a');
              } else if (layer.type === 'fill' && (layer.id.includes('land') || layer.id.includes('park'))) {
                map.setPaintProperty(layer.id, 'fill-color', '#0a1628');
              } else if (layer.type === 'fill' && layer.id.includes('water')) {
                map.setPaintProperty(layer.id, 'fill-color', '#022c43');
              } else if (layer.type === 'line' && (layer.id.includes('road') || layer.id.includes('highway') || layer.id.includes('transportation'))) {
                map.setPaintProperty(layer.id, 'line-color', '#1e293b');
              } else if (layer.type === 'fill-extrusion' || layer.id.includes('building')) {
                if (layer.type === 'fill-extrusion') {
                  map.setPaintProperty(layer.id, 'fill-extrusion-color', '#16243d');
                  map.setPaintProperty(layer.id, 'fill-extrusion-opacity', 0.88);
                }
              }
            });
          } catch (_) {}

          // 1. Primary Road-Snapped Emergency Corridor (Outer Glow + Core + Center Lane Line)
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
              id: 'route-asphalt-bed',
              type: 'line',
              source: 'preemption-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#0f172a',
                'line-width': 22,
                'line-opacity': 0.85,
              },
            });

            map.addLayer({
              id: 'route-glow',
              type: 'line',
              source: 'preemption-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#10b981',
                'line-width': 18,
                'line-opacity': 0.45,
                'line-blur': 6,
              },
            });

            map.addLayer({
              id: 'route-inner',
              type: 'line',
              source: 'preemption-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#22c55e',
                'line-width': 6,
                'line-opacity': 0.98,
              },
            });

            map.addLayer({
              id: 'route-center-dashes',
              type: 'line',
              source: 'preemption-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#dcfce7',
                'line-width': 1.8,
                'line-dasharray': [2, 3],
                'line-opacity': 0.9,
              },
            });
          } catch (_) {}

          // 2. Deadlock Bypass Corridor Line
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
                id: 'bypass-route-glow',
                type: 'line',
                source: 'bypass-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                  'line-color': '#f59e0b',
                  'line-width': 12,
                  'line-blur': 5,
                  'line-opacity': 0.28,
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
                  'line-opacity': 0.85,
                },
              });
            }
          } catch (_) {}

          // 3. BLE Geodesic Radar Ring
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
                'fill-color': '#06b6d4',
                'fill-opacity': 0.16,
              },
            });

            map.addLayer({
              id: 'ble-wave-stroke',
              type: 'line',
              source: 'ble-wave',
              paint: {
                'line-color': '#22d3ee',
                'line-width': 2.5,
                'line-dasharray': [3, 2],
                'line-opacity': 0.9,
              },
            });
          } catch (_) {}

          setMapLoaded(true);
          setTimeout(() => {
            if (mapRef.current) mapRef.current.resize();
          }, 150);
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
  }, [corridor.id, selectedStyleIndex]);

  // ---- Dynamically Update Road-Snapped Polyline Geometry When OSRM Finishes ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      const primarySrc = map.getSource('preemption-route');
      if (primarySrc && Array.isArray(corridor.route) && corridor.route.length >= 2) {
        primarySrc.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: corridor.route },
        });
      }
      const bypassSrc = map.getSource('bypass-route');
      if (bypassSrc && Array.isArray(corridor.bypassRoute) && corridor.bypassRoute.length >= 2) {
        bypassSrc.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: corridor.bypassRoute },
        });
      }
    } catch (_) {}
  }, [corridor.route, corridor.bypassRoute, mapLoaded]);

  // ---- Highlight Bypass Route vs Primary Route When Deadlock Rerouting Toggles ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      const isBypass = Boolean(simState.deadlockRerouteActive);
      if (map.getLayer('route-inner')) {
        map.setPaintProperty('route-inner', 'line-color', isBypass ? '#ef4444' : '#22c55e');
        map.setPaintProperty('route-inner', 'line-opacity', isBypass ? 0.45 : 0.98);
      }
      if (map.getLayer('route-glow')) {
        map.setPaintProperty('route-glow', 'line-color', isBypass ? '#ef4444' : '#10b981');
      }
      if (map.getLayer('bypass-route-line')) {
        map.setPaintProperty('bypass-route-line', 'line-color', isBypass ? '#38bdf8' : '#f59e0b');
        map.setPaintProperty('bypass-route-line', 'line-width', isBypass ? 6.5 : 3.5);
        map.setPaintProperty('bypass-route-line', 'line-opacity', isBypass ? 1.0 : 0.65);
      }
      if (map.getLayer('bypass-route-glow')) {
        map.setPaintProperty('bypass-route-glow', 'line-color', isBypass ? '#38bdf8' : '#f59e0b');
        map.setPaintProperty('bypass-route-glow', 'line-opacity', isBypass ? 0.55 : 0.22);
      }
    } catch (_) {}
  }, [simState.deadlockRerouteActive, mapLoaded]);

  // ---- Update BLE Circle Layer & Smooth Chase Camera ----
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
          pitch: 64,
          zoom: 17.1,
          duration: 90,
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

  // ---- Ambulance 3D Volumetric Marker (Strictly Road-Aligned) ----
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
          <div style="position:relative; width:36px; height:64px; display:flex; align-items:center; justify-content:center; pointer-events:none;">
            <!-- Volumetric Headlight Beam Cones -->
            <div style="position:absolute; top:-34px; width:38px; height:42px; background:linear-gradient(to top, rgba(254,240,138,0.48) 0%, rgba(56,189,248,0.18) 60%, rgba(0,0,0,0) 100%); clip-path:polygon(25% 100%, 75% 100%, 100% 0%, 0% 0%); pointer-events:none;"></div>
            <!-- Red/Blue Emergency Strobe Halo -->
            <div style="position:absolute; width:46px; height:46px; border-radius:50%; background:radial-gradient(circle, rgba(239,68,68,0.45) 0%, rgba(59,130,246,0.35) 55%, rgba(0,0,0,0) 75%); pointer-events:none;"></div>
            <!-- Detailed Top-Down 3D Ambulance Chassis SVG -->
            <svg width="26" height="50" viewBox="0 0 26 50" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 6px 10px rgba(0,0,0,0.85));">
              <rect x="2" y="3" width="22" height="44" rx="5" fill="#f8fafc" stroke="#dc2626" stroke-width="2"/>
              <!-- Windshield -->
              <path d="M4.5 13 L21.5 13 L19.5 7 L6.5 7 Z" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
              <!-- Roof Red/Blue Lightbar -->
              <rect x="5" y="15" width="7.5" height="3.5" rx="1" fill="#ef4444"/>
              <rect x="13.5" y="15" width="7.5" height="3.5" rx="1" fill="#3b82f6"/>
              <!-- Medical Cross on Roof -->
              <rect x="11" y="23" width="4" height="12" rx="0.8" fill="#dc2626"/>
              <rect x="7" y="27" width="12" height="4" rx="0.8" fill="#dc2626"/>
              <!-- Front LED Headlights -->
              <circle cx="6" cy="4" r="1.8" fill="#fef08a"/>
              <circle cx="20" cy="4" r="1.8" fill="#fef08a"/>
              <!-- Rear Tail Lights -->
              <rect x="4" y="45" width="4" height="1.8" rx="0.5" fill="#ef4444"/>
              <rect x="18" y="45" width="4" height="1.8" rx="0.5" fill="#ef4444"/>
            </svg>
            <div style="position:absolute; bottom:-14px; background:rgba(2,6,23,0.92); border:1px solid #22c55e; border-radius:999px; padding:1px 7px; font-family:monospace; font-size:9px; font-weight:900; color:#4ade80; white-space:nowrap; box-shadow:0 2px 8px rgba(0,0,0,0.8);">
              🚑 AMB-108
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

  // ---- Sleek Non-Overlapping 3D Signal Gantry Badges (J1, J2, J3) ----
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

    nodes.forEach((node, idx) => {
      const status = node.status || (simState.signalPhase === 'W_GREEN' ? 'GREEN_WAVE' : 'RED');
      const isGreen = status === 'GREEN_WAVE' || status === 'CLEARED';
      const isGridlock = status === 'GRIDLOCK_BYPASSED';

      const color = isGridlock ? '#f59e0b' : isGreen ? '#22c55e' : '#ef4444';
      const shortBadge = node.shortLabel || `J${idx + 1}`;
      const cleanName = (node.name || '').replace(/^J\d:\s*/, '');
      const statusTag = isGridlock
        ? 'BYPASSED'
        : status === 'GREEN_WAVE'
        ? 'GREEN WAVE'
        : status === 'CLEARED'
        ? 'CLEARED'
        : 'RED';

      // Alternate horizontal badge offset left/right so J1, J2, J3 never overlap along the road axis
      const offsetShiftPx = idx % 2 === 0 ? -58 : 58;

      try {
        const el = document.createElement('div');
        el.className = 'intersection-signal-marker';
        el.innerHTML = `
          <div style="position:relative; display:flex; flex-direction:column; align-items:center; pointer-events:none;">
            <div style="transform:translateX(${offsetShiftPx}px); background:rgba(2,6,23,0.92); border:1.5px solid ${color}; border-radius:999px; padding:3px 9px; font-family:monospace; color:#f8fafc; font-size:9px; white-space:nowrap; box-shadow:0 4px 14px rgba(0,0,0,0.85), 0 0 12px ${color}55; display:flex; align-items:center; gap:5px; margin-bottom:2px;">
              <span style="background:${color}; color:#020617; font-weight:900; padding:0.5px 4px; border-radius:999px; font-size:8px;">${shortBadge}</span>
              <span style="font-weight:700; color:#e2e8f0;">${cleanName}</span>
              <span style="color:${color}; font-weight:900;">• ${statusTag}</span>
            </div>
            <div style="width:2px; height:14px; background:linear-gradient(to bottom, ${color}, rgba(255,255,255,0.2));"></div>
            <div style="width:14px; height:14px; border-radius:50%; background:${color}; border:2.5px solid #ffffff; box-shadow:0 0 16px ${color};"></div>
          </div>
        `;

        const marker = new maplibregl.Marker({ element: el, anchor: 'bottom' })
          .setLngLat(node.coords)
          .addTo(map);

        signalMarkersRef.current.push(marker);
      } catch (_) {}
    });
  }, [corridor, simState.intersectionStates, simState.signalPhase, mapLoaded]);

  // ---- Moving Road-Aligned Civilian Vehicles with Yielding Pull-Over ----
  useEffect(() => {
    const map = mapRef.current;
    const maplibregl = mapLibRef.current;
    if (!map || !maplibregl || !mapLoaded) return;

    const markersMap = civilianMarkersRef.current;
    const activeIds = new Set(civilianVehicles.map((c) => c.id));

    // Remove stale markers
    markersMap.forEach((val, key) => {
      if (!activeIds.has(key)) {
        try { val.marker.remove(); } catch (_) {}
        markersMap.delete(key);
      }
    });

    const bodyColors = ['#38bdf8', '#94a3b8', '#fbbf24', '#a78bfa', '#e2e8f0', '#60a5fa', '#cbd5e1'];

    civilianVehicles.forEach((car, idx) => {
      let markerObj = markersMap.get(car.id);
      const paintColor = bodyColors[idx % bodyColors.length];

      try {
        if (!markerObj) {
          const el = document.createElement('div');
          el.className = `civilian-car-${car.id}`;
          el.innerHTML = `
            <div style="position:relative; width:22px; height:40px; display:flex; align-items:center; justify-content:center; pointer-events:none;">
              <!-- Headlight cone -->
              <div style="position:absolute; top:-18px; width:20px; height:20px; background:linear-gradient(to top, rgba(254,240,138,0.25) 0%, rgba(254,240,138,0) 100%); clip-path:polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%);"></div>
              <svg width="18" height="34" viewBox="0 0 18 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.75));">
                <rect x="1.5" y="2" width="15" height="30" rx="4" fill="${paintColor}" stroke="#0f172a" stroke-width="1.2"/>
                <!-- Windshield & Rear Glass -->
                <path d="M3.2 10 L14.8 10 L13.5 5.5 L4.5 5.5 Z" fill="#0f172a"/>
                <rect x="3.5" y="10.5" width="11" height="11" rx="1.5" fill="#1e293b"/>
                <path d="M4 26 L14 26 L14.5 22.5 L3.5 22.5 Z" fill="#0f172a"/>
                <!-- Headlights -->
                <circle cx="4" cy="3" r="1.2" fill="#fef08a"/>
                <circle cx="14" cy="3" r="1.2" fill="#fef08a"/>
                <!-- Brake lights -->
                <rect x="3" y="30.2" width="3.5" height="1.3" rx="0.4" fill="#ef4444"/>
                <rect x="11.5" y="30.2" width="3.5" height="1.3" rx="0.4" fill="#ef4444"/>
              </svg>
              <div id="car-badge-${car.id}" style="display:none; position:absolute; top:-13px; background:#10b981; color:#020617; font-family:monospace; font-size:7px; font-weight:900; border-radius:999px; padding:1px 5px; white-space:nowrap; box-shadow:0 0 8px #10b981;">
                ⬅ YIELDING
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
        zoom: 17.4,
        pitch: 65,
        bearing: corridor.bearing,
        duration: 1100,
      });
    } else if (mode === 'OVERVIEW') {
      map.flyTo({
        center: corridor.center,
        zoom: 15.5,
        pitch: 48,
        bearing: corridor.bearing,
        duration: 1100,
      });
    }
  };

  // Explicit inline styles guarantee zero overlap regardless of Tailwind compilation
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '100%',
        background: '#020617',
        overflow: 'hidden',
        userSelect: 'none',
        fontFamily: 'monospace',
      }}
    >
      {/* MapLibre WebGL Canvas */}
      <div
        ref={mapContainerRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          width: '100%',
          height: '100%',
        }}
      />

      {/* ── Top-Left Bengaluru Corridor & Green Wave HUD Card ── */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 20,
          width: 315,
          background: 'rgba(2, 6, 23, 0.90)',
          border: '1px solid rgba(34, 197, 94, 0.45)',
          backdropFilter: 'blur(12px)',
          borderRadius: 14,
          padding: '14px 16px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.75)',
          color: '#f1f5f9',
          pointerEvents: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderBottom: '1px solid #1e293b',
            paddingBottom: 8,
            marginBottom: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#22c55e',
                boxShadow: '0 0 8px #22c55e',
              }}
            />
            <span style={{ fontSize: 10, letterSpacing: 1.4, color: '#4ade80', fontWeight: 800 }}>
              BENGALURU 3D GREEN CORRIDOR
            </span>
          </div>
          <span
            style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#0f172a',
              color: simState.v2xConnected ? '#34d399' : '#fbbf24',
              border: '1px solid #334155',
              fontWeight: 700,
            }}
          >
            {simState.v2xConnected ? 'V2X LIVE' : 'LOCAL SIM'}
          </span>
        </div>

        <div style={{ fontSize: 13, fontWeight: 800, color: '#ffffff', marginBottom: 2 }}>
          {corridor.name}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 10 }}>
          {simState.deadlockRerouteActive
            ? `🔀 Bypass Active: ${simState.bypassName}`
            : `🏥 Dest: ${corridor.hospitalName || 'Bowring Hospital'} • Next: ${simState.activeJunctionName}`}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 10 }}>
          <div style={{ background: 'rgba(15,23,42,0.85)', padding: '7px 10px', borderRadius: 8, border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>AMB SPEED</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#4ade80' }}>
              {simState.ambulanceSpeedKmh} <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>km/h</span>
            </div>
          </div>
          <div style={{ background: 'rgba(15,23,42,0.85)', padding: '7px 10px', borderRadius: 8, border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>ROAD HEADING</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#38bdf8' }}>
              {Math.round(simState.ambulanceBearing)}°
            </div>
          </div>
          <div style={{ background: 'rgba(15,23,42,0.85)', padding: '7px 10px', borderRadius: 8, border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>DIST TO SIGNAL</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fbbf24' }}>
              {simState.distanceToNextSignal} <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>m</span>
            </div>
          </div>
          <div style={{ background: 'rgba(15,23,42,0.85)', padding: '7px 10px', borderRadius: 8, border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 9, color: '#64748b' }}>JUNCTION ETA</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#f87171' }}>
              {simState.etaToSignalSeconds} <span style={{ fontSize: 10, fontWeight: 400, color: '#94a3b8' }}>s</span>
            </div>
          </div>
        </div>

        {/* 3-Junction Green Wave Cascade Status List */}
        <div
          style={{
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid #1e293b',
            borderRadius: 9,
            padding: '8px 10px',
          }}
        >
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: 1, marginBottom: 6 }}>
            MULTI-JUNCTION GREEN WAVE CASCADE
          </div>
          {(simState.intersectionStates || []).map((node) => {
            const isGreen = node.status === 'GREEN_WAVE';
            const isCleared = node.status === 'CLEARED';
            const isBypass = node.status === 'GRIDLOCK_BYPASSED';
            const badgeCol = isGreen ? '#4ade80' : isCleared ? '#38bdf8' : isBypass ? '#fbbf24' : '#f87171';
            const badgeBg = isGreen
              ? 'rgba(34,197,94,0.16)'
              : isCleared
              ? 'rgba(56,189,248,0.15)'
              : isBypass
              ? 'rgba(245,158,11,0.18)'
              : 'rgba(239,68,68,0.15)';
            const label = isGreen
              ? '🟢 GREEN WAVE'
              : isCleared
              ? '✓ CLEARED'
              : isBypass
              ? '🔀 BYPASSED'
              : '🔴 RED HOLD';

            return (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 10,
                  padding: '3px 0',
                }}
              >
                <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 175 }}>
                  {node.name}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 9,
                    padding: '1.5px 6px',
                    borderRadius: 4,
                    color: badgeCol,
                    background: badgeBg,
                  }}
                >
                  {label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Bottom-Center Floating Control Dock (Guaranteed No Overlap) ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 22,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: 'rgba(2, 6, 23, 0.92)',
          border: '1px solid #334155',
          backdropFilter: 'blur(12px)',
          borderRadius: 16,
          padding: '8px 12px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.85)',
          pointerEvents: 'auto',
          whiteSpace: 'nowrap',
        }}
      >
        <button
          onClick={onDispatch}
          style={{
            padding: '8px 16px',
            borderRadius: 10,
            fontWeight: 900,
            fontSize: 11,
            letterSpacing: 1,
            background: '#22c55e',
            color: '#020617',
            border: 'none',
            cursor: 'pointer',
            boxShadow: '0 0 18px rgba(34, 197, 94, 0.45)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>▶</span>
          <span>DISPATCH [ENTER]</span>
        </button>

        <button
          onClick={onToggleFreeze}
          style={{
            padding: '8px 12px',
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 11,
            background: simState.isFrozen ? '#f59e0b' : '#0f172a',
            color: simState.isFrozen ? '#020617' : '#e2e8f0',
            border: '1px solid #334155',
            cursor: 'pointer',
          }}
        >
          {simState.isFrozen ? 'UNFREEZE [F]' : 'FREEZE [F]'}
        </button>

        <div
          style={{
            display: 'flex',
            background: '#0f172a',
            borderRadius: 10,
            padding: 3,
            border: '1px solid #1e293b',
            gap: 3,
          }}
        >
          {['CHASE', 'INTERSECTION', 'OVERVIEW', 'FREE'].map((m) => {
            const active = cameraMode === m;
            return (
              <button
                key={m}
                onClick={() => handleCameraChange(m)}
                style={{
                  padding: '5px 10px',
                  borderRadius: 7,
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: active ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                  color: active ? '#4ade80' : '#94a3b8',
                  border: active ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid transparent',
                }}
              >
                {m === 'CHASE' ? 'Chase' : m === 'INTERSECTION' ? 'Junction' : m === 'OVERVIEW' ? 'Corridor' : 'Orbit'}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => setShowSettings(true)}
          style={{
            padding: '7px 10px',
            borderRadius: 10,
            background: '#0f172a',
            border: '1px solid #334155',
            color: '#cbd5e1',
            cursor: 'pointer',
            fontSize: 12,
          }}
          title="Switch 3D Vector / Satellite Map Layer"
        >
          🗺️ Layer
        </button>
      </div>

      {/* ── Map Style / Layer Selector Modal ── */}
      {showSettings && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(2, 6, 23, 0.80)',
            backdropFilter: 'blur(8px)',
            padding: 16,
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: 16,
              padding: 22,
              maxWidth: 400,
              width: '100%',
              color: '#f1f5f9',
              boxShadow: '0 20px 50px rgba(0,0,0,0.9)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>🗺️ Bengaluru Map Layer</span>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
              {MAP_STYLES.map((style, idx) => (
                <button
                  key={style.id}
                  onClick={() => {
                    setSelectedStyleIndex(idx);
                    setShowSettings(false);
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: selectedStyleIndex === idx ? '1.5px solid #22c55e' : '1px solid #1e293b',
                    background: selectedStyleIndex === idx ? 'rgba(34,197,94,0.12)' : '#020617',
                    color: selectedStyleIndex === idx ? '#4ade80' : '#cbd5e1',
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                  }}
                >
                  <span>{style.name}</span>
                  {selectedStyleIndex === idx && <span>✓</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => setShowSettings(false)}
              style={{
                width: '100%',
                padding: '10px 0',
                borderRadius: 10,
                background: '#22c55e',
                color: '#020617',
                fontWeight: 900,
                fontSize: 12,
                border: 'none',
                cursor: 'pointer',
              }}
            >
              CLOSE
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
