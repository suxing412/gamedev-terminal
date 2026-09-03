// 适配器.js —— runtime adapter 的公共半边：**契约 + 路由**。逐家的运行时映射在 适配器-<家>.js。
//
// 制作人 2026-09-05 00:49 定：按单选 harness，五家一份契约。09-02 外审 codex 第 8 条击杀
// 算过多后端的乘法维护成本——否的不是方向，是「契约没钉死就开多家」。所以：
//   契约先于适配器。进方 = 工单 + 执行卷 + 提示词；出方 = 证据包（内核/证据）。
//   适配器要薄；厚的部分是契约与 契约一致性 判据。
//
// 路由（02:29 定）：无人闸。按需求标记（要引擎？碰活存储？）对能力表；
// 上级席位协议里 可指定下属harness=true 才能用 单.执行池 覆写；
// 没有任何一家覆盖需求 → 不派、上呈。首版只接 Claude + codex——
// 09-04 调研实证这两家的 PreToolUse 能按单传参、实跑拦下，写闸能硬。
'use strict';
const 协议 = require('../领域/协议.js');

const 契约版本 = 1;

/**
 * 能力表。**写闸硬 指 hook 层**，不指沙箱：codex 本机沙箱无头下不可用、且 MCP 工具绕过沙箱已实证，
 * 但它有 PreToolUse。Hermes 要改配置文件、dsh 要写插件，写闸按单硬不起来——先不启用。
 */
const 能力表 = Object.freeze({
  claude: Object.freeze({ 启用: true,  引擎通道: false, 写闸硬: true,  说: 'Agent SDK，hooks.PreToolUse 按单传参' }),
  codex:  Object.freeze({ 启用: true,  引擎通道: false, 写闸硬: true,  说: 'codex exec，-c hooks.PreToolUse 内联 + .rules' }),
  hermes: Object.freeze({ 启用: false, 引擎通道: false, 写闸硬: false, 说: '钩子要改 config.yaml，默认 fail-open' }),
  dsh:    Object.freeze({ 启用: false, 引擎通道: false, 写闸硬: false, 说: '钩子要写插件；headless 只走 argv 无 stdin' }),
});
const 优先序 = Object.freeze(['claude', 'codex']);   // 池衡（额度/偏好）以后接在这儿

class 上呈 extends Error {
  constructor(msg, 单) { super(msg); this.code = '路由上呈'; this.单号 = 单 && 单.id; }
}

/** 一家能不能覆盖这张单的需求。 */
function 覆盖(家, 需求) {
  const c = 能力表[家];
  if (!c || !c.启用) return { 行: false, 因: `${家} 未启用` };
  const 需 = 需求 || {};
  if (需.要引擎 && !c.引擎通道) return { 行: false, 因: `${家} 没有引擎通道` };
  if (需.碰活存储 && !c.写闸硬) return { 行: false, 因: `${家} 写闸不硬，不许派碰活存储的单` };
  return { 行: true, 因: '能力覆盖需求' };
}

/**
 * 路由。
 * @param 单        { id, 需求?, 执行池? }
 * @param 上级协议  派这张单的那一席的协议（决定它有没有资格写 执行池）
 * @returns { harness, 因 }
 * @throws 上呈    没有任何一家覆盖需求
 */
function 路由(单, 上级协议) {
  const 需 = (单 && 单.需求) || {};
  if (单 && 单.执行池) {
    if (!协议.能指定下属harness(上级协议)) {
      throw new 上呈(`单上写了 执行池=${单.执行池}，但派单的席位没有「可指定下属harness」权限——执行席写了无效`, 单);
    }
    const r = 覆盖(单.执行池, 需);
    if (!r.行) throw new 上呈(`指定的 ${单.执行池} 覆盖不了需求：${r.因}`, 单);
    return { harness: 单.执行池, 因: `上级指定（${r.因}）` };
  }
  const 拒 = [];
  for (const 家 of 优先序) {
    const r = 覆盖(家, 需);
    if (r.行) return { harness: 家, 因: `自动路由，优先序第一个能覆盖的：${r.因}` };
    拒.push(`${家}：${r.因}`);
  }
  throw new 上呈(`没有任何一家覆盖需求 ${JSON.stringify(需)}——${拒.join('；')}`, 单);
}

/**
 * 进方契约：每家适配器吃的东西，一个形状。
 * 提示词由 编排/装配器 装（每步新会话、内容按状态机当前格定）；这里只收成品。
 */
function 进方(单, 执行卷, 提示词, 工作目录) {
  if (!单 || !单.id) throw new Error('进方：没有单');
  if (!执行卷 || !执行卷.哈希) throw new Error('进方：没有执行卷（要先过 领域/权限.编译执行卷）');
  if (typeof 提示词 !== 'string' || !提示词.trim()) throw new Error('进方：提示词为空');
  if (!工作目录) throw new Error('进方：没有工作目录');
  return Object.freeze({
    契约版本,
    单号: 单.id,
    性质: 单.性质,
    进项: Object.freeze({ ...(单.进项 || {}) }),
    执行卷,
    提示词,
    工作目录,
  });
}

module.exports = { 契约版本, 能力表, 优先序, 覆盖, 路由, 进方, 上呈 };
