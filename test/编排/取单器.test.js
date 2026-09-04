// 取单器.test.js —— 收草稿剥字段、成单编序列、审批、③ 进项未过闸不派、战役不派、整链假模型跑通、
// 打回自修、三振待处理、上呈待处理、没注入落盘就炸、单飞不叠。全喂假，不碰网不碰盘。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const Q = require('../../编排/取单器.js');
const M = require('../../领域/状态机.js');
const K = require('../../内核/时钟.js');
const L = require('../../内核/锁.js');

const 程序协议 = { 职责权限: { 职能: '程序', 可碰目录: ['Assets/SLG/**', 'test/**'], 可用工具: ['Read', 'Edit', 'Write'], 禁: [] }, 人格语气: { 称呼: '小程' } };
const 策划协议 = { 职责权限: { 职能: '技术策划', 可碰目录: ['方案/**'], 可用工具: ['Read', 'Write'], 禁: [] }, 人格语气: { 称呼: '小策' } };
const 总监协议 = { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [], 可指定下属harness: true }, 人格语气: { 称呼: '总监' } };

const 好料 = (进, 改) => ({
  单号: 进.单号, harness: { 名: 'claude', 版本: 't' },
  改动: { 文件: 改 || ['Assets/SLG/Hello.cs'], diff: 'd' }, 日志尾: 'l',
  结果: { 退出: 'completed', 耗时ms: 1, token: { 输入: 1, 输出: 1 } }, 回执: '写了',
});

/** 假依赖：存进 Map，事件进数组，适配器按传入的 跑 走。 */
function 假依赖(改) {
  const 存 = new Map(), 包们 = [], 事 = [], 提示们 = [];
  const 钟 = K.假钟('2026-09-05T00:00:00Z');
  return {
    存, 包们, 事, 提示们, 钟,
    依赖: {
      钟, 工作目录: 'D:/w', 自修上限: 2,
      存单: (单) => 存.set(单.id, 单), 存包: (包) => 包们.push(包), 记事: (e) => 事.push(e),
      读文件: (p) => `【${p} 的内容】`, 存在: (p) => p.startsWith('盘上/'),
      取协议: (单) => ({ 执行: 单.职能 === '技术策划' ? 策划协议 : 程序协议, 上级: 总监协议 }),
      适配器们: { claude: { 跑: async (进) => { 提示们.push(进.提示词); return 好料(进); } } },
      ...改,
    },
  };
}
const 草稿 = (改) => ({ title: '写 Hello', 正文: '在 Assets/SLG/Hello.cs 写一个空类', 职能: '程序', 性质: '新建', 归属: { 特性: 'F-15' }, 项目: 'TK', ...改 });
const 池0 = () => ({ 管线们: [{ id: 'P-1' }], 特性们: [{ id: 'F-15', 管线: 'P-1', 散单: true }, { id: 'F-1', 管线: 'P-1' }], 专项们: [{ id: 'S-1', 特性: 'F-1', 状态: '进行', 产出类型: '成果' }], 工单们: [] });

test('取① 收草稿：剥掉项管不该写的（状态/履历/id 手填无效），成单后 id/待审/时间/闸序列 齐，存了、记了', () => {
  const F = 假依赖();
  const r = Q.收草稿(草稿({ id: '手填-9', 状态: '完成', 履历: [{ 闸: '人判', 结果: '通过' }] }), 池0(), F.依赖);
  assert.strictEqual(r.行, true, (r.违 || []).join(' | '));
  assert.strictEqual(r.单.id, 'TK-1', '号是代码发的');
  assert.strictEqual(r.单.状态, '待审');
  assert.deepStrictEqual(r.单.履历, [], '手填的履历剥掉了');
  assert.strictEqual(r.单.创建时间, '2026-09-05T00:00:00.000Z');
  assert.deepStrictEqual([...r.单.闸序列.闸], ['初检', '深检']);
  assert.ok(F.存.has('TK-1'));
  assert.strictEqual(F.事[0].类, '成单');
});

test('取② 草稿拆错（技术策划接新建）→ 不成单、点名判据⑤；不存不记', () => {
  const F = 假依赖();
  const r = Q.收草稿(草稿({ 职能: '技术策划' }), 池0(), F.依赖);
  assert.strictEqual(r.行, false);
  assert.ok(r.违.some((x) => /不接「新建」/.test(x)), r.违.join(' | '));
  assert.strictEqual(F.存.size, 0);
});

