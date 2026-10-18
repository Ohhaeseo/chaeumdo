import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitWithin } from '../src/photoSize.mjs';
test('긴 변 기준 축소, 작은 사진 유지, 세로 사진 비율 보존', () => {
  assert.deepEqual(fitWithin(4032, 3024, 2048), { width: 2048, height: 1536 });
  assert.deepEqual(fitWithin(3024, 4032, 2048), { width: 1536, height: 2048 });
  assert.deepEqual(fitWithin(800, 600, 2048), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(20000, 10, 2048), { width: 2048, height: 1 });
});
