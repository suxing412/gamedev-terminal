// 数据区.test.js —— 布局建得出、读池按类归、坏 JSON 报出来不炸、存走写闸（类不对/越界拒）、证据包按序编号。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const D = require('../../内核/数据区.js');

const 临 = () => fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-data-'));

test('区① 建：七个目录都在，幂等；读空池不炸', () => {
  const d = 临();
  try {
    D.建(d); D.建(d);
    for (const 类 of D.布局) assert.ok(fs.existsSync(path.join(d, 类)), 类);
    const 池 = D.读池(d);
    assert.deepStrictEqual(池, { 坏: [], 管线们: [], 特性们: [], 专项们: [], 工单们: [] });
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('区② 存走写闸：存单/存专项 落到对应目录；读池按类归、按文件名排序；读一 没有返回 null', () => {
  const d = 临();
  try {
    const 存 = D.造存(d);
    存.存单({ id: 'TK-2', title: '二' }); 存.存单({ id: 'TK-1', title: '一' });
    存.存专项({ id: 'S-1', 名称: '专' });
    存.存('管线', 'P-1', { id: 'P-1' });
    const 池 = D.读池(d);
    assert.deepStrictEqual(池.工单们.map((t) => t.id), ['TK-1', 'TK-2']);
    assert.strictEqual(池.专项们[0].名称, '专');
    assert.strictEqual(池.管线们.length, 1);
    assert.strictEqual(D.读一(d, '工单', 'TK-1').title, '一');
    assert.strictEqual(D.读一(d, '工单', 'TK-9'), null);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('区③ 类不对 / 没 id → 炸；坏 JSON 进 坏 列表不炸，其余照读', () => {
  const d = 临();
  try {
    const 存 = D.造存(d);
    assert.throws(() => 存.存('杂物', 'x', {}), /没有「杂物」这一类/);
    assert.throws(() => 存.存('工单', '', {}), /要有 id/);
    存.存单({ id: 'TK-1' });
    fs.writeFileSync(path.join(d, '工单', 'TK-坏.json'), '{不是 json');
    const 池 = D.读池(d);
    assert.strictEqual(池.工单们.length, 1);
    assert.strictEqual(池.坏.length, 1);
    assert.match(池.坏[0].文件, /TK-坏/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('区④ 证据包按 单号-序 编号，序从盘上已有的往后数（重启不覆盖）', () => {
  const d = 临();
  try {
    const a = D.造存(d);
    a.存包({ 单号: 'TK-1' }); a.存包({ 单号: 'TK-1' });
    const b = D.造存(d);   // 模拟重启
    const p = b.存包({ 单号: 'TK-1' });
    assert.match(p, /TK-1-3\.json$/);
    assert.strictEqual(fs.readdirSync(path.join(d, '证据')).length, 3);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
