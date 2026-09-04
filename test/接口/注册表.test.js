// 注册表.test.js —— 撞名启动时炸；分发：找到调、找不到 404 JSON、炸了 500 JSON、静态兜底。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const R = require('../../接口/注册表.js');

test('注① 同一 method+path 注两次 → 炸，且点名先注的是谁', () => {
  const 表 = R.造注册表();
  表.注('GET', '/api/x', () => ({}), '甲');
  assert.throws(() => 表.注('get', '/api/x', () => ({}), '乙'), /路由撞名：GET \/api\/x 已注册（甲）/);
  表.注('POST', '/api/x', () => ({}), '丙');
  assert.strictEqual(表.列().length, 2);
});

test('注② 方法不认 / 路径不以 / 开头 / 没处理函数 → 炸', () => {
  const 表 = R.造注册表();
  assert.throws(() => 表.注('FETCH', '/a', () => ({})), /不认/);
  assert.throws(() => 表.注('GET', 'a', () => ({})), /以 \/ 开头/);
  assert.throws(() => 表.注('GET', '/a'), /没给处理函数/);
});

async function 起(表, 静态根) {
  const s = http.createServer((req, res) => R.分发(表, req, res, { 静态根 }));
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const 口 = s.address().port;
  const 取 = async (m, p, 体) => {
    const r = await fetch(`http://127.0.0.1:${口}${p}`, { method: m, headers: 体 ? { 'content-type': 'application/json' } : {}, body: 体 ? JSON.stringify(体) : undefined });
    const 文 = await r.text();
    let j = null; try { j = JSON.parse(文); } catch (e) { /* 非 JSON */ }
    return { 状态: r.status, 类型: r.headers.get('content-type'), 文, j };
  };
  return { s, 取, 关: () => new Promise((r) => s.close(r)) };
}

test('注③ 分发：查询参数与 JSON 体进处理器；返回体当 200；{状态,体} 按给的状态；炸了 500 JSON 带路', async () => {
  const 表 = R.造注册表();
  表.注('GET', '/api/echo', ({ 查 }) => ({ 查 }), '回显');
  表.注('POST', '/api/echo', ({ 体 }) => ({ 状态: 201, 体: { 收: 体 } }), '回显');
  表.注('GET', '/api/boom', () => { throw new Error('炸了'); }, '炸');
  const { 取, 关 } = await 起(表);
  try {
    const a = await 取('GET', '/api/echo?x=1&y=二');
    assert.strictEqual(a.状态, 200); assert.deepStrictEqual(a.j, { 查: { x: '1', y: '二' } });
    const b = await 取('POST', '/api/echo', { k: 'v' });
    assert.strictEqual(b.状态, 201); assert.deepStrictEqual(b.j, { 收: { k: 'v' } });
    const c = await 取('GET', '/api/boom');
    assert.strictEqual(c.状态, 500); assert.match(c.j.错, /炸了/); assert.strictEqual(c.j.路, 'GET /api/boom');
  } finally { await 关(); }
});

test('注④ 找不到 → 404 JSON 列出有的路；静态根兜底：/ 给 壳.html，越出静态根的路径不给', async () => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-static-'));
  try {
    fs.writeFileSync(path.join(d, '壳.html'), '<title>壳</title>');
    fs.writeFileSync(path.join(d, 'a.js'), 'x');
    const 表 = R.造注册表();
    表.注('GET', '/api/one', () => ({}), '一');
    const { 取, 关 } = await 起(表, d);
    try {
      const 无 = await 取('GET', '/api/none');
      assert.strictEqual(无.状态, 404); assert.deepStrictEqual(无.j.有的, ['GET /api/one']);
      const 根 = await 取('GET', '/');
      assert.strictEqual(根.状态, 200); assert.match(根.类型, /text\/html/); assert.match(根.文, /壳/);
      const js = await 取('GET', '/a.js');
      assert.match(js.类型, /javascript/);
      const 越 = await 取('GET', '/../package.json');
      assert.strictEqual(越.状态, 404);
    } finally { await 关(); }
  } finally { fs.rmSync(d, { recursive: true, force: true }); }
});
