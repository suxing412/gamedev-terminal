// 协议.test.js —— 两层分界、权限位、改状态工具一票否决。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const P = require('../../领域/协议.js');

const 好协议 = (改) => ({
  职责权限: { 职能: '程序', 可碰目录: ['Assets/SLG/**'], 可用工具: ['Read', 'Edit', 'Bash'], 默认harness: 'codex', ...((改 && 改.职责权限) || {}) },
  人格语气: { 称呼: '小程', 语气: '简短', ...((改 && 改.人格语气) || {}) },
});
const 违 = (r, 词) => assert.ok(r.违.some((x) => x.includes(词)), `该点名「${词}」，实得：${r.违.join(' | ')}`);

test('议① 两层齐、字段齐 → 过', () => {
  const r = P.校验(好协议());
  assert.deepStrictEqual(r.违, []);
});

test('议② 缺人格层 / 缺职责层 → 红', () => {
  const a = 好协议(); delete a.人格语气; 违(P.校验(a), '缺「人格语气」层');
  const b = 好协议(); delete b.职责权限; 违(P.校验(b), '缺「职责权限」层');
});

test('议③ 可碰目录 / 可用工具 必填（白名单，漏了是碰不了）', () => {
  违(P.校验(好协议({ 职责权限: { 可碰目录: undefined } })), '可碰目录 必填');
  违(P.校验(好协议({ 职责权限: { 可用工具: undefined } })), '可用工具 必填');
});

test('议④ 职能不在表里或未启用 → 红', () => {
  违(P.校验(好协议({ 职责权限: { 职能: '算命' } })), '不在职能表');
  违(P.校验(好协议({ 职责权限: { 职能: '音频' } })), '未启用');
});

test('议⑤ 可用工具里出现改工单状态的工具 → 红（谁都不许有）', () => {
  违(P.校验(好协议({ 职责权限: { 可用工具: ['Read', 'set_state'] } })), '改工单状态');
  违(P.校验(好协议({ 职责权限: { 可用工具: ['Read', '迁移工单'] } })), '改工单状态');
});

test('议⑥ 权限声明只取职责层，一个人格字段都不带', () => {
  const 声 = P.权限声明(好协议());
  assert.deepStrictEqual(Object.keys(声).sort(), ['默认harness', '可指定下属harness', '可碰目录', '可用工具', '禁', '职能'].sort());
  assert.ok(!('称呼' in 声) && !('语气' in 声));
  assert.deepStrictEqual(声.可碰目录, ['Assets/SLG/**']);
  assert.strictEqual(声.可指定下属harness, false, '缺省是 false——执行席默认不能覆写路由');
  assert.deepStrictEqual(声.禁, []);
});

test('议⑦ 人格只取人格层，一个权限字段都不带', () => {
  const 格 = P.人格(好协议());
  assert.deepStrictEqual(Object.keys(格).sort(), ['称呼', '语气', '开场', '忌讳'].sort());
  assert.ok(!('可碰目录' in 格));
  assert.strictEqual(格.称呼, '小程');
});

test('议⑧ 可指定下属harness 是权限位：写了 true 才 true，写别的都不算', () => {
  assert.strictEqual(P.能指定下属harness(好协议({ 职责权限: { 可指定下属harness: true } })), true);
  assert.strictEqual(P.能指定下属harness(好协议({ 职责权限: { 可指定下属harness: 'yes' } })), false);
  assert.strictEqual(P.能指定下属harness(好协议()), false);
});

test('议⑨ 权限声明与人格都是冻结的——执行卷里的权限不许被谁顺手改', () => {
  const 声 = P.权限声明(好协议());
  assert.throws(() => { 'use strict'; 声.可碰目录 = ['/']; }, TypeError);
});
