// 路径.js —— 这个系统跑在三种形态下，而三种形态里「我在哪」的答案不一样。
//
// **这是第一个模块，故意选它。** 因为旧仓在这一格上一夜栽过三次
// （2026-08-29，坑档案「portable exe 路径陷阱」）：
//
//   portable exe 里 __dirname / process.execPath / process.cwd() **全都是临时解压目录**
//   （`%TEMP%\<随机>\`，退出即删）。而它们不报错——取到的是一个真实存在、
//   写得进去、下次启动就消失的路径。表现是「少做了一件事」，静默失效。
//
//   更坏的是 existsSync 会把它吞掉：`if (existsSync(p)) 做事()` ——
//   p 指着临时目录里那份不存在的东西，条件为假，一件事就这么没做，零报错。
//
// 正确解法是 electron-builder 注入的 PORTABLE_EXECUTABLE_* 两个环境变量。
// 它们**只在 portable exe 里有**，所以「有没有它」正好也是形态判据。
'use strict';
const path = require('path');

/**
 * 三种形态：
 *   源码   —— `node server.js` / 判据跑道。仓根 = 这个文件往上两层
 *   便携   —— portable exe。仓根无意义（代码在 asar 里），可执行文件在 PORTABLE_EXECUTABLE_FILE
 *   部署   —— 解压安装态。留给以后，现在不走这条
 */
function 形态(env = process.env) {
  if (env.PORTABLE_EXECUTABLE_FILE || env.PORTABLE_EXECUTABLE_DIR) return '便携';
  return '源码';
}

/** 仓根：源码态才有意义。便携态返回 null——**不要在这里编一个出来**。 */
function 仓根(env = process.env) {
  if (形态(env) === '便携') return null;
  return path.resolve(__dirname, '..');
}

/**
 * 数据区：**永远在仓外**。
 *
 * 换装要能一个字节都不碰数据，所以数据不能住在仓里、更不能住在 asar 里。
 * 优先级：显式 env > 便携 exe 的同级目录 > 源码态的兄弟目录。
 */
function 数据区(env = process.env) {
  if (env.GDT_DATA) return path.resolve(env.GDT_DATA);
  const f = env.PORTABLE_EXECUTABLE_DIR || (env.PORTABLE_EXECUTABLE_FILE && path.dirname(env.PORTABLE_EXECUTABLE_FILE));
  if (f) return path.join(f, '数据');
  return path.resolve(__dirname, '..', '..', 'AI-GameStudio');
}

/**
 * 一次算全，返回一个可以直接传下去的对象。
 *
 * **不导出「当前值」常量**，只导出函数：常量会在 require 的那一刻定死，
 * 而判据要能喂不同的 env 进来跑。旧仓那些「换机即死」的硬编码路径
 * 就是从「模块顶层算一次」开始的。
 */
function 解算(env = process.env) {
  const 态 = 形态(env);
  return {
    形态: 态,
    仓根: 仓根(env),
    数据区: 数据区(env),
    便携: 态 === '便携',
    // 取路径时用得着：便携态下这两个是唯一可信的锚
    可执行文件: env.PORTABLE_EXECUTABLE_FILE || null,
    可执行目录: env.PORTABLE_EXECUTABLE_DIR || null,
  };
}

module.exports = { 形态, 仓根, 数据区, 解算 };
