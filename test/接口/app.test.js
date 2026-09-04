// app.test.js —— 视图表从正本系统表生成、每系统一格、靠标已建；四条接口活着；/ 给壳。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const A = require('../../接口/app.js');
const K = require('../../内核/时钟.js');

const 假表 = () => ({
  模块: [{ 键: '领域/状态机' }, { 键: '编排/取单器' }],
  待建: [{ 键: '接口/prod' }],
  系统: [
    { 键: '研发', 名: '开发研发', 状态: '在建', 这一圈: ['需求', '拆单', '审批', '执行'], 人在哪介入: ['审批'], 凭什么算闭上了: '说一句需求收到产出', 靠: ['领域/状态机', '编排/取单器', '接口/prod'] },
    { 键: '沉淀', 名: '职业规划与设计方法论沉淀', 状态: '已声明未设计', 这一圈: [], 靠: [] },
  ],
});

test('应① 视图表：每个系统一格不多不少；靠 逐个标已建；已建数/待建数对；纯函数不改正本', () => {
  const 表 = 假表();
  const v = A.视图表(表);
  assert.strictEqual(v.length, 2);
  assert.deepStrictEqual(v[0].靠, [{ 键: '领域/状态机', 已建: true }, { 键: '编排/取单器', 已建: true }, { 键: '接口/prod', 已建: false }]);
  assert.strictEqual(v[0].已建数, 2); assert.strictEqual(v[0].待建数, 1);
  assert.deepStrictEqual(v[0].人在哪介入, ['审批']);
  assert.strictEqual(v[1].状态, '已声明未设计');
  assert.strictEqual(v[1].凭什么算闭上了, '');
  assert.strictEqual(表.系统[0].靠[0], '领域/状态机', '正本没被改成对象');
});

test('应② 真正本：视图表六格 == 系统表；靠 里没有正本里不存在的模块键', () => {
  const 表 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', 'docs', '模块.json'), 'utf8'));
  const v = A.视图表(表);
  assert.strictEqual(v.length, 表.系统.length);
  assert.deepStrictEqual(v.map((x) => x.键), 表.系统.map((s) => s.键));
  const 全 = new Set([...表.模块.map((m) => m.键), ...表.待建.map((w) => w.键)]);
  for (const x of v) for (const k of x.靠) assert.ok(全.has(k.键), `${x.键} 靠了说明书里没有的 ${k.键}`);
});

test('应③ 起在随机口：version/health/pulse/views/routes 都活；/ 给壳 html；撞名的路注不进去', async () => {
  const 钟 = K.假钟('2026-09-05T00:00:00Z');
  const app = A.造app({ 表: 假表(), 版本: '0.0.t', 钟 });
  assert.throws(() => app.注册表.注('GET', '/api/views', () => ({})), /路由撞名/);
  const a = await app.起(0);
  const 取 = async (p) => { const r = await fetch(`http://127.0.0.1:${a.port}${p}`); return { 状态: r.status, 类型: r.headers.get('content-type'), 文: await r.text() }; };
  try {
    assert.deepStrictEqual(JSON.parse((await 取('/api/version')).文).版本, '0.0.t');
    钟.拨(5000);
    const h = JSON.parse((await 取('/api/health')).文);
    assert.strictEqual(h.行, true); assert.strictEqual(h.活了ms, 5000);
    const p = JSON.parse((await 取('/api/pulse')).文);
    assert.strictEqual(p.已建, 2); assert.strictEqual(p.待建, 1); assert.strictEqual(p.系统.length, 2);
    assert.strictEqual(JSON.parse((await 取('/api/views')).文).length, 2);
    assert.ok(JSON.parse((await 取('/api/routes')).文).some((r) => r.路 === '/api/views'));
    const 根 = await 取('/');
    assert.strictEqual(根.状态, 200); assert.match(根.类型, /text\/html/); assert.match(根.文, /壳\.js/);
    assert.strictEqual((await 取('/api/nope')).状态, 404);
  } finally { await app.关(); }
});
