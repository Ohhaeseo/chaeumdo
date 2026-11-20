import { useCallback, useState } from "react";
import { api, ApiError, localRegionCovers, localTrips, type RegionCover, type Trip } from "./data";

export type Mode = "server" | "demo";

// Demo records hand out blob: URLs; they are released when the list that held them is replaced.
function revoke(urls: (string | null | undefined)[]) {
  for (const url of urls) if (url?.startsWith("blob:")) URL.revokeObjectURL(url);
}
function tripUrls(trip: Trip) {
  return [trip.photoUrl, trip.thumbnailUrl, ...(trip.placePhotoUrls?.flat() || []), ...(trip.placePhotoThumbnailUrls?.flat() || [])];
}

// Trips and 시·도 map photos, from the account (server) or from this browser (demo).
export function useTravelData(mode: Mode) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [covers, setCovers] = useState<RegionCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const replace = useCallback((nextTrips: Trip[], nextCovers: RegionCover[]) => {
    setTrips(old => {
      old.forEach(trip => revoke(tripUrls(trip)));
      return nextTrips;
    });
    setCovers(old => {
      old.forEach(cover => revoke([cover.photoUrl, cover.thumbnailUrl]));
      return nextCovers;
    });
  }, []);

  const reload = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextTrips, nextCovers] = mode === "demo"
        ? await Promise.all([localTrips(), localRegionCovers()])
        : await Promise.all([api<Trip[]>("/trips"), api<RegionCover[]>("/region-covers")]);
      replace(nextTrips, nextCovers);
    } catch (failure) {
      // A 401 has already sent the app back to the login screen.
      if (!(failure instanceof ApiError && failure.status === 401)) setError("여행 기록을 불러오지 못했어요. 연결을 확인해 주세요.");
    } finally {
      setLoading(false);
    }
  }, [mode, replace]);

  const clear = useCallback(() => replace([], []), [replace]);

  return { trips, covers, loading, setLoading, error, reload, clear };
}
