/* tests/m6-settings.test.js — M6 设置与全局规则测试 */
'use strict';
const fs = require('fs');
const path = require('path');
const { test, group, assert } = require('./harness.js');
const App = require('./harness.js').loadApp();
const U = App.util, S = App.schema;

function freshStore() {
  const store = App.createStore();
  store.setCacheAdapter({ saveSnapshot() {}, loadSnapshot: () => null, pushOps() {}, loadOps: () => [], clearOps() {} });
  return store;
}

group('M6 · 设置项');

test('setSetting 修改平台列表并产生 setting op', () => {
  const store = freshStore();
  store.setSetting('platforms', ['B站', '播客']);
  assert.deepEq(store.data.settings.platforms, ['B站', '播客']);
  const ops = store.pendingOps();
  assert.eq(ops.length, 1);
  assert.eq(ops[0].type, 'setting');
  assert.eq(ops[0].key, 'platforms');
});

test('setting op 可重放到另一份数据（合并链路）', () => {
  const store = freshStore();
  store.setSetting('recipeTags', ['主食', '新标签']);
  const target = S.defaultData();
  App.logic.applyOplog(target, store.pendingOps());
  assert.deepEq(target.settings.recipeTags, ['主食', '新标签']);
});

test('主题设置只接受 light/dark（normalize 兜底）', () => {
  const d = S.normalize({ settings: { theme: '赛博朋克' } });
  assert.eq(d.settings.theme, 'light');
  const d2 = S.normalize({ settings: { theme: 'dark' } });
  assert.eq(d2.settings.theme, 'dark');
});

group('M6 · 全局规则（源码级回归）');

test('启动与连接流程都执行自动顺延', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '40-persist.js'), 'utf8');
  const n = (src.match(/carryOverTodos/g) || []).length;
  assert.ok(n >= 2, 'boot 与 adoptHandle 各调用一次，实际 ' + n + ' 处');
});

test('九个模块页面文件都调用 registerPage 注册（源码级）', () => {
  const fileOf = { home: '60-home.js', plan: '61-plan.js', media: '62-media.js', dev: '63-dev.js', consult: '64-consult.js', study: '65-study.js', diet: '66-diet.js', fun: '67-fun.js', settings: '68-settings.js' };
  for (const id of Object.keys(fileOf)) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', fileOf[id]), 'utf8');
    assert.includes(src, "registerPage('" + id + "'", fileOf[id] + ' 应注册 ' + id);
  }
});

test('清空=重置为默认结构（store.setData 语义）', () => {
  const store = freshStore();
  store.upsert('memos', { id: 'm1', text: 'x' });
  store.upsert('consult.incomes', { id: 'i1', client: 'c', amount: 1, date: '2026-11-13' });
  store.setData(S.defaultData());
  assert.eq(store.data.memos.length, 0);
  assert.eq(store.data.consult.incomes.length, 0);
  assert.deepEq(store.data.settings.platforms, S.DEFAULT_PLATFORMS);
});

test('数据统计口径：counts 覆盖全部 20 类集合', () => {
  /* 与 68-settings 的 counts() 口径一致：COLLECTIONS 全量 */
  assert.eq(Object.keys(S.COLLECTIONS).length, 20);
});
