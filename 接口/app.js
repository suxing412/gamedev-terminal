// app.js —— 版本、健康、脉搏、视图表；静态兜底给 web/。**页签从正本的系统表生成，不手写。**
//
// 视图表 = 说明书里六个系统各一格：名、状态（已闭环/在建/已声明未设计）、这一圈怎么转、人在哪介入、
// 凭什么算闭上了、靠哪些模块（各标已建/待建）。壳拿到它就能把整个产品的形状画出来，
// 哪一圈建到哪一目了然；功能落一块，那一格的占位就被真页面替掉，正本一变页面就变。
//
// 一个进程、Node 自带 http、不上 express。业务判断不在这层：这层只转调领域/编排，出 JSON。
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const 路径 = require('../内核/路径.js');
const 时钟 = require('../内核/时钟.js');
const 注册表模块 = require('./注册表.js');

/** 视图表：从正本的系统表生成，纯函数。 */
function 视图表(表) {
  const 已建 = new Set((表.模块 || []).map((m) => m.键));
  return (表.系统 || []).map((s) => {
    const 靠 = (s.靠 || []).map((k) => ({ 键: k, 已建: 已建.has(k) }));
    return {
      键: s.键, 名: s.名, 状态: s.状态, 页: '占位',
      这一圈: [...(s.这一圈 || [])],
      人在哪介入: [...(s.人在哪介入 || [])],
      凭什么算闭上了: s.凭什么算闭上了 || '',
      靠, 已建数: 靠.filter((x) => x.已建).length, 待建数: 靠.filter((x) => !x.已建).length,
    };
  });
}

function 读正本(仓根) { return JSON.parse(fs.readFileSync(path.join(仓根, 'docs', '模块.json'), 'utf8')); }

/**
 * 造 app。
 * @param 依赖 { 表?, 版本?, 钟?, 仓根?, 静态根? }  全可注入；缺省读真正本、真 package.json、真钟
 */
function 造app(依赖) {
  const d = 依赖 || {};
  const 钟 = d.钟 || 时钟.真钟();
  const 仓 = d.仓根 || 路径.仓根();
  if (!仓 && !d.表) throw new Error('app：便携态没有仓根，要注入 表 与 静态根');
  const 表 = d.表 || 读正本(仓);
  const 版本 = d.版本 || JSON.parse(fs.readFileSync(path.join(仓, 'package.json'), 'utf8')).version;
  const 静态根 = d.静态根 || path.join(仓, 'web');
  const 起于 = 钟.毫秒();
  const 注册表 = 注册表模块.造注册表();

  注册表.注('GET', '/api/version', () => ({ 版本, 形态: 路径.形态() }), '版本与形态');
  注册表.注('GET', '/api/health', () => ({ 行: true, 起于: new Date(起于).toISOString(), 活了ms: 钟.毫秒() - 起于 }), '健康');
  注册表.注('GET', '/api/pulse', () => ({
    t: 钟.现在(), 已建: (表.模块 || []).length, 待建: (表.待建 || []).length,
    系统: 视图表(表).map((v) => ({ 键: v.键, 状态: v.状态, 已建数: v.已建数, 待建数: v.待建数 })),
  }), '脉搏：建到哪了');
  注册表.注('GET', '/api/views', () => 视图表(表), '视图表：页签从正本的系统表生成');
  注册表.注('GET', '/api/routes', () => 注册表.列(), '路由表');

  const server = http.createServer((req, res) => { 注册表模块.分发(注册表, req, res, { 静态根 }); });
  return {
    注册表, server,
    视图表: () => 视图表(表),
    起(端口, 主机) { return new Promise((r) => server.listen(端口 === undefined ? 4300 : 端口, 主机 || '127.0.0.1', () => r(server.address()))); },
    关() { return new Promise((r) => server.close(r)); },
  };
}

if (require.main === module) {
  const app = 造app();
  app.起(Number(process.env.GDT_PORT) || 4300).then((a) => console.log(`终端接口 http://127.0.0.1:${a.port}  （视图表 ${app.视图表().length} 格）`));
}

module.exports = { 造app, 视图表 };
