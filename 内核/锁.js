// 锁.js —— 文件锁与单飞锁。
//
// 单飞：同一进程里同名的活同时只跑一份——取单器的拍、巡检的循环，上一拍没完下一拍就跳过，不叠。
// 文件锁：跨进程，wx 独占建文件，内容记 pid 与时刻；过期（按钟）可抢。Unity 编辑器单实例、
// 文稿并发写都靠它。**读不出来的锁当活锁，不抢**——宁可等，不撞。
'use strict';
const fs = require('fs');

/** 单飞锁：进程内。 */
function 单飞(名) {
  let 在 = false;
  return Object.freeze({
    名,
    试() { if (在) return false; 在 = true; return true; },
    放() { 在 = false; },
    在() { return 在; },
  });
}

/**
 * 文件锁。
 * @param 路   锁文件
 * @param 选项 { 钟?, 过期ms? }  钟 可注入（判据喂假钟就能测过期）
 */
function 文件锁(路, 选项) {
  const o = 选项 || {};
  const 现在ms = () => (o.钟 ? o.钟.毫秒() : Date.now());
  const 现在 = () => (o.钟 ? o.钟.现在() : new Date().toISOString());
  const 过期ms = o.过期ms || 10 * 60 * 1000;
  const 持有者 = () => { try { return JSON.parse(fs.readFileSync(路, 'utf8')); } catch (e) { return null; } };
  const 锁 = {
    路,
    试() {
      try {
        fs.writeFileSync(路, JSON.stringify({ pid: process.pid, t: 现在() }), { flag: 'wx' });
        return true;
      } catch (e) {
        if (e.code !== 'EEXIST') throw e;
      }
      const 谁 = 持有者();
      if (谁 && 谁.t && 现在ms() - Date.parse(谁.t) > 过期ms) {
        try { fs.unlinkSync(路); } catch (e) { return false; }
        return 锁.试();
      }
      return false;   // 活锁，或读不出来——都不抢
    },
    放() { try { fs.unlinkSync(路); } catch (e) { /* 本来就没有 */ } },
    持有者,
  };
  return Object.freeze(锁);
}

module.exports = { 单飞, 文件锁 };
