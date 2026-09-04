// 会话.js —— Claude Agent SDK 接法：一席一会话、续接、用量。
//
// 两种用途，两种装法（协议两层分界是类型系统）：
//   对话  给制作人/项管说话的席——系统提示带 人格语气 层
//   审    深检站、评审台这类只读的判官——**不带人格**，工具只给读的，不许写盘
// 续接：SDK 的 resume 带上一次的 session_id；开会话时给 续接 就接着聊，不给就新开。
//
// 依赖可注入（query / 版本），判据把 query 换成假的就能跑，不碰网。执行工单**不走这里**，走 适配器-claude。
'use strict';
const 协议模块 = require('../领域/协议.js');

const 只读工具 = Object.freeze(['Read', 'Grep', 'Glob']);

function 真query() {
  let sdk;
  try { sdk = require('@anthropic-ai/claude-agent-sdk'); }
  catch (e) { throw new Error('会话：没装 @anthropic-ai/claude-agent-sdk（npm install），或注入 依赖.query'); }
  return sdk.query;
}

function 取文本(m) {
  const c = m && m.message && m.message.content;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.filter((x) => x && x.type === 'text').map((x) => x.text).join('\n');
  return '';
}

/**
 * 开一个会话。
 * @param 协议  两层协议对象
 * @param 选项  { 用途: '对话'|'审', 工作目录, 续接?, 最多轮?, 超时ms? }
 * @param 依赖  { query?, 钟? }
 */
function 开会话(协议, 选项, 依赖) {
  const o = 选项 || {};
  const d = 依赖 || {};
  if (o.用途 !== '对话' && o.用途 !== '审') throw new Error('会话：用途 只能是 对话 或 审');
  if (!o.工作目录) throw new Error('会话：要 工作目录');
  const query = d.query || 真query();
  const 声 = 协议模块.权限声明(协议);
  const 人格 = o.用途 === '对话' ? 协议模块.人格(协议) : null;
  let 会话id = o.续接 || null;
  const 系统提示 = 人格
    ? [`你是「${人格.称呼 || 声.职能}」，职能 ${声.职能}。`, 人格.语气 ? `语气：${人格.语气}` : '', 人格.开场 ? `开场：${人格.开场}` : '', 人格.忌讳.length ? `忌讳：${人格.忌讳.join('；')}` : ''].filter(Boolean).join('\n')
    : `你是只读的判官（职能 ${声.职能}）。不许改任何文件，不许自己判定流程下一步，只出结论与理由。`;

  const 会话 = {
    get id() { return 会话id; },
    用途: o.用途,
    /** 问一句，收整段回复。 */
    async 问(提示词) {
      if (typeof 提示词 !== 'string' || !提示词.trim()) throw new Error('会话：提示词为空');
      const ac = new AbortController();
      const 表 = setTimeout(() => ac.abort(), o.超时ms || 10 * 60 * 1000);
      const options = {
        cwd: o.工作目录,
        permissionMode: 'default',
        allowedTools: o.用途 === '审' ? [...只读工具] : [...声.可用工具],
        systemPrompt: { type: 'preset', preset: 'claude_code', append: 系统提示 },
        maxTurns: o.最多轮 || 8,
        abortController: ac,
        ...(会话id ? { resume: 会话id } : {}),
      };
      const 行 = [];
      let 结果 = null;
      try {
        for await (const m of query({ prompt: 提示词, options })) {
          if (m.type === 'assistant') { const 文 = 取文本(m); if (文) 行.push(文); }
          else if (m.type === 'result') 结果 = m;
        }
      } finally { clearTimeout(表); }
      if (结果 && 结果.session_id) 会话id = 结果.session_id;
      const u = (结果 && 结果.usage) || {};
      return {
        文本: (结果 && typeof 结果.result === 'string' && 结果.result) || 行.join('\n'),
        会话id,
        退出: !结果 ? 'error' : (结果.is_error ? 'error' : 'completed'),
        用量: { 输入: Number(u.input_tokens) || 0, 输出: Number(u.output_tokens) || 0 },
      };
    },
  };
  return 会话;
}

module.exports = { 开会话, 只读工具 };
