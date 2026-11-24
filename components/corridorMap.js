const zoomWidth = (width) => ['interpolate', ['exponential', 2], ['zoom'], 14, width / 8, 20, width * 8];
const road = (id, kind, color, width) => ({
  id, type: 'line', source: 'district', filter: ['==', ['get', 'kind'], kind],
  layout: { 'line-cap': 'round', 'line-join': 'round' },
  paint: { 'line-color': color, 'line-width': kind === 'main' ? [
    'interpolate', ['exponential', 2], ['zoom'],
    14, ['*', 0.215, ['+', ['get', 'widthMeters'], id === 'main-casing' ? 0.8 : 0]],
    20, ['*', 13.76, ['+', ['get', 'widthMeters'], id === 'main-casing' ? 0.8 : 0]],
  ] : zoomWidth(width) },
});
export const streetStyle = {
  version: 8, glyphs: '/maps/fonts/{fontstack}/{range}.pbf',
  sources: { district: { type: 'geojson', data: '/maps/bengaluru.geojson', tolerance: 0.1, maxzoom: 19 } },
  layers: [
    { id: 'ground', type: 'background', paint: { 'background-color': '#eeeae0' } },
    ...[['green', '#cbd9bd'], ['water', '#b8d5d9'], ['building', '#ddd7c8']].map(([kind, color]) => ({
      id: kind, type: 'fill', source: 'district', filter: ['==', ['get', 'kind'], kind],
      paint: { 'fill-color': color, 'fill-outline-color': kind === 'building' ? '#c9c3b4' : color },
    })),
    road('paths', 'path', '#f9f6eb', 2.7), road('side-casing', 'street', '#cec8b9', 10),
    road('side-streets', 'street', '#fffdf5', 8.7), road('main-casing', 'main', '#b9b4a7', 15),
    road('main-streets', 'main', '#fffdf6', 13),
    { id: 'street-labels', type: 'symbol', source: 'district', filter: ['all', ['has', 'name'], ['==', ['geometry-type'], 'LineString']],
      layout: { 'symbol-placement': 'line', 'symbol-spacing': 280, 'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Regular'], 'text-size': 11, 'text-offset': [0, -0.85] },
      paint: { 'text-color': '#514f49', 'text-halo-color': '#f7f5ed', 'text-halo-width': 1.8 } },
    { id: 'landmarks', type: 'symbol', minzoom: 15.5, source: 'district', filter: ['==', ['get', 'kind'], 'place'],
      layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': 11,
        'text-max-width': 11, 'text-padding': 8 },
      paint: { 'text-color': '#617062', 'text-halo-color': '#f6f5ea', 'text-halo-width': 1.5 } },
  ],
};
export function addTrafficLayer(map, source, data) {
  map.addSource(source, { type: 'geojson', data, tolerance: 0, maxzoom: 20 });
  map.addLayer({ id: source + '-ink', type: 'line', source,
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': ['get', 'color'], 'line-opacity': 0.88,
      'line-width': ['interpolate', ['exponential', 2], ['zoom'], 14, 0.85, 17, 1.8, 20, 11] },
  }, map.getLayer('street-labels') ? 'street-labels' : undefined);
}
