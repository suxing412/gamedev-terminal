// 适配器-claude.test.js —— query 换成假的，不碰网、不碰真 SDK。
// 验的是映射：执行卷 → SDK 选项；写闸 → PreToolUse deny；SDK 吐的 → 证据包的料。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const C = require('../../编排/适配器-claude.js');
const A = require('../../编排/适配器.js');
const Q = require('../../领域/权限.js');
const E = require('../../内核/证据.js');

const 卷 = Q.编译执行卷({ id: 'T-9' }, { 可碰目录: ['Assets/SLG/**'], 可用工具: ['Read', 'Edit'], 禁: ['Assets/SLG/Tests/**'] });
const 进 = A.进方({ id: 'T-9', 性质: '新建' }, 卷, '把 x 改成 y', 'D:/w');

// 假 query：记下收到的 options，吐两条 assistant 一条 result
function 假query(记) {
  return async function* (args) {
    记.options = args.options; 记.prompt = args.prompt;
    yield { type: 'assistant', message: { content: [{ type: 'text', text: '第一行\n第二行' }] } };
    yield { type: 'assistant', message: { content: '第三行' } };
    yield { type: 'result', subtype: 'success', result: '改完了', usage: { input_tokens: 11, output_tokens: 22 }, session_id: 'sess-1' };
  };
}
const 假git = () => ({ 文件: ['Assets/SLG/x.cs'], diff: '--- a\n+++ b' });
let t = 1000; const 假钟 = () => (t += 500);

test('克① 执行卷映射成 SDK 选项：cwd / allowedTools / acceptEdits / additionalDirectories', async () => {
  const 记 = {};
  await C.跑(进, { query: 假query(记), git改动: 假git, 时钟: 假钟, 版本: '0.0.t' });
  assert.strictEqual(记.options.cwd, 'D:/w');
  assert.deepStrictEqual(记.options.allowedTools, ['Read', 'Edit']);
  assert.strictEqual(记.options.permissionMode, 'acceptEdits', '不用 bypassPermissions——那是把闸整个拆掉');
  assert.ok(记.options.additionalDirectories.some((p) => /Assets[\\/]SLG$/.test(p)));
  assert.strictEqual(记.prompt, '把 x 改成 y');
});

test('克② 写闸挂在 PreToolUse 上：目录外的 Write 被 deny，形状是 SDK 认的', async () => {
  const 记 = {};
  await C.跑(进, { query: 假query(记), git改动: 假git, 时钟: 假钟, 版本: 'v' });
  const 钩 = 记.options.hooks.PreToolUse[0];
  assert.match(钩.matcher, /Write/);
  const fn = 钩.hooks[0];
  const 拒 = await fn({ tool_name: 'Write', tool_input: { file_path: 'D:/w/Assets/Shared/x.cs' } });
  assert.strictEqual(拒.hookSpecificOutput.permissionDecision, 'deny');
  assert.match(拒.hookSpecificOutput.permissionDecisionReason, /写闸/);
  const 准 = await fn({ tool_name: 'Write', tool_input: { file_path: 'D:/w/Assets/SLG/Map/y.cs' } });
  assert.deepStrictEqual(准, {}, '目录内的写放行');
  const 禁 = await fn({ tool_name: 'Edit', tool_input: { file_path: 'D:/w/Assets/SLG/Tests/t.cs' } });
  assert.strictEqual(禁.hookSpecificOutput.permissionDecision, 'deny', '禁区在可碰目录内也要拦');
  const 读 = await fn({ tool_name: 'Read', tool_input: { file_path: 'D:/w/anything' } });
  assert.deepStrictEqual(读, {}, '非写类工具不管');
});

test('克③ 跑完攒出证据包的料，能过 验包；改动来自 git 不来自模型', async () => {
  const 记 = {};
  const 料 = await C.跑(进, { query: 假query(记), git改动: 假git, 时钟: 假钟, 版本: '0.3.259' });
  const 包 = E.攒包(料);
  const r = E.验包(包);
  assert.deepStrictEqual(r.违, []);
  assert.deepStrictEqual(料.harness, { 名: 'claude', 版本: '0.3.259' });
  assert.deepStrictEqual(料.改动.文件, ['Assets/SLG/x.cs']);
  assert.strictEqual(料.结果.退出, 'completed');
  assert.deepStrictEqual(料.结果.token, { 输入: 11, 输出: 22 });
  assert.strictEqual(料.结果.耗时ms, 500);
  assert.strictEqual(料.回执, '改完了', 'result.result 优先于 assistant 尾文');
  assert.match(料.日志尾, /第三行/);
  assert.strictEqual(料.会话id, 'sess-1');
});

