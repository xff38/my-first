/* tests/m5-life.test.js — M5 生活模块测试：schema 清洗 + store 级业务流 */
'use strict';
const { test, group, assert } = require('./harness.js');
const App = require('./harness.js').loadApp();
const U = App.util, S = App.schema, L = App.logic;

function freshStore() {
  const store = App.createStore();
  store.setCacheAdapter({ saveSnapshot() {}, loadSnapshot: () => null, pushOps() {}, loadOps: () => [], clearOps() {} });
  return store;
}

group('M5 · schema 清洗（学习/饮食/娱乐）');

test('打卡记录分钟数夹紧为非负整数，坏键丢弃', () => {
  const d = S.normalize({ study: { checkins: { '2026-11-13': { minutes: '90', note: 'x' }, '2026-11-14': { minutes: -5 }, 'bad': { minutes: 1 } } } });
  assert.eq(d.study.checkins['2026-11-13'].minutes, 90);
  assert.eq(d.study.checkins['2026-11-14'].minutes, 0, '负数夹紧 0');
  assert.eq(d.study.checkins['bad'], undefined);
});

test('时间表星期夹紧 1-7，非法时间回落默认', () => {
  const d = S.normalize({ study: { timetable: [{ id: 't', weekday: 9, start: '99:99', end: '21:00', text: '论文' }, { id: 't2', text: '' }] } });
  assert.eq(d.study.timetable.length, 1);
  assert.eq(d.study.timetable[0].weekday, 7);
  assert.eq(d.study.timetable[0].start, '19:00');
});

test('阅读状态/类型非法回落，读完日期保留', () => {
  const d = S.normalize({ study: { readings: [{ id: 'r', name: '书', status: '读完一半', type: '漫画', doneDate: '2026-11-01' }] } });
  assert.eq(d.study.readings[0].status, '想读');
  assert.eq(d.study.readings[0].type, '书籍');
  assert.eq(d.study.readings[0].doneDate, '2026-11-01');
});

test('目标两层结构清洗：子任务检查项保留', () => {
  const d = S.normalize({ study: { goals: [{ id: 'g', title: '论文', subtasks: [{ id: 's1', text: '开题', done: true, checks: [{ text: '查文献', done: true }, 'bad'] }, 'badsub'] }] } });
  assert.eq(d.study.goals[0].subtasks.length, 1);
  assert.eq(d.study.goals[0].subtasks[0].checks.length, 1);
  assert.eq(d.study.goals[0].subtasks[0].checks[0].done, true);
});

test('餐食安排与记录结构清洗', () => {
  const d = S.normalize({ diet: { meals: { '2026-11-13': { breakfast: '豆浆', lunch: 123 } }, records: { '2026-11-13': { breakfast: { eaten: 'yes' } } } } });
  assert.eq(d.diet.meals['2026-11-13'].breakfast, '豆浆');
  assert.eq(d.diet.meals['2026-11-13'].lunch, '123', '数字转字符串');
  assert.eq(d.diet.records['2026-11-13'].breakfast.eaten, true);
  assert.eq(d.diet.records['2026-11-13'].lunch.eaten, false, '缺省餐次补全');
});

test('体重：非法 kg 整条丢弃；非法日期按全局规则回落今天（数据不静默丢失）', () => {
  const d = S.normalize({ diet: { weights: [{ id: 'w1', kg: 0, date: '2026-11-13' }, { id: 'w2', kg: 70, date: 'x' }, { id: 'w3', kg: 68.5, date: '2026-11-13' }] } });
  assert.eq(d.diet.weights.length, 2, 'kg=0 被丢，其余保留');
  assert.eq(d.diet.weights.filter(w => w.id === 'w1').length, 0);
  assert.eq(d.diet.weights.filter(w => w.id === 'w2')[0].date, U.today(), '坏日期回落今天，记录保留可人工修正');
  assert.eq(d.diet.weights.filter(w => w.id === 'w3')[0].kg, 68.5);
});

test('娱乐记录时长/心情清洗', () => {
  const d = S.normalize({ fun: { records: [{ id: 'f', what: '游戏', minutes: '45', mood: 'good' }, { id: 'f2', what: '', minutes: 10 }, { id: 'f3', what: 'x', mood: 'meh' }] } });
  assert.eq(d.fun.records.length, 2);
  assert.eq(d.fun.records[0].minutes, 45);
  assert.eq(d.fun.records[1].mood, null, '非法心情回落 null');
});

