import { type PlaceLocation } from "./data";

const TILE_SIZE = 256;
const MAP_WIDTH = 330;
const MAP_HEIGHT = 220;

function project(latitude: number, longitude: number, zoom: number) {
  const scale = TILE_SIZE * 2 ** zoom;
  const lat = Math.max(-85.0511, Math.min(85.0511, latitude)) * Math.PI / 180;
  return {
    x: (longitude + 180) / 360 * scale,
    y: (1 - Math.asinh(Math.tan(lat)) / Math.PI) / 2 * scale,
  };
}

function viewport(locations: PlaceLocation[]) {
  for (let zoom = 16; zoom >= 5; zoom--) {
    const points = locations.map(item => project(item.latitude, item.longitude, zoom));
    const minX = Math.min(...points.map(point => point.x));
    const maxX = Math.max(...points.map(point => point.x));
    const minY = Math.min(...points.map(point => point.y));
    const maxY = Math.max(...points.map(point => point.y));
    if (maxX - minX <= MAP_WIDTH - 80 && maxY - minY <= MAP_HEIGHT - 80) {
      return { zoom, centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
    }
  }
  const first = project(locations[0].latitude, locations[0].longitude, 5);
  return { zoom: 5, centerX: first.x, centerY: first.y };
}

export default function PlaceMap({ places }: { places: { name: string; location: PlaceLocation }[] }) {
  if (!places.length) return null;
  const view = viewport(places.map(place => place.location));
  const left = view.centerX - MAP_WIDTH / 2;
  const top = view.centerY - MAP_HEIGHT / 2;
  const firstTileX = Math.floor(left / TILE_SIZE);
  const lastTileX = Math.floor((left + MAP_WIDTH) / TILE_SIZE);
  const firstTileY = Math.floor(top / TILE_SIZE);
  const lastTileY = Math.floor((top + MAP_HEIGHT) / TILE_SIZE);
  const tiles = [];
  const tileCount = 2 ** view.zoom;
  for (let y = firstTileY; y <= lastTileY; y++) for (let x = firstTileX; x <= lastTileX; x++) {
    if (y < 0 || y >= tileCount) continue;
    const wrappedX = ((x % tileCount) + tileCount) % tileCount;
    tiles.push(<img key={`${x}-${y}`} src={`https://tile.openstreetmap.org/${view.zoom}/${wrappedX}/${y}.png`} alt="" loading="lazy" style={{ left: x * TILE_SIZE - left, top: y * TILE_SIZE - top }} />);
  }
  return <section className="place-map-section" aria-label="방문 장소 지도">
    <div className="place-map" style={{ "--map-width": `${MAP_WIDTH}px`, "--map-height": `${MAP_HEIGHT}px` } as React.CSSProperties}>
      <div className="place-map-tiles" aria-hidden="true">{tiles}</div>
      {places.map((place, index) => {
        const point = project(place.location.latitude, place.location.longitude, view.zoom);
        return <span className="place-map-pin" key={`${place.location.sourceId}-${index}`} style={{ left: point.x - left, top: point.y - top }} title={place.name}><i><em>{index + 1}</em></i><b>{place.name}</b></span>;
      })}
      <a className="osm-attribution" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>
    </div>
  </section>;
}
