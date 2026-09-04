// 事件流.test.js —— 只追加、按序读回、坏行报出来不炸、写走写闸（准写区外领不到令牌）。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const E = require('../../内核/事件流.js');
const 写闸 = require('../../内核/写闸.js');
const K = require('../../内核/时钟.js');

const 起 = () => { const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-ev-')); return { d, 闸: 写闸.建闸({ 根: d, 准写: ['事件'] }), 路: path.join(d, '事件', '流.jsonl') }; };

test('流① 记两条、按序读回、每条带 t（假钟）；文件是一行一 JSON', () => {
  const { d, 闸, 路 } = 起();
  try {
    const 钟 = K.假钟('2026-09-05T00:00:00Z');
    const 流 = E.造流(闸, 路, 钟);
    流.记({ 类: '派', 单: 'TK-1' }); 钟.拨(1000);
    流.记({ 类: '初检', 单: 'TK-1', 结果: '通过' });
    const 全 = 流.读();
    assert.deepStrictEqual(全.map((x) => [x.类, x.t]), [['派', '2026-09-05T00:00:00.000Z'], ['初检', '2026-09-05T00:00:01.000Z']]);
    assert.strictEqual(fs.readFileSync(路, 'utf8').split('\n').filter(Boolean).length, 2);
    assert.deepStrictEqual(流.读((x) => x.类 === '初检').length, 1);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('流② 只追加：模块不导出 写；更正是追加一条指着原来那条，旧行原样在', () => {
  const { d, 闸, 路 } = 起();
  try {
    assert.strictEqual(E.写, undefined);
    const 流 = E.造流(闸, 路);
    流.记({ 类: '派', 单: 'TK-1', harness: 'codex' });
    流.更正({ 类: '派', 单: 'TK-1' }, { harness: 'claude' }, '记错了');
    const 全 = 流.读();
    assert.strictEqual(全.length, 2);
    assert.strictEqual(全[0].harness, 'codex', '旧行不改');
    assert.strictEqual(全[1].类, '更正');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('流③ 事件不是对象 / 没有 类 → 炸；写在准写区外 → 写闸拒绝（领不到令牌）', () => {
  const { d, 闸 } = 起();
  try {
    const 流 = E.造流(闸, path.join(d, '事件', 'a.jsonl'));
    assert.throws(() => 流.记('字符串'), /要是对象/);
    assert.throws(() => 流.记({ 单: 'x' }), /要有 类/);
    const 外 = E.造流(闸, path.join(d, '别处', 'b.jsonl'));
    assert.throws(() => 外.记({ 类: '派' }), (e) => e.code === '写闸拒绝');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('流④ 坏行不炸：原样报 坏行 与行号，其余照读', () => {
  const { d, 闸, 路 } = 起();
  try {
    const 流 = E.造流(闸, 路);
    流.记({ 类: '派' });
    fs.appendFileSync(路, '这不是 json\n');
    流.记({ 类: '初检' });
    const 全 = 流.读();
    assert.deepStrictEqual(全.map((x) => x.类), ['派', '坏行', '初检']);
    assert.strictEqual(全[1].行号, 2);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
