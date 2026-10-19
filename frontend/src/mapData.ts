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

export type JejuNeighborhoodBoundary = {
  id: string;
  name: string;
  district: string;
  path: string;
};

// 행정동 layer for the Jeju map (scripts/generate-jeju-neighborhoods.py).
export type JejuBoundaries = {
  source: string;
  districtBorder: string;
  neighborhoods: JejuNeighborhoodBoundary[];
};

// One cached, retryable fetch per static map file: the files never change while the app runs.
function mapFile<T>(file: string, validate: (value: unknown) => T) {
  let cached: T | null = null;
  let pending: Promise<T> | null = null;
  function load(): Promise<T> {
    if (cached) return Promise.resolve(cached);
    if (!pending) {
      pending = fetch(`${import.meta.env.BASE_URL}data/map/${file}`, { cache: "force-cache" })
        .then(response => {
          if (!response.ok) throw new Error(`지도 데이터를 불러오지 못했습니다. (${response.status})`);
          return response.json() as Promise<unknown>;
        })
        .then(validate)
        .then(value => (cached = value))
        .finally(() => { pending = null; });
    }
    return pending;
  }
  function useFile() {
    const [data, setData] = useState<T | null>(cached);
    const [error, setError] = useState("");
    const [requestKey, setRequestKey] = useState(0);

    useEffect(() => {
      let active = true;
      setError("");
      void load().then(value => {
        if (active) setData(value);
      }).catch(reason => {
        if (active) setError(reason instanceof Error ? reason.message : "지도 데이터를 불러오지 못했습니다.");
      });
      return () => { active = false; };
    }, [requestKey]);

    const retry = useCallback(() => {
      cached = null;
      pending = null;
      setData(null);
      setRequestKey(value => value + 1);
    }, []);

    return { data, error, retry };
  }
  return { load, useFile };
}

function validateBoundaries(value: unknown): MapBoundaries {
  if (!value || typeof value !== "object") throw new Error("지도 데이터 형식이 올바르지 않습니다.");
  const candidate = value as Partial<MapBoundaries>;
  if (!candidate.provinces || Object.keys(candidate.provinces).length !== 17 || !Array.isArray(candidate.districts) || candidate.districts.length !== 250) {
    throw new Error("지도 데이터가 완전하지 않습니다.");
  }
  return candidate as MapBoundaries;
}

function validateJeju(value: unknown): JejuBoundaries {
  const candidate = (value || {}) as Partial<JejuBoundaries>;
  if (typeof candidate.districtBorder !== "string" || !Array.isArray(candidate.neighborhoods) || candidate.neighborhoods.length !== 43) {
    throw new Error("제주 읍·면·동 지도 데이터가 완전하지 않습니다.");
  }
  return candidate as JejuBoundaries;
}

const boundariesFile = mapFile("boundaries.json", validateBoundaries);
const jejuFile = mapFile("jeju-neighborhoods.json", validateJeju);

export const loadMapBoundaries = boundariesFile.load;

export function useMapBoundaries() {
  const { data, error, retry } = boundariesFile.useFile();
  return { boundaries: data, error, retry };
}

export function useJejuBoundaries() {
  const { data, error, retry } = jejuFile.useFile();
  return { jeju: data, error, retry };
}
