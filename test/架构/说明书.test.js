// 说明书.test.js —— **让说明书不会漂**。
//
// 制作人 2026-09-02 拍板重搭时提的要求原话是「让我们一直有一份很清晰的说明书」。
// 文档会漂移，唯一的原因是**它漂移的时候没有任何东西会响**。所以说明书在这里
// 不是文档，是判据的一部分：
//
//   声明了没建 → 红        建了没声明 → 红
//   职责写成 TODO → 红      导出对不上 → 红
//   跨层反向依赖 → 红       待建项没写职责 → 红
//
// 而且这张表的「待建」那一节就是**回归条件**：它清空之日，新仓可以取代旧仓。
// 这一条也是制作人当晚定的（Q19 由 Q20 的答案定死）。
//
// 本仓口径 H104：判据必须验行为、且能自证能红。这个文件的每一条都能红——
// 证法写在 test/架构/说明书自证.md 里，不是靠这段注释保证。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const 仓根 = path.join(__dirname, '..', '..');
const 表 = JSON.parse(fs.readFileSync(path.join(仓根, 'docs', '模块.json'), 'utf8'));

const 在 = (p) => fs.existsSync(path.join(仓根, p));
const 读 = (p) => fs.readFileSync(path.join(仓根, p), 'utf8');

// 层键 → 层定义
const 层表 = new Map(表.层.map((l) => [l.键, l]));

// ── 一、声明的东西真的在 ──────────────────────────────────────────

test('书① 每个模块声明的文件都存在', () => {
  for (const m of 表.模块) {
    assert.ok(在(m.文件), `模块「${m.键}」声明了 ${m.文件}，盘上没有`);
  }
});

test('书② 每个模块都有自己的判据文件，且里面真的有断言', () => {
  for (const m of 表.模块) {
    assert.ok(m.判据, `模块「${m.键}」没写判据字段`);
    assert.ok(在(m.判据), `模块「${m.键}」的判据 ${m.判据} 不存在`);
    const 源 = 读(m.判据);
    const n = (源.match(/\bassert\./g) || []).length;
    assert.ok(n > 0, `模块「${m.键}」的判据文件里一个 assert 都没有——空判据比没判据坏，它看起来像验过了`);
  }
});

test('书③ 声明的导出，require 出来真的有', () => {
  for (const m of 表.模块) {
    const mod = require(path.join(仓根, m.文件));
    for (const 名 of (m.导出 || [])) {
      assert.ok(Object.prototype.hasOwnProperty.call(mod, 名),
        `模块「${m.键}」说它导出 ${名}，实际没有。导出面是说明书的一部分，改了要一起改`);
    }
  }
});

// ── 二、建了的东西说明书上真的有 ────────────────────────────────
//
// 这一条挡的是反方向：**加了模块忘了写进说明书**。
// 只有这一条在，说明书才不会变成「写的时候对、之后越来越旧」的那种文档。

test('书④ 层目录下的每个 .js 都在说明书里（加了东西不写会红）', () => {
  const 声明 = new Set(表.模块.map((m) => m.文件.replace(/\\/g, '/')));
  const 漏 = [];
  for (const l of 表.层) {
    const 目录 = path.join(仓根, l.目录);
    if (!fs.existsSync(目录)) continue;
    const 走 = (d) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const p = path.join(d, e.name);
        if (e.isDirectory()) { 走(p); continue; }
        if (!e.name.endsWith('.js')) continue;
        const 相对 = path.relative(仓根, p).replace(/\\/g, '/');
        if (!声明.has(相对)) 漏.push(相对);
      }
    };
    走(目录);
  }
  assert.deepStrictEqual(漏, [],
    `这些文件在盘上但说明书里没有：${漏.join('、')}。要么写进 docs/模块.json，要么删掉`);
});

// ── 三、说明书本身写得像句人话 ──────────────────────────────────

test('书⑤ 每一项都有职责，且不是占位符', () => {
  const 坏词 = /TODO|待补|待填|待定|暂无|xxx|占位/i;
  for (const 项 of [...表.模块, ...表.待建, ...表.层]) {
    const 键 = 项.键;
    assert.ok(项.负责 && 项.负责.trim().length >= 8,
      `「${键}」的职责太短或为空——一句写不清楚的模块，多半是还没想清楚`);
    assert.ok(!坏词.test(项.负责), `「${键}」的职责里有占位符：${项.负责}`);
  }
});

test('书⑥ 职责不许写成一篇文章（写不短说明这个模块该拆）', () => {
  for (const 项 of [...表.模块, ...表.待建]) {
    assert.ok(项.负责.length <= 200,
      `「${项.键}」的职责 ${项.负责.length} 字，超过 200。说明书是给人一眼看懂的，长了就该拆模块`);
  }
});

test('书⑦ 每个模块与待建项的层都是真存在的层', () => {
  for (const 项 of [...表.模块, ...表.待建]) {
    assert.ok(层表.has(项.层), `「${项.键}」挂在层「${项.层}」上，而说明书里没有这个层`);
  }
});

test('书⑧ 待建 与 模块 的键不许重复（建完要从待建里搬走，不是两边都留）', () => {
  const 已建 = new Set(表.模块.map((m) => m.键));
  for (const w of 表.待建) {
    assert.ok(!已建.has(w.键),
      `「${w.键}」同时在 模块 和 待建 里。建完了就从 待建 搬走——两边都留会让「还剩多少」这个数字失真，而那个数字是回归条件`);
  }
});

// ── 四、依赖方向 ────────────────────────────────────────────────
//
// 分层不是文件夹分一下就算数的。这一条按**实际 require** 判，
// 不按说明书里写的 依赖 字段判——写的那份会跟真的分家，真的那份不会。

test('书⑨ 实际 require 不跨层反向（分层被穿透会红）', () => {
  const 层名们 = 表.层.map((l) => l.键);
  const 犯 = [];
  for (const m of 表.模块) {
    const 层 = 层表.get(m.层);
    const 准 = new Set([m.层, ...(层.可依赖 || [])]);
    const 源 = 读(m.文件);
    const re = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    let g;
    while ((g = re.exec(源))) {
      const 路 = g[1];
      if (!路.startsWith('.')) continue;                  // 内置模块与 npm 包不判
      const 绝 = path.resolve(path.dirname(path.join(仓根, m.文件)), 路);
      const 相 = path.relative(仓根, 绝).replace(/\\/g, '/');
      const 头 = 相.split('/')[0];
      if (!层名们.includes(头)) continue;                 // 不在任何层目录里，不判
      if (!准.has(头)) {
        犯.push(`${m.键}（${m.层}层）require 了 ${相}（${头}层）`);
      }
    }
  }
  assert.deepStrictEqual(犯, [],
    `跨层反向依赖：\n  ${犯.join('\n  ')}\n层的可依赖表在 docs/模块.json 的「层」一节`);
});

// ── 五、回归条件 ────────────────────────────────────────────────

test('书⑩ 回归条件是可数的：待建还剩几项', () => {
  const 剩 = 表.待建.length;
  const 建 = 表.模块.length;
  // 这条永远绿——它存在是为了把进度打进判据输出里，让每次 npm test 都报一次账。
  // **不要给它加断言把它变成会红的**：进度慢不是缺陷。
  assert.ok(剩 >= 0);
  console.log(`    ↳ 说明书进度：已建 ${建} · 待建 ${剩} · 明确不带 ${表.不带.length}`);
  console.log(`    ↳ 回归条件：待建清空 = 新仓可取代旧仓`);
});
