"use client";

import React, { useEffect, useRef, useState } from 'react';
import 'maplibre-gl/dist/maplibre-gl.css';

// ── 1. Geodesic Circle Generator for BLE Radar Dome ─────────────────────────
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

// ── 2. Procedural 3D Bengaluru Building Extrusion Generator ─────────────────
// Guarantees 100% reliable 3D buildings (`fill-extrusion`) along both sides of
// any Bengaluru corridor without relying on fragile external vector tile servers!
function generateCorridor3DBuildingsGeoJson(routeCoords) {
  const features = [];
  if (!Array.isArray(routeCoords) || routeCoords.length < 2) {
    return { type: 'FeatureCollection', features };
  }

  const palette = ['#1e293b', '#172554', '#0f172a', '#1e3a5f', '#1e293b', '#273549'];

  for (let i = 0; i < routeCoords.length - 1; i++) {
    const [lon1, lat1] = routeCoords[i];
    const [lon2, lat2] = routeCoords[i + 1];
    const dx = lon2 - lon1;
    const dy = lat2 - lat1;
    const segLen = Math.hypot(dx, dy);
    if (segLen < 0.00015) continue;

    // Unit normal perpendicular to road segment
    const nx = -dy / segLen;
    const ny = dx / segLen;
    const tx = dx / segLen;
    const ty = dy / segLen;

    const steps = Math.max(1, Math.min(4, Math.floor(segLen / 0.00055)));
    for (let s = 0; s < steps; s++) {
      const frac = (s + 0.5) / steps;
      const baseLon = lon1 + dx * frac;
      const baseLat = lat1 + dy * frac;

      // Place 3D commercial/tech-park buildings on both Left (+1) and Right (-1) sides of the avenue
      [-1, 1].forEach((side, sideIdx) => {
        // Row 1: Front avenue buildings (set back ~26m from road centerline so road is never covered)
        const setbackDeg = 0.00027 * side;
        const halfWidth = 0.00014 + ((i + s) % 3) * 0.00004;
        const halfDepth = 0.00012 + ((i + sideIdx) % 2) * 0.00005;

        const cx = baseLon + nx * setbackDeg;
        const cy = baseLat + ny * setbackDeg;

        const p1 = [cx - tx * halfWidth - nx * halfDepth, cy - ty * halfWidth - ny * halfDepth];
        const p2 = [cx + tx * halfWidth - nx * halfDepth, cy + ty * halfWidth - ny * halfDepth];
        const p3 = [cx + tx * halfWidth + nx * halfDepth, cy + ty * halfWidth + ny * halfDepth];
        const p4 = [cx - tx * halfWidth + nx * halfDepth, cy - ty * halfWidth + ny * halfDepth];

        const heightMeters = 18 + ((i * 7 + s * 13 + sideIdx * 11) % 44);
        features.push({
          type: 'Feature',
          properties: {
            height: heightMeters,
            base: 0,
            color: palette[(i + s + sideIdx) % palette.length],
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[p1, p2, p3, p4, p1]],
          },
        });

        // Row 2: Secondary skyline block further back (~68m from road)
        const setback2 = 0.00066 * side;
        const cx2 = baseLon + nx * setback2;
        const cy2 = baseLat + ny * setback2;
        const hw2 = halfWidth * 1.15;
        const hd2 = halfDepth * 1.25;

        const q1 = [cx2 - tx * hw2 - nx * hd2, cy2 - ty * hw2 - ny * hd2];
        const q2 = [cx2 + tx * hw2 - nx * hd2, cy2 + ty * hw2 - ny * hd2];
        const q3 = [cx2 + tx * hw2 + nx * hd2, cy2 + ty * hw2 + ny * hd2];
        const q4 = [cx2 - tx * hw2 + nx * hd2, cy2 - ty * hw2 + ny * hd2];

        features.push({
          type: 'Feature',
          properties: {
            height: 28 + ((i * 11 + s * 5 + sideIdx * 17) % 55),
            base: 0,
            color: palette[(i + s + 2) % palette.length],
          },
          geometry: {
            type: 'Polygon',
            coordinates: [[q1, q2, q3, q4, q1]],
          },
        });
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

// ── 3. Instant-Loading Multi-CDN Basemap Styles (Zero External Vector Failures) ──
const BENGALURU_3D_DARK_STYLE = {
  version: 8,
  name: 'Bengaluru 3D Smart City + Live Traffic (Default)',
  sources: {
    'carto-dark': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'carto-dark-layer', type: 'raster', source: 'carto-dark', minzoom: 0, maxzoom: 19 },
  ],
};

const BENGALURU_3D_COLOR_STREETS_STYLE = {
  version: 8,
  name: 'Bengaluru 3D Color Streets + Live Traffic',
  sources: {
    'carto-voyager': {
      type: 'raster',
      tiles: [
        'https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
        'https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'carto-voyager-layer', type: 'raster', source: 'carto-voyager', minzoom: 0, maxzoom: 19 },
  ],
};

const ESRI_SATELLITE_STYLE = {
  version: 8,
  name: 'Bengaluru 3D Satellite Hybrid + Live Traffic',
  sources: {
    'esri-satellite': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
    'esri-satellite-labels': {
      type: 'raster',
      tiles: [
        'https://services.arcgisonline.com/arcgis/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
      ],
      tileSize: 256,
      maxzoom: 19,
    },
  },
  layers: [
    { id: 'satellite-base', type: 'raster', source: 'esri-satellite', minzoom: 0, maxzoom: 19 },
    { id: 'satellite-roads', type: 'raster', source: 'esri-satellite-labels', minzoom: 0, maxzoom: 19 },
  ],
};

const MAP_STYLES = [
  {
    id: 'blr-3d-dark',
    name: 'Bengaluru 3D Smart City + Live Traffic (Default)',
    style: BENGALURU_3D_DARK_STYLE,
  },
  {
    id: 'blr-3d-color',
    name: 'Bengaluru 3D Color Streets + Live Traffic',
    style: BENGALURU_3D_COLOR_STREETS_STYLE,
  },
  {
    id: 'esri-satellite',
    name: 'Bengaluru 3D Satellite Hybrid + Live Traffic',
    style: ESRI_SATELLITE_STYLE,
  },
];

export function MapboxSimulation({
  corridor,
  simState,
  civilianVehicles,
  onDispatch,
  onToggleFreeze,
  onToggleTrafficIncident,
}) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const mapLibRef = useRef(null);
  const ambulanceMarkerRef = useRef(null);
  const signalMarkersRef = useRef([]);
  const civilianMarkersRef = useRef(new Map());

  // DEFAULT IS 'LOCKED' (Static Corridor View) so the map NEVER zooms in or reloads tiles when simulation starts!
  const [cameraMode, setCameraMode] = useState('LOCKED');
  const [selectedStyleIndex, setSelectedStyleIndex] = useState(0);
  const [show3DBuildings, setShow3DBuildings] = useState(true);
  const [showLiveTrafficLayer, setShowLiveTrafficLayer] = useState(true);
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

        if (mapRef.current) {
          try { mapRef.current.remove(); } catch (_) {}
          mapRef.current = null;
        }

        const map = new maplibregl.Map({
          container: mapContainerRef.current,
          style: styleObj.style,
          center: corridor.center,
          zoom: corridor.zoom || 15.6,
          pitch: corridor.pitch || 52,
          bearing: corridor.bearing || 284,
          antialias: true,
          attributionControl: false,
        });

        map.on('load', () => {
          if (isCancelled) return;
          mapRef.current = map;

          // Optional Live TomTom Traffic Raster Flow Tile Layer if user configures NEXT_PUBLIC_TOMTOM_KEY
          const tomtomKey =
            typeof process !== 'undefined' ? process.env?.NEXT_PUBLIC_TOMTOM_KEY : null;
          if (tomtomKey) {
            try {
              map.addSource('tomtom-live-traffic', {
                type: 'raster',
                tiles: [
                  `https://api.tomtom.com/traffic/map/4/tile/flow/relative0/{z}/{x}/{y}.png?key=${tomtomKey}&tileSize=256`,
                ],
                tileSize: 256,
              });
              map.addLayer({
                id: 'tomtom-live-traffic-layer',
                type: 'raster',
                source: 'tomtom-live-traffic',
                paint: { 'raster-opacity': 0.85 },
              });
            } catch (_) {}
          }

          // 1. 3D Extruded Bengaluru Corridor Buildings (`fill-extrusion` — 100% reliable local GeoJSON!)
          try {
            const buildingsGeoJson = generateCorridor3DBuildingsGeoJson(corridor.route);
            map.addSource('blr-3d-buildings', {
              type: 'geojson',
              data: buildingsGeoJson,
            });

            map.addLayer({
              id: 'blr-3d-buildings-extrusion',
              type: 'fill-extrusion',
              source: 'blr-3d-buildings',
              paint: {
                'fill-extrusion-color': ['get', 'color'],
                'fill-extrusion-height': ['get', 'height'],
                'fill-extrusion-base': ['get', 'base'],
                'fill-extrusion-opacity': 0.82,
              },
            });
          } catch (_) {}

          // 2. Base Road Asphalt Casing for Primary Corridor
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
                'line-width': 20,
                'line-opacity': 0.9,
              },
            });
          } catch (_) {}

          // 3. LIVE BENGALURU TRAFFIC FEED LAYER (Color-Coded Multi-Segment Traffic Congestion: Red/Orange/Yellow/Green)
          try {
            const initialTrafficData = corridor.liveTrafficGeoJson || {
              type: 'FeatureCollection',
              features: [],
            };

            map.addSource('live-traffic-feed', {
              type: 'geojson',
              data: initialTrafficData,
            });

            // Outer Traffic Congestion Halo
            map.addLayer({
              id: 'live-traffic-glow',
              type: 'line',
              source: 'live-traffic-feed',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': ['get', 'glow'],
                'line-width': [
                  'case',
                  ['==', ['get', 'roadType'], 'CROSS_STREET'],
                  10,
                  18,
                ],
                'line-opacity': 0.45,
                'line-blur': 5,
              },
            });

            // Core Live Traffic Flow Band (Green = Free Flow, Yellow = Moderate, Orange = Heavy, Red = Gridlock)
            map.addLayer({
              id: 'live-traffic-core',
              type: 'line',
              source: 'live-traffic-feed',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': ['get', 'color'],
                'line-width': [
                  'case',
                  ['==', ['get', 'roadType'], 'CROSS_STREET'],
                  4.5,
                  8,
                ],
                'line-opacity': 0.96,
              },
            });

            // Center directional lane dashes on primary corridor
            map.addLayer({
              id: 'route-center-dashes',
              type: 'line',
              source: 'preemption-route',
              layout: { 'line-join': 'round', 'line-cap': 'round' },
              paint: {
                'line-color': '#f8fafc',
                'line-width': 1.6,
                'line-dasharray': [2, 3],
                'line-opacity': 0.85,
              },
            });
          } catch (_) {}

          // 4. Parallel Free-Flow Bypass Corridor Line
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
                  'line-color': '#10b981',
                  'line-width': 12,
                  'line-blur': 5,
                  'line-opacity': 0.25,
                },
              });

              map.addLayer({
                id: 'bypass-route-line',
                type: 'line',
                source: 'bypass-route',
                layout: { 'line-join': 'round', 'line-cap': 'round' },
                paint: {
                  'line-color': '#38bdf8',
                  'line-width': 4,
                  'line-dasharray': [2, 2],
                  'line-opacity': 0.85,
                },
              });
            }
          } catch (_) {}

          // 5. BLE Geodesic Radar Ring
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
                'fill-opacity': 0.15,
              },
            });

            map.addLayer({
              id: 'ble-wave-stroke',
              type: 'line',
              source: 'ble-wave',
              paint: {
                'line-color': '#22d3ee',
                'line-width': 2.2,
                'line-dasharray': [3, 2],
                'line-opacity': 0.9,
              },
            });
          } catch (_) {}

          setMapLoaded(true);
          setTimeout(() => {
            if (mapRef.current) mapRef.current.resize();
          }, 120);
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

  // ---- Dynamically Update Road-Snapped Polyline & 3D Buildings When OSRM Finishes ----
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
      const buildingsSrc = map.getSource('blr-3d-buildings');
      if (buildingsSrc && Array.isArray(corridor.route) && corridor.route.length >= 2) {
        buildingsSrc.setData(generateCorridor3DBuildingsGeoJson(corridor.route));
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

  // ---- Stream Real-Time Live Traffic Feed Segments onto the Map ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded || !corridor.liveTrafficGeoJson) return;
    try {
      const trafficSrc = map.getSource('live-traffic-feed');
      if (trafficSrc) {
        trafficSrc.setData(corridor.liveTrafficGeoJson);
      }
    } catch (_) {}
  }, [corridor.liveTrafficGeoJson, mapLoaded]);

  // ---- Toggle 3D Buildings & Live Traffic Layer Visibility ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      if (map.getLayer('blr-3d-buildings-extrusion')) {
        map.setLayoutProperty(
          'blr-3d-buildings-extrusion',
          'visibility',
          show3DBuildings ? 'visible' : 'none'
        );
      }
      ['live-traffic-glow', 'live-traffic-core'].forEach((layerId) => {
        if (map.getLayer(layerId)) {
          map.setLayoutProperty(layerId, 'visibility', showLiveTrafficLayer ? 'visible' : 'none');
        }
      });
    } catch (_) {}
  }, [show3DBuildings, showLiveTrafficLayer, mapLoaded]);

  // ---- Highlight Bypass Route When Live Traffic Gridlock Rerouting Activates ----
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapLoaded) return;
    try {
      const isBypass = Boolean(simState.deadlockRerouteActive);
      if (map.getLayer('bypass-route-line')) {
        map.setPaintProperty('bypass-route-line', 'line-color', isBypass ? '#22c55e' : '#38bdf8');
        map.setPaintProperty('bypass-route-line', 'line-width', isBypass ? 7 : 3.5);
        map.setPaintProperty('bypass-route-line', 'line-opacity', isBypass ? 1.0 : 0.65);
      }
      if (map.getLayer('bypass-route-glow')) {
        map.setPaintProperty('bypass-route-glow', 'line-color', isBypass ? '#22c55e' : '#38bdf8');
        map.setPaintProperty('bypass-route-glow', 'line-opacity', isBypass ? 0.6 : 0.2);
      }
    } catch (_) {}
  }, [simState.deadlockRerouteActive, mapLoaded]);

  // ---- Update BLE Circle Layer & Camera (NO AUTO-ZOOM-IN ON DISPATCH!) ----
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

    // Only pan gently if user explicitly clicked 'FOLLOW' mode — and NEVER change zoom or bearing!
    if (cameraMode === 'FOLLOW' && simState.isSimulationRunning && !simState.isFrozen) {
      try {
        map.panTo([lon, lat], { duration: 80, easing: (t) => t });
      } catch (_) {}
    }
  }, [
    simState.ambulancePosition,
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
            <div style="position:absolute; top:-34px; width:38px; height:42px; background:linear-gradient(to top, rgba(254,240,138,0.48) 0%, rgba(56,189,248,0.18) 60%, rgba(0,0,0,0) 100%); clip-path:polygon(25% 100%, 75% 100%, 100% 0%, 0% 0%); pointer-events:none;"></div>
            <div style="position:absolute; width:46px; height:46px; border-radius:50%; background:radial-gradient(circle, rgba(239,68,68,0.45) 0%, rgba(59,130,246,0.35) 55%, rgba(0,0,0,0) 75%); pointer-events:none;"></div>
            <svg width="26" height="50" viewBox="0 0 26 50" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 6px 10px rgba(0,0,0,0.85));">
              <rect x="2" y="3" width="22" height="44" rx="5" fill="#f8fafc" stroke="#dc2626" stroke-width="2"/>
              <path d="M4.5 13 L21.5 13 L19.5 7 L6.5 7 Z" fill="#0f172a" stroke="#38bdf8" stroke-width="0.8"/>
              <rect x="5" y="15" width="7.5" height="3.5" rx="1" fill="#ef4444"/>
              <rect x="13.5" y="15" width="7.5" height="3.5" rx="1" fill="#3b82f6"/>
              <rect x="11" y="23" width="4" height="12" rx="0.8" fill="#dc2626"/>
              <rect x="7" y="27" width="12" height="4" rx="0.8" fill="#dc2626"/>
              <circle cx="6" cy="4" r="1.8" fill="#fef08a"/>
              <circle cx="20" cy="4" r="1.8" fill="#fef08a"/>
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

    markersMap.forEach((val, key) => {
      if (!activeIds.has(key)) {
        try { val.marker.remove(); } catch (_) {}
        markersMap.delete(key);
      }
    });

    const bodyColors = ['#38bdf8', '#94a3b8', '#fbbf24', '#a78bfa', '#e2e8f0', '#60a5fa', '#cbd5e1', '#34d399'];

    civilianVehicles.forEach((car, idx) => {
      let markerObj = markersMap.get(car.id);
      const paintColor = bodyColors[idx % bodyColors.length];

      try {
        if (!markerObj) {
          const el = document.createElement('div');
          el.className = `civilian-car-${car.id}`;
          el.innerHTML = `
            <div style="position:relative; width:22px; height:40px; display:flex; align-items:center; justify-content:center; pointer-events:none;">
              <div style="position:absolute; top:-18px; width:20px; height:20px; background:linear-gradient(to top, rgba(254,240,138,0.25) 0%, rgba(254,240,138,0) 100%); clip-path:polygon(30% 100%, 70% 100%, 100% 0%, 0% 0%);"></div>
              <svg width="18" height="34" viewBox="0 0 18 34" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter:drop-shadow(0 4px 6px rgba(0,0,0,0.75));">
                <rect x="1.5" y="2" width="15" height="30" rx="4" fill="${paintColor}" stroke="#0f172a" stroke-width="1.2"/>
                <path d="M3.2 10 L14.8 10 L13.5 5.5 L4.5 5.5 Z" fill="#0f172a"/>
                <rect x="3.5" y="10.5" width="11" height="11" rx="1.5" fill="#1e293b"/>
                <path d="M4 26 L14 26 L14.5 22.5 L3.5 22.5 Z" fill="#0f172a"/>
                <circle cx="4" cy="3" r="1.2" fill="#fef08a"/>
                <circle cx="14" cy="3" r="1.2" fill="#fef08a"/>
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

    if (mode === 'LOCKED') {
      map.JumpTo
        ? map.jumpTo({
            center: corridor.center,
            zoom: corridor.zoom || 15.6,
            pitch: corridor.pitch || 52,
            bearing: corridor.bearing || 284,
          })
        : map.easeTo({
            center: corridor.center,
            zoom: corridor.zoom || 15.6,
            pitch: corridor.pitch || 52,
            bearing: corridor.bearing || 284,
            duration: 400,
          });
    } else if (mode === 'TOP_2D') {
      map.easeTo({
        center: corridor.center,
        zoom: corridor.zoom || 15.5,
        pitch: 0,
        bearing: 0,
        duration: 450,
      });
    }
  };

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

      {/* ── Top-Left Bengaluru Live Traffic & Green Wave HUD Card ── */}
      <div
        style={{
          position: 'absolute',
          top: 16,
          left: 16,
          zIndex: 20,
          width: 325,
          background: 'rgba(2, 6, 23, 0.92)',
          border: '1px solid rgba(34, 197, 94, 0.45)',
          backdropFilter: 'blur(12px)',
          borderRadius: 14,
          padding: '13px 15px',
          boxShadow: '0 12px 32px rgba(0, 0, 0, 0.78)',
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
            paddingBottom: 7,
            marginBottom: 8,
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
            <span style={{ fontSize: 10, letterSpacing: 1.2, color: '#4ade80', fontWeight: 800 }}>
              BTP LIVE TRAFFIC & V2X CORRIDOR
            </span>
          </div>
          <span
            style={{
              fontSize: 9,
              padding: '2px 6px',
              borderRadius: 4,
              background: '#0f172a',
              color: '#38bdf8',
              border: '1px solid #334155',
              fontWeight: 700,
            }}
          >
            LOCKED ZOOM (NO LAG)
          </span>
        </div>

        <div style={{ fontSize: 12.5, fontWeight: 800, color: '#ffffff', marginBottom: 2 }}>
          {corridor.name}
        </div>
        <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 9 }}>
          {simState.deadlockRerouteActive
            ? `🔀 Live Traffic Diverted: ${simState.bypassName}`
            : `🏥 Dest: ${corridor.hospitalName || 'Bowring Hospital'} • Next: ${simState.activeJunctionName}`}
        </div>

        {/* Live Traffic Feed Color Legend & Avg Flow Speed */}
        <div
          style={{
            background: 'rgba(15, 23, 42, 0.92)',
            border: '1px solid #1e293b',
            borderRadius: 9,
            padding: '7px 10px',
            marginBottom: 9,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
            <span style={{ fontSize: 9, color: '#cbd5e1', fontWeight: 800 }}>
              🚦 LIVE TRAFFIC FEED ({simState.liveTrafficSource || 'BTP + OSRM'})
            </span>
            <span style={{ fontSize: 9.5, fontWeight: 900, color: '#4ade80' }}>
              Avg: {simState.corridorAvgSpeedKmh || 32} km/h
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 8.5, color: '#cbd5e1' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#22c55e', display: 'inline-block' }} />
              Free (&gt;40)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#facc15', display: 'inline-block' }} />
              Mod (22-39)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#f97316', display: 'inline-block' }} />
              Heavy (10-21)
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: '#ef4444', display: 'inline-block' }} />
              Jam (&lt;10)
            </span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, marginBottom: 9 }}>
          <div style={{ background: 'rgba(15,23,42,0.85)', padding: '6px 9px', borderRadius: 8, border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 8.5, color: '#64748b' }}>AMB SPEED</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#4ade80' }}>
              {simState.ambulanceSpeedKmh} <span style={{ fontSize: 9.5, fontWeight: 400, color: '#94a3b8' }}>km/h</span>
            </div>
          </div>
          <div style={{ background: 'rgba(15,23,42,0.85)', padding: '6px 9px', borderRadius: 8, border: '1px solid #1e293b' }}>
            <div style={{ fontSize: 8.5, color: '#64748b' }}>DIST TO SIGNAL</div>
            <div style={{ fontSize: 15, fontWeight: 900, color: '#fbbf24' }}>
              {simState.distanceToNextSignal} <span style={{ fontSize: 9.5, fontWeight: 400, color: '#94a3b8' }}>m</span>
            </div>
          </div>
        </div>

        {/* 3-Junction Green Wave Cascade Status List */}
        <div
          style={{
            background: 'rgba(15,23,42,0.9)',
            border: '1px solid #1e293b',
            borderRadius: 9,
            padding: '7px 10px',
          }}
        >
          <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, letterSpacing: 1, marginBottom: 5 }}>
            LIVE TRAFFIC SIGNAL PREEMPTION
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
              ? '🟢 FLUSHING GREEN'
              : isCleared
              ? '✓ CLEARED'
              : isBypass
              ? '🔀 JAM BYPASSED'
              : '🔴 TRAFFIC QUEUE';

            return (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  fontSize: 9.5,
                  padding: '2.5px 0',
                }}
              >
                <span style={{ color: '#cbd5e1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 165 }}>
                  {node.name}
                </span>
                <span
                  style={{
                    fontWeight: 800,
                    fontSize: 8.5,
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

      {/* ── Bottom-Center Floating Control Dock (Guaranteed No Overlap & No Auto-Zoom) ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 25,
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          background: 'rgba(2, 6, 23, 0.94)',
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
            padding: '8px 14px',
            borderRadius: 10,
            fontWeight: 900,
            fontSize: 11,
            letterSpacing: 0.8,
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

        {onToggleTrafficIncident && (
          <button
            onClick={onToggleTrafficIncident}
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              fontWeight: 800,
              fontSize: 10.5,
              background: simState.deadlockRerouteActive ? '#ef4444' : '#0f172a',
              color: simState.deadlockRerouteActive ? '#ffffff' : '#fca5a5',
              border: '1px solid #ef4444',
              cursor: 'pointer',
            }}
            title="Inject severe live traffic jam on primary corridor to test automatic ambulance bypass rerouting"
          >
            {simState.deadlockRerouteActive ? '🟢 CLEAR TRAFFIC JAM' : '🔴 INJECT LIVE JAM'}
          </button>
        )}

        <button
          onClick={onToggleFreeze}
          style={{
            padding: '8px 11px',
            borderRadius: 10,
            fontWeight: 800,
            fontSize: 10.5,
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
          {[
            { id: 'LOCKED', label: 'Locked 3D (No Zoom)' },
            { id: 'FOLLOW', label: 'Pan Follow' },
            { id: 'TOP_2D', label: '2D Top' },
          ].map((m) => {
            const active = cameraMode === m.id;
            return (
              <button
                key={m.id}
                onClick={() => handleCameraChange(m.id)}
                style={{
                  padding: '5px 9px',
                  borderRadius: 7,
                  fontSize: 10.5,
                  fontWeight: 700,
                  cursor: 'pointer',
                  background: active ? 'rgba(34, 197, 94, 0.2)' : 'transparent',
                  color: active ? '#4ade80' : '#94a3b8',
                  border: active ? '1px solid rgba(34, 197, 94, 0.45)' : '1px solid transparent',
                }}
              >
                {m.label}
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
            fontSize: 11,
            fontWeight: 700,
          }}
          title="Configure 3D Buildings, Live Traffic Layer & Map Style"
        >
          🗺️ Layers
        </button>
      </div>

      {/* ── Map Style / 3D Buildings / Live Traffic Layer Modal ── */}
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
              maxWidth: 420,
              width: '100%',
              color: '#f1f5f9',
              boxShadow: '0 20px 50px rgba(0,0,0,0.9)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, borderBottom: '1px solid #1e293b', paddingBottom: 10 }}>
              <span style={{ fontSize: 14, fontWeight: 800 }}>🗺️ Bengaluru 3D & Live Traffic Layers</span>
              <button
                onClick={() => setShowSettings(false)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: 16, cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Toggles for 3D Extruded Buildings and Live Traffic Flow Overlay */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: '#020617',
                  borderRadius: 10,
                  border: '1px solid #1e293b',
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                <span>🏢 3D Extruded Bengaluru Buildings</span>
                <input
                  type="checkbox"
                  checked={show3DBuildings}
                  onChange={(e) => setShow3DBuildings(e.target.checked)}
                />
              </label>

              <label
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 12px',
                  background: '#020617',
                  borderRadius: 10,
                  border: '1px solid #1e293b',
                  fontSize: 11.5,
                  cursor: 'pointer',
                }}
              >
                <span>🚦 Live Traffic Congestion Feed (Red/Orange/Green)</span>
                <input
                  type="checkbox"
                  checked={showLiveTrafficLayer}
                  onChange={(e) => setShowLiveTrafficLayer(e.target.checked)}
                />
              </label>
            </div>

            <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8, fontWeight: 700 }}>
              BASEMAP STYLE (INSTANT-LOAD CDNs):
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
                    fontSize: 11.5,
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