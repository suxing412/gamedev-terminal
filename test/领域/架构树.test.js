// 架构树.test.js —— 只记直接上级，整棵树、上级链、相邻、数据流、阻塞、计数全是推出来的；挂错的报孤儿不炸。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const T = require('../../领域/架构树.js');

const 料 = () => ({
  管线们: [{ id: 'P-1', 名称: '地图', 状态: '活跃' }, { id: 'P-2', 名称: '镜头', 状态: '活跃' }],
  特性们: [
    { id: 'F-1', 名称: '行政区', 管线: 'P-1', 状态: '活跃' },
    { id: 'F-15', 名称: '地图散单', 管线: 'P-1', 状态: '活跃', 散单: true },
    { id: 'F-2', 名称: '推拉', 管线: 'P-2', 状态: '活跃' },
  ],
  专项们: [{ id: 'S-1', 名称: '手修编辑器', 特性: 'F-1', 状态: '进行', 产出类型: '成果' }],
  工单们: [
    { id: 'TK-1', 归属: { 专项: 'S-1' }, 性质: '调研', 状态: '归档', 产出: { 方案: '方案/TK-1.md' } },
    { id: 'TK-2', 归属: { 专项: 'S-1' }, 性质: '新建', 状态: '在途', 进项: { 方案: '方案/TK-1.md' }, 产出: { 资产: 'Assets/Editor.cs' } },
    { id: 'TK-3', 归属: { 专项: 'S-1' }, 性质: '装配', 状态: '待派', 进项: { 方案: '方案/TK-1.md', 资产: ['Assets/Editor.cs'] } },
    { id: 'TK-4', 归属: { 特性: 'F-15' }, 性质: '新建', 状态: '待审' },
  ],
});

test('树① 建树：管线→特性→专项→工单 四层嵌套，散单单挂在散单特性上，全冻结', () => {
  const 树 = T.建树(料());
  assert.strictEqual(树.管线.length, 2);
  const 地图 = 树.管线[0];
  assert.deepStrictEqual(地图.特性.map((f) => f.id), ['F-1', 'F-15']);
  assert.deepStrictEqual(地图.特性[0].专项[0].工单, ['TK-1', 'TK-2', 'TK-3']);
  assert.deepStrictEqual(地图.特性[1].散单工单, ['TK-4']);
  assert.strictEqual(地图.特性[1].散单, true);
  assert.deepStrictEqual(树.孤儿, []);
  assert.ok(Object.isFrozen(树) && Object.isFrozen(地图.特性[0].专项[0].工单));
});

test('树② 挂错地方的报孤儿、不炸、其余照推：专项指向不存在的特性；工单没归属；工单指向不存在的专项', () => {
  const r = 料();
  r.专项们.push({ id: 'S-9', 名称: '野', 特性: 'F-99', 状态: '进行' });
  r.工单们.push({ id: 'TK-8' }, { id: 'TK-9', 归属: { 专项: 'S-42' } });
  const 树 = T.建树(r);
  assert.strictEqual(树.管线.length, 2, '其余照推');
  assert.deepStrictEqual(树.孤儿.map((o) => o.id).sort(), ['S-9', 'TK-8', 'TK-9']);
  assert.ok(树.孤儿.find((o) => o.id === 'TK-8').因.includes('没有归属'));
  assert.ok(树.孤儿.find((o) => o.id === 'S-9').因.includes('F-99'));
});

test('树③ 上级链：工单→专项→特性→管线 反向推出来；散单少一层；断在哪层说哪层', () => {
  const r = 料();
  assert.deepStrictEqual(T.上级链(r, r.工单们[1]), { 行: true, 专项: 'S-1', 特性: 'F-1', 管线: 'P-1' });
  assert.deepStrictEqual(T.上级链(r, r.工单们[3]), { 行: true, 专项: null, 特性: 'F-15', 管线: 'P-1' });
  assert.match(T.上级链(r, { id: 'x', 归属: { 专项: 'S-42' } }).断在, /S-42/);
  assert.match(T.上级链(r, { id: 'x' }).断在, /没有归属/);
});

test('树④ 相邻：同专项的其它单；散单单只跟同散单特性下的散单单相邻', () => {
  const r = 料();
  assert.deepStrictEqual(T.相邻(r, 'TK-2'), ['TK-1', 'TK-3']);
  assert.deepStrictEqual(T.相邻(r, 'TK-4'), []);
  r.工单们.push({ id: 'TK-5', 归属: { 特性: 'F-15' } });
  assert.deepStrictEqual(T.相邻(r, 'TK-4'), ['TK-5']);
  assert.deepStrictEqual(T.相邻(r, '不存在'), []);
});

test('树⑤ 数据流：进项引用谁的产出，谁就是上游；数组进项逐项算；自己引自己不算', () => {
  const 图 = T.数据流(料().工单们);
  assert.deepStrictEqual(图.get('TK-1'), []);
  assert.deepStrictEqual(图.get('TK-2'), ['TK-1']);
  assert.deepStrictEqual(图.get('TK-3').sort(), ['TK-1', 'TK-2']);
  assert.deepStrictEqual(图.get('TK-4'), []);
});

test('树⑧ 数据流也认 预计产出：上游还没跑、只写了打算产出什么，边就已经在（排期靠它在执行前推先后）', () => {
  const 图 = T.数据流([
    { id: 'A', 状态: '待派', 预计产出: { 方案: '方案/x.md' } },
    { id: 'B', 状态: '待派', 进项: { 方案: '方案/x.md' } },
  ]);
  assert.deepStrictEqual(图.get('B'), ['A']);
});

test('树⑥ 阻塞：上游没完就挡着我；我没完就挡着引用我产出的下游；上游归档了不算挡', () => {
  const r = 料();
  assert.deepStrictEqual(T.阻塞(r, 'TK-3'), { 挡着我的: ['TK-2'], 我挡着的: [] }, 'TK-1 已归档不算挡，TK-2 在途挡着');
  assert.deepStrictEqual(T.阻塞(r, 'TK-2'), { 挡着我的: [], 我挡着的: ['TK-3'] });
  r.工单们[1].状态 = '完成';
  assert.deepStrictEqual(T.阻塞(r, 'TK-3').挡着我的, []);
  assert.deepStrictEqual(T.阻塞(r, 'TK-2').我挡着的, [], '我完成了就不挡人');
});

test('树⑦ 计数：按屏上格归（格表在状态机，不另存）；人闸格算得出 待审', () => {
  const 数 = T.计数(料());
  assert.strictEqual(数.专项['S-1'].在途, 1);
  assert.strictEqual(数.专项['S-1'].待跑, 1);
  assert.strictEqual(数.专项['S-1'].已落袋, 1);
  assert.strictEqual(数.特性['F-15'].人闸, 1);
  assert.strictEqual(数.管线['P-1'].人闸, 1);
  assert.strictEqual(数.管线['P-2'].在途, 0);
  assert.deepStrictEqual(数.管线['P-1'].漏, []);
});
