// 壳.js —— 单壳外框：顶况条、页签、页面区。**页签由后端下发的视图表生成，不手写。**
//
// 渲染是纯函数：渲染(视图表, 状态) → 一棵树 {tag, attrs, children}，判据在 Node 里判树；
// 挂(树) 把树变成真 DOM，只在浏览器里跑。没登记真页面的系统走占位页：占位不是「敬请期待」，
// 是说明书里这一圈的定义（怎么转、人在哪介入、凭什么算闭上了、靠哪些模块及各自建没建）。
// 正本一变页面就变；功能建到能看，就把那一格登记进 页面表 替掉占位。
//
// 不 require 任何服务端模块，只走 HTTP；不自算任何状态分组——分组是后端算好的字段。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.壳 = factory();
})(this, function () {
  'use strict';

  /** 造节点。children 里的 null/false 自动丢，数组自动摊平。 */
  const 节 = (tag, attrs, ...children) => ({ tag, attrs: attrs || {}, children: children.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false) });

  const 状态字 = { 已闭环: '闭', 在建: '建', 已声明未设计: '未' };

  function 顶条(状态) {
    const 脉 = 状态.脉搏;
    return 节('header', { class: '顶条' },
      节('span', { class: '牌' }, '游戏开发者终端'),
      节('span', { class: '版本' }, 状态.版本 ? 'v' + 状态.版本 : '…'),
      节('span', { class: '健康 ' + (状态.健康 ? '活' : '死') }, 状态.健康 ? '接口活着' : '接口没应'),
      节('span', { class: '进度' }, 脉 ? `已建 ${脉.已建} · 待建 ${脉.待建}` : ''),
    );
  }

  function 页签栏(视图表, 当前) {
    return 节('nav', { class: '页签栏', 'aria-label': '系统页签' }, 视图表.map((v) => 节('button', { class: '页签' + (v.键 === 当前 ? ' 当前' : ''), 'data-键': v.键, title: v.状态, 'aria-label': `${v.名}（${v.状态}）`, 'aria-current': v.键 === 当前 ? 'page' : null },
      v.名, 节('i', { class: '态 ' + (状态字[v.状态] || '') }, 状态字[v.状态] || '?'))));
  }

  /** 占位页：说明书里这一圈的定义。 */
  function 占位页(v) {
    return 节('section', { class: '页 占位', 'data-键': v.键 },
      节('h2', {}, v.名, 节('small', { class: '状态' }, v.状态)),
      节('p', { class: '占位说明' }, '占位：这一圈的功能还没建到能看的地步。这页显示的是说明书里这一圈的定义，正本变它就变。'),
      节('h3', {}, '这一圈怎么转'),
      v.这一圈.length ? 节('ol', { class: '圈' }, v.这一圈.map((s) => 节('li', { class: v.人在哪介入.includes(s) ? '人' : '' }, s, v.人在哪介入.includes(s) ? 节('b', {}, '人') : null))) : 节('p', { class: '空' }, '（这一圈还没设计）'),
      节('h3', {}, '凭什么算闭上了'),
      节('blockquote', {}, v.凭什么算闭上了 || '（没写）'),
      节('h3', {}, `靠（已建 ${v.已建数} · 待建 ${v.待建数}）`),
      v.靠.length ? 节('ul', { class: '靠' }, v.靠.map((k) => 节('li', { class: k.已建 ? '已建' : '待建' }, k.已建 ? '✓ ' : '☐ ', k.键))) : 节('p', { class: '空' }, '（没有靠的模块）'),
    );
  }

  /** 页面表：系统键 → 渲染函数(视图格, 状态)。没登记的走占位。 */
  const 页面表 = {};

  function 渲染(视图表, 状态) {
    const 表 = Array.isArray(视图表) ? 视图表 : [];
    const 当前 = 表.some((v) => v.键 === 状态.当前) ? 状态.当前 : (表[0] ? 表[0].键 : null);
    const v = 表.find((x) => x.键 === 当前);
    const 画 = v ? (页面表[v.键] || 占位页) : null;
    return 节('div', { class: '壳' },
      顶条(状态),
      页签栏(表, 当前),
      节('main', { class: '页面区' }, v ? 画(v, 状态) : 节('section', { class: '页 空' }, '正本里没有系统')),
    );
  }

  /** 树 → DOM。只在浏览器里跑（判据用假 document）。 */
  function 挂(树, doc) {
    const d = doc || document;
    if (typeof 树 === 'string' || typeof 树 === 'number') return d.createTextNode(String(树));
    const el = d.createElement(树.tag);
    for (const [k, v] of Object.entries(树.attrs)) if (v !== undefined && v !== null && v !== false) el.setAttribute(k, String(v));
    for (const c of 树.children) el.appendChild(挂(c, d));
    return el;
  }

  /** 起：拉四条接口、画、接页签点击。 */
  async function 起(根, 取) {
    const f = 取 || ((p) => fetch(p).then((r) => r.json()));
    const 状态 = { 当前: null, 版本: null, 健康: false, 脉搏: null };
    try { 状态.当前 = localStorage.getItem('壳.当前'); } catch (e) { /* 没有 localStorage 也能画 */ }
    let 视图表 = [];
    try {
      视图表 = await f('/api/views');
      状态.版本 = (await f('/api/version')).版本;
      状态.健康 = !!(await f('/api/health')).行;
      状态.脉搏 = await f('/api/pulse');
    } catch (e) { 状态.健康 = false; }
    const 画 = () => { 根.replaceChildren(挂(渲染(视图表, 状态))); };
    根.addEventListener('click', (e) => {
      const b = e.target && e.target.closest ? e.target.closest('.页签') : null;
      if (!b) return;
      状态.当前 = b.getAttribute('data-键');
      try { localStorage.setItem('壳.当前', 状态.当前); } catch (x) { /* 同上 */ }
      画();
    });
    画();
    return { 状态, 画, 视图表 };
  }

  return { 节, 渲染, 挂, 起, 页面表, 占位页 };
});
