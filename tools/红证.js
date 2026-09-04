// 红证.js —— 变异台种子：把实现改坏一处，要求对应判据当场红，再还原。
//
// 本仓口径 H104：判据必须自证能红。绿不算数——一条从来没红过的判据，
// 跟一条恒真的判据在「没报错」上长得一模一样。
//
// **写成 Node 不写成 bash**：首版用 bash，中文变量名 `过` 被 shell 吃掉
// （`$'�\207=0': command not found`），四条全报「没红」——假阴性，还差点被当真。
// 这里全 ASCII 标识符、spawnSync 不过 shell、文本替换走 fs 不走 sed。
//
// 用法：node tools/红证.js            跑全表
//       node tools/红证.js 状态机     只跑名字含「状态机」的
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

// 每条：{ name, file, find, replace, test, expectRedCase }
//   find/replace 是实现文件里的原文与坏文；expectRedCase 是判据文件里该红的用例名片段。
const TABLE = [
  {
    name: '状态机：在途→初检 不要证据包',
    file: '领域/状态机.js',
    find: "'在途→初检': (凭) => 凭.产物 ? null : '进初检要证据包（产物），没有等于没干完',",
    replace: "'在途→初检': () => null,",
    test: 'test/领域/状态机.test.js',
    expectRedCase: '假模型①',
  },
  {
    name: '状态机：方案不要人判也能完成',
    file: '领域/状态机.js',
    find: "if (要人判 && 凭.闸.人判 !== '通过') return",
    replace: 'if (false) return',
    test: 'test/领域/状态机.test.js',
    expectRedCase: '假模型③',
  },
  {
    name: '状态机：凭里塞「模型说可以」就放行',
    file: '领域/状态机.js',
    find: "  if (要凭[k]) {",
    replace: "  if (要凭[k] && !p.模型说可以) {",
    test: 'test/领域/状态机.test.js',
    expectRedCase: '假模型⑤',
  },
  {
    name: '单型：归属二选一不查',
    file: '领域/单型.js',
    find: 'if (有专项 === 有特性) {',
    replace: 'if (false) {',
    test: 'test/领域/单型.test.js',
    expectRedCase: '型③',
  },
  {
    name: '单型：修复不要防复发判据',
    file: '领域/单型.js',
    find: "if (单.性质 === '修复' && !单.防复发判据)",
    replace: 'if (false)',
    test: 'test/领域/单型.test.js',
    expectRedCase: '型⑨',
  },
  {
    name: '单型：末单规则不查',
    file: '领域/单型.js',
    find: 'if (专项.产出类型 && 型 && 型 !== 专项.产出类型) {',
    replace: 'if (false) {',
    test: 'test/领域/单型.test.js',
    expectRedCase: '型⑮',
  },
  {
    name: '写闸：路径比对退化成字符串前缀',
    file: '内核/写闸.js',
    find: "  return x === y || x.startsWith(y + '/');",
    replace: '  return x.startsWith(y);',
    test: 'test/内核/写闸.test.js',
    expectRedCase: '闸⑥',
  },
  {
    name: '路径：便携态也编一个仓根出来',
    file: '内核/路径.js',
    find: "  if (形态(env) === '便携') return null;",
    replace: "  if (false) return null;",
    test: 'test/内核/路径.test.js',
    expectRedCase: '径③',
  },
  {
    name: '协议：改状态工具不拦',
    file: '领域/协议.js',
    find: "for (const t of 工具) if (/改.*状态|迁移|move_state|set_state/i.test(String(t)))",
    replace: 'for (const t of 工具) if (false)',
    test: 'test/领域/协议.test.js',
    expectRedCase: '议⑤',
  },
  {
    name: '权限：工单要没给的目录就放宽',
    file: '领域/权限.js',
    find: "if (!被覆盖(d, s.可碰目录 || [])) throw new 放宽拒绝(",
    replace: 'if (false) throw new 放宽拒绝(',
    test: 'test/领域/权限.test.js',
    expectRedCase: '权③',
  },
  {
    name: '证据：契约版本不比',
    file: '内核/证据.js',
    find: 'if (包.契约版本 !== 契约版本) {',
    replace: 'if (false) {',
    test: 'test/内核/证据.test.js',
    expectRedCase: '证⑤',
  },
  {
    name: '适配器：执行席也能写执行池',
    file: '编排/适配器.js',
    find: "if (!协议.能指定下属harness(上级协议)) {",
    replace: 'if (false) {',
    test: 'test/编排/适配器.test.js',
    expectRedCase: '配④',
  },
  {
    name: '适配器-claude：写闸钩子永远放行',
    file: '编排/适配器-claude.js',
    find: "    if (r.行) return {};",
    replace: '    if (true) return {};',
    test: 'test/编排/适配器-claude.test.js',
    expectRedCase: '克②',
  },
  {
    name: '装配器：人格层进了执行卷',
    file: '编排/装配器.js',
    find: "  段.push(`职能：${声.职能}`);",
    replace: "  段.push(`职能：${声.职能}`); 段.push(`称呼：${(协议.人格语气||{}).称呼}`);",
    test: 'test/编排/装配器.test.js',
    expectRedCase: '装④',
  },
  {
    name: '校验：空改动也放行',
    file: '领域/校验.js',
    find: "if (改.length === 0) 违.push(",
    replace: 'if (false) 违.push(',
    test: 'test/领域/校验.test.js',
    expectRedCase: '检③',
  },
  {
    name: '出说明书：单元格里的竖线不转义',
    file: 'tools/出说明书.js',
    find: ".replace(/\\|/g, '\\\\|')",
    replace: ".replace(/\\|/g, '|')",
    test: 'test/架构/说明书.test.js',
    expectRedCase: '书⑭',
    // 书⑬ 会用坏生成器把说明书重生成一遍，源码还原后盘上的生成物还是坏的；
    // 不善后，「还原后全量」会因 ⑬ 不一致而红——不是实现坏了，是现场没清。
    善后: 'tools/出说明书.js',
  },
  {
    name: '出说明书：四层字段不从 docs/单型 渲染',
    file: 'tools/出说明书.js',
    find: '  const 字段们 = Object.entries(S.字段 || {});',
    replace: '  const 字段们 = [];',
    test: 'test/架构/说明书.test.js',
    expectRedCase: '书⑯',
    善后: 'tools/出说明书.js',
  },
];

