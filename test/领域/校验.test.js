// 校验.test.js —— 初检：形状与最低事实，不判内容；判不了的显式待人判。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const J = require('../../领域/校验.js');
const E = require('../../内核/证据.js');
const Q = require('../../领域/权限.js');

const 卷 = Q.编译执行卷({ id: 'T-1' }, { 可碰目录: ['Assets/SLG/**'], 可用工具: ['Edit'], 禁: [] });
const 好包 = (改) => E.攒包({
  单号: 'T-1', harness: { 名: 'claude', 版本: 'v' },
  改动: { 文件: ['Assets/SLG/x.cs'], diff: 'd' }, 日志尾: 'l',
  结果: { 退出: 'completed', 耗时ms: 1, token: { 输入: 1, 输出: 1 } }, 回执: '改好了', ...改,
});
const 违 = (r, 词) => assert.ok(r.违.some((x) => x.includes(词)), `该点名「${词}」，实得：${r.违.join(' | ')}`);

test('检① 新建单交了改动、回执非空、包齐 → 初检通过，无待人判', () => {
  const r = J.初检(好包(), { id: 'T-1', 性质: '新建', 产出类型: '资产' }, 卷);
  assert.strictEqual(r.初检, '通过', r.违.join(' | '));
  assert.deepStrictEqual(r.待人判, []);
});

test('检② 包缺项 → 红，理由带「证据包：」前缀', () => {
  const 包 = 好包(); delete 包.日志尾;
  违(J.初检(包, { 性质: '新建' }, 卷), '证据包：缺必有项「日志尾」');
});

test('检③ 新建/修复/装配 改动为空 → 红（什么都没交）', () => {
  for (const 性 of ['新建', '修复', '装配']) {
    违(J.初检(好包({ 改动: { 文件: [], diff: '' } }), { 性质: 性 }, 卷), '什么都没交');
  }
});

test('检④ 调研：没 .md 方案 → 打回；有 → 通过但待人判（产出是方案）', () => {
  违(J.初检(好包({ 改动: { 文件: ['Assets/x.cs'], diff: 'd' } }), { 性质: '调研' }, 卷), '没有 .md 方案');
  const r = J.初检(好包({ 改动: { 文件: ['Assets/SLG/方案.md'], diff: 'd' } }), { 性质: '调研' }, 卷);
  assert.strictEqual(r.初检, '通过');
  assert.ok(r.待人判.some((x) => /方案/.test(x)));
});

test('检⑤ 回执为空 → 红', () => {
  违(J.初检(好包({ 回执: '   ' }), { 性质: '新建' }, 卷), '回执为空');
});

test('检⑥ 改动越过执行卷 → 红（hook 层该拦的，这里事后兜底）', () => {
  违(J.初检(好包({ 改动: { 文件: ['Assets/Shared/y.cs'], diff: 'd' } }), { 性质: '新建' }, 卷), '改动越界');
});

test('检⑦ 执行没正常结束 → 红', () => {
  违(J.初检(好包({ 结果: { 退出: 'timeout', 耗时ms: 1, token: { 输入: 0, 输出: 0 } } }), { 性质: '新建' }, 卷), '没正常结束');
});

test('检⑧ 产出是成果（装配单）/ 美术单 → 通过后仍标待人判（人判是结构性的）', () => {
  const r = J.初检(好包(), { 性质: '装配', 职能: '程序' }, 卷);
  assert.strictEqual(r.初检, '通过');
  assert.ok(r.待人判.some((x) => /成果/.test(x)));
  assert.ok(J.初检(好包(), { 性质: '新建', 职能: '原画美术' }, 卷).待人判.some((x) => /美术/.test(x)));
  assert.deepStrictEqual(J.初检(好包(), { 性质: '新建', 职能: '程序' }, 卷).待人判, [], '程序新建单不待人判');
});

test('检⑩ 修复单的改动里没有测试目录下的文件 → 打回（防复发判据是出项，在这儿判，不在派前判）', () => {
  const 宽卷 = Q.编译执行卷({ id: 'T-1' }, { 可碰目录: ['Assets/SLG/**', 'test/**'], 可用工具: ['Edit'], 禁: [] });
  const r = J.初检(好包({ 改动: { 文件: ['Assets/SLG/x.cs'], diff: 'd' } }), { 性质: '修复', 职能: '程序' }, 宽卷);
  assert.strictEqual(r.初检, '打回');
  违(r, '没有防复发判据');
  const 好 = J.初检(好包({ 改动: { 文件: ['Assets/SLG/x.cs', 'test/x.test.js'], diff: 'd' } }), { 性质: '修复', 职能: '程序' }, 宽卷);
  assert.strictEqual(好.初检, '通过', 好.违.join(' | '));
  const Unity = J.初检(好包({ 改动: { 文件: ['Assets/SLG/x.cs', 'Assets/SLG/Tests/xTest.cs'], diff: 'd' } }), { 性质: '修复', 职能: '程序' }, 宽卷);
  assert.strictEqual(Unity.初检, '通过', 'Unity 工程的测试在 Assets/**/Tests/ 下，也算');
});

test('检⑨ 不传执行卷时不判越界（缺省不装作判过）', () => {
  const r = J.初检(好包({ 改动: { 文件: ['Anywhere/z.cs'], diff: 'd' } }), { 性质: '新建' });
  assert.strictEqual(r.初检, '通过');
});
