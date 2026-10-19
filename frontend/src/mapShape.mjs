// Boundary paths are absolute "M x,y x,y … Z" rings (see scripts/generate-map.py).
// Returns the region's area and the box of its largest ring, where a photo fill is placed.
export function shapeMetrics(path) {
  let area = 0;
  let largest = -1;
  let main = { x: 0, y: 0, width: 0, height: 0 };
  for (const ring of path.split("M")) {
    const values = (ring.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
    if (values.length < 6) continue;
    let twice = 0;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < values.length; i += 2) {
      const j = (i + 2) % values.length;
      twice += values[i] * values[j + 1] - values[j] * values[i + 1];
      minX = Math.min(minX, values[i]); maxX = Math.max(maxX, values[i]);
      minY = Math.min(minY, values[i + 1]); maxY = Math.max(maxY, values[i + 1]);
    }
    area += twice / 2;
    if (Math.abs(twice) > largest) {
      largest = Math.abs(twice);
      main = { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
  }
  return { area: Math.abs(area), main };
}

// A region smaller than its photo pin would show only a sliver of the photo, so it keeps the pin as well.
export function needsPhotoPin(area, pinDiameter) {
  return Math.sqrt(area) < pinDiameter;
}