test('取③ 审批：通过 → 待派，操作者进履历；拒 → 废弃', () => {
  const F = 假依赖();
  const 单 = Q.收草稿(草稿(), 池0(), F.依赖).单;
  const 过 = Q.审批(单, { 操作者: '制作人', 因: '该做' }, F.依赖);
  assert.strictEqual(过.状态, '待派');
  assert.strictEqual(过.履历[0].操作者, '制作人');
  assert.strictEqual(Q.审批(单, { 操作者: '制作人', 结果: '拒' }, F.依赖).状态, '废弃');
});

test('取④ 取单：拆单判据③——进项由在途的上游产出 → 不派并写因；上游归档了 → 派；盘上已有 → 派', () => {
  const F = 假依赖();
  const 池 = { ...池0(), 工单们: [
    { id: 'A', 状态: '在途', 归属: { 专项: 'S-1' }, 产出: { 方案: '方案/A.md' }, 创建时间: '1' },
    { id: 'B', 状态: '待派', 归属: { 专项: 'S-1' }, 进项: { 方案: '方案/A.md' }, 优先级: 'P0', 创建时间: '2' },
    { id: 'C', 状态: '待派', 归属: { 特性: 'F-15' }, 进项: { 方案: '盘上/老方案.md' }, 优先级: 'P2', 创建时间: '3' },
  ] };
  const r = Q.取单(池, F.依赖);
  assert.strictEqual(r.单.id, 'C', 'B 被 A 挡着，C 的进项盘上有');
  assert.ok(r.因们.some((x) => x.单 === 'B' && /上游 A 在 在途/.test(x.因)), JSON.stringify(r.因们));
  池.工单们[0] = { ...池.工单们[0], 状态: '归档' };
  assert.strictEqual(Q.取单(池, F.依赖).单.id, 'B', 'A 归档了，B 优先级更高先派');
});

test('取⑤ 取单：战役不派、写因；同优先级按创建时间；没有能派的返回 null 与全部因', () => {
  const F = 假依赖();
  const 池 = { ...池0(), 工单们: [
    { id: 'W', 状态: '待派', 规模: '战役', 归属: { 特性: 'F-15' }, 优先级: 'P0', 创建时间: '1' },
    { id: 'X', 状态: '待派', 归属: { 特性: 'F-15' }, 优先级: 'P1', 创建时间: '5' },
    { id: 'Y', 状态: '待派', 归属: { 特性: 'F-15' }, 优先级: 'P1', 创建时间: '3' },
  ] };
  const r = Q.取单(池, F.依赖);
  assert.strictEqual(r.单.id, 'Y');
  assert.ok(r.因们.some((x) => x.单 === 'W' && /战役/.test(x.因)));
  const 空 = Q.取单({ ...池0(), 工单们: [{ id: 'W', 状态: '待派', 规模: '战役', 归属: { 特性: 'F-15' } }] }, F.依赖);
  assert.strictEqual(空.单, null);
  assert.strictEqual(空.因们.length, 1);
});

test('取⑥ 派：整链假模型跑通 → 深检；履历 待派→在途→初检、初检:通过、初检→深检；包存了、产出写了、事件齐', async () => {
  const F = 假依赖();
  const 单 = Q.审批(Q.收草稿(草稿(), 池0(), F.依赖).单, { 操作者: '制作人' }, F.依赖);
  const r = await Q.派(单, F.依赖);
  assert.strictEqual(r.结果, '进深检');
  assert.strictEqual(r.单.状态, '深检');
  assert.deepStrictEqual(r.单.履历.map((h) => (h.闸 ? `${h.闸}:${h.结果}` : `${h.从}→${h.到}`)), ['待审→待派', '待派→在途', '在途→初检', '初检:通过', '初检→深检']);
  assert.strictEqual(F.包们.length, 1);
  assert.deepStrictEqual(r.单.产出, { 资产: 'Assets/SLG/Hello.cs' }, '产出由代码从改动清单写');
  assert.deepStrictEqual(F.事.map((e) => e.类), ['成单', '审批', '派', '初检']);
  assert.match(F.提示们[0], /Hello/, '提示词装了正文');
  assert.ok(!F.提示们[0].includes('小程'), '人格层没进执行卷');
  assert.strictEqual(F.存.get('TK-1').状态, '深检', '最后一次存的是深检态');
});

