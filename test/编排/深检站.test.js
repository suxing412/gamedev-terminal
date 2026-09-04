// 深检站.test.js —— 提示词装了单与证据包并写死格式；解读失效方向是拦；深检只出结论不改状态。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const Z = require('../../编排/深检站.js');

const 单 = { id: 'TK-1', title: '写 Hello', 正文: '写一个空类', 性质: '新建', 职能: '程序', 进项: { 方案: '方案/x.md' } };
const 包 = { 改动: { 文件: ['Assets/SLG/Hello.cs'], diff: '+class Hello {}' }, 回执: '写了一个空类', 结果: { 退出: 'completed', 耗时ms: 3 }, harness: { 名: 'claude' }, 日志尾: 'tail' };

test('站① 提示词：单的正文与进项、改动清单、回执、diff、日志尾都在；写死结论格式与不许改', () => {
  const p = Z.深检提示词(单, 包);
  for (const 词 of ['写一个空类', '方案/x.md', 'Assets/SLG/Hello.cs', '写了一个空类', '+class Hello', 'tail', '结论：通过', '结论：打回', '不许改任何文件']) assert.ok(p.includes(词), `缺「${词}」`);
});

test('站② diff 超上限截断并注明，不把 token 烧在 diff 上', () => {
  const 长 = { ...包, 改动: { 文件: ['a'], diff: 'x'.repeat(50) } };
  const p = Z.深检提示词(单, 长, { diff上限: 10 });
  assert.match(p, /xxxxxxxxxx\n…（diff 共 50 字，截到 10）/);
});

test('站③ 解读：最后一个结论行算数；理由带出来；没有结论行 → 打回且标含糊（失效方向=拦）', () => {
  assert.deepStrictEqual(Z.解读结论('看了。\n结论：通过\n理由：改得对'), { 结果: '通过', 因: '改得对', 含糊: false });
  assert.deepStrictEqual(Z.解读结论('先想结论：通过，再看……不对。\n结论：打回\n理由：漏了命名空间'), { 结果: '打回', 因: '漏了命名空间', 含糊: false });
  const 含 = Z.解读结论('我觉得挺好的，应该没问题。');
  assert.strictEqual(含.结果, '打回');
  assert.strictEqual(含.含糊, true);
  assert.strictEqual(Z.解读结论('结论: 上呈\n理由: 超出我能判的').结果, '上呈');
});

test('站④ 深检：问判官、解读、带回原文与会话id；不注入 问 → 炸', async () => {
  const 记 = [];
  const 问 = async (p) => { 记.push(p); return { 文本: '结论：通过\n理由：对', 会话id: 's-1', 用量: { 输入: 1, 输出: 2 } }; };
  const r = await Z.深检(单, 包, { 问 });
  assert.strictEqual(r.结果, '通过');
  assert.strictEqual(r.会话id, 's-1');
  assert.match(记[0], /深检 · 工单 TK-1/);
  await assert.rejects(() => Z.深检(单, 包, {}), /没注入 问/);
});

test('站⑤ 判官嘴上说好但没按格式 → 打回（假模型：含糊不算过）', async () => {
  const r = await Z.深检(单, 包, { 问: async () => ({ 文本: '做得不错，可以进下一步了。' }) });
  assert.strictEqual(r.结果, '打回');
  assert.match(r.因, /含糊/);
});
