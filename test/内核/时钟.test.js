// 时钟.test.js —— 假钟不拨不走、拨了才走；真钟只读系统时间。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const K = require('../../内核/时钟.js');

test('钟① 假钟不拨不走：连读两次一样；拨了才前进；拨到能跳', () => {
  const 钟 = K.假钟('2026-09-05T00:00:00Z');
  assert.strictEqual(钟.现在(), 钟.现在());
  assert.strictEqual(钟.现在(), '2026-09-05T00:00:00.000Z');
  钟.拨(K.毫秒.小时 * 2);
  assert.strictEqual(钟.现在(), '2026-09-05T02:00:00.000Z');
  钟.拨到('2026-09-06T00:00:00Z');
  assert.strictEqual(钟.毫秒(), Date.parse('2026-09-06T00:00:00Z'));
});

test('钟② 假钟起点/拨到 不是时间 → 炸，不静默当 NaN 往下传', () => {
  assert.throws(() => K.假钟('不是时间'), /起点不是时间/);
  assert.throws(() => K.假钟().拨到('也不是'), /不是时间/);
});

test('钟③ 真钟读系统时间，两次读之间不倒退；毫秒与现在指同一刻', () => {
  const 钟 = K.真钟();
  const a = 钟.毫秒(); const b = 钟.毫秒();
  assert.ok(b >= a);
  assert.ok(Math.abs(Date.parse(钟.现在()) - 钟.毫秒()) < 1000);
  assert.deepStrictEqual(Object.keys(K.毫秒).sort(), ['分钟', '小时', '天'].sort());
});
