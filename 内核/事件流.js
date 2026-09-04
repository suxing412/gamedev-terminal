// 事件流.js —— 只追加。只导出 追加 的口（记），不导出 写。历史不删不改，纠正靠追加更正记录。
//
// 写走 内核/写闸 的令牌与 追加()——事件流的路径必须在闸的准写区里，否则领不到令牌。
// 读直接 fs。一行一个 JSON，坏行不炸、原样报出来（谁写坏的能查到）。
'use strict';
const fs = require('fs');
const 写闸 = require('./写闸.js');

/**
 * 造一条流。
 * @param 闸  内核/写闸.建闸 的产物（决定这条流能不能写）
 * @param 路  流文件的绝对路径
 * @param 钟  可注入；缺省读系统时间
 */
function 造流(闸, 路, 钟) {
  if (!闸 || typeof 闸.领 !== 'function') throw new Error('事件流：要一道写闸');
  if (!路) throw new Error('事件流：要路径');
  const 现在 = () => (钟 ? 钟.现在() : new Date().toISOString());
  const 流 = {
    路,
    /** 记一条。返回落盘的那条（带 t）。 */
    记(事件) {
      if (!事件 || typeof 事件 !== 'object' || Array.isArray(事件)) throw new Error('事件流：事件要是对象');
      if (!事件.类) throw new Error('事件流：事件要有 类');
      const 条 = { t: 现在(), ...事件 };
      写闸.追加(闸.领(路, '事件流追加：' + 事件.类), JSON.stringify(条) + '\n');
      return 条;
    },
    /** 纠正不改旧行：追加一条 更正，指着原来那条。 */
    更正(指, 改, 因) { return 流.记({ 类: '更正', 指, 改, 因: 因 || '' }); },
    /** 读全部（可筛）。 */
    读(筛) {
      if (!fs.existsSync(路)) return [];
      const 全 = fs.readFileSync(路, 'utf8').split('\n').filter(Boolean).map((l, i) => {
        try { return JSON.parse(l); } catch (e) { return { 类: '坏行', 行号: i + 1, 原文: l }; }
      });
      return typeof 筛 === 'function' ? 全.filter(筛) : 全;
    },
  };
  return Object.freeze(流);
}

module.exports = { 造流 };
