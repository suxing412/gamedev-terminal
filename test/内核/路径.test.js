// 路径.test.js —— 三种形态各喂一份 env 进去，量它算出什么。
//
// **不读 process.env，全部喂假的。** 这样判据能在任何机器上跑出同一个结果，
// 而且能验到「便携态」这条——那条在开发机上永远走不到，正是它出过事故。
'use strict';
const assert = require('node:assert');
const test = require('node:test');
const path = require('node:path');
const 路径 = require('../../内核/路径.js');

const 源码env = {};
const 便携env = {
  PORTABLE_EXECUTABLE_FILE: 'D:\\部署区\\游戏开发者终端 1.0.0.exe',
  PORTABLE_EXECUTABLE_DIR: 'D:\\部署区',
};

test('径① 没有 PORTABLE_* 就是源码态', () => {
  assert.strictEqual(路径.形态(源码env), '源码');
});

test('径② 有 PORTABLE_EXECUTABLE_FILE 就是便携态', () => {
  assert.strictEqual(路径.形态(便携env), '便携');
  // 只给 DIR 也算——两个变量 electron-builder 都注，但别假设一定成对
  assert.strictEqual(路径.形态({ PORTABLE_EXECUTABLE_DIR: 'D:\\x' }), '便携');
});

test('径③ 便携态的仓根是 null，不许编一个出来', () => {
  // 这一条是那次事故的核心：便携态下 __dirname 指着 %TEMP% 里的临时解压目录，
  // 「算得出一个路径」比「算不出」危险得多——它写得进去，下次启动就没了。
  assert.strictEqual(路径.仓根(便携env), null);
});

test('径④ 源码态的仓根是这个仓', () => {
  const 根 = 路径.仓根(源码env);
  assert.ok(根 && path.isAbsolute(根), '仓根要是绝对路径');
  assert.strictEqual(path.basename(根), 'gamedev-terminal');
});

test('径⑤ 便携态的数据区落在 exe 同级，不落临时目录', () => {
  const d = 路径.数据区(便携env);
  assert.strictEqual(d, path.join('D:\\部署区', '数据'));
  assert.ok(!/temp/i.test(d), '数据区绝不许落在临时目录下——退出即删');
});

test('径⑥ GDT_DATA 优先级最高（换机 / 判据 / 多实例都靠它）', () => {
  const d = 路径.数据区({ ...便携env, GDT_DATA: 'E:\\另一份数据' });
  assert.strictEqual(d, path.resolve('E:\\另一份数据'));
});

test('径⑦ 解算 一次给全，且形态与单项函数一致', () => {
  for (const env of [源码env, 便携env]) {
    const r = 路径.解算(env);
    assert.strictEqual(r.形态, 路径.形态(env));
    assert.strictEqual(r.仓根, 路径.仓根(env));
    assert.strictEqual(r.数据区, 路径.数据区(env));
    assert.strictEqual(r.便携, 路径.形态(env) === '便携');
  }
});

test('径⑧ 不导出「当前值」常量——只导出函数', () => {
  // 常量会在 require 那一刻按当时的 env 定死，判据就喂不进别的 env 了。
  // 旧仓那些「换机即死」的硬编码路径，都是从「模块顶层算一次」开始的。
  for (const k of Object.keys(路径)) {
    assert.strictEqual(typeof 路径[k], 'function',
      `导出面里的 ${k} 不是函数——路径不许在模块顶层算成常量`);
  }
});