const filter = process.argv[2] || '';
const rows = TABLE.filter((r) => r.name.includes(filter));
let passed = 0;
const failed = [];

for (const r of rows) {
  const abs = path.join(ROOT, r.file);
  const orig = fs.readFileSync(abs, 'utf8');
  if (!orig.includes(r.find)) {
    failed.push(`${r.name}：锚点没命中——实现改了，这条变异静默失效（比没红更坏，它看起来像通过）`);
    continue;
  }
  fs.writeFileSync(abs, orig.replace(r.find, r.replace), 'utf8');
  let out = '';
  try {
    // **相对路径、正斜杠。** Node 21+ 的 --test 把位置参数当 glob 解析，
    // Windows 绝对路径里的反斜杠（\G \g …）被当成转义吃掉 → 匹配零个文件 →
    // 输出只剩「ℹ tests 0」。首版就是这样：8 条全报「没红」，其实一个测试都没跑。
    // **强制 tap 报告器。** 不强制的话 Node 按「stdout 是不是 TTY」选 spec 或 tap，
    // spawnSync 下在这台 Windows 上给的是 spec（打 ✔/✖，没有 ok/not ok），
    // 我对着尾巴猜了三次格式全猜错。确定性比猜强。
    const p = spawnSync(process.execPath, ['--test', '--test-reporter=tap', r.test.replace(/\\/g, '/')], { encoding: 'utf8', cwd: ROOT, timeout: 60000 });
    out = (p.stdout || '') + (p.stderr || '');
  } finally {
    fs.writeFileSync(abs, orig, 'utf8');   // 无论如何还原
    if (r.善后) spawnSync(process.execPath, [r.善后], { cwd: ROOT, timeout: 60000 });   // 还原源码后清现场（重生成等）
  }
  // 零测试也是失败：一个什么都没跑的套件，跟一个全过的套件在「没报错」上长得一样
  const ran = /^(?:ℹ|#)\s*tests\s+(\d+)/m.exec(out);
  if (ran && Number(ran[1]) === 0) {
    failed.push(`${r.name}：判据文件一个测试都没跑（ℹ tests 0）——路径没匹配上`);
    console.log(`  FAIL ${r.name}  零测试`);
    continue;
  }
  const redLine = out.split('\n').find((l) => /^\s*not ok/.test(l) && l.includes(r.expectRedCase));
  if (redLine) { passed += 1; console.log(`  ok   ${r.name}  → ${r.expectRedCase} 红了`); }
  else {
    failed.push(`${r.name}：改坏了但 ${r.expectRedCase} 没红`);
    console.log(`  FAIL ${r.name}`);
    const lines = out.split('\n');
    const shown = lines.filter((l) => /^\s*(ok|not ok)/.test(l)).slice(0, 6);
    console.log((shown.length ? shown : lines.slice(-8)).map((l) => '       ' + l).join('\n'));
  }
}

// 还原后全量复跑：证明没把实现留在坏的状态
const back = spawnSync(process.execPath, ['test/跑测试.js'], { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
const backOk = back.status === 0;
console.log('');
console.log(`红证 ${passed}/${rows.length}${failed.length ? '\n  ' + failed.join('\n  ') : ''}`);
console.log(`还原后全量：${backOk ? '绿' : '**红——实现被留在坏的状态，立刻查**'}`);
process.exit(passed === rows.length && backOk ? 0 : 1);
