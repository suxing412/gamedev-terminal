// 适配器.test.js —— 路由按需求对能力表；执行池覆写要权限位；进方契约缺项就炸。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const A = require('../../编排/适配器.js');
const Q = require('../../领域/权限.js');

const 总监协议 = { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [], 可指定下属harness: true }, 人格语气: { 称呼: '总监' } };
const 执行席协议 = { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [] }, 人格语气: { 称呼: '小程' } };

test('配① 首版只启用 claude 与 codex，两家写闸都硬', () => {
  assert.deepStrictEqual(A.优先序, ['claude', 'codex']);
  for (const 家 of A.优先序) { assert.ok(A.能力表[家].启用); assert.ok(A.能力表[家].写闸硬); }
  assert.ok(!A.能力表.hermes.启用 && !A.能力表.dsh.启用);
});

test('配② 无需求的单自动走优先序第一家', () => {
  const r = A.路由({ id: 'T-1' }, 执行席协议);
  assert.strictEqual(r.harness, 'claude');
  assert.match(r.因, /自动路由/);
});

test('配③ 碰活存储的单只许派给写闸硬的家；要引擎的单首版没人接 → 上呈', () => {
  assert.strictEqual(A.路由({ id: 'T-2', 需求: { 碰活存储: true } }, 执行席协议).harness, 'claude');
  assert.throws(() => A.路由({ id: 'T-3', 需求: { 要引擎: true } }, 执行席协议),
    (e) => e.code === '路由上呈' && /没有引擎通道/.test(e.message));
});

test('配④ 执行席在单上写 执行池 → 无效（上呈），总监写 → 生效', () => {
  assert.throws(() => A.路由({ id: 'T-4', 执行池: 'codex' }, 执行席协议),
    (e) => e.code === '路由上呈' && /可指定下属harness/.test(e.message));
  const r = A.路由({ id: 'T-4', 执行池: 'codex' }, 总监协议);
  assert.strictEqual(r.harness, 'codex');
  assert.match(r.因, /上级指定/);
});

test('配⑤ 总监指定了一家覆盖不了需求的 → 仍上呈（指定不能绕过能力校验）', () => {
  assert.throws(() => A.路由({ id: 'T-5', 执行池: 'hermes', 需求: { 碰活存储: true } }, 总监协议),
    (e) => e.code === '路由上呈' && /hermes/.test(e.message));
});

test('配⑦ 上级协议写了 默认harness → 没别的依据时用它，仍过能力校验；覆盖不了落到优先序（U20）', () => {
  const 默codex = { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [], 默认harness: 'codex' }, 人格语气: { 称呼: 'x' } };
  const r = A.路由({ id: 'T-7' }, 默codex);
  assert.strictEqual(r.harness, 'codex');
  assert.match(r.因, /默认harness/);
  const 默hermes = { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [], 默认harness: 'hermes' }, 人格语气: { 称呼: 'x' } };
  assert.strictEqual(A.路由({ id: 'T-8' }, 默hermes).harness, 'claude', 'hermes 未启用，落到优先序第一家');
  assert.strictEqual(A.路由({ id: 'T-9', 执行池: 'claude' }, { ...总监协议, 职责权限: { ...总监协议.职责权限, 默认harness: 'codex' } }).harness, 'claude', '上级指定优先于默认harness');
});

test('配⑧ 进方带超时：不给用默认 30 分钟，给了用给的（编排层每处外呼必须有超时）', () => {
  const 卷 = Q.编译执行卷({ id: 'T-6' }, { 可碰目录: ['Assets/**'], 可用工具: ['Read'], 禁: [] });
  assert.strictEqual(A.进方({ id: 'T-6' }, 卷, 'x', 'D:/w').超时ms, 30 * 60 * 1000);
  assert.strictEqual(A.进方({ id: 'T-6' }, 卷, 'x', 'D:/w', { 超时ms: 5000 }).超时ms, 5000);
});

test('配⑥ 进方契约：四样缺一就炸，成品冻结且带契约版本', () => {
  const 卷 = Q.编译执行卷({ id: 'T-6' }, { 可碰目录: ['Assets/**'], 可用工具: ['Read'], 禁: [] });
  assert.throws(() => A.进方(null, 卷, 'x', 'D:/w'), /没有单/);
  assert.throws(() => A.进方({ id: 'T-6' }, { 权限: {} }, 'x', 'D:/w'), /执行卷/);
  assert.throws(() => A.进方({ id: 'T-6' }, 卷, '   ', 'D:/w'), /提示词为空/);
  assert.throws(() => A.进方({ id: 'T-6' }, 卷, 'x', ''), /工作目录/);
  const 进 = A.进方({ id: 'T-6', 性质: '新建', 进项: { 方案: 'm.md' } }, 卷, '做', 'D:/w');
  assert.strictEqual(进.契约版本, A.契约版本);
  assert.strictEqual(进.执行卷.哈希, 卷.哈希);
  assert.throws(() => { 'use strict'; 进.提示词 = '改'; }, TypeError);
});
