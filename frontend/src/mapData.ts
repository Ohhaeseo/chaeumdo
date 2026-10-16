import { useCallback, useEffect, useState } from "react";

export type MapDistrictBoundary = {
  id: string;
  name: string;
  province: string;
  path: string;
};

export type MapBoundaries = {
  provinces: Record<string, string>;
  districts: MapDistrictBoundary[];
};

let cachedBoundaries: MapBoundaries | null = null;
let pendingBoundaries: Promise<MapBoundaries> | null = null;

function validateBoundaries(value: unknown): MapBoundaries {
  if (!value || typeof value !== "object") throw new Error("지도 데이터 형식이 올바르지 않습니다.");
  const candidate = value as Partial<MapBoundaries>;
  if (!candidate.provinces || Object.keys(candidate.provinces).length !== 17 || !Array.isArray(candidate.districts) || candidate.districts.length !== 250) {
    throw new Error("지도 데이터가 완전하지 않습니다.");
  }
  return candidate as MapBoundaries;
}

export function loadMapBoundaries(): Promise<MapBoundaries> {
  if (cachedBoundaries) return Promise.resolve(cachedBoundaries);
  if (!pendingBoundaries) {
    const url = `${import.meta.env.BASE_URL}data/map/boundaries.json`;
    pendingBoundaries = fetch(url, { cache: "force-cache" })
      .then(response => {
        if (!response.ok) throw new Error(`지도 데이터를 불러오지 못했습니다. (${response.status})`);
        return response.json() as Promise<unknown>;
      })
      .then(validateBoundaries)
      .then(value => (cachedBoundaries = value))
      .finally(() => { pendingBoundaries = null; });
  }
  return pendingBoundaries;
}

export function useMapBoundaries() {
  const [boundaries, setBoundaries] = useState<MapBoundaries | null>(cachedBoundaries);
  const [error, setError] = useState("");
  const [requestKey, setRequestKey] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    void loadMapBoundaries().then(value => {
      if (active) setBoundaries(value);
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "지도 데이터를 불러오지 못했습니다.");
    });
    return () => { active = false; };
  }, [requestKey]);

  const retry = useCallback(() => {
    cachedBoundaries = null;
    pendingBoundaries = null;
    setBoundaries(null);
    setRequestKey(value => value + 1);
  }, []);

  return { boundaries, error, retry };
}
