import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { needsPhotoPin, shapeMetrics } from "../src/mapShape.mjs";

const boundariesUrl = new URL("../public/data/map/boundaries.json", import.meta.url);

test("면적과 사진 상자는 가장 큰 고리를 기준으로 한다", () => {
  const square = "M0.0,0.0 10.0,0.0 10.0,10.0 0.0,10.0Z";
  const islet = "M50.0,50.0 52.0,50.0 52.0,52.0 50.0,52.0Z";
  const { area, main } = shapeMetrics(square + islet);
  assert.equal(area, 104);
  assert.deepEqual(main, { x: 0, y: 0, width: 10, height: 10 });
});

test("전국 지도에서는 특별·광역시와 제주만 사진 핀을 함께 쓴다", async () => {
  const { provinces } = JSON.parse(await readFile(boundariesUrl, "utf8"));
  // KoreaMap의 전국 핀 지름(바깥 반지름 33)
  const pinned = Object.entries(provinces).filter(([, path]) => needsPhotoPin(shapeMetrics(path).area, 66)).map(([id]) => id);
  assert.deepEqual(pinned.sort(), ["11", "26", "27", "28", "29", "30", "31", "36", "50"]);
});

test("멀리 떨어진 섬 때문에 사진 상자가 본토 밖으로 넓어지지 않는다", async () => {
  const { provinces } = JSON.parse(await readFile(boundariesUrl, "utf8"));
  const { main } = shapeMetrics(provinces["47"]);
  // 울릉도·독도는 x 579 이상, 전국 지도 viewBox는 x 545까지다.
  assert.ok(main.x + main.width < 545);
  assert.ok(main.width > 150 && main.height > 150);
});
