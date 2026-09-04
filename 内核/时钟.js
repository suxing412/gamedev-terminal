// 时钟.js —— 可注入的时钟。
//
// 裸 Date.now() 会让一整片逻辑变异不动：排期算不出「过了多久」、闸判不出「逾期」，
// 判据只能等真时间过去。所以领域层不碰真时间——它们收一个 钟（或一个 现在 值），
// 真钟只在编排/接口那一头造一次往下传。
'use strict';

const 分钟 = 60 * 1000;
const 小时 = 60 * 分钟;
const 天 = 24 * 小时;

/** 真钟：只在这里读系统时间。 */
function 真钟() {
  return Object.freeze({
    毫秒: () => Date.now(),
    现在: () => new Date().toISOString(),
  });
}

const 解 = (时) => (typeof 时 === 'number' ? 时 : Date.parse(时));

/** 假钟：从 起 开始不走，拨 才走。判据用它把「过了两天」变成一行代码。 */
function 假钟(起) {
  let t = 起 === undefined ? Date.parse('2026-01-01T00:00:00Z') : 解(起);
  if (Number.isNaN(t)) throw new Error('假钟：起点不是时间');
  return Object.freeze({
    毫秒: () => t,
    现在: () => new Date(t).toISOString(),
    拨: (ms) => { t += Number(ms) || 0; return t; },
    拨到: (时) => { const x = 解(时); if (Number.isNaN(x)) throw new Error('假钟：拨到的不是时间'); t = x; return t; },
  });
}

module.exports = { 真钟, 假钟, 毫秒: Object.freeze({ 分钟, 小时, 天 }) };
