// 闸.test.js —— 四种人闸全从状态与闸序列推；逾期与升格按假时间判；谁在等我按角色筛。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const G = require('../../领域/闸.js');
const M = require('../../领域/状态机.js');

const H = 3600 * 1000;
const 现在 = '2026-09-05T00:00:00Z';
const 早 = (h) => new Date(Date.parse(现在) - h * H).toISOString();
const 造 = (单) => M.编闸序列(单);

test('闸① 待审 / 待处理 从状态推；自 = 进该态的时刻；等谁按默认表', () => {
  const 料 = { 工单们: [
    { id: 'A', 状态: '待审', 履历: [{ 到: '待审', t: 早(2) }] },
    { id: 'B', 状态: '待处理', 履历: [{ 到: '待处理', t: 早(1) }] },
    { id: 'C', 状态: '在途' },
  ] };
  const r = G.在等的(料, { 现在 });
  assert.deepStrictEqual(r.map((x) => [x.类, x.单, x.等谁]), [['待审', 'A', '制作人'], ['待处理', 'B', '项管']]);
  assert.strictEqual(r[0].等了ms, 2 * H);
  assert.strictEqual(r[0].逾期, false);
});

test('闸② 人判：深检过了、序列里有人判、人判没记 → 在等；程序新建单序列里没人判 → 不列；人判记了 → 不列；仲裁路同理', () => {
  const 美 = M.记闸(造({ id: 'M', 状态: '深检', 性质: '新建', 职能: '原画美术' }), '深检', '通过', { 操作者: '机判', 时刻: 早(3) });
  const 程 = M.记闸(造({ id: 'P', 状态: '深检', 性质: '新建', 职能: '程序' }), '深检', '通过', { 操作者: '机判', 时刻: 早(3) });
  const 签了 = M.记闸(美, '人判', '通过', { 操作者: '制作人', 时刻: 早(1) });
  const 没过深检 = 造({ id: 'N', 状态: '深检', 性质: '新建', 职能: '原画美术' });
  const 仲 = M.记闸(造({ id: 'Z', 状态: '仲裁', 性质: '调研', 职能: '技术策划' }), '仲裁', '通过', { 操作者: '仲裁席', 时刻: 早(5) });
  const r = G.在等的({ 工单们: [美, 程, 签了, 没过深检, 仲] }, { 现在 });
  assert.deepStrictEqual(r.map((x) => x.单), ['M', 'Z']);
  assert.strictEqual(r[0].等谁, '制作人');
  assert.strictEqual(r[0].等了ms, 3 * H, '从深检通过那一刻起算');
  assert.match(r[0].注, /美术/);
  assert.strictEqual(r[1].等了ms, 5 * H, '仲裁路从仲裁通过起算');
});

test('闸③ 逾期与升格：超时限 → 提醒；超两倍 → 上呈；时限可改', () => {
  const 料 = { 工单们: [
    { id: 'A', 状态: '待审', 履历: [{ 到: '待审', t: 早(30) }] },
    { id: 'B', 状态: '待审', 履历: [{ 到: '待审', t: 早(50) }] },
    { id: 'C', 状态: '待审', 履历: [{ 到: '待审', t: 早(5) }] },
  ] };
  const r = G.在等的(料, { 现在 });
  assert.deepStrictEqual(r.map((x) => [x.单, x.逾期, x.升格]), [['A', true, '提醒'], ['B', true, '上呈'], ['C', false, null]]);
  const 紧 = G.在等的(料, { 现在, 时限: { 待审: 2 * H } });
  assert.strictEqual(紧[2].升格, '上呈', '时限改成 2 小时，等了 5 小时就上呈');
});

test('闸④ 进入时刻不明（履历没记 t）→ 不判逾期、注里说清，不装作刚进来', () => {
  const r = G.在等的({ 工单们: [{ id: 'A', 状态: '待审' }] }, { 现在 });
  assert.strictEqual(r[0].等了ms, null);
  assert.strictEqual(r[0].逾期, false);
  assert.match(r[0].注, /进入时刻不明/);
});

test('闸⑤ 关账：收口的专项在等；产出是成果/方案等制作人，资产等项管；等谁表可改', () => {
  const 料 = { 专项们: [
    { id: 'S-1', 状态: '收口', 产出类型: '成果', 履历: [{ 到: '收口', t: 早(10) }] },
    { id: 'S-2', 状态: '收口', 产出类型: '资产', 履历: [{ 到: '收口', t: 早(10) }] },
    { id: 'S-3', 状态: '进行', 产出类型: '成果' },
  ] };
  const r = G.在等的(料, { 现在 });
  assert.deepStrictEqual(r.map((x) => [x.类, x.专项, x.等谁]), [['关账', 'S-1', '制作人'], ['关账', 'S-2', '项管']]);
  const 改 = G.在等的(料, { 现在, 等谁: { 关账: '总监' } });
  assert.strictEqual(改[0].等谁, '总监');
});

test('闸⑥ 谁在等我 按角色筛；汇总 按类按人数、逾期与上呈单列', () => {
  const 料 = { 工单们: [
    { id: 'A', 状态: '待审', 履历: [{ 到: '待审', t: 早(50) }] },
    { id: 'B', 状态: '待处理', 履历: [{ 到: '待处理', t: 早(1) }] },
  ], 专项们: [{ id: 'S-1', 状态: '收口', 产出类型: '方案', 履历: [{ 到: '收口', t: 早(1) }] }] };
  assert.deepStrictEqual(G.谁在等我(料, '制作人', { 现在 }).map((x) => x.单 || x.专项), ['A', 'S-1']);
  assert.deepStrictEqual(G.谁在等我(料, '项管', { 现在 }).map((x) => x.单), ['B']);
  const 汇 = G.汇总(G.在等的(料, { 现在 }));
  assert.strictEqual(汇.总, 3);
  assert.deepStrictEqual(汇.按人, { 制作人: 2, 项管: 1 });
  assert.deepStrictEqual(汇.逾期, ['A']);
  assert.deepStrictEqual(汇.上呈, ['A']);
});

test('闸⑦ 不传 现在 → 炸（领域层不碰钟）', () => {
  assert.throws(() => G.在等的({}, {}), /要传 现在/);
});
