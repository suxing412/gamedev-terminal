// 协议.js —— 协议文档的校验器与两层的读取口。
//
// 协议 = 一份定义「这个智能体是谁、能碰什么、不能碰什么、怎么说话」的 md。
// 三层：职能（抽象类）→ 协议（具体类）→ 席位（实例）。
//
// 为什么单独成模块、不并进席位：协议被**两条环**读——研发环派单要它的职责权限层，
// 智能体环对话要它的人格语气层。藏在席位里，研发环派一张单就得先经过「在座栏」
// 这个对话侧的概念才能拿到权限。拆开后研发环只读这里，根本不知道席位存在。
//
// 纯函数。frontmatter 由调用方解析好传进来（领域层禁 fs）。schema 静态 require。
'use strict';
const S = require('../docs/协议/schema.json');
const 职能表 = require('../docs/单型/职能.json');

const 层名 = Object.freeze(Object.keys(S.层));   // ['职责权限', '人格语气']

function 验层(对象, 层) {
  const 定义 = S.层[层];
  if (!定义) return [`没有「${层}」这一层`];
  const 违 = [];
  const 段 = 对象 && 对象[层];
  if (!段 || typeof 段 !== 'object') return [`协议缺「${层}」层`];
  for (const [名, 定] of Object.entries(定义.字段)) {
    const v = 段[名];
    const 缺 = v === undefined || v === null || v === '';
    if (定.必填 === true && 缺) { 违.push(`${层}.${名} 必填`); continue; }
    if (缺) continue;
    if (定.类型 === 'list' && !Array.isArray(v)) 违.push(`${层}.${名} 该是数组`);
    if (定.类型 === 'bool' && typeof v !== 'boolean') 违.push(`${层}.${名} 该是布尔`);
    if (定.类型 === 'string' && typeof v !== 'string') 违.push(`${层}.${名} 该是字符串`);
  }
  return 违;
}

/** 校验一份协议（已解析的 frontmatter 对象）。 */
function 校验(协议) {
  const 违 = [];
  if (!协议 || typeof 协议 !== 'object') return { 行: false, 违: ['协议不是对象'] };
  for (const 层 of 层名) 违.push(...验层(协议, 层));
  const 职 = 协议.职责权限 && 协议.职责权限.职能;
  if (职 && !职能表.表.some((r) => r.名 === 职 && r.启用 !== false)) 违.push(`职责权限.职能「${职}」不在职能表里或未启用`);
  const 工具 = (协议.职责权限 && 协议.职责权限.可用工具) || [];
  for (const t of 工具) if (/改.*状态|迁移|move_state|set_state/i.test(String(t))) 违.push(`可用工具里有「${t}」——改工单状态的工具谁都不许有，状态只有状态机能改`);
  return { 行: 违.length === 0, 违 };
}

/**
 * 取一层：**按 schema 的字段表出键**，不写死字段名（09-04 评审甲-13：以前六个键手写在这儿，
 * schema 加字段这里不会带上，规矩①说的「加字段=改数据」是假的）。
 * list 复制一份、bool 只认 true、其余缺省取 schema 默认（没有默认取 null）。议⑩ 盯着键集 == schema 字段集。
 */
function 取层(协议, 层) {
  const 定义 = S.层[层];
  const p = (协议 && 协议[层]) || {};
  const 出 = {};
  for (const [名, 定] of Object.entries(定义.字段)) {   // 按 schema 出键
    const v = p[名];
    if (定.类型 === 'list') 出[名] = [...(Array.isArray(v) ? v : (定.默认 || []))];
    else if (定.类型 === 'bool') 出[名] = v === true;
    else 出[名] = (v === undefined || v === null || v === '') ? (定.默认 !== undefined ? 定.默认 : null) : v;
  }
  return Object.freeze(出);
}

/**
 * 权限声明：从职责权限层导出，给 领域/权限 跟工单收紧求交。
 * **只从这一层取**——人格层的字段一个都不带进执行卷。
 */
function 权限声明(协议) { return 取层(协议, '职责权限'); }

/** 人格：从人格语气层导出，只进对话会话。 */
function 人格(协议) { return 取层(协议, '人格语气'); }

/** 这份协议能不能覆写路由——「可指定下属harness」那一位。 */
function 能指定下属harness(协议) {
  return !!(协议 && 协议.职责权限 && 协议.职责权限.可指定下属harness === true);
}

module.exports = { 层名, 校验, 权限声明, 人格, 能指定下属harness, schema: S };
