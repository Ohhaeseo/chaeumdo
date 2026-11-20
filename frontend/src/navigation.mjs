// Each screen has a URL, so the phone's back button, refresh and a copied link all land where the app was.
//
//   /                                   전국 지도
//   /my                                 나
//   /provinces/:id                      시·도 지도 (시·군·구 목록)
//   /regions/:id                        지역 기록 (시·군·구, 읍·면·동, 시·도 전체 기록)
//   /regions/:id/trips/:trip            기록 상세
//   /regions/:id/trips/:trip/edit       기록 수정
//   /new?region=:id                     기록 추가
//   /privacy, /terms                    개인정보처리방침, 이용약관 (로그인하지 않아도 열림)
//   /reset-password#token=…             메일로 받은 비밀번호 재설정 링크

/** @typedef {"map" | "districts" | "my" | "region" | "detail" | "form" | "complete" | "privacy" | "terms" | "reset-password"} Screen */
/** @typedef {{ screen: Screen, provinceId?: string, regionId?: string, tripId?: string, editing?: boolean }} Nav */
/** @typedef {{ level: string, parentId: string | null }} RegionNode */
/** @typedef {Map<string, RegionNode>} RegionLookup */

/** @type {Nav} */
export const MAP = { screen: "map" };

/** @param {Nav} nav */
export function pathFor(nav) {
  switch (nav.screen) {
    case "my": return "/my";
    case "privacy": return "/privacy";
    case "terms": return "/terms";
    // The token stays in the fragment, which never leaves the browser.
    case "reset-password": return "/reset-password";
    case "districts": return `/provinces/${nav.provinceId}`;
    // The completion screen is not worth a URL of its own; a refresh there shows the saved region.
    case "region": case "complete": return `/regions/${nav.regionId}`;
    case "detail": return `/regions/${nav.regionId}/trips/${nav.tripId}`;
    case "form":
      if (nav.editing) return `/regions/${nav.regionId}/trips/${nav.tripId}/edit`;
      return nav.regionId ? `/new?region=${nav.regionId}` : "/new";
    default: return "/";
  }
}

/** @param {string} id @param {RegionLookup} regions */
export function provinceOf(id, regions) {
  let current = id;
  for (let parent = regions.get(current)?.parentId; parent; parent = regions.get(current)?.parentId) current = parent;
  return current;
}

/**
 * Reads the screen a URL names. Unknown paths and region codes open the map.
 * @param {string} pathname @param {string} search @param {RegionLookup} regions
 * @returns {Nav}
 */
export function navFromLocation(pathname, search, regions) {
  let parts;
  try {
    parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  } catch {
    return MAP;
  }
  if (parts.length === 1 && ["my", "privacy", "terms", "reset-password"].includes(parts[0])) return { screen: /** @type {Screen} */ (parts[0]) };
  if (parts.length === 2 && parts[0] === "provinces" && regions.get(parts[1])?.level === "province") return { screen: "districts", provinceId: parts[1] };
  if (parts[0] === "regions" && regions.has(parts[1])) {
    const regionId = parts[1];
    const provinceId = provinceOf(regionId, regions);
    if (parts.length === 2) return { screen: "region", provinceId, regionId };
    if (parts.length === 4 && parts[2] === "trips") return { screen: "detail", provinceId, regionId, tripId: parts[3] };
    if (parts.length === 5 && parts[2] === "trips" && parts[4] === "edit") return { screen: "form", provinceId, regionId, tripId: parts[3], editing: true };
  }
  if (parts.length === 1 && parts[0] === "new") {
    const regionId = new URLSearchParams(search).get("region");
    return regionId && regions.has(regionId) ? { screen: "form", provinceId: provinceOf(regionId, regions), regionId } : { screen: "form" };
  }
  return MAP;
}

/**
 * The screen one level up. Used when there is no earlier screen to go back to, e.g. after opening a link.
 * @param {Nav} nav @param {RegionLookup} regions
 * @returns {Nav}
 */
export function parentOf(nav, regions) {
  const region = nav.regionId ? regions.get(nav.regionId) : undefined;
  const province = nav.provinceId ? { screen: /** @type {Screen} */ ("districts"), provinceId: nav.provinceId } : MAP;
  switch (nav.screen) {
    case "detail": return { screen: "region", provinceId: nav.provinceId, regionId: nav.regionId };
    case "region":
      if (region?.level === "neighborhood" && region.parentId) return { screen: "region", provinceId: nav.provinceId, regionId: region.parentId };
      return province;
    case "form":
      if (nav.editing) return { screen: "detail", provinceId: nav.provinceId, regionId: nav.regionId, tripId: nav.tripId };
      if (region && region.level !== "province") return { screen: "region", provinceId: nav.provinceId, regionId: nav.regionId };
      return province;
    case "complete": return province;
    default: return MAP;
  }
}

/** @param {Nav} a @param {Nav} b */
export function sameNav(a, b) {
  return a.screen === b.screen && a.provinceId === b.provinceId && a.regionId === b.regionId && a.tripId === b.tripId && Boolean(a.editing) === Boolean(b.editing);
}
