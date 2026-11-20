import { test } from "node:test";
import assert from "node:assert/strict";
import { dateRange, dayDate, inclusiveDays, stayLabel } from "../src/dates.mjs";
import { withObjectParticle } from "../src/korean.mjs";
test("포함 일수, 월/연도 경계, 윤년과 잘못된 순서", () => {
  assert.equal(inclusiveDays("2026-09-10", "2026-09-12"), 3);
  assert.equal(inclusiveDays("2026-09-10", "2026-09-10"), 1);
  assert.equal(inclusiveDays("2024-02-28", "2024-03-01"), 3);
  assert.equal(inclusiveDays("2025-12-31", "2026-01-01"), 2);
  assert.equal(inclusiveDays("2026-09-12", "2026-09-10"), 0);
  assert.equal(inclusiveDays("", ""), 0);
});
test("DAY 날짜, 숙박 표기와 기간 표기", () => {
  assert.equal(dayDate("2024-02-28", 0), "2/28");
  assert.equal(dayDate("2024-02-28", 1), "2/29");
  assert.equal(dayDate("2025-12-31", 1), "1/1");
  assert.equal(stayLabel(1), "당일치기");
  assert.equal(stayLabel(3), "2박 3일");
  assert.equal(dateRange("2026-03-02", "2026-03-04"), "2026.03.02 ~ 2026.03.04");
});
test("받침에 따라 을/를을 붙인다", () => {
  assert.equal(withObjectParticle("강릉"), "강릉을");
  assert.equal(withObjectParticle("종로구"), "종로구를");
  assert.equal(withObjectParticle("서울"), "서울을");
  assert.equal(withObjectParticle("ABC"), "ABC를");
});
