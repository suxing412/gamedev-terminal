// 生产.test.js —— 登记替掉留白；甘特一单一行按格上色临界描边；人闸队列逾期/上呈标出来；数据没拉到说清；工单库一单一行。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const 壳 = require('../../web/壳.js');
const 生产 = require('../../web/生产.js');

const 找 = (树, 断) => { const 出 = []; const 走 = (n) => { if (!n || typeof n !== 'object') return; if (断(n)) 出.push(n); (n.children || []).forEach(走); }; 走(树); return 出; };
const 文 = (n) => (typeof n === 'string' ? n : (n.children || []).map(文).join(''));
const 格 = { 键: '研发', 名: '开发研发', 状态: '在建', 这一圈: [], 人在哪介入: [], 凭什么算闭上了: '', 靠: [], 已建数: 9, 待建数: 3 };
const board = () => ({
  t: '2026-09-05T00:00:00.000Z',
  甘特: [
    { id: 'TK-1', title: '方案', 起: '2026-09-04T20:00:00.000Z', 止: '2026-09-04T22:00:00.000Z', 格: '已落袋', 依赖: [], 临界: false },
    { id: 'TK-2', title: '实现', 起: '2026-09-04T22:00:00.000Z', 止: '2026-09-05T04:00:00.000Z', 格: '在途', 依赖: ['TK-1'], 临界: true },
    { id: 'TK-3', title: '装配', 起: '2026-09-05T04:00:00.000Z', 止: '2026-09-05T07:00:00.000Z', 格: '待跑', 依赖: ['TK-1', 'TK-2'], 临界: true },
  ],
  不排: [], 环: [],
  在等: [{ 类: '人判', 单: 'TK-4', 等谁: '制作人', 等了ms: 3600000 * 50, 逾期: true, 升格: '上呈', 注: '' }, { 类: '待审', 单: 'TK-5', 等谁: '制作人', 等了ms: 60000 * 5, 逾期: false, 升格: null, 注: '' }],
  计数: { 管线: { 'P-1': { 待跑: 1, 在途: 1, 候验收: 0, 人闸: 2, 已落袋: 1, 结束: 0, 漏: [] } }, 特性: {}, 专项: {} },
  空转: { 专项: [], 管线: [] }, 坏: [],
});
const tickets = () => [{ id: 'TK-1', title: '方案', 职能: '技术策划', 性质: '调研', 状态: '归档', 归属: { 专项: 'S-1' }, 闸: ['初检', '深检', '人判'] }, { id: 'TK-2', title: '实现', 职能: '程序', 性质: '新建', 状态: '在途', 归属: { 专项: 'S-1' }, 闸: ['初检', '深检'] }];
const 状态 = (数据) => ({ 当前: '研发', 版本: '0.1.0', 健康: true, 脉搏: null, 数据: 数据 });

test('产页① 登记进页面表并声明要的数据；渲染时研发格不再是留白', () => {
  assert.ok(壳.页面表.研发);
  assert.deepStrictEqual(壳.页面表.研发.数据, ['/api/prod/board', '/api/prod/tickets']);
  const 树 = 壳.渲染([格], 状态({ '/api/prod/board': board(), '/api/prod/tickets': tickets() }));
  assert.strictEqual(找(树, (n) => n.attrs && n.attrs.class === '页 占位').length, 0);
  assert.strictEqual(找(树, (n) => n.attrs && n.attrs.class === '页 生产').length, 1);
});

test('产页② 甘特：一单一行、条按格上色、临界描边、依赖标出来、现在一条线；空的说没有', () => {
  const 树 = 生产.画(格, 状态({ '/api/prod/board': board(), '/api/prod/tickets': tickets() }));
  const svg = 找(树, (n) => n.tag === 'svg')[0];
  const 行 = 找(svg, (n) => n.tag === 'g');
  assert.strictEqual(行.length, 3);
  assert.deepStrictEqual(行.map((r) => r.attrs['data-id']), ['TK-1', 'TK-2', 'TK-3']);
  assert.ok(行[1].attrs.class.includes('临界') && !行[0].attrs.class.includes('临界'));
  const 条 = 找(svg, (n) => n.tag === 'rect');
  assert.deepStrictEqual(条.map((r) => r.attrs.class), ['条 已落袋', '条 在途', '条 待跑']);
  assert.ok(条[1].attrs.width > 条[0].attrs.width, '6 小时的条比 2 小时的长');
  assert.match(文(行[2]), /←TK-1,TK-2/);
  assert.strictEqual(找(svg, (n) => n.tag === 'line' && n.attrs.class === '现在').length, 1);
  assert.match(文(生产.甘特([], null)), /没有排上的单/);
});

test('产页③ 谁在等我：一条一行，上呈/逾期标在行上，等了多久人读', () => {
  const 树 = 生产.画(格, 状态({ '/api/prod/board': board(), '/api/prod/tickets': tickets() }));
  const 行 = 找(树, (n) => n.tag === 'tr' && n.attrs && n.attrs['data-单']);
  assert.strictEqual(行.length, 2);
  assert.strictEqual(行[0].attrs.class, '上呈');
  assert.match(文(行[0]), /50\.0 时/);
  assert.match(文(行[0]), /上呈/);
  assert.strictEqual(行[1].attrs.class, '');
  assert.match(文(行[1]), /5 分/);
  assert.match(文(树), /谁在等我（2）/);
});

test('产页④ 按格计数一管线一行；工单库一单一行带闸；在途只列格=在途的', () => {
  const 树 = 生产.画(格, 状态({ '/api/prod/board': board(), '/api/prod/tickets': tickets() }));
  const 计 = 找(树, (n) => n.attrs && n.attrs.class === '表 计数表')[0];
  assert.match(文(计), /P-1/);
  assert.strictEqual(找(计, (n) => n.tag === 'td' && n.attrs.class === '有').length, 4, '待跑/在途/人闸/已落袋 非零');
  const 库 = 找(树, (n) => n.tag === 'tr' && n.attrs && n.attrs['data-id']);
  assert.strictEqual(库.length, 2);
  assert.match(文(库[0]), /初检→深检→人判/);
  const 途 = 找(树, (n) => n.attrs && n.attrs.class === '在途')[0];
  assert.strictEqual(找(途, (n) => n.tag === 'li').length, 1);
  assert.match(文(途), /TK-2/);
});

test('产页⑤ 数据没拉到 / 接口出错 → 页上说清，不炸不空白；空转与坏文件警出来', () => {
  assert.match(文(生产.画(格, 状态({}))), /还没拉到数据/);
  assert.match(文(生产.画(格, 状态({ '/api/prod/board': { 错: '500 炸了' } }))), /500 炸了/);
  const b = board(); b.空转 = { 专项: [{ 专项: 'S-1', 因: '全被挡着' }], 管线: [] }; b.坏 = [{ 文件: '工单/x.json' }];
  const 文本 = 文(生产.画(格, 状态({ '/api/prod/board': b, '/api/prod/tickets': [] })));
  assert.match(文本, /空转：S-1 全被挡着/);
  assert.match(文本, /坏文件：工单\/x\.json/);
  assert.match(文本, /工单库是空的/);
});