group('M5 · 生活模块业务流');

test('学习打卡：mapSet 写入、修改、删除（清空）', () => {
  const store = freshStore();
  store.mapSet('study.checkins', '2026-11-13', { minutes: 120, note: '论文' });
  assert.eq(store.data.study.checkins['2026-11-13'].minutes, 120);
  store.mapSet('study.checkins', '2026-11-13', { minutes: 90, note: '' });
  assert.eq(store.data.study.checkins['2026-11-13'].minutes, 90, '后补修改生效');
  store.remove('study.checkins', '2026-11-13');
  assert.eq(store.data.study.checkins['2026-11-13'], undefined);
});

test('目标进度随子任务勾选变化（含两层检查项不影响进度）', () => {
  const store = freshStore();
  store.upsert('study.goals', { id: 'g', title: '论文', subtasks: [
    { id: 's1', text: '开题', done: false, checks: [{ text: 'a', done: true }] },
    { id: 's2', text: '实验', done: false, checks: [] }
  ] });
  assert.eq(L.goalProgress(store.data.study.goals[0]), 0);
  const g = store.data.study.goals[0];
  store.upsert('study.goals', Object.assign({}, g, { subtasks: g.subtasks.map(s => s.id === 's1' ? Object.assign({}, s, { done: true }) : s) }));
  assert.eq(L.goalProgress(store.data.study.goals[0]), 50);
});

test('餐食安排：排餐后今日记录卡能读到计划', () => {
  const store = freshStore();
  store.mapSet('diet.meals', '2026-11-13', { breakfast: '豆浆油条', lunch: '', dinner: '' });
  const meals = store.data.diet.meals['2026-11-13'];
  assert.eq(meals.breakfast, '豆浆油条');
  store.mapSet('diet.records', '2026-11-13', { breakfast: { actual: '豆浆油条', eaten: true }, lunch: { actual: '', eaten: false }, dinner: { actual: '', eaten: false } });
  assert.eq(L.dietTodayDone(store.data.diet.records, '2026-11-13'), 1);
});

test('复制上周逻辑：逐天 mapSet 覆盖本周', () => {
  const store = freshStore();
  const prevMon = U.addDays(U.mondayOf('2026-11-13'), -7);
  const curMon = U.mondayOf('2026-11-13');
  store.mapSet('diet.meals', prevMon, { breakfast: '上周早餐', lunch: '', dinner: '' });
  for (let i = 0; i < 7; i++) {
    const pd = U.addDays(prevMon, i), cd = U.addDays(curMon, i);
    const pv = store.data.diet.meals[pd];
    if (pv) store.mapSet('diet.meals', cd, Object.assign({}, pv));
  }
  assert.eq(store.data.diet.meals[curMon].breakfast, '上周早餐');
});

test('体重同日覆盖：复用同 id 不产生重复', () => {
  const store = freshStore();
  store.upsert('diet.weights', { id: 'w1', date: '2026-11-13', kg: 70 });
  const existing = store.data.diet.weights.filter(w => w.date === '2026-11-13')[0];
  store.upsert('diet.weights', { id: existing.id, date: '2026-11-13', kg: 69.5 });
  assert.eq(store.data.diet.weights.length, 1);
  assert.eq(store.data.diet.weights[0].kg, 69.5);
});

test('抽选确认预填今日娱乐记录（时长 0 待补）', () => {
  const store = freshStore();
  store.upsert('fun.pool', { id: 'p1', text: '塞尔达' });
  const pool = L.buildPickPool(store.data.fun.weekly, store.data.fun.pool);
  const picked = L.randomPick(pool, [], () => 0);
  store.upsert('fun.records', { id: U.uid(), date: U.today(), what: picked.text, minutes: 0, mood: null });
  assert.eq(store.data.fun.records.length, 1);
  assert.eq(store.data.fun.records[0].what, '塞尔达');
  assert.eq(store.data.fun.records[0].minutes, 0);
});

test('娱乐安排自动进入抽选池', () => {
  const store = freshStore();
  store.upsert('fun.weekly', { id: 'w1', weekday: 6, time: '20:00', what: '电影夜' });
  store.upsert('fun.pool', { id: 'p1', text: '手动候选' });
  const pool = L.buildPickPool(store.data.fun.weekly, store.data.fun.pool);
  assert.deepEq(pool.map(p => p.text).sort(), ['手动候选', '电影夜']);
  assert.eq(pool.filter(p => p.src === 'weekly')[0].id, 'w1');
});
