// 排期.test.js —— 依赖从数据流推、起止按上游与工时、临界松弛为零、环报出来、空转点名、改排期落账不覆盖。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const S = require('../../领域/排期.js');

const 现在 = '2026-09-05T00:00:00Z';
const ms = (iso) => Date.parse(iso);
const H = 3600 * 1000;
const 单们 = () => [
  { id: 'A', 性质: '调研', 状态: '待派', 产出: { 方案: '方案/A.md' } },
  { id: 'B', 性质: '新建', 状态: '待派', 进项: { 方案: '方案/A.md' }, 产出: { 资产: 'x.cs' }, 估算: { 时间: 6 } },
  { id: 'C', 性质: '新建', 状态: '待派', 进项: { 方案: '方案/A.md' }, 产出: { 资产: 'y.cs' } },
  { id: 'D', 性质: '装配', 状态: '待派', 进项: { 方案: '方案/A.md', 资产: ['x.cs', 'y.cs'] } },
];

test('排① 拓扑序按数据流：A 先，B/C 中，D 末；没环', () => {
  const { 序, 环 } = S.拓扑序(单们());
  assert.strictEqual(序[0], 'A');
  assert.strictEqual(序[3], 'D');
  assert.deepStrictEqual(环, []);
});

test('排② 有环报出来、不死循环；环外的照排', () => {
  const 们 = [
    { id: 'X', 状态: '待派', 进项: { 资产: 'y' }, 产出: { 资产: 'x' } },
    { id: 'Y', 状态: '待派', 进项: { 资产: 'x' }, 产出: { 资产: 'y' } },
    { id: 'Z', 状态: '待派' },
  ];
  const r = S.排(们, { 现在 });
  assert.deepStrictEqual([...r.环].sort(), ['X', 'Y']);
  assert.deepStrictEqual(r.条.map((c) => c.id), ['Z']);
  assert.ok(r.不排.some((n) => n.id === 'X' && /环/.test(n.因)));
});

test('排③ 起止：没上游的从现在开；有上游的等上游止；工时取估算，没估算按性质默认', () => {
  const r = S.排(单们(), { 现在 });
  const 按 = Object.fromEntries(r.条.map((c) => [c.id, c]));
  assert.strictEqual(按.A.起, ms(现在));
  assert.strictEqual(按.A.止, ms(现在) + 2 * H, '调研默认 2 小时');
  assert.strictEqual(按.B.起, 按.A.止);
  assert.strictEqual(按.B.止, 按.B.起 + 6 * H, '估算 6 小时');
  assert.strictEqual(按.C.止, 按.C.起 + 4 * H, '新建默认 4 小时');
  assert.strictEqual(按.D.起, Math.max(按.B.止, 按.C.止), '装配等最晚的资产');
  assert.deepStrictEqual([...按.D.上游].sort(), ['A', 'B', 'C']);
});

test('排④ 临界：松弛为零的链 A→B→D 临界，C 有 2 小时松弛不临界', () => {
  const r = S.排(单们(), { 现在 });
  const 按 = Object.fromEntries(r.条.map((c) => [c.id, c.临界]));
  assert.deepStrictEqual(按, { A: true, B: true, C: false, D: true });
});

test('排⑤ 在途的单：起 = 进在途的时刻，止不早于现在；完了的单按履历定起止且不临界；废弃/挂起 不排', () => {
  const 们 = [
    { id: 'A', 性质: '调研', 状态: '归档', 产出: { 方案: 'm' }, 履历: [{ 到: '在途', t: '2026-09-04T10:00:00Z' }, { 到: '完成', t: '2026-09-04T13:00:00Z' }] },
    { id: 'B', 性质: '新建', 状态: '在途', 进项: { 方案: 'm' }, 履历: [{ 到: '在途', t: '2026-09-04T22:00:00Z' }] },
    { id: 'C', 性质: '新建', 状态: '废弃' },
    { id: 'D', 性质: '新建', 状态: '挂起' },
  ];
  const r = S.排(们, { 现在 });
  const 按 = Object.fromEntries(r.条.map((c) => [c.id, c]));
  assert.strictEqual(按.A.起, ms('2026-09-04T10:00:00Z'));
  assert.strictEqual(按.A.止, ms('2026-09-04T13:00:00Z'));
  assert.strictEqual(按.A.临界, false, '完了的不算临界');
  assert.strictEqual(按.B.起, ms('2026-09-04T22:00:00Z'));
  assert.strictEqual(按.B.止, ms('2026-09-05T02:00:00Z'), '22 点开、4 小时工时 → 02 点');
  assert.deepStrictEqual(r.不排.map((n) => n.id).sort(), ['C', 'D']);
});

