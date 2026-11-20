import { test } from "node:test";
import assert from "node:assert/strict";
import { MAP, navFromLocation, parentOf, pathFor, sameNav } from "../src/navigation.mjs";

const regions = new Map([
  ["26", { level: "province", parentId: null }],
  ["26350", { level: "district", parentId: "26" }],
  ["2635051000", { level: "neighborhood", parentId: "26350" }],
]);
const trip = "a1b2c3d4-0000-4000-8000-000000000000";
const read = url => {
  const { pathname, search } = new URL(url, "https://example.com");
  return navFromLocation(pathname, search, regions);
};

test("모든 화면이 주소로 갔다가 같은 화면으로 돌아온다", () => {
  const screens = [
    MAP,
    { screen: "my" },
    { screen: "privacy" },
    { screen: "terms" },
    { screen: "reset-password" },
    { screen: "districts", provinceId: "26" },
    { screen: "region", provinceId: "26", regionId: "26350" },
    { screen: "region", provinceId: "26", regionId: "26" },
    { screen: "region", provinceId: "26", regionId: "2635051000" },
    { screen: "detail", provinceId: "26", regionId: "26350", tripId: trip },
    { screen: "form", provinceId: "26", regionId: "26350", tripId: trip, editing: true },
    { screen: "form", provinceId: "26", regionId: "26" },
    { screen: "form" },
  ];
  for (const nav of screens) assert.ok(sameNav(read(pathFor(nav)), nav), pathFor(nav));
});

test("재설정 링크의 토큰은 주소의 # 뒤에만 있고 화면 주소에는 남지 않는다", () => {
  assert.deepEqual(read("/reset-password#token=abc"), { screen: "reset-password" });
  assert.equal(pathFor({ screen: "reset-password" }), "/reset-password");
});

test("완료 화면은 새로고침하면 저장한 지역 기록을 연다", () => {
  assert.equal(pathFor({ screen: "complete", provinceId: "26", regionId: "26350" }), "/regions/26350");
});

test("모르는 주소와 지역 코드는 전국 지도로 연다", () => {
  for (const url of ["/nope", "/provinces/26350", "/provinces/99", "/regions/99", "/regions/26350/trips", "/new?region=99x", "/%E0%A4%A"]) {
    const nav = read(url);
    assert.ok(url.startsWith("/new") ? sameNav(nav, { screen: "form" }) : sameNav(nav, MAP), url);
  }
});

test("이전 화면이 없을 때 한 단계 위로 간다", () => {
  const up = nav => parentOf(nav, regions);
  assert.deepEqual(up({ screen: "detail", provinceId: "26", regionId: "26350", tripId: trip }), {
    screen: "region",
    provinceId: "26",
    regionId: "26350",
  });
  assert.deepEqual(up({ screen: "region", provinceId: "26", regionId: "2635051000" }), {
    screen: "region",
    provinceId: "26",
    regionId: "26350",
  });
  assert.deepEqual(up({ screen: "region", provinceId: "26", regionId: "26350" }), { screen: "districts", provinceId: "26" });
  assert.deepEqual(up({ screen: "districts", provinceId: "26" }), MAP);
  assert.deepEqual(up({ screen: "form", provinceId: "26", regionId: "26350", tripId: trip, editing: true }), {
    screen: "detail",
    provinceId: "26",
    regionId: "26350",
    tripId: trip,
  });
  assert.deepEqual(up({ screen: "form", provinceId: "26", regionId: "26350" }), { screen: "region", provinceId: "26", regionId: "26350" });
  assert.deepEqual(up({ screen: "form", provinceId: "26", regionId: "26" }), { screen: "districts", provinceId: "26" });
  assert.deepEqual(up({ screen: "form" }), MAP);
  assert.deepEqual(up({ screen: "my" }), MAP);
  assert.deepEqual(up({ screen: "privacy" }), MAP);
  assert.deepEqual(up({ screen: "reset-password" }), MAP);
});
