// 数据区.js —— 数据区的布局与读写口：一类一目录、一实体一 JSON 文件，写走写闸。
//
// 布局：管线/ 特性/ 专项/ 工单/ 证据/ 事件/ 方案/。读是直接 fs（读不越界也不改盘），写一律经 内核/写闸 的令牌——
// 这层不自己 writeFileSync。「盘上有什么」由这里一次读成池 { 管线们, 特性们, 专项们, 工单们 }，领域层拿池算，
// 算完的新对象再经这里落盘。坏文件报出来不炸：一个坏 JSON 不该让整个池读不出来。
'use strict';
const fs = require('fs');
const path = require('path');
const 写闸 = require('./写闸.js');

const 布局 = Object.freeze(['管线', '特性', '专项', '工单', '证据', '事件', '方案']);
const 类到池 = Object.freeze({ 管线: '管线们', 特性: '特性们', 专项: '专项们', 工单: '工单们' });

/** 建目录骨架（幂等）。 */
function 建(根) {
  for (const 类 of 布局) fs.mkdirSync(path.join(根, 类), { recursive: true });
  return 根;
}

/** 读一类的全部实体，按文件名排序；坏 JSON 进 坏 不进列表。 */
function 读全(根, 类) {
  const d = path.join(根, 类);
  const 出 = []; const 坏 = [];
  if (!fs.existsSync(d)) return { 列: 出, 坏 };
  for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json')).sort()) {
    try { 出.push(JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))); }
    catch (e) { 坏.push({ 文件: path.join(类, f), 因: e.message }); }
  }
  return { 列: 出, 坏 };
}

/** 一次读成池。 */
function 读池(根) {
  const 池 = { 坏: [] };
  for (const [类, 键] of Object.entries(类到池)) { const r = 读全(根, 类); 池[键] = r.列; 池.坏.push(...r.坏); }
  return 池;
}

/** 读一个。没有返回 null。 */
function 读一(根, 类, id) {
  const p = path.join(根, 类, id + '.json');
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

/** 存口：写全走写闸。 */
function 造存(根) {
  建(根);
  const 闸 = 写闸.建闸({ 根, 准写: [...布局] });
  const 存 = (类, id, 对象, 为) => {
    if (!布局.includes(类)) throw new Error(`数据区：没有「${类}」这一类（${布局.join('/')}）`);
    if (!id) throw new Error('数据区：存要有 id');
    const p = path.join(根, 类, String(id) + '.json');
    写闸.写(闸.领(p, 为 || `存${类} ${id}`), JSON.stringify(对象, null, 2));
    return p;
  };
  let 包序 = 0;
  return Object.freeze({
    根, 闸, 存,
    存单: (单) => 存('工单', 单.id, 单, '落单'),
    存专项: (专项) => 存('专项', 专项.id, 专项, '落专项'),
    /** 证据包按 单号-序 存，序从盘上已有的往后数。 */
    存包: (包) => {
      const 已有 = fs.readdirSync(path.join(根, '证据')).filter((f) => f.startsWith(包.单号 + '-')).length;
      包序 = Math.max(包序, 已有) + 1;
      return 存('证据', `${包.单号}-${包序}`, 包, '落包');
    },
    事件流路: path.join(根, '事件', '流.jsonl'),
  });
}

module.exports = { 布局, 建, 读全, 读池, 读一, 造存 };
