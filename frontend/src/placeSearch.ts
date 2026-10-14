import { type PlaceLocation } from "./data";

export type PlaceSearchResult = { name: string; location: PlaceLocation };
type PhotonFeature = {
  geometry?: { coordinates?: [number, number] };
  properties?: Record<string, string | number | undefined>;
};

const endpoint = import.meta.env.VITE_PLACE_SEARCH_URL || "https://photon.komoot.io/api";
const cache = new Map<string, PlaceSearchResult[]>();

function addressOf(properties: Record<string, string | number | undefined>) {
  return [properties.street, properties.district, properties.city, properties.county, properties.state, properties.country]
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join(" · ");
}

export async function searchPlaces(query: string): Promise<PlaceSearchResult[]> {
  const normalized = query.trim();
  if (normalized.length < 2) return [];
  const cached = cache.get(normalized);
  if (cached) return cached;
  const url = new URL(endpoint);
  url.searchParams.set("q", normalized);
  url.searchParams.set("limit", "5");
  url.searchParams.set("bbox", "124,33,132,39");
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error("장소 검색 서비스에 연결하지 못했어요.");
  const body = await response.json() as { features?: PhotonFeature[] };
  const results = (body.features || []).flatMap(feature => {
    const coordinates = feature.geometry?.coordinates;
    const properties = feature.properties || {};
    const name = String(properties.name || "").trim();
    if (!coordinates || !name || !Number.isFinite(coordinates[0]) || !Number.isFinite(coordinates[1])) return [];
    return [{
      name,
      location: {
        longitude: coordinates[0], latitude: coordinates[1], address: addressOf(properties),
        source: "OpenStreetMap" as const,
        sourceId: `${properties.osm_type || "osm"}/${properties.osm_id || `${coordinates[0]},${coordinates[1]}`}`,
      },
    }];
  });
  cache.set(normalized, results);
  return results;
}
