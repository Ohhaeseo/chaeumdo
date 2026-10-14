import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inclusiveDays } from '../src/dates.mjs';
test('포함 일수, 월/연도 경계, 윤년과 잘못된 순서', () => {
  assert.equal(inclusiveDays('2026-09-10','2026-09-12'),3);
  assert.equal(inclusiveDays('2026-09-10','2026-09-10'),1);
  assert.equal(inclusiveDays('2024-02-28','2024-03-01'),3);
  assert.equal(inclusiveDays('2025-12-31','2026-01-01'),2);
  assert.equal(inclusiveDays('2026-09-12','2026-09-10'),0);
  assert.equal(inclusiveDays('',''),0);
});
