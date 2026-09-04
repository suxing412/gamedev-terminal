// 一张单.js —— 第 3 步：一张散单端到端，验链条能不能转。
//
//   schema 校验 → 路由 → 执行卷 → 状态 待派→在途 → 装配提示词 → 跑（Claude）
//   → 攒证据包 → 验包 → 初检 → 状态 在途→初检→深检 → 经写闸落盘 → **撤销**
//
// 制作人 02:59 定：散单直派、不经专项，目的只是验链条；**验完撤销这张单，保持数据干净。**
// 所以这里全部在临时目录里做：临时工作目录（git init）+ 临时数据区，跑完删掉。
//
// 用法：node tools/一张单.js          干跑：query 换成假的（它自己把文件写出来），不碰网
//       node tools/一张单.js --真     真跑：走 @anthropic-ai/claude-agent-sdk，要代理与登录
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const 单型 = require('../领域/单型.js');
const 状态机 = require('../领域/状态机.js');
const 协议 = require('../领域/协议.js');
const 权限 = require('../领域/权限.js');
const 校验 = require('../领域/校验.js');
const 证据 = require('../内核/证据.js');
const 写闸 = require('../内核/写闸.js');
const 适配器 = require('../编排/适配器.js');
const claude = require('../编排/适配器-claude.js');
const 装配器 = require('../编排/装配器.js');

const 真 = process.argv.includes('--真');
const 步 = [];
const 记 = (名, 行, 说) => { 步.push({ 名, 行: !!行, 说: 说 || '' }); console.log(`${行 ? '  ✓' : '  ✗'} ${名}${说 ? '   ' + 说 : ''}`); if (!行) throw new Error('链条断在：' + 名); };

const 范本 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'docs', '协议', '范本', '程序.json'), 'utf8'));

