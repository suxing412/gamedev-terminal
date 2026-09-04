// prod.test.js —— 种子池起接口：一屏有甘特/人闸/计数；收草稿成单；审批；记人判能完成就完成；拍一次走假 harness 与假判官。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const A = require('../../接口/app.js');
const P = require('../../接口/prod.js');
const 种子 = require('../../tools/种子.js');
const K = require('../../内核/时钟.js');

const 程序协议 = { 职责权限: { 职能: '程序', 可碰目录: ['Assets/SLG/**'], 可用工具: ['Read', 'Edit', 'Write'], 禁: [] }, 人格语气: { 称呼: '小程' } };
const 总监协议 = { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [], 可指定下属harness: true }, 人格语气: { 称呼: '总监' } };

async function 起(改) {
  const 数据 = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-prod-'));
  const 工作 = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-prodw-'));
  const 钟 = K.假钟('2026-09-05T00:00:00Z');
  种子.种(数据, 钟);
  fs.mkdirSync(path.join(工作, '方案'), { recursive: true }); fs.writeFileSync(path.join(工作, '方案', 'S-1-寻路.md'), '# 方案');
  fs.mkdirSync(path.join(工作, 'Assets', 'SLG'), { recursive: true }); fs.writeFileSync(path.join(工作, 'Assets', 'SLG', 'Pathfinder.cs'), 'class P {}');
  const app = A.造app({ 表: { 模块: [], 待建: [], 系统: [] }, 版本: 't', 钟 });
  P.注(app.注册表, {
    数据区根: 数据, 钟, 工作目录: 工作,
    取协议: () => ({ 执行: 程序协议, 上级: 总监协议 }),
    问: async () => ({ 文本: '结论：通过\n理由：假判官' }),
    适配器们: { claude: { 跑: async (进) => { fs.writeFileSync(path.join(工作, 'Assets', 'SLG', 'Scenes.unity'), 'y'); return { 单号: 进.单号, harness: { 名: 'claude', 版本: 't' }, 改动: { 文件: ['Assets/SLG/Scenes/寻路演示.unity'], diff: 'd' }, 日志尾: 'l', 结果: { 退出: 'completed', 耗时ms: 1, token: { 输入: 1, 输出: 1 } }, 回执: '搭了' }; } } },
    ...(改 || {}),
  });
  const a = await app.起(0);
  const 取 = async (m, p, 体) => { const r = await fetch(`http://127.0.0.1:${a.port}${p}`, { method: m, headers: 体 ? { 'content-type': 'application/json' } : {}, body: 体 ? JSON.stringify(体) : undefined }); return { 状态: r.status, j: JSON.parse(await r.text()) }; };
  return { 取, 钟, 关: async () => { await app.关(); fs.rmSync(数据, { recursive: true, force: true }); fs.rmSync(工作, { recursive: true, force: true }); } };
}

test('产① board：甘特有排上的单、在途的起自履历；人闸队列列出 待审 TK-5 与等人判的 TK-4；计数按格；空转空', async () => {
  const { 取, 关 } = await 起();
  try {
    const { 状态, j } = await 取('GET', '/api/prod/board');
    assert.strictEqual(状态, 200);
    assert.ok(j.甘特.length >= 4, `甘特 ${j.甘特.length} 行`);
    const 二 = j.甘特.find((c) => c.id === 'TK-2');
    assert.strictEqual(二.格, '在途'); assert.strictEqual(二.起, '2026-09-04T22:00:00.000Z');
    assert.deepStrictEqual(j.在等.map((x) => [x.类, x.单, x.等谁]).sort(), [['人判', 'TK-4', '制作人'], ['待审', 'TK-5', '制作人']]);
    assert.strictEqual(j.计数.专项['S-1'].已落袋, 1);
    assert.strictEqual(j.计数.管线['P-1'].人闸, 1);
    assert.deepStrictEqual(j.空转.专项, []);
    assert.deepStrictEqual(j.坏, []);
  } finally { await 关(); }
});

test('产② tickets 简表 + ticket 全貌；没有的 404', async () => {
  const { 取, 关 } = await 起();
  try {
    const 表 = (await 取('GET', '/api/prod/tickets')).j;
    assert.strictEqual(表.length, 5);
    assert.deepStrictEqual(表.find((t) => t.id === 'TK-4').闸, ['初检', '深检', '人判']);
    const 一 = await 取('GET', '/api/prod/ticket?id=TK-1');
    assert.strictEqual(一.j.履历.length, 9);
    assert.strictEqual((await 取('GET', '/api/prod/ticket?id=TK-9')).状态, 404);
  } finally { await 关(); }
});

test('产③ draft：草稿成单（剥掉手填状态）→ 待审；拆错 422 点名；approve → 待派', async () => {
  const { 取, 关 } = await 起();
  try {
    const r = await 取('POST', '/api/prod/draft', { 草稿: { title: '新单', 正文: '做', 职能: '程序', 性质: '新建', 归属: { 特性: 'F-15' }, 项目: 'TK', 状态: '完成' } });
    assert.strictEqual(r.状态, 200); assert.strictEqual(r.j.单.id, 'TK-6'); assert.strictEqual(r.j.单.状态, '待审');
    const 坏 = await 取('POST', '/api/prod/draft', { 草稿: { title: 'x', 正文: '做', 职能: '技术策划', 性质: '新建', 归属: { 特性: 'F-15' }, 项目: 'TK' } });
    assert.strictEqual(坏.状态, 422); assert.ok(坏.j.违.some((v) => /不接「新建」/.test(v)));
    const 审 = await 取('POST', '/api/prod/approve', { id: 'TK-6', 操作者: '制作人' });
    assert.strictEqual(审.j.单.状态, '待派');
    assert.strictEqual((await 取('GET', '/api/prod/tickets')).j.length, 6);
  } finally { await 关(); }
});

test('产④ sign：TK-4 等人判 → 记人判通过 → 直接完成；人闸队列里它没了；只记人闸不记机判', async () => {
  const { 取, 关 } = await 起();
  try {
    const r = await 取('POST', '/api/prod/sign', { id: 'TK-4', 闸: '人判', 结果: '通过', 操作者: '制作人' });
    assert.strictEqual(r.j.完成, true); assert.strictEqual(r.j.单.状态, '完成');
    assert.ok(!(await 取('GET', '/api/prod/board')).j.在等.some((x) => x.单 === 'TK-4'));
    assert.strictEqual((await 取('POST', '/api/prod/sign', { id: 'TK-5', 闸: '初检', 结果: '通过', 操作者: '制作人' })).状态, 400);
  } finally { await 关(); }
});

test('产⑤ tick：TK-3 装配单进项齐（TK-1 归档、资产在盘上）→ 派、初检、假判官深检通过；成果单等人判不自动完成', async () => {
  const { 取, 关 } = await 起();
  try {
    const r = await 取('POST', '/api/prod/tick');
    assert.strictEqual(r.j.派了, 'TK-3', JSON.stringify(r.j));
    assert.strictEqual(r.j.结果, '进深检');
    assert.strictEqual(r.j.状态, '深检', '装配单产出成果，要人判，不自动完成');
    const 单 = (await 取('GET', '/api/prod/ticket?id=TK-3')).j;
    assert.ok(单.履历.some((h) => h.闸 === '深检' && h.结果 === '通过'));
    assert.ok((await 取('GET', '/api/prod/board')).j.在等.some((x) => x.单 === 'TK-3' && x.类 === '人判'));
  } finally { await 关(); }
});
