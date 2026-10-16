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
