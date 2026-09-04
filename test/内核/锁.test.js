// 锁.test.js —— 单飞不叠；文件锁独占、放了才让、过期才抢、读不出来不抢。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const L = require('../../内核/锁.js');
const K = require('../../内核/时钟.js');

const 临 = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-lock-'));

test('锁① 单飞：拿到一次，第二次 试 是 false，放了才又能拿', () => {
  const 锁 = L.单飞('拍');
  assert.strictEqual(锁.试(), true);
  assert.strictEqual(锁.试(), false);
  assert.strictEqual(锁.在(), true);
  锁.放();
  assert.strictEqual(锁.试(), true);
});

test('锁② 文件锁：第一个拿到，第二个拿不到；放了第二个能拿；持有者记 pid', () => {
  const d = 临(); const 路 = path.join(d, 'x.lock');
  try {
    const a = L.文件锁(路); const b = L.文件锁(路);
    assert.strictEqual(a.试(), true);
    assert.strictEqual(b.试(), false);
    assert.strictEqual(a.持有者().pid, process.pid);
    a.放();
    assert.strictEqual(b.试(), true);
    b.放();
    assert.strictEqual(fs.existsSync(路), false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('锁③ 过期才抢：假钟拨过过期时限，第二个能抢；没过不抢', () => {
  const d = 临(); const 路 = path.join(d, 'y.lock');
  try {
    const 钟 = K.假钟('2026-09-05T00:00:00Z');
    const a = L.文件锁(路, { 钟, 过期ms: 60 * 1000 });
    const b = L.文件锁(路, { 钟, 过期ms: 60 * 1000 });
    assert.strictEqual(a.试(), true);
    钟.拨(30 * 1000);
    assert.strictEqual(b.试(), false, '没过期不抢');
    钟.拨(31 * 1000);
    assert.strictEqual(b.试(), true, '过期了抢');
    assert.strictEqual(b.持有者().t, 钟.现在());
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('锁④ 锁文件读不出来（不是 JSON）→ 当活锁，不抢', () => {
  const d = 临(); const 路 = path.join(d, 'z.lock');
  try {
    fs.writeFileSync(路, '不是 json');
    assert.strictEqual(L.文件锁(路).试(), false);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
