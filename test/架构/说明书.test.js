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

// ── 六、仓的目录本身也要有说明书 ────────────────────────────────
//
// 2026-09-03 制作人看着本地文件夹问「这些都什么东西」。
// 当时说明书只写了模块，**没写目录本身**——十个顶层条目没有一个有解释，
// 而且六个层目录还是空的，git 不跟踪空目录，GitHub 上根本看不见它们。
//
// 「目录里放什么」是最常被问、最容易过期的一种知识。所以它也进正本、也上判据。

test('书⑪ 每个顶层目录与文件都在 目录 表里（加了不写会红）', () => {
  const 表里 = new Set((表.目录 || []).map((d) => d.名));
  const 忽略 = new Set(['.git', 'node_modules', '.gitignore']);
  const 漏 = [];
  for (const e of fs.readdirSync(仓根, { withFileTypes: true })) {
    if (忽略.has(e.name)) continue;
    if (e.name.startsWith('.') && !表里.has(e.name)) continue;   // 点文件按需登记
    if (!表里.has(e.name)) 漏.push(e.name);
  }
  assert.deepStrictEqual(漏, [],
    `这些顶层条目没有说明：${漏.join('、')}。写进 docs/模块.json 的「目录」一节`);
});

test('书⑫ 目录 表里说的东西盘上真的有（写了没建也会红）', () => {
  for (const d of (表.目录 || [])) {
    assert.ok(在(d.名), `目录表里写了「${d.名}」，盘上没有`);
    assert.ok(d.装什么 && d.装什么.length >= 8, `「${d.名}」的「装什么」太短`);
    assert.ok(d.谁改 && d.谁改.trim(), `「${d.名}」没写谁往里放东西`);
  }
});

test('书⑬ 所有生成物都与正本一致（手改生成的文件会被抓）', () => {
  // git 不跟踪空目录：层目录还没有代码时，说明.md 就是它在仓里存在的唯一凭据。
  // 「与正本一致」用**先全量快照、再重生成一次、最后逐份比对**来判。
  //
  // **首版把它拆成了两条（⑬ 管层说明、⑭ 管总说明书），结果 ⑭ 恒真**：
  // ⑬ 里那次 execFileSync 已经把 说明书.md 一起重生成了，等 ⑭ 去读「旧值」时
  // 证据早被自己人抹掉了。实测：手改 docs/说明书.md，整套仍然全绿。
  // 一条判据把另一条判据要验的现场清理了——所以它们必须合成一条。
  const { execFileSync } = require('node:child_process');
  const 生成物 = ['docs/说明书.md', ...表.层.map((l) => path.join(l.目录, '说明.md'))];

  const 快照 = new Map();
  for (const p of 生成物) {
    assert.ok(在(p), `缺 ${p}——跑一次 npm run 说明书`);
    快照.set(p, 读(p));                       // **先全部读完，再重生成**
  }
  execFileSync(process.execPath, [path.join(仓根, 'tools', '出说明书.js')], { cwd: 仓根 });
  const 不一致 = [];
  for (const [p, 旧] of 快照) if (读(p) !== 旧) 不一致.push(p);
  assert.deepStrictEqual(不一致, [],
    `这些生成物与正本不一致，有人手改了：${不一致.join('、')}
` +
    '改 docs/模块.json 然后 npm run 说明书');
});

test('书⑭ 生成的每张表，每行格数等于表头格数（单元格里的竖线切坏表格会红）', () => {
  // 09-04 晨制作人抓的：性质签名「资产|方案」没转义，修复那一行被切成六格，
  // 表头多出两列空的，「出」列显示成「方案」。⑬ 抓不到——它只比生成物与正本一致，
  // 正本本来就是那样，生成器忠实地把它渲染坏了。这条直接验渲染结果的形状。
  const 生成物 = ['docs/说明书.md', ...表.层.map((l) => path.join(l.目录, '说明.md'))];
  const 切 = (行) => 行.split(/(?<!\\)\|/).slice(1, -1);   // 只按**未转义**的竖线切，去掉首尾空段
  const 坏 = [];
  for (const p of 生成物) {
    const 行们 = 读(p).split('\n');
    for (let i = 0; i + 1 < 行们.length; i++) {
      if (!/^\|/.test(行们[i]) || !/^\|\s*:?-+/.test(行们[i + 1])) continue;   // 表头 + 分隔行才是一张表
      const N = 切(行们[i]).length;
      for (let j = i + 2; j < 行们.length && /^\|/.test(行们[j]); j++) {
        const n = 切(行们[j]).length;
        if (n !== N) 坏.push(`${p}:${j + 1} 有 ${n} 格，表头 ${N} 格：${行们[j].slice(0, 40)}…`);
      }
    }
  }
  assert.deepStrictEqual(坏, [], `表格被切坏了：\n  ${坏.join('\n  ')}`);
});