test('取⑦ 初检打回 → 自修（打回理由追进提示词）→ 再打回 → 三振进待处理；自修上限可调', async () => {
  const F = 假依赖({ 适配器们: { claude: { 跑: async (进) => 好料(进, []) } } });   // 什么都不交
  const 单 = Q.审批(Q.收草稿(草稿(), 池0(), F.依赖).单, { 操作者: '制作人' }, F.依赖);
  const r = await Q.派(单, F.依赖);
  assert.strictEqual(r.结果, '三振');
  assert.strictEqual(r.单.状态, '待处理');
  assert.strictEqual(M.自修次数(r.单), 2, '自修了两次');
  assert.strictEqual(F.包们.length, 3, '跑了三轮');
  assert.strictEqual(F.事.filter((e) => e.类 === '自修').length, 2);
  assert.strictEqual(F.事.filter((e) => e.类 === '三振').length, 1);
  const G = 假依赖({ 自修上限: 0, 适配器们: { claude: { 跑: async (进) => 好料(进, []) } } });
  const 一次 = await Q.派(Q.审批(Q.收草稿(草稿(), 池0(), G.依赖).单, { 操作者: '制作人' }, G.依赖), G.依赖);
  assert.strictEqual(一次.结果, '三振');
  assert.strictEqual(G.包们.length, 1, '上限 0：一次打回就进待处理');
});

test('取⑧ 自修那一轮的提示词带上一轮打回理由；修好了就进深检', async () => {
  let 次 = 0;
  const F = 假依赖({ 适配器们: { claude: { 跑: async (进) => { 次 += 1; F.提示们.push(进.提示词); return 好料(进, 次 === 1 ? [] : ['Assets/SLG/Hello.cs']); } } } });
  const r = await Q.派(Q.审批(Q.收草稿(草稿(), 池0(), F.依赖).单, { 操作者: '制作人' }, F.依赖), F.依赖);
  assert.strictEqual(r.结果, '进深检');
  assert.strictEqual(次, 2);
  assert.match(F.提示们[1], /上一轮初检打回/);
  assert.match(F.提示们[1], /什么都没交/);
  assert.ok(!F.提示们[0].includes('上一轮'), '第一轮没有');
});

test('取⑭ 基线一张单拍一次：三轮自修用同一份基线，拍基线只调一次；超时的打回理由喂回去时说成人话', async () => {
  let 拍 = 0; const 见 = [];
  const F = 假依赖({ 适配器们: { claude: {
    拍基线: () => { 拍 += 1; return { 第: 拍 }; },
    跑: async (进, 跑依赖) => { 见.push(跑依赖.git基线()); F.提示们.push(进.提示词); return { ...好料(进, []), 结果: { 退出: 见.length === 1 ? 'timeout' : 'completed', 耗时ms: 1, token: { 输入: 0, 输出: 0 } } }; },
  } } });
  const r = await Q.派(Q.审批(Q.收草稿(草稿(), 池0(), F.依赖).单, { 操作者: '制作人' }, F.依赖), F.依赖);
  assert.strictEqual(r.结果, '三振');
  assert.strictEqual(拍, 1, '三轮只拍一次基线');
  assert.deepStrictEqual(见, [{ 第: 1 }, { 第: 1 }, { 第: 1 }], '每轮拿到的是同一份');
  assert.match(F.提示们[1], /超时被掐断/);
  assert.ok(!/timeout/.test(F.提示们[1]), '不把机器话原样喂回去');
  assert.match(F.提示们[1], /还在、还算数/);
});

