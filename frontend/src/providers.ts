// Map tiles and place search come from outside services. The defaults are OpenStreetMap's and Photon's
// public servers: fine for development, but their usage policies do not cover a public service.
// Set these at build time to switch (docs/DEPLOYMENT.md); empty values keep the defaults.
const env = import.meta.env;

export const mapTiles = {
  // Any raster XYZ tile URL; {z}, {x} and {y} are filled in per tile.
  url: env.VITE_MAP_TILE_URL || "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
  attribution: env.VITE_MAP_ATTRIBUTION || "© OpenStreetMap",
  attributionUrl: env.VITE_MAP_ATTRIBUTION_URL || "https://www.openstreetmap.org/copyright",
};

export const placeSearch = {
  // A Photon-compatible /api endpoint: photon.komoot.io or a self-hosted Photon.
  url: env.VITE_PLACE_SEARCH_URL || "https://photon.komoot.io/api",
  attribution: env.VITE_PLACE_SEARCH_ATTRIBUTION || "검색: Photon · © OpenStreetMap contributors",
  attributionUrl: env.VITE_PLACE_SEARCH_ATTRIBUTION_URL || "https://photon.komoot.io",
};

export function tileUrl(zoom: number, x: number, y: number) {
  return mapTiles.url.replace(/\{z\}/g, String(zoom)).replace(/\{x\}/g, String(x)).replace(/\{y\}/g, String(y));
}
