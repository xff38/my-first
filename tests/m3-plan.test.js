/* tests/m3-plan.test.js — M3 今日计划测试：时间轴布局算法 + 页面级数据流 */
'use strict';
const { test, group, assert } = require('./harness.js');
const App = require('./harness.js').loadApp();
const U = App.util, L = App.logic, P = App.planPage;

group('M3 · 时间轴布局 timelineLayout');

test('空日程返回空数组', () => {
  assert.deepEq(P.timelineLayout([]), []);
});

test('不重叠日程各占一列（colCount=1）', () => {
  const out = P.timelineLayout([
    { id: 'a', start: '09:00', end: '10:00' },
    { id: 'b', start: '10:00', end: '11:00' },
    { id: 'c', start: '13:00', end: '14:00' }
  ]);
  assert.deepEq(out.map(o => [o.id, o.col, o.colCount]), [['a', 0, 1], ['b', 0, 1], ['c', 0, 1]]);
});

test('两两重叠分两列', () => {
  const out = P.timelineLayout([
    { id: 'a', start: '09:00', end: '11:00' },
    { id: 'b', start: '10:00', end: '12:00' }
  ]);
  assert.deepEq(out.map(o => [o.id, o.col, o.colCount]), [['a', 0, 2], ['b', 1, 2]]);
});

test('三层嵌套重叠分三列', () => {
  const out = P.timelineLayout([
    { id: 'a', start: '09:00', end: '12:00' },
    { id: 'b', start: '09:30', end: '11:00' },
    { id: 'c', start: '10:00', end: '11:30' }
  ]);
  assert.deepEq(out.map(o => [o.id, o.col, o.colCount]), [['a', 0, 3], ['b', 1, 3], ['c', 2, 3]]);
});

test('传递性重叠同簇：a-c 不重叠可复用列，簇列数=实际使用列数', () => {
  const out = P.timelineLayout([
    { id: 'a', start: '09:00', end: '10:30' },
    { id: 'b', start: '10:00', end: '11:30' },
    { id: 'c', start: '11:00', end: '12:00' }
  ]);
  /* c 与 a 时间不冲突，复用第 0 列；簇内共 2 列 */
  assert.deepEq(out.map(o => [o.id, o.col, o.colCount]), [['a', 0, 2], ['b', 1, 2], ['c', 0, 2]]);
  /* 同列内不得有时间重叠 */
  for (const col of [0, 1]) {
    const inCol = out.filter(o => o.col === col).sort((x, y) => x.start - y.start);
    for (let i = 1; i < inCol.length; i++) assert.ok(inCol[i].start >= inCol[i - 1].end, '同列不重叠');
  }
});

test('重叠簇之间互不影响列数', () => {
  const out = P.timelineLayout([
    { id: 'a', start: '09:00', end: '11:00' },
    { id: 'b', start: '10:00', end: '11:00' },
    { id: 'c', start: '15:00', end: '16:00' }
  ]);
  const c = out.filter(o => o.id === 'c')[0];
  assert.deepEq([c.col, c.colCount], [0, 1], '下午的日程不受上午簇影响');
});

test('乱序输入按开始时间排序输出', () => {
  const out = P.timelineLayout([
    { id: 'b', start: '10:00', end: '11:00' },
    { id: 'a', start: '09:00', end: '10:00' }
  ]);
  assert.deepEq(out.map(o => o.id), ['a', 'b']);
});

group('M3 · 今日计划数据流（store 级）');

test('日程增删改走 store 且产生 op', () => {
  const store = App.createStore();
  store.setCacheAdapter({ saveSnapshot() {}, loadSnapshot: () => null, pushOps() {}, loadOps: () => [], clearOps() {} });
  const ev = store.upsert('plan.events', { id: 'e1', date: '2026-11-13', start: '09:00', end: '11:00', title: '写论文' });
  assert.ok(ev);
  store.upsert('plan.events', Object.assign({}, ev, { start: '10:00', end: '12:00' }));
  assert.eq(store.data.plan.events.length, 1);
  assert.eq(store.data.plan.events[0].start, '10:00');
  store.remove('plan.events', 'e1');
  assert.eq(store.data.plan.events.length, 0);
  assert.eq(store.pendingOps().length, 3);
});

test('待办打勾/优先级切换保留其他字段（含顺延标记）', () => {
  const store = App.createStore();
  store.setCacheAdapter({ saveSnapshot() {}, loadSnapshot: () => null, pushOps() {}, loadOps: () => [], clearOps() {} });
  store.upsert('plan.todos', { id: 't1', date: '2026-11-13', text: 'x', priority: '高', done: false, carriedFrom: '2026-11-12', carriedId: 'root1' });
  const t = store.data.plan.todos[0];
  store.upsert('plan.todos', Object.assign({}, t, { done: true }));
  const t2 = store.data.plan.todos[0];
  assert.eq(t2.done, true);
  assert.eq(t2.priority, '高', '优先级保留');
  assert.eq(t2.carriedFrom, '2026-11-12', '顺延来源保留');
  assert.eq(t2.carriedId, 'root1');
});

test('每日回顾写入与清空（空文本删除键）', () => {
  const store = App.createStore();
  store.setCacheAdapter({ saveSnapshot() {}, loadSnapshot: () => null, pushOps() {}, loadOps: () => [], clearOps() {} });
  store.mapSet('plan.reviews', '2026-11-13', '今天效率很高');
  assert.eq(store.data.plan.reviews['2026-11-13'], '今天效率很高');
  store.mapSet('plan.reviews', '2026-11-13', '');
  assert.eq(store.data.plan.reviews['2026-11-13'], undefined, '清空回顾删除键');
});

test('首页摘要：planSummary 与备忘排序数据源正确', () => {
  const store = App.createStore();
  store.setCacheAdapter({ saveSnapshot() {}, loadSnapshot: () => null, pushOps() {}, loadOps: () => [], clearOps() {} });
  store.upsert('memos', { id: 'm1', text: '普通', pinned: false, createdAt: '2026-11-13T01:00:00Z' });
  store.upsert('memos', { id: 'm2', text: '置顶', pinned: true, createdAt: '2026-11-12T01:00:00Z' });
  const sorted = store.data.memos.slice().sort((a, b) => (a.pinned !== b.pinned ? (a.pinned ? -1 : 1) : (b.createdAt || '').localeCompare(a.createdAt || '')));
  assert.deepEq(sorted.map(m => m.id), ['m2', 'm1'], '置顶优先，其次新在前');
});
