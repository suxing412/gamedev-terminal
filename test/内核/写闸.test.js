// 写闸.test.js —— 这道闸真的挡得住吗。
//
// 全部在临时目录里做**真的读写**，不 mock fs：这道闸唯一的价值就是「真的写不进去」，
// mock 掉 fs 之后验的是「我的 if 写对了」，那是另一件事，而且是没用的那件事。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const 闸 = require('../../内核/写闸.js');

function 造盘() {
  const 根 = fs.mkdtempSync(path.join(os.tmpdir(), '写闸-'));
  for (const d of ['文档', '文档/策划', '待派', '归档', 'journal', '文档.备份']) {
    fs.mkdirSync(path.join(根, d), { recursive: true });
  }
  return 根;
}

function 造闸(根) {
  return 闸.建闸({ 根, 准写: ['文档'], 禁写: ['文档/策划/锁死的'] });
}

test('闸① 准写区能写，而且文件真的落盘了', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  const t = g.领(path.join(根, '文档', 'a.md'), '判据');
  闸.写(t, '你好');
  assert.strictEqual(fs.readFileSync(path.join(根, '文档', 'a.md'), 'utf8'), '你好');
});

test('闸② 准写区之外的，领令牌就 throw（不是返回 false）', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  // 返回 false 会被忽略，异常不会。这是这道闸的设计核心。
  assert.throws(() => g.领(path.join(根, '待派', 'TK-999.md'), '偷写工单'),
    (e) => e.code === '写闸拒绝' && /不在准写区/.test(e.message));
  assert.ok(!fs.existsSync(path.join(根, '待派', 'TK-999.md')), '一个字节都不该落盘');
});

test('闸③ 白名单没列的目录默认拦住（漏了是写不了，不是能写）', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  // 这一条是黑名单做不到的：状态机以后加第十四态，这道闸默认就拦住它，
  // 不需要有人记得回来补表。旧仓的黑名单漏了 6 个活态目录，而漏了没有任何症状。
  fs.mkdirSync(path.join(根, '将来某个新态'));
  assert.throws(() => g.领(path.join(根, '将来某个新态', 'x.md'), '新态'),
    (e) => e.code === '写闸拒绝');
});

test('闸④ 禁写区在白名单里挖洞，洞优先', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  assert.ok(g.判(path.join(根, '文档', '策划', '正常.md')).行, '策划目录本身该能写');
  assert.throws(() => g.领(path.join(根, '文档', '策划', '锁死的', 'x.md'), '试'),
    (e) => /禁写区/.test(e.message));
});

test('闸⑤ 管辖之外的路径一律拒（不是放行）', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  // 「不归我管」的正确反应是拒绝，不是放行。放行的话，一个 ../.. 就出去了。
  assert.throws(() => g.领(path.join(根, '..', '外面.md'), '越界'),
    (e) => /不在这道闸的管辖里/.test(e.message));
  assert.throws(() => g.领('D:/别的地方/x.md', '越界'), (e) => e.code === '写闸拒绝');
});

test('闸⑥ 路径按段比，不按字符串前缀比', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  // 「文档.备份」用 startsWith('文档') 比会被误判成在准写区里 —— 它不是。
  assert.ok(!g.判(path.join(根, '文档.备份', 'x.md')).行,
    '「文档.备份」不在「文档」底下，字符串前缀比会把它放进来');
  assert.ok(g.判(path.join(根, '文档', 'x.md')).行);
});

test('闸⑦ 没令牌写不了（这是「忘了判」与「判了通过」的区别）', () => {
  assert.throws(() => 闸.写(null, 'x'), (e) => e.code === '写闸无令牌');
  assert.throws(() => 闸.写({ 目标: 'D:/x.md' }, 'x'), (e) => e.code === '写闸无令牌');
});

test('闸⑧ 拒绝理由要说清是哪一条规矩挡的（照着它能补）', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  const r = g.判(path.join(根, '归档', 'x.md'));
  assert.strictEqual(r.行, false);
  assert.match(r.因, /只准写/, '要把准写区列出来，否则人不知道该去哪补');
  assert.match(r.因, /文档/);
});

test('闸⑨ 追加不覆盖（事件流、台账靠它）', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  const p = path.join(根, '文档', '流.jsonl');
  闸.追加(g.领(p, '第一行'), '{"a":1}\n');
  闸.追加(g.领(p, '第二行'), '{"a":2}\n');
  assert.strictEqual(fs.readFileSync(p, 'utf8'), '{"a":1}\n{"a":2}\n');
});

test('闸⑩ 准写为空 = 这道闸底下什么都不许写', () => {
  const 根 = 造盘();
  const g = 闸.建闸({ 根, 准写: [] });
  assert.throws(() => g.领(path.join(根, '文档', 'x.md'), '试'),
    (e) => /什么都不许写/.test(e.message));
});

test('闸⑪ 领令牌时要说用途，用途会写进拒绝消息里（事后能查是谁想写）', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  try {
    g.领(path.join(根, 'journal', 'x.log'), '巡检想记一笔');
    assert.fail('该 throw');
  } catch (e) {
    assert.match(e.message, /巡检想记一笔/, '用途要出现在拒绝消息里');
  }
});

test('闸⑫ 会自己建父目录（否则每个调用方都要记得 mkdir）', () => {
  const 根 = 造盘();
  const g = 造闸(根);
  const p = path.join(根, '文档', '深', '一点', 'x.md');
  闸.写(g.领(p, '深目录'), '内容');
  assert.strictEqual(fs.readFileSync(p, 'utf8'), '内容');
});
