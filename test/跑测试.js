// 跑测试.js —— 全量判据执行器。
//
// 三条旧账，每条都在这里堵着：
//
// ① **不用 `node test/*.test.js` 串 &&。** 一红吞五十二——排第 8 的套件一红，
//    后面 52 个一次都不跑，而屏上只看到一条错。这里一律跑完，最后统一报账。
//
// ② **计数正则认 `ℹ pass` 不认 `# pass`。** 首版写的是 `# pass`，于是每个套件
//    都报「0 项」而整体报绿——执行器数不出断言却说全过，比不报还坏。
//    （同族旧案：换装闸写的是 U+2717「✗」而 node 打的是 U+2716「✖」，
//     那道闸对全量输出的计数恒为 0，二十几个文件失败一个不漏地放过去。）
//
// ③ **零断言算红。** 一个什么都没跑的套件，和一个全过的套件，在「没报错」这件事上
//    长得一模一样。空套件必须自己喊出来。
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const 根 = path.join(__dirname);
const 套件 = [];
const 走 = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    if (e.isDirectory()) { 走(p); continue; }
    if (e.name.endsWith('.test.js')) 套件.push(p);
  }
};
走(根);
套件.sort();

if (!套件.length) {
  console.error('一个套件都没找到 —— 这本身就是红');
  process.exit(1);
}

/** 从 node --test 的输出里取数。两种口径都认，取到哪个算哪个。 */
function 取数(出, 键) {
  const m = new RegExp(`^(?:ℹ|#)\\s*${键}\\s+(\\d+)`, 'm').exec(出);
  return m ? Number(m[1]) : null;
}

let 红 = 0;
let 断言 = 0;
const 起 = Date.now();
const 账 = [];

for (const s of 套件) {
  const 名 = path.relative(根, s).replace(/\\/g, '/');
  const r = spawnSync(process.execPath, ['--test', s], {
    encoding: 'utf8',
    env: { ...process.env, NODE_OPTIONS: '' },
  });
  const 出 = (r.stdout || '') + (r.stderr || '');
  const 过 = 取数(出, 'pass');
  const 败 = 取数(出, 'fail');

  // 数不出来 = 执行器瞎了，按红算。**不许当成 0 然后报绿。**
  if (过 === null || 败 === null) {
    红 += 1;
    账.push(`✖ ${名}   执行器数不出 pass/fail —— 输出口径变了？`);
    账.push(出.split('\n').slice(-12).map((l) => '    ' + l).join('\n'));
    continue;
  }

  断言 += 过;

  if (败 > 0 || r.status !== 0) {
    红 += 1;
    账.push(`✖ ${名}   过 ${过} · 红 ${败}`);
    // 红了就把原文打出来 —— 截尾判绿是这个仓的旧案
    账.push(出.split('\n')
      .filter((l) => /not ok|Error|AssertionError|expected|actual/.test(l))
      .slice(0, 30).map((l) => '    ' + l).join('\n'));
  } else if (过 === 0) {
    红 += 1;
    账.push(`✖ ${名}   零断言 —— 空套件与全过在「没报错」上长得一样，所以它算红`);
  } else {
    账.push(`✓ ${名}   ${过} 项`);
    for (const l of 出.split('\n')) if (l.includes('↳')) 账.push(l.replace(/^\s*/, '    '));
  }
}

console.log(账.join('\n'));
const 秒 = ((Date.now() - 起) / 1000).toFixed(1);
console.log('');
console.log(`══ 套件 ${套件.length} · 断言 ${断言} · 耗时 ${秒}s · 红 ${红} ══`);
process.exit(红 ? 1 : 0);
