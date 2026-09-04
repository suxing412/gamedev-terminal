// 壳.test.js —— 渲染是纯函数，在 Node 里判树：页签 == 视图表、当前页签、占位页装了这一圈/人/靠、登记真页面就替掉占位、挂 成 DOM 形状对。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const 壳 = require('../../web/壳.js');

const 视图表 = () => [
  { 键: '研发', 名: '开发研发', 状态: '在建', 这一圈: ['需求', '拆单', '审批', '执行', '归档'], 人在哪介入: ['审批'], 凭什么算闭上了: '说一句需求收到产出', 靠: [{ 键: '领域/状态机', 已建: true }, { 键: '接口/prod', 已建: false }], 已建数: 1, 待建数: 1 },
  { 键: '值守', 名: '监测和值守', 状态: '已声明未设计', 这一圈: [], 人在哪介入: [], 凭什么算闭上了: '', 靠: [], 已建数: 0, 待建数: 0 },
];
const 状态 = (改) => ({ 当前: null, 版本: '0.1.0', 健康: true, 脉搏: { 已建: 21, 待建: 26 }, ...改 });
const 找 = (树, 断) => { const 出 = []; const 走 = (n) => { if (!n || typeof n !== 'object') return; if (断(n)) 出.push(n); (n.children || []).forEach(走); }; 走(树); return 出; };
const 文 = (n) => (typeof n === 'string' ? n : (n.children || []).map(文).join(''));

test('壳① 页签数 == 视图表；没给当前就选第一个；给了就选它；页签带状态字', () => {
  const 树 = 壳.渲染(视图表(), 状态());
  const 签 = 找(树, (n) => n.attrs && /^页签( |$)/.test(n.attrs.class || ''));
  assert.strictEqual(签.length, 2);
  assert.ok(签[0].attrs.class.includes('当前') && !签[1].attrs.class.includes('当前'));
  assert.strictEqual(文(签[0]).includes('建'), true, '在建 → 建');
  const 树2 = 壳.渲染(视图表(), 状态({ 当前: '值守' }));
  const 签2 = 找(树2, (n) => n.attrs && /^页签( |$)/.test(n.attrs.class || ''));
  assert.ok(签2[1].attrs.class.includes('当前'));
  const 树3 = 壳.渲染(视图表(), 状态({ 当前: '不存在的' }));
  assert.ok(找(树3, (n) => n.attrs && /^页签( |$)/.test(n.attrs.class || ''))[0].attrs.class.includes('当前'), '当前不在表里就回第一个');
});

test('壳② 占位页：标着占位；这一圈逐条、人介入的那步标「人」；凭什么算闭上了；靠 逐条标已建/待建', () => {
  const 树 = 壳.渲染(视图表(), 状态());
  const 页 = 找(树, (n) => n.attrs && n.attrs.class === '页 占位')[0];
  assert.strictEqual(页.attrs['data-键'], '研发');
  assert.match(文(页), /占位：/);
  const 步 = 找(页, (n) => n.tag === 'li' && n.attrs && ('class' in n.attrs) && !/已建|待建/.test(n.attrs.class));
  assert.strictEqual(步.length, 5);
  assert.strictEqual(步.filter((s) => s.attrs.class === '人').length, 1);
  assert.match(文(步[2]), /审批人/);
  assert.match(文(页), /说一句需求收到产出/);
  const 靠 = 找(页, (n) => n.tag === 'li' && /已建|待建/.test((n.attrs || {}).class || ''));
  assert.deepStrictEqual(靠.map((k) => [k.attrs.class, 文(k)]), [['已建', '✓ 领域/状态机'], ['待建', '☐ 接口/prod']]);
  assert.match(文(页), /已建 1 · 待建 1/);
});

test('壳③ 已声明未设计的系统：圈为空就说「还没设计」，靠为空就说没有；不炸', () => {
  const 树 = 壳.渲染(视图表(), 状态({ 当前: '值守' }));
  const 页 = 找(树, (n) => n.attrs && n.attrs.class === '页 占位')[0];
  assert.match(文(页), /还没设计/);
  assert.match(文(页), /没有靠的模块/);
});

test('壳④ 登记真页面就替掉占位；顶条有版本、健康、进度；接口没应时健康是死', () => {
  壳.页面表.研发 = (v) => 壳.节('section', { class: '页 生产' }, '甘特在这');
  try {
    const 树 = 壳.渲染(视图表(), 状态());
    assert.strictEqual(找(树, (n) => n.attrs && n.attrs.class === '页 占位').length, 0);
    assert.match(文(找(树, (n) => n.attrs && n.attrs.class === '页 生产')[0]), /甘特在这/);
  } finally { delete 壳.页面表.研发; }
  const 顶 = 找(壳.渲染(视图表(), 状态()), (n) => n.attrs && n.attrs.class === '顶条')[0];
  assert.match(文(顶), /v0\.1\.0/); assert.match(文(顶), /接口活着/); assert.match(文(顶), /已建 21 · 待建 26/);
  const 死 = 找(壳.渲染(视图表(), 状态({ 健康: false, 版本: null })), (n) => n.attrs && /健康/.test(n.attrs.class || ''))[0];
  assert.match(死.attrs.class, /死/); assert.match(文(死), /没应/);
});

test('壳⑤ 挂：树变 DOM——标签、属性、文本、层级都对（假 document）', () => {
  const 造 = (tag) => ({ tag, attrs: {}, kids: [], setAttribute(k, v) { this.attrs[k] = v; }, appendChild(c) { this.kids.push(c); } });
  const doc = { createElement: 造, createTextNode: (t) => ({ text: t }) };
  const el = 壳.挂(壳.节('div', { class: 'a', 'data-键': '研发', 空: null }, '文', 壳.节('b', {}, '粗')), doc);
  assert.strictEqual(el.tag, 'div');
  assert.deepStrictEqual(el.attrs, { class: 'a', 'data-键': '研发' }, 'null 属性不设');
  assert.deepStrictEqual(el.kids[0], { text: '文' });
  assert.strictEqual(el.kids[1].tag, 'b');
  assert.deepStrictEqual(el.kids[1].kids[0], { text: '粗' });
});

test('壳⑥ 视图表为空 → 一页「没有系统」，不炸', () => {
  const 树 = 壳.渲染([], 状态());
  assert.match(文(树), /正本里没有系统/);
});