// ── 七、系统：能自己转起来的一圈 ────────────────────────────────
//
// 2026-09-03 两次被制作人打回来才写对：
//   ① 第一版说明书里全是零件（写闸、状态机、装配器），一条「能干什么」都没有
//      —— 照零件表建，建完可能发现没人用得上；
//   ② 补了 20 条功能之后又被打回：「我想要的是系统是系统，能自己闭环的系统，
//      不是这种碎片化的功能」——「查一张单」「排期」不是系统，是按钮。
//
// 所以正本上的顶层单位是**系统**：一圈自己转得起来的东西。功能是环上的某一节。
// 那 20 条旧稿留在 功能旧稿 里当参照，不删——它们是环上的节点清单。

const 系统 = 表.系统 || [];
const 全模块键 = new Set([...表.模块.map((m) => m.键), ...表.待建.map((w) => w.键)]);
const 地基键 = new Set([...表.模块, ...表.待建].filter((m) => m.地基).map((m) => m.键));

test('系① 每个系统都说清了这一圈怎么转、人在哪介入、凭什么算闭上了', () => {
  assert.ok(系统.length > 0, '说明书里一个系统都没有——那这个仓在建什么？');
  const 坏词 = /TODO|待补|待填|暂无|占位/i;
  for (const s of 系统) {
    assert.ok(s.名 && s.状态, `系统「${s.键}」缺 名 或 状态`);
    assert.ok(['已闭环', '在建', '已声明未设计'].includes(s.状态),
      `系统「${s.键}」的状态「${s.状态}」不是三档之一`);
    if (s.状态 === '已声明未设计') {
      // 「一定要有但还没想好怎么做」是合法状态——制作人对「职业规划与方法论沉淀」
      // 的原话就是这个。但它必须写清**为什么一定要有**，否则每次排期都会被更急的事挤掉。
      assert.ok(s.为什么一定要有 && s.为什么一定要有.length >= 20,
        `系统「${s.键}」标了「已声明未设计」，那就必须写「为什么一定要有」——` +
        '不写的话，它会在每次排期时被更急的事挤掉，而没有任何东西会提醒你');
      continue;
    }
    assert.ok(Array.isArray(s.这一圈) && s.这一圈.length >= 3,
      `系统「${s.键}」的「这一圈」少于 3 步——两步转不成圈`);
    assert.ok(s.凭什么算闭上了 && s.凭什么算闭上了.length >= 15 && !坏词.test(s.凭什么算闭上了),
      `系统「${s.键}」的「凭什么算闭上了」缺失或是占位符。它是这一圈的验收标准，要能照着跑一遍`);
    assert.ok(Array.isArray(s.人在哪介入),
      `系统「${s.键}」没写人在哪一步介入——一个环里人插在哪儿，是这个环最重要的设计`);
  }
});

test('系② 系统「靠」的每个模块都真在说明书里', () => {
  const 空 = [];
  for (const s of [...系统, ...(表.系统之外 || [])]) {
    for (const k of (s.靠 || [])) if (!全模块键.has(k)) 空.push(`${s.键 || s.什么} → ${k}`);
  }
  assert.deepStrictEqual(空, [], `指向了说明书里没有的模块：${空.join('、')}`);
});

test('系③ 每个模块都归了某个系统（没人要的零件会红）', () => {
  const 用到 = new Set();
  for (const s of [...系统, ...(表.系统之外 || [])]) for (const k of (s.靠 || [])) 用到.add(k);
  const 孤儿 = [...全模块键].filter((k) => !用到.has(k) && !地基键.has(k)).sort();
  assert.deepStrictEqual(孤儿, [],
    `这些模块不属于任何系统：${孤儿.join('、')}
` +
    '要么归进某个系统的「靠」，要么标 地基:true 并写理由，要么放进「系统之外」等制作人归位，' +
    '要么删掉——造了没人用的零件是这个仓最贵的一种浪费');
});

