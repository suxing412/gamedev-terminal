// 写闸.js —— **全仓唯一的 fs 写入口**。
//
// 旧仓的病：写口散在四处（文稿台一处、坐席一处、runner 一处、巡检一处），
// 谁都能写，于是「这个文件怎么变了」永远查不出来。而挡它的那张禁写表是**黑名单**，
// 失效方向是「漏了就能写」——实测已经漏了 6 个活态目录，其中「待派」正是 runner
// 每 15 秒取单的那一个。漏了没有任何症状，直到某次保存撞上
// `parse → rename → write → unlink` 的窗口：要么编辑被静默吞掉，要么同号双态成立、
// 全线派发熔断。那个熔断的案源就是「人往工单目录里写字」。
//
// 所以这里换成三条硬规矩：
//
//   ① **令牌制**：没有令牌，写数据区直接 throw。不是「返回 false 由调用方判断」——
//      返回值会被忽略，异常不会。
//   ② **白名单**：允许写哪儿是列出来的，不是排除出来的。失效方向变成「漏了写不了」，
//      人当场就知道，去补一行即可。状态机以后加第十四态，默认拦住它。
//   ③ **写前先说要写什么**：拿令牌时就要声明目标路径。声明与实际不符照样 throw。
//      这样「谁想写哪儿」在事发前就是可审的，不用事后翻 journal 猜。
'use strict';
const fs = require('fs');
const path = require('path');

/** 路径归一：统一分隔符、去掉尾斜杠、转小写（Windows 不分大小写）。 */
function 归一(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

/** a 是不是在 b 底下（或就是 b）。**按段比，不按字符串前缀比。** */
function 在其下(a, b) {
  const x = 归一(a);
  const y = 归一(b);
  if (!y) return false;
  // 「/数据/待派x」不算在「/数据/待派」底下 —— 用 startsWith 比字符串会误判成是。
  return x === y || x.startsWith(y + '/');
}

/**
 * 建一道闸。
 *
 * @param {object} 规  { 根, 准写, 禁写 }
 *   根    —— 这道闸管辖的目录。管辖外的路径一律拒（不是放行，是拒）。
 *   准写  —— 白名单，相对于根的前缀数组。空数组＝这道闸底下什么都不许写。
 *   禁写  —— 白名单内部再挖掉的洞。少用；它是黑名单，只在「准写某目录但其中一个子目录不行」时用。
 */
function 建闸(规) {
  const 根 = path.resolve(规.根);
  const 准 = (规.准写 || []).map((x) => 归一(path.join(根, x)));
  const 禁 = (规.禁写 || []).map((x) => 归一(path.join(根, x)));

  /**
   * 这个路径能不能写。**返回原因，不只返回真假**——
   * 「为什么不给写」比「不给写」有用得多，没有原因的拒绝会让人去猜。
   */
  function 判(目标) {
    const 绝 = path.resolve(目标);
    if (!在其下(绝, 根)) {
      return { 行: false, 因: `不在这道闸的管辖里（根是 ${根}）` };
    }
    // 先看禁写（白名单里挖的洞），再看白名单——洞优先，否则洞就没意义
    for (const d of 禁) {
      if (在其下(绝, d)) return { 行: false, 因: `落在禁写区 ${d}` };
    }
    for (const a of 准) {
      if (在其下(绝, a)) return { 行: true, 因: `在准写区 ${a}` };
    }
    return {
      行: false,
      因: 准.length
        ? `不在准写区。这道闸只准写：${(规.准写 || []).join('、')}`
        : '这道闸底下什么都不许写',
    };
  }

  /**
   * 领一张令牌。**领的时候就要说清写哪儿**——
   * 声明与实际不符时 写() 会 throw，所以「谁想写哪儿」在事发前就可审。
   */
  function 领(目标, 为什么) {
    const r = 判(目标);
    if (!r.行) {
      const e = new Error(`写闸拒绝：${目标}\n  原因：${r.因}\n  用途：${为什么 || '（没说）'}`);
      e.code = '写闸拒绝';
      e.目标 = 目标;
      e.因 = r.因;
      throw e;
    }
    return { 目标: path.resolve(目标), 为什么: 为什么 || '', 闸根: 根, __令牌: true };
  }

  return { 根, 判, 领 };
}

/**
 * 写。**必须拿令牌来**，而且令牌上写的目标要与实际一致。
 *
 * 为什么不做成 `写(路径, 内容)` 顺手判一下：因为那样调用方可以不判就写，
 * 而「忘了判」和「判了通过」在代码里长得一模一样。要令牌，是为了让
 * 「没过闸」变成一个**写不出来的状态**，而不是一个需要人记得的规矩。
 */
function 写(令牌, 内容, 选项) {
  验令牌(令牌);
  const 目标 = 令牌.目标;
  const o = 选项 || {};
  if (o.建目录 !== false) fs.mkdirSync(path.dirname(目标), { recursive: true });
  fs.writeFileSync(目标, 内容, o.编码 || 'utf8');
  return { 写了: 目标, 字节: Buffer.byteLength(内容, o.编码 || 'utf8') };
}

/** 追加。事件流、台账这类只增不改的东西走它。 */
function 追加(令牌, 内容, 选项) {
  验令牌(令牌);
  const o = 选项 || {};
  if (o.建目录 !== false) fs.mkdirSync(path.dirname(令牌.目标), { recursive: true });
  fs.appendFileSync(令牌.目标, 内容, o.编码 || 'utf8');
  return { 追加到: 令牌.目标, 字节: Buffer.byteLength(内容, o.编码 || 'utf8') };
}

function 验令牌(令牌) {
  if (!令牌 || 令牌.__令牌 !== true) {
    const e = new Error('写闸：没有令牌。写数据区必须先 领(目标, 为什么)');
    e.code = '写闸无令牌';
    throw e;
  }
  if (!path.isAbsolute(令牌.目标)) {
    const e = new Error('写闸：令牌上的目标不是绝对路径');
    e.code = '写闸坏令牌';
    throw e;
  }
}

module.exports = { 建闸, 写, 追加, 归一, 在其下 };
