// 适配器-claude.js —— Claude Agent SDK 那家。把进方契约映射到 query()，把它吐的东西攒成证据包的料。
//
// 薄。厚的在契约与判据里。它只做四件事：
//   ① 把执行卷翻成 SDK 选项：cwd / allowedTools / permissionMode / additionalDirectories
//   ② **把写闸挂到 hooks.PreToolUse**：每次 Write/Edit 前问 领域/权限.准写()，不准就 deny——
//      这是「写闸能硬」的物理形态，09-04 实跑证实 permissionDecision:'deny' 拦下 Write 文件未落盘
//   ③ 跑，收 result 消息里的 usage / subtype
//   ④ 改动清单**自己跑 git diff**——四家都不原生输出，模型自称改了几个文件不算
//
// 依赖全可注入（query / git改动 / 时钟 / 版本），判据把 query 换成假的就能跑，不碰网。
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const 权限 = require('../领域/权限.js');

const 名 = 'claude';

/** 真 SDK：装了就用，没装就在调用时报清楚，不在 require 时炸。 */
function 真query() {
  let sdk;
  try { sdk = require('@anthropic-ai/claude-agent-sdk'); }
  catch (e) { throw new Error('适配器-claude：没装 @anthropic-ai/claude-agent-sdk（npm install），或注入 依赖.query'); }
  return sdk.query;
}
function 真版本() {
  // 不走 require('.../package.json')：这个包的 exports 映射不暴露它，require 会炸。
  // 解析出入口文件，往上找到 package.json 用 fs 读——编排层允许 fs。
  try {
    const fs = require('fs');
    let d = path.dirname(require.resolve('@anthropic-ai/claude-agent-sdk'));
    for (let i = 0; i < 6; i++) {
      const pj = path.join(d, 'package.json');
      if (fs.existsSync(pj)) { const j = JSON.parse(fs.readFileSync(pj, 'utf8')); if (j.name === '@anthropic-ai/claude-agent-sdk') return j.version; }
      d = path.dirname(d);
    }
  } catch (e) { /* 落到 unknown */ }
  return 'unknown';
}

/** 改动清单：git diff 说了算。 */
function 真git改动(工作目录, 基线) {
  // **core.quotepath=false**：git 默认把非 ASCII 路径打成八进制转义（"\346\226\271\346\241\210/x.md"），
  // 改动清单里就没有「方案/x.md」这个文件——一个专项端到端第一次干跑就断在这：调研单交的中文路径方案
  // 被初检判成「预计产出没交」加「越界」。09-03 记忆里就有这坑，这次是它在新仓的第一次复发。
  const 跑 = (args) => spawnSync('git', ['-c', 'core.quotepath=false', ...args], { cwd: 工作目录, encoding: 'utf8', windowsHide: true });
  // **不能只用 git diff --name-only：它不列未跟踪的新文件。** 第 3 步端到端第一次干跑就断在这：
  // 假 query 写了 Hello.cs，改动清单却是空的，初检红。新建单产出的资产天然是新文件——
  // 这条不修，所有新建单都过不了初检。
  // 文件清单走 status --porcelain -uall（改动 + 未跟踪都在）；未跟踪的先 add -N（intent-to-add，
  // 只标记不入内容）再 diff，diff 里才有它们。
  const 状 = 跑(['status', '--porcelain', '-uall']);
  if (状.status !== 0) return { 文件: [], diff: '', 注: `git status 失败：${(状.stderr || '').trim()}` };
  const 行 = (状.stdout || '').split('\n').filter(Boolean);
  const 文件 = [];
  const 未跟踪 = [];
  for (const l of 行) {
    const 码 = l.slice(0, 2); const 路 = l.slice(3).trim().replace(/^"|"$/g, '');
    if (!路) continue;
    // **只算这一次跑改的**：基线里已有、且内容没变的，是上一张单留下的（一个专项端到端第二站断在这：
    // TK-1 交的方案文件没提交，TK-2 跑完 status 里它还在，被判成 TK-2 越界）。
    if (基线 && 基线.has(路) && 基线.get(路) === 内容哈希(工作目录, 路)) continue;
    文件.push(路);
    if (码 === '??') 未跟踪.push(路);
  }
  if (未跟踪.length) 跑(['add', '-N', '--', ...未跟踪]);
  const 差 = 文件.length ? 跑(['diff', '--', ...文件]) : { stdout: '' };
  return { 文件, diff: 差.stdout || '' };
}

function 内容哈希(工作目录, 路) {
  try { return require('crypto').createHash('sha1').update(require('fs').readFileSync(path.join(工作目录, 路))).digest('hex'); }
  catch (e) { return null; }   // 删掉的文件：哈希 null，与基线必不同 → 算改动
}