test('取⑨ 路由上呈（要引擎，首版没人接）→ 待处理 + 上呈事件；适配器炸 → 待处理 + 炸事件', async () => {
  const F = 假依赖();
  const 要引擎 = Q.审批(Q.收草稿(草稿({ 需求: { 要引擎: true } }), 池0(), F.依赖).单, { 操作者: '制作人' }, F.依赖);
  const a = await Q.派(要引擎, F.依赖);
  assert.strictEqual(a.结果, '上呈');
  assert.strictEqual(a.单.状态, '待处理');
  assert.ok(F.事.some((e) => e.类 === '上呈'));
  const G = 假依赖({ 适配器们: { claude: { 跑: async () => { throw new Error('SDK 掉线'); } } } });
  const b = await Q.派(Q.审批(Q.收草稿(草稿(), 池0(), G.依赖).单, { 操作者: '制作人' }, G.依赖), G.依赖);
  assert.strictEqual(b.结果, '炸');
  assert.strictEqual(b.单.状态, '待处理');
  assert.match(b.单.履历[b.单.履历.length - 1].因, /SDK 掉线/);
});

test('取⑩ 没注入 存单 / 存包 / 记事 / 读文件 / 存在 → 炸，不静默不落盘', async () => {
  const F = 假依赖();
  for (const 名 of ['存单', '存包', '记事', '读文件', '存在', '取协议']) {
    const 缺 = { ...F.依赖 }; delete 缺[名];
    let 炸 = null;
    try { const 单 = Q.审批(Q.收草稿(草稿(), 池0(), F.依赖).单, { 操作者: 'x' }, F.依赖); await Q.派(单, 缺); } catch (e) { 炸 = e; }
    if (!炸) { try { Q.收草稿(草稿(), 池0(), 缺); } catch (e) { 炸 = e; } }
    assert.ok(炸 && new RegExp(`没注入 ${名}`).test(炸.message), `缺 ${名} 该炸，实得 ${炸 && 炸.message}`);
  }
});

test('取⑪ 修复单初检过后写 产出.资产 与 防复发判据（测试文件）；调研单写 产出.方案', () => {
  assert.deepStrictEqual(Q.算产出({ 性质: '修复' }, { 改动: { 文件: ['Assets/SLG/a.cs', 'test/a.test.js'] } }), { 产出: { 资产: 'Assets/SLG/a.cs' }, 防复发判据: 'test/a.test.js' });
  assert.deepStrictEqual(Q.算产出({ 性质: '调研' }, { 改动: { 文件: ['方案/x.md'] } }), { 产出: { 方案: '方案/x.md' } });
  assert.deepStrictEqual(Q.算产出({ 性质: '新建' }, { 改动: { 文件: ['a.cs', 'b.cs'] } }), { 产出: { 资产: ['a.cs', 'b.cs'] } });
  assert.deepStrictEqual(Q.算产出({ 性质: '装配' }, { 改动: { 文件: ['Scenes/Main.unity'] } }), { 产出: { 成果: 'Scenes/Main.unity' } });
});

test('取⑫ 拍：取一张派一张，返回新池不改旧池；没有能派的返回 null 与因', async () => {
  const F = 假依赖();
  let 池 = 池0();
  const 单 = Q.审批(Q.收草稿(草稿(), 池, F.依赖).单, { 操作者: '制作人' }, F.依赖);
  池 = { ...池, 工单们: [单] };
  const r = await Q.拍(池, F.依赖);
  assert.strictEqual(r.派了, 'TK-1');
  assert.strictEqual(r.池.工单们[0].状态, '深检');
  assert.strictEqual(池.工单们[0].状态, '待派', '旧池不动');
  const 空 = await Q.拍(r.池, F.依赖);
  assert.strictEqual(空.派了, null);
});

test('取⑬ 造循环 + 单飞：上一拍没完，这一拍跳过，不叠', async () => {
  let 在跑 = 0, 峰 = 0;
  const 拍一次 = async () => { 在跑 += 1; 峰 = Math.max(峰, 在跑); await new Promise((r) => setTimeout(r, 20)); 在跑 -= 1; return { 派了: 'x' }; };
  const 环 = Q.造循环(拍一次, L.单飞('拍'));
  const [a, b] = await Promise.all([环.拍(), 环.拍()]);
  assert.strictEqual(峰, 1);
  assert.ok((a.跳过 && !b.跳过) || (!a.跳过 && b.跳过), '一个跑一个跳');
  const c = await 环.拍();
  assert.strictEqual(c.派了, 'x', '上一拍完了又能拍');
});
