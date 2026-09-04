// 一个专项.js —— 第 4 步：**一个专项端到端**。研发环「凭什么算闭上了」的实证：
//   说一句需求 → 项管拆成 调研 / 新建 / 装配 三张 → 审批 → 甘特上看得见先后 → 取单器按拍派
//   → 跑 → 初检 → 深检站判 → 人判（制作人签）→ 完成 → 归档 → 下游被放行 → … → 专项 收口 → 关账。
//
// 全在临时目录里：临时工作目录（git init）+ 临时数据区（写闸 + 事件流）。跑完撤销，盘上不留。
// 用法：node tools/一个专项.js          干跑：执行者与判官都是假的（假 query 自己把文件写出来、判官一律通过）
//       node tools/一个专项.js --真     真跑：三张单走 Claude SDK 执行，三次深检走只读会话；人判仍由脚本代签并标明
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const 取单器 = require('../编排/取单器.js');
const 深检站 = require('../编排/深检站.js');
const 会话 = require('../编排/会话.js');
const 状态机 = require('../领域/状态机.js');
const 排期 = require('../领域/排期.js');
const 闸模块 = require('../领域/闸.js');
const 架构树 = require('../领域/架构树.js');
const 写闸 = require('../内核/写闸.js');
const 事件流 = require('../内核/事件流.js');
const 时钟 = require('../内核/时钟.js');

const 真 = process.argv.includes('--真');
const 步 = [];
const 记 = (名, 行, 说) => { 步.push({ 名, 行: !!行 }); console.log(`${行 ? '  ✓' : '  ✗'} ${名}${说 ? '   ' + 说 : ''}`); if (!行) throw new Error('链条断在：' + 名); };

const 程序协议 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', '协议', '范本', '程序.json'), 'utf8'));
const 策划协议 = { 职责权限: { 职能: '技术策划', 可碰目录: ['方案/**'], 可用工具: ['Read', 'Write', 'Edit', 'Glob', 'Grep'], 禁: [], 默认harness: 'claude' }, 人格语气: { 称呼: '小策', 语气: '先列路线再推荐' } };
const 总监协议 = { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [], 可指定下属harness: true }, 人格语气: { 称呼: '总监' } };

