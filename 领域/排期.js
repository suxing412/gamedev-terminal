// 排期.js —— 排期算法与依赖顺序：谁挡着谁、哪条线空转、甘特要的条。
//
// 依赖不是人填的：拆单判据② 说进项由更早的单产出，所以「谁先谁后」从进项→产出的数据流推出来
// （边在 领域/架构树.数据流，这里不另算）。改排期要落账不覆盖：记排期() 往履历追加一条，旧的留着。
//
// 首版不做资源约束（并行席位数、额度），只做依赖与工时：一张单最早能开的时刻 = 上游都完了的时刻；
// 工时取 估算.时间（小时），没填按性质用默认工时。临界 = 松弛为零的那条链。
//
// 纯函数。时间由调用方传 现在，不碰钟。
'use strict';
const 架构树 = require('./架构树.js');
const 状态机 = require('./状态机.js');

const 小时ms = 3600 * 1000;
/** 没填估算时按性质给的工时（小时）。是排期的兜底，不是承诺。 */
const 默认工时 = Object.freeze({ 新建: 4, 修复: 2, 调研: 2, 装配: 3 });

const 解 = (时) => { if (时 === undefined || 时 === null) return NaN; return typeof 时 === 'number' ? 时 : Date.parse(时); };
function 工时ms(单) {
  const e = 单.估算 && Number(单.估算.时间);
  return (e > 0 ? e : (默认工时[单.性质] || 4)) * 小时ms;
}
/** 履历里最后一次进某态的时刻。 */
function 进入时刻(单, 态) {
  const h = (单.履历 || []).filter((x) => x.到 === 态 && x.t);
  return h.length ? 解(h[h.length - 1].t) : NaN;
}
const 不排的态 = new Set(['废弃', '挂起']);
const 完了的态 = new Set(['完成', '归档']);
const 在跑的态 = new Set(状态机.大态.在途.filter((s) => s !== '完成'));

/** 拓扑序：按数据流排先后；有环的报出来，不死循环。 */
function 拓扑序(工单们) {
  const 们 = 工单们 || [];
  const 图 = 架构树.数据流(们);
  const 入度 = new Map(); const 下游 = new Map();
  for (const t of 们) { 入度.set(t.id, 0); 下游.set(t.id, []); }
  for (const [id, 上游] of 图) for (const u of 上游) { if (!入度.has(u)) continue; 入度.set(id, 入度.get(id) + 1); 下游.get(u).push(id); }
  const 队 = 们.filter((t) => 入度.get(t.id) === 0).map((t) => t.id);
  const 序 = [];
  while (队.length) {
    const id = 队.shift(); 序.push(id);
    for (const d of 下游.get(id)) { 入度.set(d, 入度.get(d) - 1); if (入度.get(d) === 0) 队.push(d); }
  }
  const 环 = 们.map((t) => t.id).filter((id) => !序.includes(id));
  return { 序, 环, 图 };
}

/**
 * 排。
 * @param 工单们
 * @param 选项 { 现在 }  现在 = ISO 或毫秒
 * @returns { 条: [{ id, 起, 止, 工时ms, 上游, 临界, 状态 }], 不排: [{ id, 因 }], 环: [id], 项目止 }
 */
function 排(工单们, 选项) {
  const 现在 = 解((选项 || {}).现在);
  if (Number.isNaN(现在)) throw new Error('排期：要传 现在（ISO 或毫秒）——领域层不碰钟');
  const 们 = (工单们 || []).filter((t) => t && t.id);
  const 按id = new Map(们.map((t) => [t.id, t]));
  const { 序, 环, 图 } = 拓扑序(们);
  const 不排 = [];
  const 结 = new Map();
  for (const id of 序) {
    const t = 按id.get(id);
    if (不排的态.has(t.状态)) { 不排.push({ id, 因: `状态 ${t.状态}` }); continue; }
    const 上游 = (图.get(id) || []).filter((u) => 结.has(u));
    let 起, 止;
    if (完了的态.has(t.状态)) {
      const 完 = 进入时刻(t, '完成');
      止 = Number.isNaN(完) ? Math.min(现在, 解(t.更新时间) || 现在) : 完;
      const 开 = 进入时刻(t, '在途');
      起 = Number.isNaN(开) ? 止 - 工时ms(t) : 开;
    } else if (在跑的态.has(t.状态)) {
      const 开 = 进入时刻(t, '在途');
      起 = Number.isNaN(开) ? 现在 : 开;
      止 = Math.max(起 + 工时ms(t), 现在);
    } else {
      起 = Math.max(现在, ...上游.map((u) => 结.get(u).止));
      止 = 起 + 工时ms(t);
    }
    结.set(id, { id, 起, 止, 工时ms: 止 - 起, 上游, 状态: t.状态, 临界: false });
  }
  for (const id of 环) 不排.push({ id, 因: '在依赖环里' });
  // 临界：松弛为零。最晚完成从项目末尾往回推。
  const 项目止 = Math.max(现在, ...[...结.values()].map((r) => r.止));
  const 最晚止 = new Map([...结.keys()].map((id) => [id, 项目止]));
  for (const id of [...序].reverse()) {
    if (!结.has(id)) continue;
    const r = 结.get(id);
    for (const u of r.上游) 最晚止.set(u, Math.min(最晚止.get(u), 最晚止.get(id) - r.工时ms));
  }
  for (const [id, r] of 结) r.临界 = (最晚止.get(id) - r.止) === 0 && !完了的态.has(r.状态);
  const 条 = 序.filter((id) => 结.has(id)).map((id) => Object.freeze({ ...结.get(id), 上游: Object.freeze([...结.get(id).上游]) }));
  return Object.freeze({ 条: Object.freeze(条), 不排: Object.freeze(不排), 环: Object.freeze(环), 项目止 });
}

