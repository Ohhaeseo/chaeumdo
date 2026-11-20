import { api, deleteLocal, deleteLocalRegionCover, readLocalData, regionIdsForTrip, type RegionCover } from "./data";
import { uploadPrepared } from "./photo";

export type LocalCounts = { trips: number; covers: number };

export async function countLocalData(): Promise<LocalCounts> {
  const { trips, covers } = await readLocalData();
  return { trips: trips.length, covers: covers.length };
}

// Moves the demo records of this browser into the signed-in account, one at a time. Each record leaves the
// device as soon as the account has it, so an interrupted move continues where it stopped. The demo record id
// is the request id, so a record the server already saved is not created twice.
export async function importLocalData(onProgress: (done: number, total: number) => void) {
  const { trips, covers } = await readLocalData();
  // The account's own 시·도 map photos win over the demo ones.
  const taken = new Set((await api<RegionCover[]>("/region-covers")).map(cover => cover.regionId));
  const total = trips.length + covers.length;
  let done = 0;
  onProgress(done, total);
  for (const trip of trips) {
    const photoId = await uploadPrepared(trip.photo);
    const placePhotoIds: (string | null)[][] = [];
    for (const [day, places] of trip.days.entries()) {
      const ids: (string | null)[] = [];
      for (const index of places.keys()) {
        const placePhoto = trip.placePhotos?.[day]?.[index];
        ids.push(placePhoto ? await uploadPrepared(placePhoto) : null);
      }
      placePhotoIds.push(ids);
    }
    await api("/trips", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requestId: trip.id, regionId: trip.regionId, regionIds: regionIdsForTrip(trip), photoId,
        startDate: trip.startDate, endDate: trip.endDate, companion: trip.companion, days: trip.days,
        placePhotoIds, placeLocations: trip.placeLocations ?? null,
      }),
    });
    await deleteLocal(trip.id);
    onProgress(++done, total);
  }
  for (const cover of covers) {
    if (!taken.has(cover.regionId)) {
      const photoId = await uploadPrepared(cover.photo);
      await api(`/region-covers/${cover.regionId}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoId }) });
    }
    await deleteLocalRegionCover(cover.regionId);
    onProgress(++done, total);
  }
}
