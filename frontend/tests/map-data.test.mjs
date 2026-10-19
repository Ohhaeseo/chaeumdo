import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const boundariesUrl = new URL("../public/data/map/boundaries.json", import.meta.url);
const metadataUrl = new URL("../src/map/districts.json", import.meta.url);

test("배포용 지도 경계 데이터가 전국 행정구역을 빠짐없이 포함한다", async () => {
  const boundaries = JSON.parse(await readFile(boundariesUrl, "utf8"));
  const metadata = JSON.parse(await readFile(metadataUrl, "utf8"));

  assert.equal(Object.keys(boundaries.provinces).length, 17);
  assert.equal(boundaries.districts.length, 250);
  assert.equal(metadata.length, 250);
  assert.deepEqual(
    new Set(boundaries.districts.map(item => item.id)),
    new Set(metadata.map(item => item.id)),
  );
  assert.ok(boundaries.districts.every(item => item.path.startsWith("M")));
  assert.ok(Object.values(boundaries.provinces).every(path => path.startsWith("M")));
});

test("제주 읍·면·동 경계가 앱의 43개 행정동과 같은 코드·이름으로 제주 안에 있다", async () => {
  const jeju = JSON.parse(await readFile(new URL("../public/data/map/jeju-neighborhoods.json", import.meta.url), "utf8"));
  const neighborhoods = JSON.parse(await readFile(new URL("../src/map/neighborhoods.json", import.meta.url), "utf8"))
    .filter(item => item.parentId.startsWith("50"));
  const { provinces } = JSON.parse(await readFile(boundariesUrl, "utf8"));

  assert.equal(jeju.neighborhoods.length, 43);
  assert.deepEqual(
    jeju.neighborhoods.map(item => [item.id, item.name, item.district]).sort(),
    neighborhoods.map(item => [item.id, item.name, item.parentId]).sort(),
  );
  assert.match(jeju.source, /SGIS/);
  assert.match(jeju.source, /CC BY 4\.0/);
  assert.ok(jeju.districtBorder.startsWith("M") && !jeju.districtBorder.includes("Z"), "district border is an open line");
  // Same projection as boundaries.json: every point stays within the bundled Jeju outline's box (±1 unit).
  const box = values => { const xs = values.filter((_, i) => i % 2 === 0), ys = values.filter((_, i) => i % 2 === 1); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]; };
  const numbers = path => (path.match(/-?\d+(?:\.\d+)?/g) || []).map(Number);
  const [left, top, right, bottom] = box(numbers(provinces["50"]));
  for (const item of jeju.neighborhoods) {
    assert.ok(item.path.startsWith("M"), item.name);
    const [x1, y1, x2, y2] = box(numbers(item.path));
    assert.ok(x1 > left - 1 && y1 > top - 1 && x2 < right + 1 && y2 < bottom + 1, `${item.name} is outside Jeju`);
  }
});
