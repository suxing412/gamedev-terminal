// 单型.js —— 类型系统的校验器：按 docs/单型/ 五份 schema 判一张单、一个专项拆得对不对。
//
// **纯函数。** 领域层禁 fs——schema 用 require 静态载入（模块加载那一刻读一次，之后没有 I/O），
// 「盘上有没有这个文件」「同专项里还有哪些单」都由调用方传进来。
// 这样判据喂假数据就能跑，变异台打得动。
//
// 它判的是**拆单判据五条**里能在 schema 层判的四条（① ② ④ ⑤）。
// 第 ③ 条「进项未过闸不派」是取单器的活，不在这儿——那要看别的单的闸结果，schema 看不到。
'use strict';
const 职能表 = require('../docs/单型/职能.json');
const 管线S = require('../docs/单型/管线.json');
const 特性S = require('../docs/单型/特性.json');
const 专项S = require('../docs/单型/专项.json');
const 工单S = require('../docs/单型/工单.json');
const 状态机 = require('./状态机.js');

const 性质们 = Object.freeze(Object.keys(工单S.性质签名));
const 产出三型 = Object.freeze(['方案', '资产', '成果']);

/** 性质签名：进/出 各是什么。 */
function 签名(性质) {
  const s = 工单S.性质签名[性质];
  return s ? { 进: [...s.进], 出: [...s.出] } : null;
}

/** 启用的职能行。 */
function 职能(名) {
  return 职能表.表.find((r) => r.名 === 名 && r.启用 !== false) || null;
}

// ── 字段级：必填、枚举、格式 ──────────────────────────────────────
function 验字段(对象, 字段表, 是) {
  const 违 = [];
  for (const [名, 定] of Object.entries(字段表)) {
    const v = 对象[名];
    const 缺 = v === undefined || v === null || v === '';
    if (定.必填 === true && 缺) { 违.push(`${是}缺必填字段「${名}」`); continue; }
    if (缺) continue;
    if (定.类型 === 'enum' && !定.合法值.includes(v)) 违.push(`${是}.${名}=「${v}」不在合法值 ${定.合法值.join('/')} 里`);
    if (定.格式 && typeof v === 'string' && !new RegExp(定.格式).test(v)) 违.push(`${是}.${名}=「${v}」不合格式 ${定.格式}`);
    if (定.类型 === 'bool' && typeof v !== 'boolean') 违.push(`${是}.${名} 该是布尔`);
    if (定.类型 === 'list' && !Array.isArray(v)) 违.push(`${是}.${名} 该是数组`);
  }
  return 违;
}

