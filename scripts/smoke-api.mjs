import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
const base = process.env.API_URL || "http://127.0.0.1:8080/api";
// Optional: the backend's MEDIA_ROOT, to also check that photo files leave the disk.
const mediaRoot = process.env.MEDIA_ROOT;
const mediaFiles = async (id) => (await readdir(mediaRoot, { recursive: true })).filter((name) => name.includes(id));
const pngSize = (bytes) => ({ width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) });
// Run only against a development DB: this registers two throwaway accounts and deletes them at the end.
const init = await fetch(base + "/regions");
assert.equal(init.status, 200);
assert.equal((await init.json()).length, 3894);
assert.equal(init.headers.get("set-cookie"), null, "reading regions must not create a session");
const password = "Test-password-2026";
const register = async () => {
  const username = `test_${crypto.randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const response = await fetch(base + "/auth/register", {
    method: "POST",
    headers: { "X-Requested-With": "chaeummdo", "Content-Type": "application/json" },
    body: JSON.stringify({ username, displayName: "검증", password }),
  });
  assert.equal(response.status, 200);
  return response.headers.get("set-cookie").split(";")[0];
};
const cookie = await register();
const headers = { Cookie: cookie, "X-Requested-With": "chaeummdo" };
const otherHeaders = { Cookie: await register(), "X-Requested-With": "chaeummdo" };
const picture = await readFile(
  new URL(
    "../frontend/public/fonts/에스코어 드림_라이선스.png",
    import.meta.url,
  ),
);
const form = new FormData();
form.append("file", new Blob([picture], { type: "image/png" }), "test.png");
const upload = await fetch(base + "/photos", {
  method: "POST",
  headers,
  body: form,
});
assert.equal(upload.status, 200);
const { id: photoId } = await upload.json();
assert.equal(
  (await fetch(base + "/photos", { method: "POST", headers: { "X-Requested-With": "chaeummdo" }, body: form })).status,
  401,
  "uploads require an account",
);
const ownPhoto = await fetch(base + "/photos/" + photoId, { headers });
assert.equal(ownPhoto.status, 200);
assert.match(ownPhoto.headers.get("cache-control"), /private.*immutable|immutable.*private/);
assert.equal((await fetch(base + "/photos/" + photoId)).status, 401);
assert.equal(
  (await fetch(base + "/photos/" + photoId, { headers: otherHeaders })).status,
  404,
  "another account must not read photo",
);
const thumbnail = await fetch(base + "/photos/" + photoId + "/thumbnail", { headers });
assert.equal(thumbnail.status, 200);
assert.equal(thumbnail.headers.get("content-type"), "image/png", "thumbnail keeps the original format");
assert.match(thumbnail.headers.get("cache-control"), /private.*immutable|immutable.*private/);
assert.match(thumbnail.headers.get("vary"), /Cookie/);
const original = pngSize(picture);
const small = pngSize(Buffer.from(await thumbnail.arrayBuffer()));
assert.equal(Math.max(small.width, small.height), Math.min(320, Math.max(original.width, original.height)), "thumbnail long edge is 320px, never enlarged");
assert.ok(Math.abs(small.width / small.height - original.width / original.height) < 0.01, "thumbnail keeps the aspect ratio");
assert.equal((await fetch(base + "/photos/" + photoId + "/thumbnail")).status, 401);
assert.equal(
  (await fetch(base + "/photos/" + photoId + "/thumbnail", { headers: otherHeaders })).status,
  404,
  "another account must not read thumbnail",
);
if (mediaRoot) assert.equal((await mediaFiles(photoId)).length, 2, "original and thumbnail files are stored");
const payload = {
  requestId: crypto.randomUUID(),
  regionId: "1111051500",
  regionIds: ["1111051500", "1111053000", "1111054000"],
  photoId,
  startDate: "2024-02-28",
  endDate: "2024-03-01",
  companion: "민지,준호",
  days: [["바다"], [], ["숲"]],
  placePhotoIds: [[photoId], [], [null]],
  placeLocations: [[{ latitude: 37.579617, longitude: 126.977041, address: "서울특별시 종로구", source: "OpenStreetMap", sourceId: "W/307131" }], [], [null]],
};
const create = (body) =>
  fetch(base + "/trips", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
const responses = await Promise.all([create(payload), create(payload)]);
for (const response of responses) assert.equal(response.status, 200);
assert.equal(
  (await responses[0].json()).id,
  (await responses[1].json()).id,
  "retry must return same trip",
);
const list = await (await fetch(base + "/trips", { headers })).json();
assert.equal(list.length, 1);
assert.deepEqual(list[0].days, payload.days);
assert.deepEqual(list[0].regionIds, payload.regionIds);
assert.equal(list[0].companion, "민지,준호");
assert.equal(list[0].thumbnailUrl, `/api/photos/${photoId}/thumbnail`);
assert.equal(list[0].placePhotoUrls[0][0], `/api/photos/${photoId}`);
assert.equal(list[0].placePhotoUrls[2][0], null);
assert.equal(list[0].placePhotoThumbnailUrls[0][0], `/api/photos/${photoId}/thumbnail`);
assert.equal(list[0].placePhotoThumbnailUrls[2][0], null);
assert.equal(list[0].placeLocations[0][0].sourceId, "W/307131");
const stats = await (await fetch(base + "/stats", { headers })).json();
assert.deepEqual(stats, { regions: 3, trips: 1, days: 3 });
const changed = await fetch(base + "/trips/" + list[0].id, {
  method: "PATCH",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, regionId: "26110", regionIds: ["26110", "26350"], photoId: undefined, days: [["해변"], [], ["시장"]], placePhotoIds: undefined, placeLocations: undefined }),
});
assert.equal(changed.status, 200);
const updated = await (await fetch(base + "/trips", { headers })).json();
assert.equal(updated[0].regionId, "26110");
assert.deepEqual(updated[0].regionIds, ["26110", "26350"]);
assert.deepEqual(updated[0].days, [["해변"], [], ["시장"]]);
assert.equal(updated[0].companion, "민지,준호");
assert.equal(updated[0].placePhotoUrls[0][0], `/api/photos/${photoId}`);
assert.equal(updated[0].placePhotoThumbnailUrls[0][0], `/api/photos/${photoId}/thumbnail`);
assert.equal(updated[0].placeLocations[0][0].sourceId, "W/307131");
const clearPlacePhoto = await fetch(base + "/trips/" + list[0].id, {
  method: "PATCH",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, regionId: "26110", regionIds: ["26110", "26350"], photoId: undefined, days: [["해변"], [], ["시장"]], placePhotoIds: [[null], [], [null]] }),
});
assert.equal(clearPlacePhoto.status, 200);
const cleared = await (await fetch(base + "/trips", { headers })).json();
assert.equal(cleared[0].placePhotoUrls[0][0], null);
assert.equal(cleared[0].placePhotoThumbnailUrls[0][0], null);
const otherUpdate = await fetch(base + "/trips/" + list[0].id, {
  method: "PATCH",
  headers: { ...otherHeaders, "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, photoId: undefined, placePhotoIds: undefined }),
});
assert.equal(otherUpdate.status, 404);
assert.equal((await create({ ...payload, requestId: crypto.randomUUID(), placePhotoIds: [[]] })).status, 400);
assert.equal((await create({ ...payload, requestId: crypto.randomUUID(), regionIds: ["1111053000", "1111051500"] })).status, 400);
assert.equal((await create({ ...payload, requestId: crypto.randomUUID(), placeLocations: [[{ latitude: 999, longitude: 126, address: "", source: "OpenStreetMap", sourceId: "bad" }], [], [null]] })).status, 400);
const reversed = await create({
  ...payload,
  requestId: crypto.randomUUID(),
  endDate: "2024-02-27",
});
assert.equal(reversed.status, 400);
assert.deepEqual(await reversed.json(), { status: 400, message: "여행 기간은 1~366일로 입력해 주세요." }, "server reason reaches the app");
assert.equal(
  (await create({ ...payload, requestId: crypto.randomUUID(), days: [] }))
    .status,
  400,
);
const noOwner = await fetch(base + "/trips", {
  method: "POST",
  headers: {
    "X-Requested-With": "chaeummdo",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ ...payload, requestId: crypto.randomUUID() }),
});
assert.equal(noOwner.status, 401);
const noHeader = await fetch(base + "/trips", {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
assert.equal(noHeader.status, 403);
const otherDelete = await fetch(base + "/trips/" + list[0].id, {
  method: "DELETE",
  headers: otherHeaders,
});
assert.equal(otherDelete.status, 404);
const deleteNoHeader = await fetch(base + "/trips/" + list[0].id, {
  method: "DELETE",
  headers: { Cookie: cookie },
});
assert.equal(deleteNoHeader.status, 403);
const deleted = await fetch(base + "/trips/" + list[0].id, {
  method: "DELETE",
  headers,
});
assert.equal(deleted.status, 200);
assert.equal((await (await fetch(base + "/trips", { headers })).json()).length, 0);
assert.equal((await fetch(base + "/photos/" + photoId, { headers })).status, 404);
assert.equal((await fetch(base + "/photos/" + photoId + "/thumbnail", { headers })).status, 404);
if (mediaRoot) assert.deepEqual(await mediaFiles(photoId), [], "trip deletion removes original and thumbnail files");
assert.deepEqual(await (await fetch(base + "/stats", { headers })).json(), { regions: 0, trips: 0, days: 0 });
// A photo no trip uses is removed only by deleting the account.
const leftover = await fetch(base + "/photos", { method: "POST", headers: otherHeaders, body: form });
assert.equal(leftover.status, 200);
const { id: leftoverId } = await leftover.json();
assert.equal((await fetch(base + "/photos/" + leftoverId + "/thumbnail", { headers: otherHeaders })).status, 200);
if (mediaRoot) assert.equal((await mediaFiles(leftoverId)).length, 2);
for (const accountHeaders of [headers, otherHeaders]) {
  const removed = await fetch(base + "/auth/delete", {
    method: "POST",
    headers: { ...accountHeaders, "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  assert.equal(removed.status, 200);
}
assert.equal((await fetch(base + "/photos/" + leftoverId + "/thumbnail", { headers: otherHeaders })).status, 401);
if (mediaRoot) assert.deepEqual(await mediaFiles(leftoverId), [], "account deletion removes original and thumbnail files");
console.log(
  `PASS: public regions without session, 17 provinces + 250 districts + 3,627 neighborhoods, 10-digit multi-region trips, account-only upload/read, private photo cache, owner isolation, 320px cover/place thumbnail URLs and read/cache/owner isolation/cleanup on trip and account deletion${mediaRoot ? " (files checked on disk)" : ""}, place photo/location save/retain/remove, atomic retry, create/update/delete, stats, invalid dates/day count, request header protection, JSON error message`,
);
