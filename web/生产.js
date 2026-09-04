// 生产.js —— 研发那一格的真页面：谁在等我、按格计数、甘特、在途、工单库。
//
// 数据全来自 /api/prod/board 与 /api/prod/tickets（后端算好的格、条、队列），这里只画，不自算分组。
// 渲染是纯函数出树（判据在 Node 判），登记进 壳.页面表.研发 就替掉留白页。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./壳.js'));
  else root.生产 = factory(root.壳);
})(this, function (壳) {
  'use strict';
  const 节 = 壳.节;
  const 小时 = 3600 * 1000;
  const 时 = (iso) => (iso ? String(iso).slice(5, 16).replace('T', ' ') : '');
  const 几小时 = (ms) => (ms === null || ms === undefined ? '—' : ms < 小时 ? `${Math.round(ms / 60000)} 分` : `${(ms / 小时).toFixed(1)} 时`);

  /** 甘特：SVG，一单一行，条按格上色，临界描边，现在一条竖线。 */
  function 甘特(条, 现在) {
    if (!条 || !条.length) return 节('p', { class: '空' }, '没有排上的单');
    const 起 = Math.min(...条.map((c) => Date.parse(c.起)));
    const 止 = Math.max(...条.map((c) => Date.parse(c.止)), 现在 ? Date.parse(现在) : 0);
    const 跨 = Math.max(止 - 起, 小时);
    const W = 900, 左 = 210, 右 = 12, 行高 = 26, 顶 = 22;
    const H = 顶 + 条.length * 行高 + 8;
    const x = (t) => 左 + ((Date.parse(t) - 起) / 跨) * (W - 左 - 右);
    const 行们 = 条.map((c, i) => {
      const y = 顶 + i * 行高;
      const x1 = x(c.起), x2 = Math.max(x(c.止), x1 + 3);
      return 节('g', { class: '行' + (c.临界 ? ' 临界' : ''), 'data-id': c.id },
        节('text', { x: 4, y: y + 17, class: '标' }, `${c.id} ${c.title || ''}`),
        节('rect', { x: x1, y: y + 4, width: x2 - x1, height: 行高 - 8, rx: 3, class: '条 ' + c.格 }),
        c.依赖 && c.依赖.length ? 节('text', { x: x1 - 4, y: y + 17, class: '依赖', 'text-anchor': 'end' }, '←' + c.依赖.join(',')) : null,
      );
    });
    const 现x = 现在 ? x(现在) : null;
    return 节('svg', { class: '甘特', viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': `甘特 ${条.length} 行` },
      节('text', { x: 左, y: 14, class: '轴' }, 时(new Date(起).toISOString())),
      节('text', { x: W - 右, y: 14, class: '轴', 'text-anchor': 'end' }, 时(new Date(止).toISOString())),
      行们,
      现x !== null ? 节('line', { x1: 现x, y1: 顶 - 4, x2: 现x, y2: H, class: '现在' }) : null,
    );
  }

  /** 谁在等我。 */
  function 人闸(在等) {
    if (!在等 || !在等.length) return 节('p', { class: '空' }, '没人在等');
    return 节('table', { class: '表 人闸表' },
      节('thead', {}, 节('tr', {}, ['闸', '谁', '等谁', '等了', '状况'].map((h) => 节('th', {}, h)))),
      节('tbody', {}, 在等.map((x) => 节('tr', { class: x.升格 === '上呈' ? '上呈' : x.逾期 ? '逾期' : '', 'data-单': x.单 || x.专项 },
        节('td', {}, x.类), 节('td', {}, x.单 || x.专项), 节('td', {}, x.等谁), 节('td', {}, 几小时(x.等了ms)),
        节('td', {}, x.升格 || (x.逾期 ? '逾期' : '') || x.注 || '')))));
  }

  /** 按格计数（管线一行）。 */
  function 计数(数) {
    const 管 = (数 && 数.管线) || {};
    const 键们 = Object.keys(管);
    if (!键们.length) return 节('p', { class: '空' }, '树上没有管线');
    const 格们 = ['待跑', '在途', '候验收', '人闸', '已落袋', '结束'];
    return 节('table', { class: '表 计数表' },
      节('thead', {}, 节('tr', {}, 节('th', {}, '管线'), 格们.map((g) => 节('th', {}, g)))),
      节('tbody', {}, 键们.map((k) => 节('tr', {}, 节('td', {}, k), 格们.map((g) => 节('td', { class: 管[k][g] ? '有' : '' }, String(管[k][g] || 0)))))));
  }

  function 工单库(表) {
    if (!表 || !表.length) return 节('p', { class: '空' }, '工单库是空的');
    return 节('table', { class: '表 工单表' },
      节('thead', {}, 节('tr', {}, ['单号', '标题', '职能', '性质', '状态', '归属', '闸'].map((h) => 节('th', {}, h)))),
      节('tbody', {}, 表.map((t) => 节('tr', { 'data-id': t.id, class: t.状态 },
        节('td', {}, t.id), 节('td', {}, t.title || ''), 节('td', {}, t.职能), 节('td', {}, t.性质), 节('td', {}, t.状态),
        节('td', {}, t.归属 ? (t.归属.专项 || t.归属.特性) : ''), 节('td', {}, (t.闸 || []).join('→'))))));
  }

  function 画(v, 状态) {
    const 数 = (状态 && 状态.数据) || {};
    const b = 数['/api/prod/board'];
    const 表 = 数['/api/prod/tickets'];
    if (!b || b.错) return 节('section', { class: '页 生产', 'data-键': v.键 }, 节('h2', {}, v.名), 节('p', { class: '空' }, '生产接口没应：' + ((b && b.错) || '还没拉到数据')));
    const 在途 = (b.甘特 || []).filter((c) => c.格 === '在途');
    return 节('section', { class: '页 生产', 'data-键': v.键 },
      节('h2', {}, v.名, 节('small', { class: '状态' }, `已建 ${v.已建数} · 待建 ${v.待建数} · ${时(b.t)}`)),
      节('div', { class: '栏' },
        节('div', { class: '块' }, 节('h3', {}, `谁在等我（${(b.在等 || []).length}）`), 人闸(b.在等)),
        节('div', { class: '块' }, 节('h3', {}, '按格'), 计数(b.计数),
          (b.空转 && (b.空转.专项.length || b.空转.管线.length)) ? 节('p', { class: '警' }, '空转：' + [...b.空转.专项.map((x) => `${x.专项} ${x.因}`), ...b.空转.管线.map((x) => `${x.管线} ${x.因}`)].join('；')) : null,
          (b.坏 && b.坏.length) ? 节('p', { class: '警' }, `数据区有 ${b.坏.length} 个坏文件：${b.坏.map((x) => x.文件).join('、')}`) : null),
      ),
      节('h3', {}, `甘特（${(b.甘特 || []).length}）`), 甘特(b.甘特, b.t),
      (b.环 && b.环.length) ? 节('p', { class: '警' }, '依赖环：' + b.环.join('、')) : null,
      节('h3', {}, `在途（${在途.length}）`),
      在途.length ? 节('ul', { class: '在途' }, 在途.map((c) => 节('li', {}, `${c.id} ${c.title || ''}　${时(c.起)} 起`))) : 节('p', { class: '空' }, '没有在跑的单'),
      节('h3', {}, `工单库（${(表 || []).length}）`), 工单库(表),
    );
  }

  壳.页面表.研发 = { 画, 数据: ['/api/prod/board', '/api/prod/tickets'] };
  return { 画, 甘特, 人闸, 计数, 工单库 };
});