test('系④ 标了地基就必须写理由', () => {
  for (const m of [...表.模块, ...表.待建]) {
    if (!m.地基) continue;
    assert.ok(m.地基理由 && m.地基理由.length >= 10,
      `「${m.键}」标了地基却没写理由。地基免于系③ 那条查，所以它必须自己说清凭什么`);
  }
});

test('系⑤ 「系统之外」的每一条都要说清为什么还没归位', () => {
  // **名字类字段只查非空，散文类才查长度。**
  // 一刀切定长度这个错今晚犯了三次：4 判掉「制作人」、8 判掉「跟坐席说话」、
  // 8 又判掉「额度与凭据」。每次红的都是判据自己写错，而人会先去改实现。
  // 名字本来就短，它不需要「有内容」这个门槛——非空就够了。
  const 名字类 = new Set(['什么']);
  for (const x of (表.系统之外 || [])) {
    for (const k of ['什么', '现状', '为什么单列', '待明确']) {
      const v = String(x[k] || '').trim();
      assert.ok(v.length > 0, `系统之外「${x.什么 || '?'}」缺「${k}」`);
      if (!名字类.has(k)) {
        assert.ok(v.length >= 15,
          `系统之外「${x.什么}」的「${k}」太短（${v.length} 字）——这几栏是要说清楚事的`);
      }
    }
  }
});

test('系⑥ 每条待明确都标了态，且态是三档之一', () => {
  // 「待明确」原来是一串字符串，现在是三态的对象——因为它们不再是一堆问号了：
  // 有的他已经答了，有的我从旧仓里挖到了答案只等他点头，只有极少数是真的没人知道。
  // **不分态的话，进度那行会一直报「待明确 15 处」**，而真正拦着开工的只有 2 处。
  // 一个不随口径更新的数字，比没有这个数字坏。
  const 态们 = new Set(['已答', '已答·与旧仓不同', '查到了待确认', '待答']);
  for (const s of 系统) {
    for (const q of (s.待明确 || [])) {
      assert.strictEqual(typeof q, 'object', `系统「${s.键}」的待明确里有一条不是对象（旧的字符串写法）`);
      assert.ok(态们.has(q.态), `系统「${s.键}」有一条待明确的态是「${q.态}」，不是四档之一`);
      assert.ok(q.问 && q.问.length >= 5, `系统「${s.键}」有一条待明确没写「问」`);
      if (q.态.startsWith('已答')) {
        assert.ok(q.他答 && q.他答.length >= 5, `「${q.问}」标了已答却没记下他答的是什么`);
      }
      if (q.态 === '查到了待确认') {
        // 挖到的答案必须带依据。没有 file:line 的「我查到了」等于「我猜的」。
        assert.ok(q.查到的 && q.查到的.length >= 20, `「${q.问}」标了查到了却没写查到什么`);
        assert.ok(q.依据 && /[:：]\d|\.md|\.js|\.json/.test(q.依据),
          `「${q.问}」的依据里没有 file:line —— 没有依据的「我查到了」等于「我猜的」`);
        assert.ok(q.还要确认 && q.还要确认.length >= 8, `「${q.问}」没写要他确认什么`);
      }
    }
  }
});

test('系⑦ 报账：三态各几条，真正拦着开工的是哪几条', () => {
  const 全 = 系统.flatMap((s) => (s.待明确 || []).map((q) => ({ ...q, 系统: s.名 })));
  const 已 = 全.filter((q) => String(q.态).startsWith('已答'));
  const 查 = 全.filter((q) => q.态 === '查到了待确认');
  const 待 = 全.filter((q) => q.态 === '待答');
  const 外 = (表.系统之外 || []).length;
  assert.ok(全.length >= 0);   // 永远绿：这条是报账不是判缺陷
  const 闭 = 系统.filter((s) => s.状态 === '已闭环').length;
  const 建 = 系统.filter((s) => s.状态 === '在建').length;
  const 未 = 系统.filter((s) => s.状态 === '已声明未设计').length;
  console.log(`    ↳ 系统 ${系统.length}：已闭环 ${闭} · 在建 ${建} · 已声明未设计 ${未}`);
  console.log(`    ↳ 待明确 ${全.length}：已答 ${已.length} · 查到了待确认 ${查.length} · **真待答 ${待.length}**（另有 ${外} 项没归位）`);
  if (待.length) {
    console.log(`    ↳ 拦着开工的：${待.map((q) => q.系统 + '「' + q.问.slice(0, 18) + '…」').join(' · ')}`);
  }
});