test('排⑥ 不传 现在 → 炸（领域层不碰钟）', () => {
  assert.throws(() => S.排(单们(), {}), /要传 现在/);
});

test('排⑦ 空转：进行中的专项没单在跑、待办全被挡 → 点名；有能派的不算；单全完了提示该收口；线空转', () => {
  const 料 = {
    管线们: [{ id: 'P-1' }, { id: 'P-2' }],
    特性们: [{ id: 'F-1', 管线: 'P-1' }, { id: 'F-2', 管线: 'P-2' }],
    专项们: [{ id: 'S-1', 特性: 'F-1', 状态: '进行' }, { id: 'S-2', 特性: 'F-1', 状态: '进行' }, { id: 'S-3', 特性: 'F-2', 状态: '进行' }, { id: 'S-4', 特性: 'F-2', 状态: '立项' }],
    工单们: [
      { id: 'A', 状态: '挂起', 归属: { 专项: 'S-1' }, 产出: { 方案: 'm' } },
      { id: 'B', 状态: '待派', 归属: { 专项: 'S-1' }, 进项: { 方案: 'm' } },
      { id: 'C', 状态: '待派', 归属: { 专项: 'S-2' } },
      { id: 'D', 状态: '归档', 归属: { 专项: 'S-3' } },
    ],
  };
  const r = S.空转(料);
  assert.ok(r.专项.some((x) => x.专项 === 'S-1' && /挡着/.test(x.因)), 'B 被挂起的 A 挡着');
  assert.ok(!r.专项.some((x) => x.专项 === 'S-2'), 'C 能派，不空转');
  assert.ok(r.专项.some((x) => x.专项 === 'S-3' && /收口/.test(x.因)));
  assert.deepStrictEqual(r.管线.map((x) => x.管线), ['P-2'], 'P-2 在进行的专项全空转；P-1 还有 S-2 在动');
});

test('排⑧ 甘特条：每张单一行，ISO 起止、格来自状态机格表、依赖与临界带着', () => {
  const 们 = 单们(); 们[0].title = '调研寻路';
  const r = S.排(们, { 现在 });
  const 条 = S.甘特条(r, 们);
  assert.strictEqual(条.length, 4);
  assert.strictEqual(条[0].title, '调研寻路');
  assert.strictEqual(条[0].起, '2026-09-05T00:00:00.000Z');
  assert.strictEqual(条[0].格, '待跑');
  assert.strictEqual(条[3].依赖.length, 3);
  assert.ok(Object.isFrozen(条[0]));
});

test('排⑨ 改排期落账不覆盖：两次记排期，履历里两条都在，旧的不动；无名的拒', () => {
  let 单 = { id: 'A', 履历: [] };
  单 = S.记排期(单, { 起: 1, 止: 2 }, { 操作者: '项管', 时刻: 't1', 因: '首排' });
  单 = S.记排期(单, { 起: 3, 止: 4 }, { 操作者: '项管', 时刻: 't2', 因: '上游延了' });
  assert.strictEqual(单.履历.length, 2);
  assert.deepStrictEqual(单.履历[0].排期, { 起: 1, 止: 2 });
  assert.deepStrictEqual(单.履历[1].排期, { 起: 3, 止: 4 });
  assert.throws(() => S.记排期(单, { 起: 1, 止: 2 }, {}), /操作者/);
  assert.throws(() => S.记排期(单, { 起: 1 }, { 操作者: 'x' }), /起 与 止/);
});
