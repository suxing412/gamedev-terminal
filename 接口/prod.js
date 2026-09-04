// prod.js —— 生产：工单、闸、排程、台账。只转调领域与编排，不含业务判断。
//
//   GET  /api/prod/board            一屏：甘特条、人闸队列、按格计数、空转、树、坏文件
//   GET  /api/prod/tickets          工单库（简表）
//   GET  /api/prod/ticket?id=       一张单全貌
//   POST /api/prod/draft   {草稿}                    收草稿 → 成单（必经剥）
//   POST /api/prod/approve {id, 操作者, 结果?, 因?}   审批
//   POST /api/prod/sign    {id, 闸, 结果, 操作者, 因?} 记一道人闸（人判/仲裁），记完能完成就完成
//   POST /api/prod/tick                               拍一次：取一张派一张（跑真 harness，会等）
//
// 池每次请求从数据区现读——不在内存里养第二份事实。写全经 内核/数据区 → 写闸。
'use strict';
const fs = require('fs');
const path = require('path');
const 数据区 = require('../内核/数据区.js');
const 事件流 = require('../内核/事件流.js');
const 时钟 = require('../内核/时钟.js');
const 路径 = require('../内核/路径.js');
const 状态机 = require('../领域/状态机.js');
const 排期 = require('../领域/排期.js');
const 闸模块 = require('../领域/闸.js');
const 架构树 = require('../领域/架构树.js');
const 取单器 = require('../编排/取单器.js');
const 深检站 = require('../编排/深检站.js');
const 会话 = require('../编排/会话.js');

const 错 = (状态, 文) => { const e = new Error(文); e.状态 = 状态; return e; };

