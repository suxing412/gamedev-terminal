// 架构树.js —— 工单在产品架构树上的位置：从「只记直接上级」反向推出整棵树，以及相邻与阻塞关系。
//
// 四层：管线 → 特性 → 专项 → 工单（散单直挂散单特性）。正本 H107：每个实体只写直接上级，
// 不写祖父、不写子列表——所以「这条管线下有哪些专项」「这张单挡着谁」都是**推出来的**，不是存的。
// 这个模块就是那个推。它是 领域/排期（依赖顺序）与 web/生产（甘特、工单库）的数据源。
//
// 纯函数。料由调用方从数据区读好传进来：{ 管线们, 特性们, 专项们, 工单们 }。
// 挂错地方的实体**报成孤儿，不 throw**——一张孤儿单不该让整棵树推不出来；旧仓 14 张孤儿单就是这么静默丢的。
'use strict';
const 状态机 = require('./状态机.js');

const 推 = (m, k, v) => { if (!m.has(k)) m.set(k, []); m.get(k).push(v); };
const 数组 = (x) => (Array.isArray(x) ? x : x === undefined || x === null ? [] : [x]);

/** 推出整棵树。 */
function 建树(料) {
  const r = 料 || {};
  const 管线们 = r.管线们 || [], 特性们 = r.特性们 || [], 专项们 = r.专项们 || [], 工单们 = r.工单们 || [];
  const 管线id = new Set(管线们.map((p) => p.id));
  const 特性id = new Set(特性们.map((f) => f.id));
  const 专项id = new Set(专项们.map((s) => s.id));
  const 特性按管线 = new Map(), 专项按特性 = new Map(), 单按专项 = new Map(), 单按特性 = new Map();
  const 孤儿 = [];
  for (const f of 特性们) {
    if (!管线id.has(f.管线)) { 孤儿.push({ 层: '特性', id: f.id, 因: `管线「${f.管线}」不存在` }); continue; }
    推(特性按管线, f.管线, f);
  }
  for (const s of 专项们) {
    if (!特性id.has(s.特性)) { 孤儿.push({ 层: '专项', id: s.id, 因: `特性「${s.特性}」不存在` }); continue; }
    推(专项按特性, s.特性, s);
  }
  for (const t of 工单们) {
    const 归 = t.归属 || {};
    if (归.专项) {
      if (!专项id.has(归.专项)) { 孤儿.push({ 层: '工单', id: t.id, 因: `专项「${归.专项}」不存在` }); continue; }
      推(单按专项, 归.专项, t);
    } else if (归.特性) {
      if (!特性id.has(归.特性)) { 孤儿.push({ 层: '工单', id: t.id, 因: `特性「${归.特性}」不存在` }); continue; }
      推(单按特性, 归.特性, t);
    } else {
      孤儿.push({ 层: '工单', id: t.id, 因: '没有归属' });
    }
  }
  const 树 = 管线们.map((p) => Object.freeze({
    id: p.id, 名称: p.名称, 状态: p.状态,
    特性: Object.freeze((特性按管线.get(p.id) || []).map((f) => Object.freeze({
      id: f.id, 名称: f.名称, 状态: f.状态, 散单: f.散单 === true,
      专项: Object.freeze((专项按特性.get(f.id) || []).map((s) => Object.freeze({
        id: s.id, 名称: s.名称, 状态: s.状态, 产出类型: s.产出类型,
        工单: Object.freeze((单按专项.get(s.id) || []).map((t) => t.id)),
      }))),
      散单工单: Object.freeze((单按特性.get(f.id) || []).map((t) => t.id)),
    }))),
  }));
  return Object.freeze({ 管线: Object.freeze(树), 孤儿: Object.freeze(孤儿) });
}