let 工作目录, 数据区;
(async () => {
  console.log(`一张单 · ${真 ? '真跑（Claude SDK）' : '干跑（假 query）'}\n`);

  // ── 0 临时工作目录 + git，临时数据区 ──
  工作目录 = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-1ticket-'));
  数据区 = fs.mkdtempSync(path.join(os.tmpdir(), 'gdt-1data-'));
  fs.mkdirSync(path.join(工作目录, 'Assets', 'SLG'), { recursive: true });
  fs.writeFileSync(path.join(工作目录, 'README.md'), '# 靶场\n');
  const g = (a) => spawnSync('git', a, { cwd: 工作目录, encoding: 'utf8', windowsHide: true });
  g(['init', '-q']); g(['-c', 'user.name=一张单', '-c', 'user.email=x@y', 'add', '-A']);
  g(['-c', 'user.name=一张单', '-c', 'user.email=x@y', 'commit', '-q', '-m', 'init']);
  记('0 临时工作目录 + git init', fs.existsSync(path.join(工作目录, '.git')), 工作目录);

  // ── 1 造一张散单 ──
  let 单 = {
    id: 'TMP-1', title: '写一个空的 Hello 类', 职能: '程序', 性质: '新建',
    归属: { 特性: 'F-15' }, 状态: '待派', 优先级: 'P2', 规模: '单兵', 项目: 'TK',
    需求: { 要引擎: false, 碰活存储: false },
    创建时间: new Date().toISOString(), 更新时间: new Date().toISOString(), 履历: [],
    正文: '在 Assets/SLG/Hello.cs 写一个空的 public class Hello（namespace SLG）。只改这一个文件，不要建别的。',
  };
  const 校 = 单型.校验单(单, { 存在: () => true, 同专项单们: [], 特性: (id) => (id === 'F-15' ? { id, 散单: true } : null) });
  记('1 schema 校验（散单挂散单特性 F-15）', 校.行, 校.违.join('；'));

  // ── 2 路由 ──
  const 路 = 适配器.路由(单, 范本);
  记('2 路由', 路.harness === 'claude', `${路.harness}（${路.因}）`);

  // ── 3 执行卷 ──
  const 声 = 协议.权限声明(范本);
  const 卷 = 权限.编译执行卷(单, 声, undefined);
  记('3 执行卷（协议 ∩ 工单收紧）', 卷.哈希 && 卷.权限.可碰目录.length > 0, `哈希 ${卷.哈希} · 可碰 ${卷.权限.可碰目录.join('、')}`);

  // ── 4 待派 → 在途 ──
  单 = 状态机.迁(单, '在途', { 操作者: '一张单', 因: '直派（第 3 步验链）', 时刻: new Date().toISOString() });
  记('4 状态 待派→在途', 单.状态 === '在途');

  // ── 5 装配提示词 ──
  const 提示词 = 装配器.装(单, 范本, {});
  记('5 装配提示词（每步新会话，只装本步要的）', 提示词.includes('Hello') && !提示词.includes('小程'), `${提示词.length} 字，人格层没进执行卷`);

  // ── 6 跑 ──
  const 进 = 适配器.进方(单, 卷, 提示词, 工作目录);
  const 假query = async function* () {
    fs.writeFileSync(path.join(工作目录, 'Assets', 'SLG', 'Hello.cs'), 'namespace SLG { public class Hello { } }\n');
    yield { type: 'assistant', message: { content: '写了 Assets/SLG/Hello.cs，一个空类。' } };
    yield { type: 'result', subtype: 'success', result: '已在 Assets/SLG/Hello.cs 写入空类 Hello（namespace SLG）。只改了这一个文件。', usage: { input_tokens: 0, output_tokens: 0 } };
  };
  const 料 = await claude.跑(进, 真 ? {} : { query: 假query, 版本: 'dry' });
  记('6 跑（Claude 适配器）', 料 && 料.结果, `退出 ${料.结果.退出} · ${料.结果.耗时ms}ms · token 入${料.结果.token.输入}/出${料.结果.token.输出}`);

  // ── 7 证据包 ──
  const 包 = 证据.攒包(料);
  const 验 = 证据.验包(包);
  记('7 攒证据包 + 验包', 验.行, 验.违.join('；') || `改动 ${包.改动.文件.join('、') || '（无）'}`);

  // ── 8 初检 ──
  const 检 = 校验.初检(包, 单, 卷);
  记('8 初检（机判）', 检.初检 === '通过', 检.违.join('；') || (检.待人判.length ? '待人判：' + 检.待人判.join('；') : '无待人判'));

  // ── 9 在途→初检→深检 ──
  单 = 状态机.迁(单, '初检', { 操作者: '一张单', 因: '证据包在', 产物: 包, 时刻: new Date().toISOString() });
  单 = 状态机.记闸(单, '初检', 检.初检, { 操作者: '领域/校验', 因: 检.违.join('；') || '机判六项过', 时刻: new Date().toISOString() });
  单 = 状态机.迁(单, '深检', { 操作者: '一张单', 因: '初检通过', 时刻: new Date().toISOString() });
  记('9 状态 在途→初检→深检（凭产物与闸履历，不凭嘴）', 单.状态 === '深检', `履历 ${单.履历.length} 条`);

  // ── 10 经写闸落盘 ──
  const 闸 = 写闸.建闸({ 根: 数据区, 准写: ['工单', '证据'] });
  写闸.写(闸.领(path.join(数据区, '工单', 'TMP-1.json'), '落单'), JSON.stringify(单, null, 2));
  写闸.写(闸.领(path.join(数据区, '证据', 'TMP-1.json'), '落包'), JSON.stringify(包, null, 2));
  let 越界拦住 = false;
  try { 闸.领(path.join(数据区, '归档', 'x.json'), '试越界'); } catch (e) { 越界拦住 = e.code === '写闸拒绝'; }
  记('10 经写闸落盘（越界写被拒）', fs.existsSync(path.join(数据区, '证据', 'TMP-1.json')) && 越界拦住);

  // ── 报告 ──
  console.log('\n══ 链条通了 ══');
  console.log(`  单 ${单.id} 停在「${单.状态}」，下一步是深检（模型判质量）——第 3 步到此为止`);
  console.log(`  证据包：harness ${包.harness.名}@${包.harness.版本} · 改动 ${包.改动.文件.length} 文件 · 回执 ${String(包.回执).slice(0, 40)}…`);
  console.log(`  履历：${单.履历.map((h) => (h.闸 ? `${h.闸}:${h.结果}` : `${h.从}→${h.到}`)).join(' · ')}`);
  if (包.权限拒绝记录) console.log(`  写闸拒绝 ${包.权限拒绝记录.length} 次：${包.权限拒绝记录.map((x) => x.路).join('、')}`);

  // ── 撤销 ──
  fs.rmSync(工作目录, { recursive: true, force: true });
  fs.rmSync(数据区, { recursive: true, force: true });
  console.log('\n  已撤销：临时工作目录与数据区已删，盘上不留这张单（制作人 02:59：验完撤销，保持干净）');
  process.exit(0);
})().catch((e) => {
  console.error('\n✗ ' + e.message);
  if (e.stack && !/链条断在/.test(e.message)) console.error(e.stack.split('\n').slice(1, 4).join('\n'));
  try { if (工作目录) fs.rmSync(工作目录, { recursive: true, force: true }); if (数据区) fs.rmSync(数据区, { recursive: true, force: true }); } catch {}
  console.error('  已清理临时目录');
  process.exit(1);
});