let 工作目录, 数据区;
(async () => {
  console.log(`一个专项 · ${真 ? '真跑（Claude SDK）' : '干跑（假执行者 + 假判官）'}\n`);
  const 钟 = 时钟.真钟();

  // ── 0 临时工作目录 + 临时数据区 ──
  工作目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-1special-w-'));
  数据区 = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-1special-d-'));
  fs.mkdirSync(path.join(工作目录, 'Assets', 'SLG'), { recursive: true });
  fs.mkdirSync(path.join(工作目录, '方案'), { recursive: true });
  fs.writeFileSync(path.join(工作目录, 'README.md'), '# 靶场\n');
  const g = (a) => spawnSync('git', a, { cwd: 工作目录, encoding: 'utf8', windowsHide: true });
  g(['init', '-q']); g(['-c', 'user.name=一个专项', '-c', 'user.email=x@y', 'add', '-A']); g(['-c', 'user.name=一个专项', '-c', 'user.email=x@y', 'commit', '-q', '-m', 'init']);
  const 闸 = 写闸.建闸({ 根: 数据区, 准写: ['工单', '证据', '事件', '专项'] });
  const 流 = 事件流.造流(闸, path.join(数据区, '事件', '流.jsonl'), 钟);
  let 包序 = 0;
  const 落 = (相, 对象, 为) => 写闸.写(闸.领(path.join(数据区, 相), 为), JSON.stringify(对象, null, 2));
  记('0 临时工作目录 + 数据区（写闸：工单/证据/事件/专项）', fs.existsSync(path.join(工作目录, '.git')), 数据区);

  // ── 1 一句需求 → 四层入树 ──
  let 池 = {
    管线们: [{ id: 'P-1', 名称: '地图系统', 范围: '地图', 状态: '活跃' }],
    特性们: [{ id: 'F-1', 名称: '寻路', 管线: 'P-1', 边界: '单位在地图上怎么走', 状态: '活跃' }, { id: 'F-15', 名称: '地图散单', 管线: 'P-1', 边界: '兜底', 状态: '活跃', 散单: true }],
    专项们: [{ id: 'S-1', 名称: '寻路演示', 特性: 'F-1', 产出类型: '成果', 目标: '一个能跑的寻路演示场景', 状态: '进行', 履历: [{ t: 钟.现在(), 到: '进行', 操作者: '制作人（干跑）' }] }],
    工单们: [],
  };
  记('1 需求「做一个寻路演示」入树：P-1 地图系统 → F-1 寻路 → S-1 寻路演示（产出=成果）', 架构树.建树(池).孤儿.length === 0);

  // ── 2 项管拆单：三张草稿，预计产出把数据流写死 ──
  const 草稿们 = [
    { title: '寻路方案', 正文: '比较 A* 与 flow field 两条路线，各自取舍，推荐一条。写到 方案/S-1-寻路.md。', 职能: '技术策划', 性质: '调研', 归属: { 专项: 'S-1' }, 项目: 'TK', 预计产出: { 方案: '方案/S-1-寻路.md' } },
    { title: '实现寻路', 正文: '按方案在 Assets/SLG/Pathfinder.cs 实现 public class Pathfinder（namespace SLG）。只改这一个文件。', 职能: '程序', 性质: '新建', 归属: { 专项: 'S-1' }, 项目: 'TK', 进项: { 方案: '方案/S-1-寻路.md' }, 预计产出: { 资产: 'Assets/SLG/Pathfinder.cs' } },
    { title: '搭寻路演示场景', 正文: '把 Pathfinder 装进 Assets/SLG/Scenes/寻路演示.unity（占位 YAML 即可）。', 职能: '程序', 性质: '装配', 归属: { 专项: 'S-1' }, 项目: 'TK', 进项: { 方案: '方案/S-1-寻路.md', 资产: ['Assets/SLG/Pathfinder.cs'] }, 预计产出: { 成果: 'Assets/SLG/Scenes/寻路演示.unity' } },
  ];
  const 存在 = (p) => fs.existsSync(path.join(工作目录, p));
  const 依赖 = {
    钟, 工作目录, 自修上限: 2, 超时ms: 10 * 60 * 1000,
    存单: (单) => 落(path.join('工单', 单.id + '.json'), 单, '落单'),
    存包: (包) => 落(path.join('证据', `${包.单号}-${++包序}.json`), 包, '落包'),
    记事: (e) => 流.记(e),
    读文件: (p) => fs.readFileSync(path.join(工作目录, p), 'utf8'),
    存在,
    取协议: (单) => ({ 执行: 单.职能 === '技术策划' ? 策划协议 : 程序协议, 上级: 总监协议 }),
  };
  for (const 草 of 草稿们) {
    const r = 取单器.收草稿(草, 池, 依赖);
    if (!r.行) 记(`2 拆单「${草.title}」`, false, r.违.join('；'));
    池 = { ...池, 工单们: [...池.工单们, r.单] };
  }
  记('2 项管拆三张：调研 → 新建 → 装配，预计产出把数据流写死', 池.工单们.length === 3, 池.工单们.map((t) => `${t.id} ${t.性质}（闸 ${t.闸序列.闸.join('→')}）`).join(' · '));

  // ── 3 审批 ──
  池 = { ...池, 工单们: 池.工单们.map((t) => 取单器.审批(t, { 操作者: '制作人（干跑）', 因: '该做' }, 依赖)) };
  记('3 制作人审批三张 → 待派', 池.工单们.every((t) => t.状态 === '待派'));

  // ── 4 排期：执行前就推得出先后（靠预计产出）──
  const 排 = 排期.排(池.工单们, { 现在: 钟.现在() });
  const 条 = 排期.甘特条(排, 池.工单们);
  记('4 排期：甘特条三行，先后从预计产出推出来', 条.length === 3 && 条[0].性质 === '调研' && 条[2].性质 === '装配' && 条[2].依赖.length === 2,
    条.map((c) => `${c.id} ${c.起.slice(11, 16)}→${c.止.slice(11, 16)}${c.临界 ? ' 临界' : ''}`).join(' · '));

  // ── 5 按拍派：每拍一张，取单器只放行上游已归档的 ──
  const 假query = (单) => async function* () {
    const 写 = (相, 内容) => { const p = path.join(工作目录, 相); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 内容); };
    if (单.性质 === '调研') 写('方案/S-1-寻路.md', '# 寻路方案\n\n## 路线甲 A*\n简单、够用。\n\n## 路线乙 flow field\n大规模单位省。\n\n## 推荐\n甲。\n');
    else if (单.性质 === '新建') 写('Assets/SLG/Pathfinder.cs', 'namespace SLG { public class Pathfinder { } }\n');
    else 写('Assets/SLG/Scenes/寻路演示.unity', '%YAML 1.1\n--- !u!1 &1\nGameObject:\n  m_Name: Pathfinder\n');
    yield { type: 'assistant', message: { content: '按单做了' } };
    yield { type: 'result', subtype: 'success', result: `按单做了：${单.title}`, usage: { input_tokens: 0, output_tokens: 0 } };
  };
  const 判官 = 真
    ? 会话.开会话(程序协议, { 用途: '审', 工作目录, 最多轮: 6 })
    : { 问: async () => ({ 文本: '结论：通过\n理由：干跑判官一律通过', 会话id: 'dry' }) };
  const 换 = (单) => { 池 = { ...池, 工单们: 池.工单们.map((t) => (t.id === 单.id ? 单 : t)) }; };
  let 拍数 = 0; let 人判过 = 0; let 派序 = [];
  for (;;) {
    const 取 = 取单器.取单(池, 依赖);
    if (!取.单) break;
    拍数 += 1;
    依赖.跑依赖 = 真 ? {} : { query: 假query(取.单), 版本: 'dry' };
    const r = await 取单器.派(取.单, 依赖);
    if (r.结果 !== '进深检') 记(`5.${拍数} 派 ${取.单.id}`, false, `${r.结果}：${(r.检 && r.检.违.join('；')) || r.单.履历[r.单.履历.length - 1].因}`);
    let 单 = r.单;
    // 深检站判
    const 检 = await 深检站.深检(单, JSON.parse(fs.readFileSync(path.join(数据区, '证据', `${单.id}-${包序}.json`), 'utf8')), { 问: (p) => 判官.问(p) });
    单 = 状态机.记闸(单, '深检', 检.结果, { 操作者: 真 ? '深检站（Claude 只读会话）' : '深检站（干跑）', 因: 检.因, 时刻: 钟.现在() });
    流.记({ 类: '深检', 单: 单.id, 结果: 检.结果, 因: 检.因 });
    if (检.结果 !== '通过') 记(`5.${拍数} 深检 ${单.id}`, false, 检.因);
    // 人判：序列里有才签
    if (单.闸序列.闸.includes('人判')) {
      const 等 = 闸模块.在等的({ 工单们: [单] }, { 现在: 钟.现在() });
      if (!(等.length === 1 && 等[0].类 === '人判' && 等[0].等谁 === '制作人')) 记(`5.${拍数} 人闸注册表该列出 ${单.id} 等制作人`, false, JSON.stringify(等));
      单 = 状态机.记闸(单, '人判', '通过', { 操作者: '制作人（干跑代签）', 因: 单.闸序列.因, 时刻: 钟.现在() });
      流.记({ 类: '人判', 单: 单.id, 操作者: '制作人（干跑代签）' });
      人判过 += 1;
    }
    单 = 状态机.迁(单, '完成', { 操作者: '取单器', 因: '闸序列走完', 时刻: 钟.现在() });
    单 = 状态机.迁(单, '归档', { 操作者: '项管（干跑）', 因: '验收过', 时刻: 钟.现在() });
    依赖.存单(单); 换(单); 派序.push(`${单.id}(${单.性质}${单.闸序列.闸.includes('人判') ? '·人判' : ''})`);
    记(`5.${拍数} ${单.id} ${单.性质}：派 → 初检 → 深检 → ${单.闸序列.闸.includes('人判') ? '人判 → ' : ''}完成 → 归档`, 单.状态 === '归档',
      `履历 ${单.履历.length} 条 · ${单.履历.filter((h) => h.闸).map((h) => `${h.闸}:${h.结果}`).join(' ')}`);
  }
  记('5 三拍派完，顺序由数据流定，下游只在上游归档后放行', 拍数 === 3 && 池.工单们.every((t) => t.状态 === '归档'), 派序.join(' → '));
  记('5b 人判只出现在该出现的单上：调研（方案）与装配（成果）各一次，新建（程序资产）没有', 人判过 === 2);

  // ── 6 专项 收口 → 关账 ──
  let 专项 = 池.专项们[0];
  专项 = { ...专项, 状态: '收口', 履历: [...专项.履历, { t: 钟.现在(), 从: '进行', 到: '收口', 操作者: '项管（干跑）', 因: '末单装配已归档' }] };
  const 等关账 = 闸模块.在等的({ 专项们: [专项] }, { 现在: 钟.现在() });
  记('6 专项收口 → 人闸注册表列出 关账 等制作人（产出=成果）', 等关账.length === 1 && 等关账[0].类 === '关账' && 等关账[0].等谁 === '制作人');
  专项 = { ...专项, 状态: '关账', 履历: [...专项.履历, { t: 钟.现在(), 从: '收口', 到: '关账', 操作者: '制作人（干跑代签）', 因: '目标达成：演示场景在' }] };
  落(path.join('专项', 'S-1.json'), 专项, '落专项');
  池 = { ...池, 专项们: [专项] };
  const 数 = 架构树.计数(池);
  记('6b 关账；架构树上 S-1 三张全落袋、无漏', 数.专项['S-1'].已落袋 === 3 && 数.专项['S-1'].漏.length === 0);

  // ── 7 账 ──
  const 事 = 流.读();
  const 盘 = fs.readdirSync(path.join(数据区, '工单')).length;
  记('7 留痕：事件流有账、数据区有单有包', 事.length >= 12 && 盘 === 3, `事件 ${事.length} 条（${[...new Set(事.map((e) => e.类))].join('/')}）· 工单 ${盘} · 证据包 ${包序}`);

  console.log('\n══ 一个专项闭上了 ══');
  console.log('  说了一句需求，之后没再碰它：三张单自己按数据流先后派、过三道闸、该签的签了两次、归档；专项关账。');
  console.log(`  产出在架构树上的位置：P-1 地图系统 → F-1 寻路 → S-1 寻路演示 → ${池.工单们.map((t) => t.id).join('/')}`);
  console.log(`  末单产出：${JSON.stringify(池.工单们[2].产出)}`);

  fs.rmSync(工作目录, { recursive: true, force: true });
  fs.rmSync(数据区, { recursive: true, force: true });
  console.log('\n  已撤销：临时工作目录与数据区已删，盘上不留（验完撤销，保持干净）');
  process.exit(0);
})().catch((e) => {
  console.error('\n✗ ' + e.message);
  if (e.stack && !/链条断在/.test(e.message)) console.error(e.stack.split('\n').slice(1, 5).join('\n'));
  try { if (工作目录) fs.rmSync(工作目录, { recursive: true, force: true }); if (数据区) fs.rmSync(数据区, { recursive: true, force: true }); } catch (x) { /* 临时目录 */ }
  console.error('  已清理临时目录');
  process.exit(1);
});
