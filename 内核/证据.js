// 证据.js —— 证据包：adapter 的出方契约。
//
// 不管哪家 harness 跑完，交回来的都是这个形状；初检验的第一件事就是「形状对不对」。
// 五项必有缺一红。**证据包由适配器攒，不由模型攒**——模型交回执正文，其余全是
// 适配器从进程外拿的：改动清单是 git diff 说了算，不是模型自称「我改了 3 个文件」。
//
// 这里只做「攒」与「验」，纯函数；git diff / 读日志尾 是适配器（编排层）的活，
// 它们拿到东西后交给这里攒成包。
'use strict';
const S = require('../docs/契约/证据包.json');

const 必有键 = Object.freeze(Object.keys(S.必有));   // 单号 harness 改动 日志尾 结果 回执
const 契约版本 = S.契约版本;

/**
 * 攒包。参数全部由适配器给，缺什么就攒出一个缺什么的包——**不补默认值**，
 * 缺项要在 验包 里红出来，补了默认值就是替模型圆谎。
 */
function 攒包(件) {
  const p = 件 || {};
  const 包 = {
    契约版本,
    单号: p.单号,
    harness: p.harness ? { 名: p.harness.名, 版本: p.harness.版本 } : undefined,
    // **只对数组展开。** 首版 [...(p.改动.文件 || [])] 会把字符串 'x.cs' 展成 ['x','.','c','s']——
    // 把坏输入悄悄修成了数组，验包就看不见了。这正是「攒包不补默认值」要防的那一类。
    改动: p.改动 ? { 文件: Array.isArray(p.改动.文件) ? [...p.改动.文件] : p.改动.文件, diff: p.改动.diff } : undefined,
    日志尾: p.日志尾,
    结果: p.结果 ? { 退出: p.结果.退出, 耗时ms: p.结果.耗时ms, token: p.结果.token } : undefined,
    回执: p.回执,
  };
  // 可选项原样带上，不校验形状（开放列表）
  for (const k of (S.可选.已知 || [])) if (p[k] !== undefined) 包[k] = p[k];
  return 包;
}

/** 验包：形状对不对。这是初检的第一道，不看内容。 */
function 验包(包) {
  const 违 = [];
  if (!包 || typeof 包 !== 'object') return { 行: false, 违: ['不是对象'] };
  if (包.契约版本 !== 契约版本) {
    违.push(`契约版本 ${包.契约版本} ≠ ${契约版本}——旧适配器交旧形状，不许混进来`);
  }
  for (const k of 必有键) {
    const v = 包[k];
    if (v === undefined || v === null || v === '') { 违.push(`缺必有项「${k}」`); continue; }
  }
  if (包.harness && (!包.harness.名 || !包.harness.版本)) 违.push('harness 要有 名 和 版本——不记版本就对不上');
  if (包.改动 && !Array.isArray(包.改动.文件)) 违.push('改动.文件 该是数组（适配器 git diff 算出来的）');
  if (包.结果) {
    if (!['completed', 'error', 'timeout'].includes(包.结果.退出)) 违.push(`结果.退出「${包.结果.退出}」不是 completed/error/timeout`);
    if (!Number.isFinite(包.结果.耗时ms)) 违.push('结果.耗时ms 该是数字');
    if (!包.结果.token || !Number.isFinite(包.结果.token.输入) || !Number.isFinite(包.结果.token.输出)) 违.push('结果.token 要有 输入/输出 两个数');
  }
  return { 行: 违.length === 0, 违 };
}

/** 两个包形状是否一致（不比内容）——契约一致性判据用它比五家交回来的东西。 */
function 同形(a, b) {
  const 键 = (o) => Object.keys(o || {}).filter((k) => o[k] !== undefined).sort().join(',');
  if (键(a) !== 键(b)) return false;
  if (键(a.结果) !== 键(b.结果)) return false;
  if (键(a.改动) !== 键(b.改动)) return false;
  return true;
}

module.exports = { 攒包, 验包, 同形, 必有键, 契约版本, schema: S };
