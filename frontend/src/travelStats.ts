import { districtIdForRegion, districts, provinceIdForRegion, provinces, regionById, regionIdsForTrip, type Trip } from "./data";
import { inclusiveDays } from "./dates.mjs";

// Everything the map, region lists and MY derive from the trips. Visiting is never stored; it comes from here.
export function travelStats(trips: Trip[], year = String(new Date().getFullYear())) {
  const districtsOf = (trip: Trip) =>
    regionIdsForTrip(trip)
      .map(districtIdForRegion)
      .filter((id): id is string => Boolean(id));
  const visited = new Set(trips.flatMap(regionIdsForTrip));
  const visitedProvinces = new Set(trips.flatMap(trip => regionIdsForTrip(trip).map(provinceIdForRegion)));
  const visitedDistricts = new Set(trips.flatMap(districtsOf));
  const visitedNeighborhoods = new Set([...visited].filter(id => regionById.get(id)?.level === "neighborhood"));
  const thisYearDistricts = new Set(trips.filter(trip => trip.startDate.startsWith(year)).flatMap(districtsOf));
  // A trip through several 읍·면·동 of one 시·군·구 counts once for it.
  const districtTripCounts = new Map<string, number>();
  for (const trip of trips) for (const id of new Set(districtsOf(trip))) districtTripCounts.set(id, (districtTripCounts.get(id) || 0) + 1);
  const topDistrict = [...districtTripCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  const provinceProgress = provinces.map(region => {
    const children = districts.filter(district => district.parentId === region.id);
    const count = children.filter(district => visitedDistricts.has(district.id)).length;
    return { region, count, total: children.length, percent: children.length ? Math.round((count / children.length) * 100) : 0 };
  });
  return {
    year,
    visitedProvinces,
    visitedDistricts,
    visitedNeighborhoods,
    thisYearDistricts,
    topDistrict,
    provinceProgress,
    nationalPercent: Math.round((visitedDistricts.size / districts.length) * 100),
    totalDays: trips.reduce((sum, trip) => sum + inclusiveDays(trip.startDate, trip.endDate), 0),
  };
}

export type TravelStats = ReturnType<typeof travelStats>;
