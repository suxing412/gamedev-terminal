// 契约一致性.js —— 五家适配器必须过的同一套比对：同一张夹具单，各家交回的证据包**形状一致**。
//
// 09-02 外审 codex 第 8 条击杀：证据字段改一个名，Harness、每个 Adapter、解析、判据全要同步，
// 漏一处就是「同一张单在不同后端得到不同结论」。这个模块把「五处要记得同步」
// 变成「五处会自己红」：契约改一个字段，所有适配器交回来的包一比对，不同形的当场点名。
//
// 纯函数。跑各家是判据的事（test/契约/一致性.test.js），这里只比。
'use strict';
const 证据 = require('../内核/证据.js');

/**
 * 比对一组包。以第一个为基准，逐个比形状；同时每个包都要过 验包。
 * @param 包们  [{ 家, 包 }]
 * @returns { 一致, 差异: [{ 家, 因 }] }
 */
function 比对(包们) {
  const 差异 = [];
  const 表 = Array.isArray(包们) ? 包们 : [];
  if (表.length === 0) return { 一致: false, 差异: [{ 家: '—', 因: '一个包都没有' }] };
  for (const { 家, 包 } of 表) {
    const r = 证据.验包(包);
    if (!r.行) 差异.push({ 家, 因: `验包不过：${r.违.join('；')}` });
  }
  const 基 = 表[0];
  for (const { 家, 包 } of 表.slice(1)) {
    if (!证据.同形(基.包, 包)) 差异.push({ 家, 因: `与 ${基.家} 不同形：键集 ${键集(包)} vs ${键集(基.包)}` });
  }
  return { 一致: 差异.length === 0, 差异 };
}

function 键集(包) {
  return Object.keys(包 || {}).filter((k) => 包[k] !== undefined).sort().join(',');
}

module.exports = { 比对 };