/** 协议档：docs/协议/范本/<职能>.json；没有那一职能的范本就上呈。 */
function 读范本(仓根, 职能) {
  const p = path.join(仓根, 'docs', '协议', '范本', 职能 + '.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/**
 * 注到注册表上。
 * @param 依赖 { 数据区根, 钟?, 仓根?, 工作目录?, 适配器们?, 问?, 取协议? }  后四样判据用假的
 */
function 注(注册表, 依赖) {
  const d = 依赖 || {};
  if (!d.数据区根) throw new Error('prod：要 数据区根');
  const 钟 = d.钟 || 时钟.真钟();
  const 仓 = d.仓根 || 路径.仓根();
  const 存 = 数据区.造存(d.数据区根);
  const 流 = 事件流.造流(存.闸, 存.事件流路, 钟);
  const 读池 = () => 数据区.读池(d.数据区根);
  const 找单 = (池, id) => { const t = (池.工单们 || []).find((x) => x.id === id); if (!t) throw 错(404, `没有工单 ${id}`); return t; };

  const 取单器依赖 = () => ({
    钟, 工作目录: d.工作目录 || 仓, 自修上限: 2, 超时ms: d.超时ms,
    存单: 存.存单, 存包: 存.存包, 记事: (e) => 流.记(e),
    读文件: (p) => fs.readFileSync(path.join(d.工作目录 || 仓, p), 'utf8'),
    存在: (p) => fs.existsSync(path.join(d.工作目录 || 仓, p)),
    取协议: d.取协议 || ((单) => {
      const 执行 = 读范本(仓, 单.职能);
      if (!执行) throw 错(422, `没有「${单.职能}」的协议范本（docs/协议/范本/${单.职能}.json）`);
      return { 执行, 上级: 读范本(仓, '总监') || { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [], 可指定下属harness: true }, 人格语气: { 称呼: '总监' } } };
    }),
    ...(d.适配器们 ? { 适配器们: d.适配器们 } : {}),
    ...(d.跑依赖 ? { 跑依赖: d.跑依赖 } : {}),
  });

  注册表.注('GET', '/api/prod/board', () => {
    const 池 = 读池();
    const 现在 = 钟.现在();
    const 排 = 排期.排(池.工单们, { 现在 });
    return {
      t: 现在,
      甘特: 排期.甘特条(排, 池.工单们),
      不排: 排.不排, 环: 排.环,
      在等: 闸模块.在等的(池, { 现在 }),
      计数: 架构树.计数(池),
      空转: 排期.空转(池),
      树: 架构树.建树(池),
      坏: 池.坏,
    };
  }, '生产一屏');

  注册表.注('GET', '/api/prod/tickets', () => 读池().工单们.map((t) => ({
    id: t.id, title: t.title, 职能: t.职能, 性质: t.性质, 状态: t.状态, 归属: t.归属, 优先级: t.优先级, 创建时间: t.创建时间, 更新时间: t.更新时间,
    闸: t.闸序列 ? [...t.闸序列.闸] : [], 履历数: (t.履历 || []).length,
  })), '工单库');

  注册表.注('GET', '/api/prod/ticket', ({ 查 }) => 找单(读池(), 查.id), '一张单');

  注册表.注('POST', '/api/prod/draft', ({ 体 }) => {
    if (!体 || !体.草稿) throw 错(400, '要 {草稿}');
    const r = 取单器.收草稿(体.草稿, 读池(), 取单器依赖());
    if (!r.行) return { 状态: 422, 体: { 行: false, 违: r.违 } };
    return { 行: true, 单: r.单 };
  }, '收草稿→成单');

  注册表.注('POST', '/api/prod/approve', ({ 体 }) => {
    if (!体 || !体.id || !体.操作者) throw 错(400, '要 {id, 操作者}');
    const 单 = 取单器.审批(找单(读池(), 体.id), { 操作者: 体.操作者, 结果: 体.结果, 因: 体.因, 时刻: 钟.现在() }, 取单器依赖());
    return { 行: true, 单 };
  }, '审批');

  注册表.注('POST', '/api/prod/sign', ({ 体 }) => {
    if (!体 || !体.id || !体.闸 || !体.结果 || !体.操作者) throw 错(400, '要 {id, 闸, 结果, 操作者}');
    if (体.闸 !== '人判' && 体.闸 !== '仲裁') throw 错(400, '这条口只记人闸：人判 / 仲裁');
    let 单 = 状态机.记闸(找单(读池(), 体.id), 体.闸, 体.结果, { 操作者: 体.操作者, 因: 体.因, 时刻: 钟.现在() });
    流.记({ 类: 体.闸, 单: 单.id, 结果: 体.结果, 操作者: 体.操作者 });
    let 完成 = false, 因 = null;
    if (体.结果 === '通过') {
      try { 单 = 状态机.迁(单, '完成', { 操作者: '取单器', 因: '闸序列走完', 时刻: 钟.现在() }); 完成 = true; }
      catch (e) { 因 = e.message; }
    }
    存.存单(单);
    return { 行: true, 单, 完成, 因 };
  }, '记人闸，能完成就完成');

  注册表.注('POST', '/api/prod/tick', async () => {
    const r = await 取单器.拍(读池(), 取单器依赖());
    if (!r.派了) return { 派了: null, 因们: r.因们 };
    let 单 = r.单;
    if (r.结果 === '进深检') {
      const 包 = JSON.parse(fs.readFileSync(path.join(d.数据区根, '证据', fs.readdirSync(path.join(d.数据区根, '证据')).filter((f) => f.startsWith(单.id + '-')).sort().pop()), 'utf8'));
      const 问 = d.问 || 会话.开会话(读范本(仓, '程序') || { 职责权限: { 职能: '程序', 可碰目录: [], 可用工具: [] }, 人格语气: { 称呼: '判官' } }, { 用途: '审', 工作目录: d.工作目录 || 仓 }).问;
      const 检 = await 深检站.深检(单, 包, { 问 });
      单 = 状态机.记闸(单, '深检', 检.结果, { 操作者: '深检站', 因: 检.因, 时刻: 钟.现在() });
      流.记({ 类: '深检', 单: 单.id, 结果: 检.结果, 因: 检.因 });
      if (检.结果 === '通过' && !单.闸序列.闸.includes('人判')) {
        单 = 状态机.迁(单, '完成', { 操作者: '取单器', 因: '闸序列走完', 时刻: 钟.现在() });
      }
      存.存单(单);
    }
    return { 派了: r.派了, 结果: r.结果, 状态: 单.状态, 因们: r.因们 };
  }, '拍一次');

  return { 存, 流, 读池 };
}

module.exports = { 注, 读范本 };