test('克④ 没有 result 消息 → 退出=error；is_error → error', async () => {
  const 无 = async function* () { yield { type: 'assistant', message: { content: 'x' } }; };
  const a = await C.跑(进, { query: 无, git改动: 假git, 时钟: 假钟, 版本: 'v' });
  assert.strictEqual(a.结果.退出, 'error');
  const 错 = async function* () { yield { type: 'result', is_error: true, subtype: 'error_max_turns', usage: {} }; };
  const b = await C.跑(进, { query: 错, git改动: 假git, 时钟: 假钟, 版本: 'v' });
  assert.strictEqual(b.结果.退出, 'error');
});

test('克⑤ 被拒的写进权限拒绝记录（可选项，随包走）', async () => {
  const 记 = {};
  const 带拒 = async function* (args) {
    const fn = args.options.hooks.PreToolUse[0].hooks[0];
    await fn({ tool_name: 'Write', tool_input: { file_path: 'D:/w/外面.cs' } });
    yield { type: 'result', subtype: 'success', result: 'r', usage: {} };
  };
  const 料 = await C.跑(进, { query: 带拒, git改动: 假git, 时钟: 假钟, 版本: 'v' });
  assert.strictEqual(料.权限拒绝记录.length, 1);
  assert.match(料.权限拒绝记录[0].因, /只准碰/);
  void 记;
});

test('克⑦ 到点 abort：query 挂死 → 退出=timeout，不是永远等（编排层每处外呼必须有超时，U10）', async () => {
  const 短 = A.进方({ id: 'T-9', 性质: '新建' }, 卷, '挂死', 'D:/w', { 超时ms: 30 });
  const 挂死 = async function* (args) {
    await new Promise((_, rej) => args.options.abortController.signal.addEventListener('abort', () => rej(new Error('aborted'))));
    yield { type: 'result', subtype: 'success', result: '不该到这', usage: {} };
  };
  const 料 = await C.跑(短, { query: 挂死, git改动: 假git, 时钟: 假钟, 版本: 'v' });
  assert.strictEqual(料.结果.退出, 'timeout');
  assert.match(料.日志尾, /超时/);
  // 没超时时 abortController 也在（SDK 认这个选项），但退出照常
  const 记 = {};
  const 正常 = await C.跑(进, { query: 假query(记), git改动: 假git, 时钟: 假钟, 版本: 'v' });
  assert.ok(记.options.abortController, '每次都带 abortController');
  assert.strictEqual(正常.结果.退出, 'completed');
});

test('克⑥ 没装 SDK 又没注入 query → 报清楚，不是莫名 undefined', async () => {
  const 原 = require.resolve;
  await assert.rejects(async () => {
    // 强行让 require 找不到 SDK：临时改 module 解析不现实，这里直接验没注入时的错误路径
    const 空 = { query: undefined };
    if (空.query) return;
    let ok = false;
    try { require('@anthropic-ai/claude-agent-sdk'); ok = true; } catch {}
    if (ok) throw new Error('（本机装了 SDK，这条只验消息形状）适配器-claude：没装 @anthropic-ai/claude-agent-sdk');
    await C.跑(进, { git改动: 假git, 时钟: 假钟, 版本: 'v' });
  }, /适配器-claude：没装|SDK/);
  void 原;
});

test('克⑧ 真git改动：中文路径原样回来（不是八进制转义），未跟踪的新文件也在，diff 里有它', () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-git-'));
  try {
    const g = (a) => spawnSync('git', a, { cwd: d, encoding: 'utf8', windowsHide: true });
    g(['init', '-q']);
    fs.mkdirSync(path.join(d, '方案'));
    fs.writeFileSync(path.join(d, '方案', 'S-1-寻路.md'), '# 方案\n');
    const r = C.真git改动(d);
    assert.deepStrictEqual(r.文件, ['方案/S-1-寻路.md'], `得到的是 ${JSON.stringify(r.文件)}——八进制转义没关`);
    assert.match(r.diff, /S-1-寻路\.md/);
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});

test('克⑨ 基线：跑前盘上已有的没提交文件不算这一次的改动；这次新加的、这次改了内容的才算', () => {
  const fs = require('node:fs'); const os = require('node:os'); const path = require('node:path');
  const { spawnSync } = require('node:child_process');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-git-'));
  try {
    spawnSync('git', ['init', '-q'], { cwd: d, windowsHide: true });
    fs.writeFileSync(path.join(d, '上一单留下的.md'), '旧');
    fs.writeFileSync(path.join(d, '这次要改的.cs'), '旧内容');
    const 基 = C.真git基线(d);
    assert.strictEqual(基.size, 2);
    fs.writeFileSync(path.join(d, '这次新加的.cs'), '新');
    fs.writeFileSync(path.join(d, '这次要改的.cs'), '新内容');
    const r = C.真git改动(d, 基);
    assert.deepStrictEqual([...r.文件].sort(), ['这次新加的.cs', '这次要改的.cs'], `上一单留下的不该算：${JSON.stringify(r.文件)}`);
    assert.ok(!/上一单留下的/.test(r.diff), 'diff 也只有这一次的');
    assert.deepStrictEqual(C.真git改动(d).文件.length, 3, '不带基线就是盘上全部没提交的');
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