/** 一张单往上的链：工单 → 专项? → 特性 → 管线。断在哪一层就说哪一层。 */
function 上级链(料, 工单) {
  const r = 料 || {};
  const 归 = (工单 && 工单.归属) || {};
  const 找 = (们, id) => (们 || []).find((x) => x.id === id) || null;
  let 专项 = null, 特性 = null;
  if (归.专项) {
    专项 = 找(r.专项们, 归.专项);
    if (!专项) return { 行: false, 断在: `专项「${归.专项}」不存在` };
    特性 = 找(r.特性们, 专项.特性);
    if (!特性) return { 行: false, 断在: `专项「${专项.id}」的特性「${专项.特性}」不存在` };
  } else if (归.特性) {
    特性 = 找(r.特性们, 归.特性);
    if (!特性) return { 行: false, 断在: `特性「${归.特性}」不存在` };
  } else {
    return { 行: false, 断在: '工单没有归属' };
  }
  const 管线 = 找(r.管线们, 特性.管线);
  if (!管线) return { 行: false, 断在: `特性「${特性.id}」的管线「${特性.管线}」不存在` };
  return { 行: true, 专项: 专项 ? 专项.id : null, 特性: 特性.id, 管线: 管线.id };
}

/** 相邻：同一专项（或同一散单特性）下的其它单。 */
function 相邻(料, 工单id) {
  const 工单们 = (料 && 料.工单们) || [];
  const 我 = 工单们.find((t) => t.id === 工单id);
  if (!我) return [];
  const 归 = 我.归属 || {};
  const 同 = (t) => { const g = t.归属 || {}; return 归.专项 ? g.专项 === 归.专项 : (归.特性 ? g.特性 === 归.特性 && !g.专项 : false); };
  return 工单们.filter((t) => t.id !== 工单id && 同(t)).map((t) => t.id);
}

/**
 * 数据流：谁的进项引用了谁的产出。边就是 拆单判据② 的那条：进项由更早的单产出。
 * @returns Map<工单id, [产出被它引用的工单id]>
 */
function 数据流(工单们) {
  const 们 = 工单们 || [];
  const 产出者 = new Map();   // 路径 → 工单id
  for (const t of 们) for (const v of Object.values(t.产出 || {})) for (const 路 of 数组(v)) 产出者.set(路, t.id);
  const 图 = new Map();
  for (const t of 们) {
    const 上游 = new Set();
    for (const v of Object.values(t.进项 || {})) for (const 路 of 数组(v)) {
      const 谁 = 产出者.get(路);
      if (谁 && 谁 !== t.id) 上游.add(谁);
    }
    图.set(t.id, [...上游]);
  }
  return 图;
}

const 了了 = (单) => 单 && (单.状态 === '完成' || 单.状态 === '归档');

/** 阻塞：挡着我的（我的上游还没完）与我挡着的（引用我产出的下游）。 */
function 阻塞(料, 工单id) {
  const 工单们 = (料 && 料.工单们) || [];
  const 图 = 数据流(工单们);
  const 按id = new Map(工单们.map((t) => [t.id, t]));
  const 挡着我的 = (图.get(工单id) || []).filter((id) => !了了(按id.get(id)));
  const 我挡着的 = [];
  for (const [id, 上游] of 图) if (id !== 工单id && 上游.includes(工单id) && !了了(按id.get(工单id))) 我挡着的.push(id);
  return { 挡着我的, 我挡着的 };
}

/** 计数：每个专项 / 特性 / 管线 下的工单按屏上格归类（格表在状态机，不另存）。 */
function 计数(料) {
  const 树 = 建树(料);
  const 工单们 = (料 && 料.工单们) || [];
  const 按id = new Map(工单们.map((t) => [t.id, t]));
  const 数 = (ids) => { const c = {}; for (const id of ids) { const t = 按id.get(id); if (t && t.状态) c[t.状态] = (c[t.状态] || 0) + 1; } return 状态机.分格(c); };
  const 出 = { 管线: {}, 特性: {}, 专项: {} };
  for (const p of 树.管线) {
    const 管线单 = [];
    for (const f of p.特性) {
      const 特性单 = [...f.散单工单];
      for (const s of f.专项) { 出.专项[s.id] = 数(s.工单); 特性单.push(...s.工单); }
      出.特性[f.id] = 数(特性单);
      管线单.push(...特性单);
    }
    出.管线[p.id] = 数(管线单);
  }
  return 出;
}

module.exports = { 建树, 上级链, 相邻, 数据流, 阻塞, 计数 };
