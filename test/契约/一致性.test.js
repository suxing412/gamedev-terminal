// 一致性.test.js —— 契约一致性：同一张夹具单，各家交回的证据包形状一致。
//
// 首版只有 Claude 一家真适配器，所以这里配一个「假适配器」当第二家——它的存在就是为了
// 让「五家同形」这条判据从第一天起就在跑，而不是等第二家接上才发现契约早分叉了。
// 假适配器故意用另一条代码路径攒料，只共享 内核/证据.攒包——这正是契约该管的那一层。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const 一致 = require('../../编排/契约一致性.js');
const C = require('../../编排/适配器-claude.js');
const A = require('../../编排/适配器.js');
const Q = require('../../领域/权限.js');
const E = require('../../内核/证据.js');

const 卷 = Q.编译执行卷({ id: 'FX-1' }, { 可碰目录: ['Assets/**'], 可用工具: ['Read', 'Edit'], 禁: [] });
const 进 = A.进方({ id: 'FX-1', 性质: '新建' }, 卷, '夹具单：改一行', 'D:/w');
const 假git = () => ({ 文件: ['Assets/a.cs'], diff: 'd' });
let t = 0; const 假钟 = () => (t += 100);

async function* 假query() {
  yield { type: 'assistant', message: { content: '干活' } };
  yield { type: 'result', subtype: 'success', result: '好了', usage: { input_tokens: 1, output_tokens: 2 } };
}

/** 假适配器：另一家，另一条路攒料。 */
async function 假适配器跑(进方) {
  return {
    单号: 进方.单号,
    harness: { 名: '假家', 版本: '9.9' },
    改动: 假git(),
    日志尾: 'fake tail',
    结果: { 退出: 'completed', 耗时ms: 7, token: { 输入: 3, 输出: 4 } },
    回执: '假家交的回执',
  };
}

test('契① Claude 与假家交回的包同形，比对一致', async () => {
  const a = E.攒包(await C.跑(进, { query: 假query, git改动: 假git, 时钟: 假钟, 版本: 'v' }));
  const b = E.攒包(await 假适配器跑(进));
  const r = 一致.比对([{ 家: 'claude', 包: a }, { 家: '假家', 包: b }]);
  assert.strictEqual(r.一致, true, JSON.stringify(r.差异));
});

test('契② 有一家漏交一项 → 比对点名是哪家、缺什么', async () => {
  const a = E.攒包(await C.跑(进, { query: 假query, git改动: 假git, 时钟: 假钟, 版本: 'v' }));
  const 料 = await 假适配器跑(进); delete 料.日志尾;
  const b = E.攒包(料);
  const r = 一致.比对([{ 家: 'claude', 包: a }, { 家: '假家', 包: b }]);
  assert.strictEqual(r.一致, false);
  assert.ok(r.差异.some((d) => d.家 === '假家' && /日志尾/.test(d.因)), JSON.stringify(r.差异));
  assert.ok(r.差异.some((d) => d.家 === '假家' && /不同形/.test(d.因)));
});

test('契③ 契约版本不同的包混进来 → 验包红，比对不一致', async () => {
  const a = E.攒包(await 假适配器跑(进));
  const b = E.攒包(await 假适配器跑(进)); b.契约版本 = 0;
  const r = 一致.比对([{ 家: '甲', 包: a }, { 家: '乙', 包: b }]);
  assert.strictEqual(r.一致, false);
  assert.ok(r.差异.some((d) => d.家 === '乙' && /契约版本/.test(d.因)));
});

test('契④ 一个包都没有 → 不一致（空集不算一致）', () => {
  assert.strictEqual(一致.比对([]).一致, false);
});

test('契⑤ 可选项多寡不影响同形判定的必有部分——但键集不同就是不同形（这是故意的）', async () => {
  // 一家多交了「截图」，另一家没交：键集不同 → 不同形。契约要的就是「一模一样」，
  // 可选项也要五家统一，不然「同一张单在不同后端得到不同结论」从可选项这条缝漏进来。
  const a = E.攒包({ ...(await 假适配器跑(进)), 截图: ['x.png'] });
  const b = E.攒包(await 假适配器跑(进));
  assert.strictEqual(一致.比对([{ 家: '甲', 包: a }, { 家: '乙', 包: b }]).一致, false);
});
