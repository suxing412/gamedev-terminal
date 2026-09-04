// 装配器.test.js —— 提示词里装什么、不装什么：进项是内容不是路径；人格层不进执行卷；交付按性质。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const Z = require('../../编排/装配器.js');

const 协议 = {
  职责权限: { 职能: '程序', 可碰目录: ['Assets/SLG/**'], 可用工具: ['Read', 'Edit'], 禁: ['Docs/**'] },
  人格语气: { 称呼: '小程', 语气: '简短', 忌讳: ['不说应该没问题'] },
};
const 单 = { id: 'T-1', title: '改一行', 性质: '新建', 职能: '程序', 正文: '把 x 改成 y' };

test('装① 单号、标题、正文、性质、职能都在提示词里', () => {
  const p = Z.装(单, 协议, {});
  for (const 词 of ['T-1', '改一行', '把 x 改成 y', '新建', '程序']) assert.ok(p.includes(词), `缺「${词}」`);
});

test('装② 进项装的是内容，不是路径——执行者不找', () => {
  const p = Z.装({ ...单, 进项: { 方案: '方案/x.md' } }, 协议, { 方案: '路线甲：……\n路线乙：……' });
  assert.ok(p.includes('路线甲'), '方案内容要在窗口里');
  assert.ok(!p.includes('方案/x.md'), '路径不该出现——给了路径等于让他自己去找');
  assert.ok(p.includes('不用去找'));
});

test('装③ 资产进项可以是多份，各自成节', () => {
  const p = Z.装(单, 协议, { 资产: ['class A{}', 'class B{}'] });
  assert.ok(p.includes('### 资产 1') && p.includes('### 资产 2'));
});

test('装④ 只装职责权限层；人格语气一个字不进执行卷（Q7）', () => {
  const p = Z.装(单, 协议, {});
  assert.ok(p.includes('Assets/SLG/**') && p.includes('Docs/**'), '可碰目录与禁要在');
  assert.ok(!p.includes('小程') && !p.includes('简短') && !p.includes('应该没问题'), '人格层进了执行卷');
});

test('装⑤ 交付段按性质变，且写死「不许自己判定做完、不许改状态」', () => {
  assert.ok(Z.装({ ...单, 性质: '调研' }, 协议, {}).includes('至少两条路线'));
  assert.ok(Z.装({ ...单, 性质: '修复' }, 协议, {}).includes('能红的判据'));
  assert.ok(Z.装({ ...单, 性质: '装配' }, 协议, {}).includes('可验收的成果'));
  const p = Z.装(单, 协议, {});
  assert.ok(p.includes('不许自己判定') && p.includes('不许改工单状态'));
});

test('装⑦ 给了工作目录就写进提示词并要求相对路径；预计产出列成必须交出的文件', () => {
  const p = Z.装({ ...单, 预计产出: { 资产: 'Assets/SLG/Pathfinder.cs' } }, 协议, {}, { 工作目录: 'D:/w' });
  assert.ok(p.includes('工作目录：D:/w'));
  assert.ok(p.includes('相对它写'));
  assert.ok(p.includes('必须交出的文件') && p.includes('Assets/SLG/Pathfinder.cs'));
  assert.ok(!Z.装(单, 协议, {}).includes('工作目录：'), '不给就不写');
});

test('装⑥ 没有单 → 炸', () => {
  assert.throws(() => Z.装(null, 协议, {}), /没有单/);
});