/** 跑前拍的基线：status 里每个路径 → 内容哈希。跑后只算和它不同的。 */
function 真git基线(工作目录) {
  const 状 = spawnSync('git', ['-c', 'core.quotepath=false', 'status', '--porcelain', '-uall'], { cwd: 工作目录, encoding: 'utf8', windowsHide: true });
  const 基 = new Map();
  for (const l of (状.stdout || '').split('\n').filter(Boolean)) {
    const 路 = l.slice(3).trim().replace(/^"|"$/g, '');
    if (路) 基.set(路, 内容哈希(工作目录, 路));
  }
  return 基;
}

/** PreToolUse 钩子：只管写类工具，别的放行。返回 SDK 认的形状。 */
function 造写闸钩子(执行卷, 工作目录, 记录) {
  return async (input) => {
    const 工具 = input && input.tool_name;
    if (!/^(Write|Edit|MultiEdit|NotebookEdit)$/.test(String(工具))) return {};
    const 路 = input.tool_input && (input.tool_input.file_path || input.tool_input.path || input.tool_input.notebook_path);
    const 相 = 路 ? path.relative(工作目录, path.resolve(工作目录, 路)) : '';
    const r = 权限.准写(执行卷, 相 || 路 || '');
    if (r.行) return {};
    记录.push({ 工具, 路: 相 || 路, 因: r.因 });
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `写闸：${r.因}`,
      },
    };
  };
}

/**
 * 跑一张单。
 * @param 进方  编排/适配器.进方() 的产物
 * @param 依赖  { query?, git改动?, 时钟?, 版本?, 日志尾行数? }
 * @returns 给 内核/证据.攒包() 的料
 */
async function 跑(进方, 依赖) {
  const d = 依赖 || {};
  const query = d.query || 真query();
  const git改动 = d.git改动 || 真git改动;
  const git基线 = d.git基线 || (d.git改动 ? () => null : 真git基线);   // 注入了假 git改动 就不拍真基线
  const 时钟 = d.时钟 || (() => Date.now());
  const 版本 = d.版本 || 真版本();
  const N = d.日志尾行数 || 40;

  const 权 = 进方.执行卷.权限;
  const 拒绝记录 = [];
  const options = {
    cwd: 进方.工作目录,
    permissionMode: 'acceptEdits',                 // 不用 bypassPermissions——那是把闸整个拆掉
    allowedTools: [...权.可用工具],
    additionalDirectories: 权.可碰目录.map((g) => path.resolve(进方.工作目录, g.replace(/\/\*\*$/, ''))),
    hooks: { PreToolUse: [{ matcher: 'Write|Edit|MultiEdit|NotebookEdit', hooks: [造写闸钩子(进方.执行卷, 进方.工作目录, 拒绝记录)] }] },
  };

  // 超时：编排层规矩「每处外呼必须有超时」（09-04 评审 U10 抓到这里没有）。到点 abort，退出记 timeout。
  const ac = new AbortController();
  options.abortController = ac;
  let 超时了 = false;
  const 表 = setTimeout(() => { 超时了 = true; ac.abort(); }, 进方.超时ms || 30 * 60 * 1000);

  const 基线 = git基线(进方.工作目录);   // 跑前拍：跑后只算这一次改的
  const 起 = 时钟();
  const 行 = [];
  let 回执 = '';
  let 结果 = null;
  try {
    for await (const m of query({ prompt: 进方.提示词, options })) {
      if (m.type === 'assistant') {
        const 文 = 取文本(m);
        if (文) { 行.push(...文.split('\n')); 回执 = 文; }
      } else if (m.type === 'result') {
        结果 = m;
      }
    }
  } catch (e) {
    if (!超时了) throw e;                 // 不是我们掐的，照常炸
    行.push(`[超时 ${进方.超时ms}ms，已 abort：${e && e.message}]`);
  } finally {
    clearTimeout(表);
  }
  const 耗时ms = 时钟() - 起;
  const u = (结果 && 结果.usage) || {};
  const 退出 = 超时了 ? 'timeout' : !结果 ? 'error' : (结果.is_error || /error/.test(String(结果.subtype || ''))) ? 'error' : 'completed';

  return {
    单号: 进方.单号,
    harness: { 名, 版本 },
    改动: git改动(进方.工作目录, 基线),
    日志尾: 行.slice(-N).join('\n'),
    结果: { 退出, 耗时ms, token: { 输入: Number(u.input_tokens) || 0, 输出: Number(u.output_tokens) || 0 } },
    回执: (结果 && typeof 结果.result === 'string' && 结果.result) || 回执,
    会话id: 结果 && 结果.session_id,
    // 可选项**非空才带**。带一个空数组会让键集多一个键——契约一致性把它判成不同形（故意的：
    // 可选项也要各家统一）。「没有拒绝」就是不带这一项，不是带一个 []。
    权限拒绝记录: 拒绝记录.length ? 拒绝记录 : undefined,
  };
}

function 取文本(m) {
  const c = m && m.message && m.message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n');
  return '';
}

module.exports = { 名, 跑, 造写闸钩子, 真git改动, 真git基线 };
