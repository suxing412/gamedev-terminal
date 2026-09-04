// 会话.test.js —— query 换成假的：两种用途装法不同、续接带 resume、用量与会话id 收回来、超时 abort。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const H = require('../../编排/会话.js');

const 协议 = { 职责权限: { 职能: '程序', 可碰目录: ['Assets/**'], 可用工具: ['Read', 'Edit', 'Bash'], 禁: [] }, 人格语气: { 称呼: '小程', 语气: '简短', 忌讳: ['不说应该没问题'] } };
function 假query(记, 回) {
  return async function* (args) {
    记.push({ prompt: args.prompt, options: args.options });
    yield { type: 'assistant', message: { content: [{ type: 'text', text: '想了想' }] } };
    yield { type: 'result', subtype: 'success', result: 回 || '答', session_id: 'sess-' + 记.length, usage: { input_tokens: 5, output_tokens: 7 } };
  };
}

test('会① 审：只读工具、不带人格；对话：协议的工具、系统提示带称呼与忌讳', async () => {
  const 记 = [];
  const 审 = H.开会话(协议, { 用途: '审', 工作目录: 'D:/w' }, { query: 假query(记) });
  await 审.问('看看');
  assert.deepStrictEqual(记[0].options.allowedTools, ['Read', 'Grep', 'Glob']);
  assert.ok(!/小程|应该没问题/.test(记[0].options.systemPrompt.append), '审不带人格');
  assert.match(记[0].options.systemPrompt.append, /不许改任何文件/);
  const 话 = H.开会话(协议, { 用途: '对话', 工作目录: 'D:/w' }, { query: 假query(记) });
  await 话.问('你好');
  assert.deepStrictEqual(记[1].options.allowedTools, ['Read', 'Edit', 'Bash']);
  assert.match(记[1].options.systemPrompt.append, /小程/);
  assert.match(记[1].options.systemPrompt.append, /应该没问题/);
  assert.strictEqual(记[1].options.cwd, 'D:/w');
});

test('会② 续接：第一问不带 resume，第二问带上第一问回来的 session_id；开会话时给 续接 就从它接', async () => {
  const 记 = [];
  const 话 = H.开会话(协议, { 用途: '对话', 工作目录: 'D:/w' }, { query: 假query(记) });
  const a = await 话.问('一');
  assert.strictEqual(记[0].options.resume, undefined);
  assert.strictEqual(a.会话id, 'sess-1');
  await 话.问('二');
  assert.strictEqual(记[1].options.resume, 'sess-1');
  const 接 = H.开会话(协议, { 用途: '对话', 工作目录: 'D:/w', 续接: 'sess-老' }, { query: 假query(记) });
  await 接.问('三');
  assert.strictEqual(记[2].options.resume, 'sess-老');
});

test('会③ 回复文本 result.result 优先；用量收回来；没 result → 退出 error', async () => {
  const 记 = [];
  const 话 = H.开会话(协议, { 用途: '审', 工作目录: 'D:/w' }, { query: 假query(记, '结论：通过') });
  const r = await 话.问('判');
  assert.strictEqual(r.文本, '结论：通过');
  assert.deepStrictEqual(r.用量, { 输入: 5, 输出: 7 });
  assert.strictEqual(r.退出, 'completed');
  const 无 = H.开会话(协议, { 用途: '审', 工作目录: 'D:/w' }, { query: async function* () { yield { type: 'assistant', message: { content: '半句' } }; } });
  const b = await 无.问('判');
  assert.strictEqual(b.退出, 'error');
  assert.strictEqual(b.文本, '半句');
});

test('会④ 用途不对 / 没工作目录 / 提示词空 → 炸；每问都带 abortController', async () => {
  assert.throws(() => H.开会话(协议, { 用途: '执行', 工作目录: 'D:/w' }, { query: 假query([]) }), /用途/);
  assert.throws(() => H.开会话(协议, { 用途: '审' }, { query: 假query([]) }), /工作目录/);
  const 记 = [];
  const 话 = H.开会话(协议, { 用途: '审', 工作目录: 'D:/w' }, { query: 假query(记) });
  await assert.rejects(() => 话.问('  '), /提示词为空/);
  await 话.问('x');
  assert.ok(记[0].options.abortController);
  assert.strictEqual(记[0].options.maxTurns, 8);
});