/**
 * 空转：进行中的专项没有单在跑、也没有单能派（都被挡着或根本没单）；一条管线下的专项全空转或没有在进行的，线空转。
 * @param 料 { 管线们, 特性们, 专项们, 工单们 }
 */
function 空转(料) {
  const r = 料 || {};
  const 工单们 = r.工单们 || [];
  const 按id = new Map(工单们.map((t) => [t.id, t]));
  const 图 = 架构树.数据流(工单们);
  const 能派 = (t) => 状态机.大态.待办.includes(t.状态) && (图.get(t.id) || []).every((u) => { const x = 按id.get(u); return !x || 完了的态.has(x.状态); });
  const 专项 = [];
  for (const s of (r.专项们 || [])) {
    if (s.状态 !== '进行') continue;
    const 单 = 工单们.filter((t) => t.归属 && t.归属.专项 === s.id);
    if (!单.length) { 专项.push({ 专项: s.id, 因: '进行中却一张单都没有' }); continue; }
    if (单.some((t) => 在跑的态.has(t.状态))) continue;
    if (单.some(能派)) continue;
    if (单.every((t) => 完了的态.has(t.状态))) { 专项.push({ 专项: s.id, 因: '单全完了，专项还挂着进行——该收口' }); continue; }
    专项.push({ 专项: s.id, 因: '没有单在跑，待办的全被上游挡着' });
  }
  const 空的专项 = new Set(专项.map((x) => x.专项));
  const 管线 = [];
  for (const p of (r.管线们 || [])) {
    const 特性id = new Set((r.特性们 || []).filter((f) => f.管线 === p.id).map((f) => f.id));
    const 在进行 = (r.专项们 || []).filter((s) => 特性id.has(s.特性) && s.状态 === '进行');
    if (!在进行.length) continue;                     // 没开线不算空转，那是没排
    if (在进行.every((s) => 空的专项.has(s.id))) 管线.push({ 管线: p.id, 因: `在进行的 ${在进行.length} 个专项全空转` });
  }
  return { 专项, 管线 };
}

/** 甘特要的条：每张单一行，起止、格、依赖、临界。渲染不在这儿。 */
function 甘特条(排结果, 工单们) {
  const 按id = new Map((工单们 || []).map((t) => [t.id, t]));
  const 格 = (态) => Object.keys(状态机.格表).find((g) => 状态机.格表[g].includes(态)) || '未知';
  return 排结果.条.map((r) => {
    const t = 按id.get(r.id) || {};
    return Object.freeze({
      id: r.id, title: t.title || '', 归属: t.归属 || null, 性质: t.性质 || null,
      起: new Date(r.起).toISOString(), 止: new Date(r.止).toISOString(),
      格: 格(r.状态), 依赖: r.上游, 临界: r.临界,
    });
  });
}

/** 改排期落账不覆盖：往履历追加一条 {t, 排期:{起,止}, 操作者, 因}，旧的留着。返回新对象。 */
function 记排期(单, 条, 凭) {
  const p = 凭 || {};
  if (!p.操作者) throw new Error('记排期：没写操作者');
  if (!条 || 条.起 === undefined || 条.止 === undefined) throw new Error('记排期：条要有 起 与 止');
  const 项 = { t: p.时刻 || null, 排期: { 起: 条.起, 止: 条.止 }, 操作者: p.操作者, 因: p.因 || '' };
  return { ...单, 履历: [...(单.履历 || []), 项] };
}

module.exports = { 默认工时, 工时ms, 拓扑序, 排, 空转, 甘特条, 记排期 };
