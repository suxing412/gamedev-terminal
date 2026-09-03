// 状态机.test.js —— 十三态、归格、迁移凭据，以及**流程自证能红**。
//
// 最后那一组「假模型」用例是这份文件存在的理由：制作人 02:17 问「模型会忘会幻觉，
// 怎么让它严格按流程走」。答案是流程住代码里、模型只做每步那一小块。
// 这组用例证明：一个只会吐垃圾、或什么都不交、或嘴上说「我做完了」的模型，
// **流程一步都不前进**。这条红不了，就说明某一步是靠模型自觉过的。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const M = require('../../领域/状态机.js');

const 凭 = (x) => ({ 操作者: '判据', 时刻: 't0', ...x });

test('机① 十三态一个不多一个不少，核查已改名深检', () => {
  assert.strictEqual(M.状态们.length, 13);
  assert.ok(M.状态们.includes('深检'));
  assert.ok(!M.状态们.includes('核查'), '「核查」在旧仓同时指目录和两个会话，分不清，废掉');
});

test('机② 大态与归格各自覆盖全部十三态，没有漏、没有重', () => {
  for (const 表 of [M.大态, M.格表]) {
    const 见 = new Map();
    for (const [组, 态们] of Object.entries(表)) for (const t of 态们) {
      assert.ok(!见.has(t), `「${t}」同时在 ${见.get(t)} 与 ${组}`);
      见.set(t, 组);
    }
    for (const t of M.状态们) assert.ok(见.has(t), `「${t}」没归进任何组`);
  }
});

test('机③ 归格：待审/待处理 归人闸格不归待跑格；没见过的态报 漏', () => {
  const g = M.分格({ 待审: 2, 待处理: 5, 待派: 1, 新造的态: 7 });
  assert.strictEqual(g.待跑, 1);
  assert.strictEqual(g.人闸, 7);
  assert.deepStrictEqual(g.漏, ['新造的态'], '加第十四态时这里要报出来，不许静默漏');
});

test('机④ 转移表里每个目标态都是合法态，终态无出边', () => {
  for (const [从, 到们] of Object.entries(M.转移)) {
    assert.ok(M.状态们.includes(从));
    for (const 到 of 到们) assert.ok(M.状态们.includes(到), `${从}→${到}：${到} 不是态`);
  }
  assert.deepStrictEqual(M.转移.归档, []);
  assert.deepStrictEqual(M.转移.废弃, []);
});

test('机⑤ 迁() 返回新对象，不改传入的单；履历追加一条', () => {
  const 单 = { id: 'T-1', 状态: '待审', 履历: [] };
  const 新 = M.迁(单, '待派', 凭({ 因: '总监审过' }));
  assert.strictEqual(单.状态, '待审', '原对象不许被改');
  assert.strictEqual(新.状态, '待派');
  assert.strictEqual(新.履历.length, 1);
  assert.deepStrictEqual(新.履历[0], { t: 't0', 从: '待审', 到: '待派', 因: '总监审过', 操作者: '判据' });
});

test('机⑥ 不在转移表里的边被拒', () => {
  assert.throws(() => M.迁({ 状态: '待审' }, '归档', 凭()), (e) => e.code === '迁移拒绝');
  assert.throws(() => M.迁({ 状态: '归档' }, '待派', 凭()), (e) => /归档/.test(e.message));
});

test('机⑦ 无名迁移被拒——履历上不许有没写操作者的记录', () => {
  assert.throws(() => M.迁({ 状态: '待审' }, '待派', { 因: '试' }), (e) => /操作者/.test(e.message));
});

// ── 流程自证能红：假模型 ──────────────────────────────────────────

test('假模型① 什么都不交（无产物）→ 进不了初检，停在在途', () => {
  const 单 = { id: 'T-2', 状态: '在途' };
  assert.throws(() => M.迁(单, '初检', 凭({ 因: '模型说做完了' })),
    (e) => e.code === '迁移拒绝' && /证据包/.test(e.message));
  assert.strictEqual(单.状态, '在途', '一步没前进');
});

test('假模型② 吐垃圾当产物 → 能进初检（初检的活就是拦垃圾），但初检没过就进不了深检', () => {
  const 单 = { id: 'T-3', 状态: '在途' };
  const 进了 = M.迁(单, '初检', 凭({ 产物: { 垃圾: true } }));
  assert.strictEqual(进了.状态, '初检');
  // 初检红了：模型嘴上说「通过」不算，闸结果里没有 初检:'通过'
  assert.throws(() => M.迁(进了, '深检', 凭({ 闸: { 初检: '红' } })), (e) => /初检没过/.test(e.message));
  assert.throws(() => M.迁(进了, '深检', 凭({ 因: '模型：我检查过了没问题' })), (e) => /初检没过/.test(e.message));
});

test('假模型③ 产出是方案，深检过了但没人判 → 不许完成（人判是结构性的，不是可选的）', () => {
  const 单 = { id: 'T-4', 状态: '深检', 产出类型: '方案' };
  assert.throws(() => M.迁(单, '完成', 凭({ 闸: { 深检: '通过' } })), (e) => /要人判过/.test(e.message));
  const 完 = M.迁(单, '完成', 凭({ 闸: { 深检: '通过', 人判: '通过' } }));
  assert.strictEqual(完.状态, '完成');
});

test('假模型④ 产出是资产，深检过了不需要人判就能完成（资产走两闸自动完结）', () => {
  const 单 = { id: 'T-5', 状态: '深检', 产出类型: '资产' };
  const 完 = M.迁(单, '完成', 凭({ 闸: { 深检: '通过' } }));
  assert.strictEqual(完.状态, '完成');
});

test('假模型⑤ 凭 里塞一个「模型说可以」字段，不起任何作用', () => {
  const 单 = { id: 'T-6', 状态: '在途' };
  assert.throws(() => M.迁(单, '初检', 凭({ 模型说可以: true, 我做完了: '真的' })),
    (e) => /证据包/.test(e.message), '没有产物就是没干完，模型怎么说都没用');
});

test('机⑧ 自修次数从履历数出来，不另存', () => {
  const 单 = { 状态: '在途', 履历: [
    { 从: '在途', 到: '初检' }, { 从: '初检', 到: '在途' },
    { 从: '在途', 到: '初检' }, { 从: '初检', 到: '深检' }, { 从: '深检', 到: '在途' },
  ] };
  assert.strictEqual(M.自修次数(单), 2);
});