// ── 工单 ──────────────────────────────────────────────────────────
//
// 上下文 = {
//   存在(路径) → bool                 盘上有没有这个文件（调用方查，这里不碰 fs）
//   同专项单们: [单]                   同一专项里的其它单，按创建时间序
//   特性(id) → 特性对象 | null         归属指向的特性，判它是不是散单
// }
function 校验单(单, 上下文) {
  const 违 = [];
  const 上 = 上下文 || {};
  const 存在 = typeof 上.存在 === 'function' ? 上.存在 : () => true;

  违.push(...验字段(单, 工单S.字段, '工单'));

  // ⑤ 职能 × 性质
  if (单.职能 && !职能(单.职能)) 违.push(`职能「${单.职能}」不在职能表里，或未启用`);
  if (单.性质 && !性质们.includes(单.性质)) 违.push(`性质「${单.性质}」不是四种之一（${性质们.join('/')}）`);

  // ① 归属二选一
  const 归 = 单.归属 || {};
  const 有专项 = !!归.专项; const 有特性 = !!归.特性;
  if (有专项 === 有特性) {
    违.push(有专项 ? '归属不许同时填 专项 和 特性' : '归属为空：要么挂专项，要么挂散单特性');
  } else if (有特性) {
    const f = typeof 上.特性 === 'function' ? 上.特性(归.特性) : null;
    if (f && f.散单 !== true) 违.push(`归属直接挂了具名特性「${归.特性}」——只许挂散单特性，具名特性下面要立专项`);
  }

  // 进项按签名齐不齐 + ② 进项存在
  const 签 = 签名(单.性质);
  if (签) {
    const 进 = 单.进项 || {};
    for (const 要 of 签.进) {
      const 可选 = 要.endsWith('?');
      const 键 = 要.replace(/[?\[\]]/g, '').replace('|', '或');
      const 候 = 要.replace('?', '').replace('[]', '').split('|');   // '资产|方案' → ['资产','方案']
      const 有 = 候.some((k) => 进[k] !== undefined && 进[k] !== null && 进[k] !== '');
      if (!有 && !可选) { 违.push(`性质「${单.性质}」要进项 ${候.join('或')}，没填`); continue; }
      for (const k of 候) {
        const v = 进[k]; if (v === undefined || v === null || v === '') continue;
        const 路们 = Array.isArray(v) ? v : [v];
        for (const 路 of 路们) {
          if (!存在(路) && !产于同专项(路, 上.同专项单们)) {
            违.push(`进项 ${k}=「${路}」既不在盘上，也不是同专项里更早的单产出的`);
          }
        }
      }
      void 键;
    }
    // 修复必须有防复发判据
    if (单.性质 === '修复' && !单.防复发判据) 违.push('修复单必须带 防复发判据（test/ 下一个能红的文件）——没有等于没修');
  }

  // 状态只认状态机
  if (单.状态 && !状态机.状态们.includes(单.状态)) 违.push(`状态「${单.状态}」不是状态机十三态之一`);

  return { 行: 违.length === 0, 违 };
}

function 产于同专项(路, 单们) {
  if (!Array.isArray(单们)) return false;
  return 单们.some((s) => {
    const 出 = s.产出 || {};
    return Object.values(出).some((v) => (Array.isArray(v) ? v : [v]).includes(路));
  });
}

// ── 专项 ──────────────────────────────────────────────────────────
//
// ④ 末单规则：最后一张子单的性质所产出的类型 == 专项.产出类型。
// 性质→产出类型：新建/修复 → 资产（修复也可能是方案，按单.产出类型）；调研 → 方案；装配 → 成果。
function 末单产出类型(单) {
  if (!单) return null;
  if (单.产出类型) return 单.产出类型;
  switch (单.性质) {
    case '调研': return '方案';
    case '装配': return '成果';
    case '新建': case '修复': return '资产';
    default: return null;
  }
}

function 校验专项(专项, 子单们) {
  const 违 = [];
  违.push(...验字段(专项, 专项S.字段, '专项'));
  if (专项.产出类型 && !产出三型.includes(专项.产出类型)) 违.push(`专项.产出类型「${专项.产出类型}」不是三型之一`);
  if (专项.管线) 违.push('专项不许写 管线（祖父，从 特性 推）——H107');
  const 子 = Array.isArray(子单们) ? 子单们 : [];
  if (子.length) {
    const 末 = 子[子.length - 1];
    const 型 = 末单产出类型(末);
    if (专项.产出类型 && 型 && 型 !== 专项.产出类型) {
      违.push(`末单「${末.id || '?'}」是${末.性质}，产出${型}；专项要的是${专项.产出类型}。产出=成果的专项末单必须是装配`);
    }
  }
  return { 行: 违.length === 0, 违 };
}

// ── 特性 / 管线 ───────────────────────────────────────────────────
function 校验特性(特性) {
  const 违 = 验字段(特性, 特性S.字段, '特性');
  if (特性.挂载凭据) 违.push('特性不许存 挂载凭据（反向边）——从工单归属推');
  return { 行: 违.length === 0, 违 };
}
function 校验管线(管线) {
  const 违 = 验字段(管线, 管线S.字段, '管线');
  return { 行: 违.length === 0, 违 };
}

module.exports = {
  签名, 职能, 性质们, 产出三型,
  校验单, 校验专项, 校验特性, 校验管线, 末单产出类型,
  职能表, 工单S, 专项S, 特性S, 管线S,
};
