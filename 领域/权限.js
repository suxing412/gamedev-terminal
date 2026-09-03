// 权限.js —— 权限求交：席位声明 × 工单收紧 → 执行卷。
//
// 制作人 Q6 定的：**席位声明默认权限，具体一张工单可以收紧、不能放宽。**
// 「只能收紧不能放宽」是可判定的——工单要一个协议里没有的目录，不是自动放宽，是红。
//
// 求交结果编译一次、带哈希、与会话绑定（落盘由适配器经写闸做，这里不碰 fs）。
// 带哈希是为了：执行到一半有人改了协议，会话里那份执行卷不变——一张单从头到尾
// 用的是同一份权限，改协议对在跑的单不生效，对下一张才生效。
//
// 纯函数。
'use strict';
const crypto = require('crypto');

class 放宽拒绝 extends Error {
  constructor(msg, 项, 值) { super(msg); this.code = '放宽拒绝'; this.项 = 项; this.值 = 值; }
}

const 归一 = (p) => String(p || '').replace(/\\/g, '/').replace(/\/+$/, '');

/** glob 前缀覆盖：声明里的 `Assets/SLG/**` 覆盖 `Assets/SLG/Map/x.cs` 与 `Assets/SLG/**`。只做前缀，不做完整 glob。 */
function 被覆盖(路, 声明目录们) {
  const x = 归一(路).replace(/\/\*\*$/, '');
  return 声明目录们.some((d) => {
    const y = 归一(d).replace(/\/\*\*$/, '');
    return x === y || x.startsWith(y + '/');
  });
}

/**
 * 求交。
 * @param 声明  领域/协议.权限声明() 的产物：{ 可碰目录, 可用工具, 禁, 默认harness, 可指定下属harness }
 * @param 收紧  工单上的约束（可缺省）：{ 可碰目录?, 可用工具?, 禁? }
 * @returns { 可碰目录, 可用工具, 禁 }  —— 只收紧的结果
 * @throws 放宽拒绝  工单要了声明里没有的东西
 */
function 求交(声明, 收紧) {
  const s = 声明 || {};
  const t = 收紧 || {};
  const 目录 = t.可碰目录 === undefined ? [...(s.可碰目录 || [])] : (t.可碰目录 || []).map((d) => {
    if (!被覆盖(d, s.可碰目录 || [])) throw new 放宽拒绝(`工单要碰「${d}」，协议没给——只能收紧不能放宽`, '可碰目录', d);
    return d;
  });
  const 工具 = t.可用工具 === undefined ? [...(s.可用工具 || [])] : (t.可用工具 || []).map((w) => {
    if (!(s.可用工具 || []).includes(w)) throw new 放宽拒绝(`工单要用「${w}」，协议没给——只能收紧不能放宽`, '可用工具', w);
    return w;
  });
  const 禁 = [...new Set([...(s.禁 || []), ...(t.禁 || [])])];   // 禁只会变多
  return Object.freeze({ 可碰目录: 目录, 可用工具: 工具, 禁 });
}

/**
 * 编译执行卷：一张单 + 一份声明 + 收紧 → 冻结的对象 + 哈希。
 * 哈希只盖权限那部分——同一张单同一份权限，哈希必相同；协议一改，哈希就变。
 */
function 编译执行卷(单, 声明, 收紧) {
  const 权 = 求交(声明, 收紧);
  const 正文 = JSON.stringify({ 单号: 单 && 单.id, 权 });
  const 哈希 = crypto.createHash('sha256').update(正文).digest('hex').slice(0, 16);
  return Object.freeze({ 单号: 单 && 单.id, 权限: 权, 哈希, 契约版本: 1 });
}

/** 一条工具调用（路径写入）过不过执行卷——给 PreToolUse 钩子用的判定，纯函数。 */
function 准写(执行卷, 路) {
  const 权 = 执行卷 && 执行卷.权限;
  if (!权) return { 行: false, 因: '没有执行卷' };
  for (const d of 权.禁) if (被覆盖(路, [d])) return { 行: false, 因: `落在禁区 ${d}` };
  if (被覆盖(路, 权.可碰目录)) return { 行: true, 因: '在可碰目录内' };
  return { 行: false, 因: `不在可碰目录内。这张单只准碰：${权.可碰目录.join('、') || '（空，只读席）'}` };
}

module.exports = { 求交, 编译执行卷, 准写, 被覆盖, 放宽拒绝 };
