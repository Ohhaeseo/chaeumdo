import boundaries from "./map/boundaries.json";
import neighborhoodData from "./map/neighborhoods.json";

export type Region = {
  id: string;
  name: string;
  fullName: string;
  level: "province" | "district" | "neighborhood";
  parentId: string | null;
  recommended: boolean;
  introduction: string;
  x: number;
  y: number;
};
export type Trip = {
  id: string;
  regionId: string;
  regionIds: string[];
  photoUrl: string;
  startDate: string;
  endDate: string;
  companion: string;
  days: string[][];
  placePhotoUrls?: (string | null)[][];
  placeLocations?: (PlaceLocation | null)[][];
};
export type PlaceLocation = {
  latitude: number;
  longitude: number;
  address: string;
  source: "OpenStreetMap";
  sourceId: string;
};
export const provinces: Region[] = [
  ["11", "서울", "서울특별시", 2, 1],
  ["26", "부산", "부산광역시", 5, 6],
  ["27", "대구", "대구광역시", 4, 4],
  ["28", "인천", "인천광역시", 1, 1],
  ["29", "광주", "광주광역시", 1, 6],
  ["30", "대전", "대전광역시", 2, 4],
  ["31", "울산", "울산광역시", 5, 5],
  ["36", "세종", "세종특별자치시", 2, 3],
  ["41", "경기", "경기도", 2, 2],
  ["42", "강원", "강원특별자치도", 3, 1],
  ["43", "충북", "충청북도", 3, 3],
  ["44", "충남", "충청남도", 1, 3],
  ["45", "전북", "전북특별자치도", 1, 5],
  ["46", "전남", "전라남도", 2, 7],
  ["47", "경북", "경상북도", 4, 3],
  ["48", "경남", "경상남도", 3, 6],
  ["50", "제주", "제주특별자치도", 1, 9],
].map(([id, name, fullName, x, y]) => ({
  id: String(id),
  name: String(name),
  fullName: String(fullName),
  level: "province" as const,
  parentId: null,
  x: Number(x),
  y: Number(y),
  recommended: ["26", "42", "50"].includes(String(id)),
  introduction:
    id === "42"
      ? "푸른 동해와 깊은 숲 사이, 잠깐 쉬어 가는 여행을 떠나 보세요."
      : id === "26"
        ? "바다를 따라 걷고, 골목마다 새로운 풍경을 만나 보세요."
        : "오름을 오르고 바람을 따라 걸으며 나만의 섬 풍경을 담아 보세요.",
}));
const appProvinceId = (boundaryId: string) => boundaryId === "51" ? "42" : boundaryId;
export const districts: Region[] = boundaries.districts.map(item => {
  const parentId = appProvinceId(item.province);
  const province = provinces.find(region => region.id === parentId)!;
  return {
    id: item.id,
    name: item.name,
    fullName: item.name === province.fullName ? province.fullName : `${province.fullName} ${item.name}`,
    level: "district" as const,
    parentId,
    recommended: false,
    introduction: "",
    x: 0,
    y: 0,
  };
});
export const neighborhoods: Region[] = neighborhoodData.map(item => {
  const district = districts.find(region => region.id === item.parentId)!;
  return {
    id: item.id,
    name: item.name,
    fullName: `${district.fullName} ${item.name}`,
    level: "neighborhood" as const,
    parentId: item.parentId,
    recommended: false,
    introduction: "",
    x: 0,
    y: 0,
  };
});
export const regions: Region[] = [...provinces, ...districts, ...neighborhoods];
export const regionById = new Map(regions.map(region => [region.id, region]));
export function provinceIdForRegion(regionId: string) {
  let current = regionById.get(regionId);
  while (current?.parentId) current = regionById.get(current.parentId);
  return current?.id || regionId;
}
export function districtIdForRegion(regionId: string) {
  let current = regionById.get(regionId);
  while (current && current.level === "neighborhood" && current.parentId) current = regionById.get(current.parentId);
  return current?.level === "district" ? current.id : null;
}
export function regionContains(parentId: string, childId: string) {
  let current = regionById.get(childId);
  while (current) {
    if (current.id === parentId) return true;
    current = current.parentId ? regionById.get(current.parentId) : undefined;
  }
  return false;
}
export function regionIdsForTrip(trip: Pick<Trip, "regionId"> & { regionIds?: string[] }) {
  return trip.regionIds?.length ? trip.regionIds : [trip.regionId];
}
export function mostRecentTripForRegion(trips: Trip[], regionId: string) {
  return trips.reduce<Trip | undefined>((latest, candidate) => {
    const matches = regionIdsForTrip(candidate).some(id => regionContains(regionId, id));
    if (!matches) return latest;
    return !latest || candidate.startDate > latest.startDate ? candidate : latest;
  }, undefined);
}
type StoredTrip = Omit<Trip, "photoUrl" | "placePhotoUrls"> & {
  photo: Blob;
  placePhotos?: (Blob | null)[][];
};
function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("chaeummdo-demo", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("trips", { keyPath: "id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function localTrips(): Promise<Trip[]> {
  const db = await openDB();
  const values = await new Promise<StoredTrip[]>((resolve, reject) => {
    const r = db.transaction("trips").objectStore("trips").getAll();
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  db.close();
  return values
    .sort((a, b) => b.startDate.localeCompare(a.startDate))
    .map(({ photo, placePhotos, ...trip }) => ({
      ...trip,
      regionIds: regionIdsForTrip(trip),
      photoUrl: URL.createObjectURL(photo),
      placePhotoUrls: trip.days.map((day, i) => day.map((_, j) => {
        const placePhoto = placePhotos?.[i]?.[j];
        return placePhoto ? URL.createObjectURL(placePhoto) : null;
      })),
    }));
}
export async function saveLocal(trip: Omit<Trip, "photoUrl" | "placePhotoUrls">, photo: Blob, placePhotos: (Blob | null)[][]) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("trips", "readwrite");
    tx.objectStore("trips").put({ ...trip, photo, placePhotos });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}
export async function deleteLocal(id: string) {
  const db = await openDB();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("trips", "readwrite");
    tx.objectStore("trips").delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
  db.close();
}
export async function api<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch("/api" + path, {
    ...options,
    headers: { "X-Requested-With": "chaeummdo", ...options.headers },
  });
  if (!response.ok) {
    const message: Record<number, string> = {
      401: "아이디·비밀번호 또는 복구 코드를 확인해 주세요.",
      404: "입력한 정보로 계정을 찾지 못했어요.",
      409: "이미 사용 중인 아이디이거나 계정에 연결된 기록입니다.",
      413: "사진은 15MB 이하로 선택해 주세요.",
      429: "잠시 후 다시 시도해 주세요.",
    };
    throw new Error(message[response.status] ?? "요청을 완료하지 못했어요. 서버 연결과 입력 내용을 확인해 주세요.");
  }
  const body = await response.text();
  return body ? JSON.parse(body) as T : undefined as T;
}
