// 注册表.js —— 唯一的路由注册函数。重复的 method+path 直接 throw。
//
// 旧仓两个系统合并时有 5 条路由正面撞名，express 先注册者胜，输的那边前端永远空白且不报错。
// 这里撞名是启动时的异常，不是运行时的静默。业务代码里不许出现 app.get/app.post——只许 注()。
//
// 分发 也在这：解析 URL 与 JSON 体，找路由，调处理器，统一出 JSON。找不到 404、炸了 500，都是 JSON，
// 前端永远能读到「为什么」。静态文件（web/）另有 静态() 一条兜底路由。
'use strict';
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const 方法们 = Object.freeze(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

function 造注册表() {
  const 表 = new Map();
  const 键 = (m, p) => `${String(m).toUpperCase()} ${p}`;
  return Object.freeze({
    /** 注一条。撞名 throw。 */
    注(method, 路, 处理, 说明) {
      const m = String(method || '').toUpperCase();
      if (!方法们.includes(m)) throw new Error(`注册表：方法「${method}」不认（${方法们.join('/')}）`);
      if (typeof 路 !== 'string' || !路.startsWith('/')) throw new Error(`注册表：路径「${路}」要以 / 开头`);
      if (typeof 处理 !== 'function') throw new Error(`注册表：${键(m, 路)} 没给处理函数`);
      const k = 键(m, 路);
      if (表.has(k)) throw new Error(`路由撞名：${k} 已注册（${表.get(k).说明 || '没写说明'}）——两边都以为自己赢了，前端会有一半永远空白`);
      表.set(k, Object.freeze({ method: m, 路, 处理, 说明: 说明 || '' }));
    },
    找(method, 路) { return 表.get(键(method, 路)) || null; },
    列() { return [...表.values()].map((r) => ({ method: r.method, 路: r.路, 说明: r.说明 })); },
  });
}

/** 读 JSON 体（上限 1MB）。 */
function 读体(req, 上限) {
  return new Promise((resolve, reject) => {
    const 块 = []; let n = 0;
    req.on('data', (c) => { n += c.length; if (n > (上限 || 1024 * 1024)) { reject(new Error('体太大')); req.destroy(); return; } 块.push(c); });
    req.on('end', () => {
      const s = Buffer.concat(块).toString('utf8');
      if (!s.trim()) return resolve(null);
      try { resolve(JSON.parse(s)); } catch (e) { reject(new Error('体不是 JSON：' + e.message)); }
    });
    req.on('error', reject);
  });
}

function 出(res, 状态, 体, 类型) {
  const 文 = 类型 ? 体 : JSON.stringify(体);
  res.writeHead(状态, { 'Content-Type': (类型 || 'application/json') + '; charset=utf-8', 'Content-Length': Buffer.byteLength(文) });
  res.end(文);
}

const 类型表 = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

/**
 * 分发一个请求。处理器签名：处理({ 查, 体, 参, req }) → { 状态?, 体 } 或直接返回体（当 200）。
 * @param 选项 { 静态根?: 目录 }  GET 找不到路由时到这里找文件；/ → 壳.html
 */
async function 分发(注册表, req, res, 选项) {
  const o = 选项 || {};
  const u = new URL(req.url, 'http://x');
  const 路 = u.pathname;
  const r = 注册表.找(req.method, 路);
  if (r) {
    try {
      const 体 = (req.method === 'GET' || req.method === 'DELETE') ? null : await 读体(req);
      const 查 = Object.fromEntries(u.searchParams.entries());
      const 回 = await r.处理({ 查, 体, req });
      if (回 && typeof 回 === 'object' && '体' in 回 && ('状态' in 回 || Object.keys(回).length <= 2)) return 出(res, 回.状态 || 200, 回.体);
      return 出(res, 200, 回 === undefined ? { 行: true } : 回);
    } catch (e) {
      return 出(res, e.状态 || 500, { 错: e.message, 路: `${req.method} ${路}` });
    }
  }
  if (req.method === 'GET' && o.静态根) {
    const 相 = 路 === '/' ? '/壳.html' : 路;
    const 绝 = path.resolve(o.静态根, '.' + decodeURIComponent(相));
    if (绝.startsWith(path.resolve(o.静态根)) && fs.existsSync(绝) && fs.statSync(绝).isFile()) {
      const 类 = 类型表[path.extname(绝).toLowerCase()] || 'application/octet-stream';
      return 出(res, 200, fs.readFileSync(绝, 'utf8'), 类);
    }
  }
  return 出(res, 404, { 错: `没有这条路：${req.method} ${路}`, 有的: 注册表.列().map((x) => `${x.method} ${x.路}`) });
}

module.exports = { 造注册表, 分发, 读体, 方法们 };
