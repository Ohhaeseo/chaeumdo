import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const base = process.env.API_URL || "http://127.0.0.1:8080/api";
// Run only against a development DB: this creates one isolated anonymous travel record.
const init = await fetch(base + "/regions");
assert.equal(init.status, 200);
assert.equal((await init.json()).length, 3894);
const cookie = init.headers.get("set-cookie").split(";")[0];
const headers = { Cookie: cookie, "X-Requested-With": "chaeummdo" };
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
  (await fetch(base + "/photos/" + photoId, { headers })).status,
  200,
);
assert.equal(
  (await fetch(base + "/photos/" + photoId)).status,
  404,
  "another traveler must not read photo",
);
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
assert.equal(list[0].placePhotoUrls[0][0], `/api/photos/${photoId}`);
assert.equal(list[0].placePhotoUrls[2][0], null);
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
assert.equal(updated[0].placeLocations[0][0].sourceId, "W/307131");
const clearPlacePhoto = await fetch(base + "/trips/" + list[0].id, {
  method: "PATCH",
  headers: { ...headers, "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, regionId: "26110", regionIds: ["26110", "26350"], photoId: undefined, days: [["해변"], [], ["시장"]], placePhotoIds: [[null], [], [null]] }),
});
assert.equal(clearPlacePhoto.status, 200);
const cleared = await (await fetch(base + "/trips", { headers })).json();
assert.equal(cleared[0].placePhotoUrls[0][0], null);
const otherUpdate = await fetch(base + "/trips/" + list[0].id, {
  method: "PATCH",
  headers: { "X-Requested-With": "chaeummdo", "Content-Type": "application/json" },
  body: JSON.stringify({ ...payload, photoId: undefined, placePhotoIds: undefined }),
});
assert.equal(otherUpdate.status, 404);
assert.equal((await create({ ...payload, requestId: crypto.randomUUID(), placePhotoIds: [[]] })).status, 400);
assert.equal((await create({ ...payload, requestId: crypto.randomUUID(), regionIds: ["1111053000", "1111051500"] })).status, 400);
assert.equal((await create({ ...payload, requestId: crypto.randomUUID(), placeLocations: [[{ latitude: 999, longitude: 126, address: "", source: "OpenStreetMap", sourceId: "bad" }], [], [null]] })).status, 400);
assert.equal(
  (
    await create({
      ...payload,
      requestId: crypto.randomUUID(),
      endDate: "2024-02-27",
    })
  ).status,
  400,
);
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
assert.equal(noOwner.status, 400);
const noHeader = await fetch(base + "/trips", {
  method: "POST",
  headers: { Cookie: cookie, "Content-Type": "application/json" },
  body: JSON.stringify(payload),
});
assert.equal(noHeader.status, 403);
const otherDelete = await fetch(base + "/trips/" + list[0].id, {
  method: "DELETE",
  headers: { "X-Requested-With": "chaeummdo" },
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
assert.deepEqual(await (await fetch(base + "/stats", { headers })).json(), { regions: 0, trips: 0, days: 0 });
console.log(
  "PASS: 17 provinces + 250 districts + 3,627 neighborhoods, 10-digit multi-region trips, upload/read, owner isolation, place photo/location save/retain/remove, atomic retry, create/update/delete, stats, invalid dates/day count, request header protection",
);
