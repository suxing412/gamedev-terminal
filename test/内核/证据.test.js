// 证据.test.js —— 证据包形状：五项必有缺一红、版本对不上红、不补默认值、同形比对。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const E = require('../../内核/证据.js');

const 全 = (改) => ({
  单号: 'TK-1',
  harness: { 名: 'claude', 版本: '0.3.259' },
  改动: { 文件: ['Assets/SLG/x.cs'], diff: '--- a\n+++ b\n' },
  日志尾: 'done',
  结果: { 退出: 'completed', 耗时ms: 1234, token: { 输入: 10, 输出: 20 } },
  回执: '改完了',
  ...改,
});
const 违 = (r, 词) => assert.ok(r.违.some((x) => x.includes(词)), `该点名「${词}」，实得：${r.违.join(' | ')}`);

test('证① 五项齐 → 攒包再验包，过；契约版本自动带上', () => {
  const 包 = E.攒包(全());
  assert.strictEqual(包.契约版本, E.契约版本);
  const r = E.验包(包);
  assert.deepStrictEqual(r.违, []);
});

test('证② 必有键正好是 schema 里那六个', () => {
  assert.deepStrictEqual([...E.必有键].sort(), ['单号', 'harness', '改动', '日志尾', '结果', '回执'].sort());
});

test('证③ 缺任何一项 → 红，且点名是哪项', () => {
  for (const k of E.必有键) {
    const 件 = 全(); delete 件[k];
    违(E.验包(E.攒包(件)), `缺必有项「${k}」`);
  }
});

test('证④ 攒包不补默认值——缺什么就攒出缺什么的包（补了就是替模型圆谎）', () => {
  const 包 = E.攒包({ 单号: 'TK-1' });
  assert.strictEqual(包.回执, undefined);
  assert.strictEqual(包.改动, undefined);
});

test('证⑤ 契约版本对不上 → 红（旧适配器交旧形状不许混进来）', () => {
  const 包 = E.攒包(全()); 包.契约版本 = 0;
  违(E.验包(包), '契约版本');
});

test('证⑥ harness 没版本 → 红；结果.退出 非法 → 红；token 缺数 → 红', () => {
  违(E.验包(E.攒包(全({ harness: { 名: 'codex' } }))), 'harness 要有 名 和 版本');
  违(E.验包(E.攒包(全({ 结果: { 退出: 'ok', 耗时ms: 1, token: { 输入: 1, 输出: 1 } } }))), '不是 completed/error/timeout');
  违(E.验包(E.攒包(全({ 结果: { 退出: 'completed', 耗时ms: 1, token: { 输入: 1 } } }))), 'token 要有 输入/输出');
});

test('证⑦ 改动.文件 不是数组 → 红（它是适配器 git diff 算的，不是模型自称的）', () => {
  违(E.验包(E.攒包(全({ 改动: { 文件: 'x.cs', diff: '' } }))), '改动.文件 该是数组');
});

test('证⑧ 可选项原样带上，不校验形状（开放列表）', () => {
  const 包 = E.攒包(全({ 截图: ['a.png'], 会话id: 'abc', 不在已知里的: 1 }));
  assert.deepStrictEqual(包.截图, ['a.png']);
  assert.strictEqual(包.会话id, 'abc');
  assert.strictEqual(包.不在已知里的, undefined, '不在已知列表里的可选项不带——要加先进 schema');
  assert.strictEqual(E.验包(包).行, true);
});

test('证⑨ 同形：两家交回来键集相同即同形，内容不同不影响；缺一项即不同形', () => {
  const a = E.攒包(全());
  const b = E.攒包(全({ 回执: '完全不同的内容', 结果: { 退出: 'error', 耗时ms: 9, token: { 输入: 0, 输出: 0 } } }));
  assert.strictEqual(E.同形(a, b), true);
  const c = E.攒包(全()); delete c.日志尾;
  assert.strictEqual(E.同形(a, c), false);
});
