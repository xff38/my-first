/* tests/m4-business.test.js — M4 业务模块测试：schema 清洗 + store 级业务流 */
'use strict';
const { test, group, assert } = require('./harness.js');
const App = require('./harness.js').loadApp();
const U = App.util, S = App.schema, L = App.logic;

function freshStore() {
  const store = App.createStore();
  store.setCacheAdapter({ saveSnapshot() {}, loadSnapshot: () => null, pushOps() {}, loadOps: () => [], clearOps() {} });
  return store;
}

group('M4 · schema 清洗（自媒体/开发/咨询）');

test('选题状态非法回落"灵感"，标题空被丢', () => {
  const d = S.normalize({ media: { topics: [{ id: 't1', title: '好选题', status: '鬼状态' }, { title: '' }] } });
  assert.eq(d.media.topics.length, 1);
  assert.eq(d.media.topics[0].status, '灵感');
});

test('发布计划状态只允许 计划中/已发布', () => {
  const d = S.normalize({ media: { schedule: [{ id: 's1', title: 'x', status: '已发布', date: '2026-11-13', platform: 'B站' }, { id: 's2', title: 'y', status: '???' }] } });
  assert.eq(d.media.schedule[0].status, '已发布');
  assert.eq(d.media.schedule[1].status, '计划中');
});

test('数据记录平台为空被丢，数值非法回落 null', () => {
  const d = S.normalize({ media: { stats: [{ id: 'a', platform: '', views: 1 }, { id: 'b', platform: 'B站', views: 'abc', likes: 3 }] } });
  assert.eq(d.media.stats.length, 1);
  assert.eq(d.media.stats[0].views, null);
  assert.eq(d.media.stats[0].likes, 3);
});

test('项目进度夹紧 0-100，日志坏条目被过滤', () => {
  const d = S.normalize({ dev: { projects: [{ id: 'p1', name: 'P', progress: 150, status: '进行中', logs: [{ time: 't', text: 'ok' }, null, 'bad', { text: 'no time' }] }] } });
  assert.eq(d.dev.projects[0].progress, 100);
  assert.eq(d.dev.projects[0].logs.length, 2);
  assert.ok(d.dev.projects[0].logs[1].time, '缺 time 自动补');
});

test('收入金额负数保留（退款场景）但非数字回落 0', () => {
  const d = S.normalize({ consult: { incomes: [{ id: 'i1', amount: -50, client: 'A', date: '2026-11-13' }, { id: 'i2', amount: 'x', client: 'B', date: '2026-11-13' }] } });
  assert.eq(d.consult.incomes[0].amount, -50);
  assert.eq(d.consult.incomes[1].amount, 0);
});

group('M4 · 自媒体业务流');

test('选题状态循环：灵感→制作中→已发布→已放弃→灵感', () => {
  const store = freshStore();
  const t = store.upsert('media.topics', { id: 't1', title: '选题', status: '灵感' });
  const order = ['灵感', '制作中', '已发布', '已放弃'];
  let cur = t;
  for (let i = 0; i < 4; i++) {
    const next = order[(order.indexOf(cur.status) + 1) % 4];
    cur = store.upsert('media.topics', Object.assign({}, cur, { status: next }));
    assert.eq(store.data.media.topics[0].status, next);
  }
  assert.eq(store.data.media.topics[0].status, '灵感', '循环回起点');
});

test('标记已发布联动：schedule 状态 + 初始数据入 stats + 关联选题变已发布', () => {
  const store = freshStore();
  store.upsert('media.topics', { id: 't1', title: '选题A', status: '制作中' });
  store.upsert('media.schedule', { id: 's1', title: '选题A', platform: 'B站', date: '2026-11-13', status: '计划中', topicId: 't1' });
  /* 模拟 markPublished 的三步 */
  const s = store.data.media.schedule[0];
  store.upsert('media.schedule', Object.assign({}, s, { status: '已发布' }));
  store.upsert('media.stats', { id: U.uid(), platform: s.platform, date: U.today(), views: 100, likes: 10, fans: null });
  const topic = store.data.media.topics[0];
  store.upsert('media.topics', Object.assign({}, topic, { status: '已发布' }));
  assert.eq(store.data.media.schedule[0].status, '已发布');
  assert.eq(store.data.media.stats.length, 1);
  assert.eq(store.data.media.stats[0].views, 100);
  assert.eq(store.data.media.topics[0].status, '已发布');
});

group('M4 · 开发看板业务流');

test('拖拽换列：状态变更并自动写进展记录', () => {
  const store = freshStore();
  store.upsert('dev.projects', { id: 'p1', name: '官网', status: '未开始', progress: 0, nextStep: '搭框架' });
  const p = store.data.dev.projects[0];
  store.upsert('dev.projects', Object.assign({}, p, { status: '进行中', logs: p.logs.concat([{ time: new Date().toISOString(), text: L.projectChangeLog(p, { status: '进行中' }), auto: true }]) }));
  const p2 = store.data.dev.projects[0];
  assert.eq(p2.status, '进行中');
  assert.eq(p2.logs.length, 1);
  assert.includes(p2.logs[0].text, '状态：未开始 → 进行中');
});

test('四列状态集合与看板列一致', () => {
  const d = S.normalize({ dev: { projects: [{ id: 'p', name: 'x', status: '摸鱼中' }] } });
  assert.eq(d.dev.projects[0].status, '未开始', '非法状态回落');
  for (const st of ['未开始', '进行中', '暂停', '已完成']) {
    const dd = S.normalize({ dev: { projects: [{ id: 'p', name: 'x', status: st }] } });
    assert.eq(dd.dev.projects[0].status, st);
  }
});

group('M4 · 咨询业务流');

test('行内切换已收/未收保留其余字段', () => {
  const store = freshStore();
  store.upsert('consult.incomes', { id: 'i1', client: '客户A', desc: '咨询', amount: 1500, date: '2026-11-13', received: false });
  const r = store.data.consult.incomes[0];
  store.upsert('consult.incomes', Object.assign({}, r, { received: true }));
  const r2 = store.data.consult.incomes[0];
  assert.eq(r2.received, true);
  assert.eq(r2.amount, 1500);
  assert.eq(r2.client, '客户A');
});

test('汇总卡数据源：本月已收/未收随切换变化', () => {
  const store = freshStore();
  store.upsert('consult.incomes', { id: 'i1', client: 'A', amount: 1000, date: '2026-11-05', received: true });
  store.upsert('consult.incomes', { id: 'i2', client: 'B', amount: 500, date: '2026-11-10', received: false });
  let s = L.incomeMonthSummary(store.data.consult.incomes, '2026-11');
  assert.deepEq([s.received, s.unreceived, s.unreceivedCount], [1000, 500, 1]);
  store.upsert('consult.incomes', Object.assign({}, store.data.consult.incomes[1], { received: true }));
  s = L.incomeMonthSummary(store.data.consult.incomes, '2026-11');
  assert.deepEq([s.received, s.unreceived, s.unreceivedCount], [1500, 0, 0]);
});

test('月度柱状图序列：6 个月、已收未收分列', () => {
  const store = freshStore();
  store.upsert('consult.incomes', { id: 'i1', client: 'A', amount: 800, date: '2026-09-15', received: true });
  store.upsert('consult.incomes', { id: 'i2', client: 'B', amount: 200, date: '2026-11-01', received: false });
  const series = L.monthlyIncomeSeries(store.data.consult.incomes, '2026-11-13', 6);
  assert.eq(series.length, 6);
  assert.eq(series[3].month, '2026-09');
  assert.eq(series[3].received, 800);
  assert.eq(series[5].unreceived, 200);
});
