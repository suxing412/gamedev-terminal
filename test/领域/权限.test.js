// 权限.test.js —— 只能收紧不能放宽；执行卷带哈希；准写按卷判。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const Q = require('../../领域/权限.js');

const 声 = () => ({ 可碰目录: ['Assets/SLG/**', 'Docs/SLG/**'], 可用工具: ['Read', 'Edit', 'Bash'], 禁: ['Docs/SLG/规章/**'] });

test('权① 工单不收紧 → 执行卷 = 声明原样', () => {
  const r = Q.求交(声(), undefined);
  assert.deepStrictEqual(r.可碰目录, ['Assets/SLG/**', 'Docs/SLG/**']);
  assert.deepStrictEqual(r.可用工具, ['Read', 'Edit', 'Bash']);
});

test('权② 工单收紧到子目录 → 过，卷里只剩子目录', () => {
  const r = Q.求交(声(), { 可碰目录: ['Assets/SLG/Map/**'] });
  assert.deepStrictEqual(r.可碰目录, ['Assets/SLG/Map/**']);
});

test('权③ 工单要声明里没有的目录 → 放宽拒绝（不是自动放宽）', () => {
  assert.throws(() => Q.求交(声(), { 可碰目录: ['Assets/Shared/**'] }),
    (e) => e.code === '放宽拒绝' && e.项 === '可碰目录' && /只能收紧不能放宽/.test(e.message));
});

test('权④ 工单要声明里没有的工具 → 放宽拒绝', () => {
  assert.throws(() => Q.求交(声(), { 可用工具: ['Read', 'WebFetch'] }), (e) => e.项 === '可用工具' && e.值 === 'WebFetch');
});

test('权⑤ 禁只会变多：工单加的禁并进来，声明的禁不掉', () => {
  const r = Q.求交(声(), { 禁: ['Assets/SLG/Tests/**'] });
  assert.deepStrictEqual(r.禁.sort(), ['Assets/SLG/Tests/**', 'Docs/SLG/规章/**'].sort());
});

test('权⑥ 前缀覆盖按段比，「Assets/SLG2」不在「Assets/SLG」底下', () => {
  assert.ok(Q.被覆盖('Assets/SLG/Map/x.cs', ['Assets/SLG/**']));
  assert.ok(!Q.被覆盖('Assets/SLG2/x.cs', ['Assets/SLG/**']));
  assert.ok(Q.被覆盖('Assets\\SLG\\x.cs', ['Assets/SLG/**']), '反斜杠归一');
});

test('权⑦ 执行卷冻结、带哈希；同单同权限哈希相同，权限一变哈希就变', () => {
  const 单 = { id: 'TK-1' };
  const a = Q.编译执行卷(单, 声(), undefined);
  const b = Q.编译执行卷(单, 声(), undefined);
  const c = Q.编译执行卷(单, { ...声(), 可碰目录: ['Assets/SLG/**'] }, undefined);
  assert.strictEqual(a.哈希, b.哈希);
  assert.notStrictEqual(a.哈希, c.哈希, '协议一改，哈希就变——在跑的单用旧卷，改协议对下一张才生效');
  assert.strictEqual(a.契约版本, 1);
  assert.throws(() => { 'use strict'; a.权限 = null; }, TypeError);
});

test('权⑧ 准写：可碰目录内过、禁区红、目录外红且说清准碰哪', () => {
  const 卷 = Q.编译执行卷({ id: 'TK-1' }, 声(), undefined);
  assert.strictEqual(Q.准写(卷, 'Assets/SLG/Map/x.cs').行, true);
  const 禁 = Q.准写(卷, 'Docs/SLG/规章/H1.md'); assert.strictEqual(禁.行, false); assert.match(禁.因, /禁区/);
  const 外 = Q.准写(卷, 'Assets/Shared/x.cs'); assert.strictEqual(外.行, false); assert.match(外.因, /只准碰/);
});

test('权⑨ 只读席（可碰目录为空）什么都写不了，理由说清是空', () => {
  const 卷 = Q.编译执行卷({ id: 'TK-2' }, { 可碰目录: [], 可用工具: ['Read'], 禁: [] }, undefined);
  const r = Q.准写(卷, 'Assets/SLG/x.cs');
  assert.strictEqual(r.行, false); assert.match(r.因, /只读席/);
});
