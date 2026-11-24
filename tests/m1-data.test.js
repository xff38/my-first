/* tests/m1-data.test.js — M1 数据层测试：schema/normalize、oplog 合并、store 保存管道、核心纯逻辑 */
'use strict';
const { test, group, assert } = require('./harness.js');
const App = require('./harness.js').loadApp();
const U = App.util, S = App.schema, L = App.logic;

/* ---------- mock 适配器 ---------- */
function mockCache() {
  let snap = null, ops = [];
  return {
    saveSnapshot: j => { snap = j; },
    loadSnapshot: () => snap,
    pushOps: o => { ops = o.slice(); },
    loadOps: () => ops.slice(),
    clearOps: () => { ops = []; },
    _dump: () => ({ snap, ops })
  };
}
function mockFile() {
  const a = {
    connected: false, fail: false, writes: [],
    isConnected: () => a.connected,
    name: () => '我的数据.json',
    write: j => { if (a.fail) throw new Error('磁盘写入失败'); a.writes.push(j); }
  };
  return a;
}

/* ============ schema ============ */
group('M1 · schema 与 normalize');

test('defaultData 结构覆盖全部 PRD 集合', () => {
  const d = S.defaultData();
  for (const p of Object.keys(S.COLLECTIONS)) {
    const v = S.getPath(d, p);
    assert.ok(v != null, '缺少集合 ' + p);
    assert.eq(S.COLLECTIONS[p] === 'array' ? Array.isArray(v) : (typeof v === 'object' && !Array.isArray(v)), true, p + ' 类型');
  }
  assert.deepEq(d.settings.platforms, ['B站', '抖音', '小红书', '公众号', '视频号', 'YouTube']);
});

test('normalize(null/undefined/空字符串) 返回默认结构', () => {
  for (const v of [null, undefined, '', '   ']) {
    const d = S.normalize(v);
    assert.ok(d && d.appVersion === 1);
    assert.deepEq(d.memos, []);
  }
});

test('normalize 损坏 JSON 返回 null（调用方可报错不崩溃）', () => {
  assert.eq(S.normalize('{broken json!!'), null);
  assert.eq(S.normalize('[1,2,3]'), null, '数组不是合法数据');
  assert.eq(S.normalize('hello'), null);
});

test('normalize 补全缺失字段并清洗坏值', () => {
  const d = S.normalize({
    memos: [{ text: '有效备忘' }, { text: '' }, null, { id: 'x', text: 123 }],
    plan: {
      todos: [{ id: 't1', text: '待办', priority: '超高', date: '不是日期' }, { text: '', date: '2026-11-13' }],
      reviews: { '2026-11-13': '今天不错', 'bad-date': 'x', '2026-11-14': null }
    },
    consult: { incomes: [{ id: 'i1', amount: '12a', received: 'yes', date: '2026-11-13', client: 'A' }] },
    diet: { weights: [{ id: 'w1', kg: 'abc', date: '2026-11-13' }, { id: 'w2', kg: 70.5, date: '2026-11-13' }] },
    settings: { theme: 'dark', platforms: [] }
  });
  assert.ok(d, '不应整体丢弃');
  assert.eq(d.memos.length, 2, '空文本被丢，数字文本被转字符串保留');
  assert.ok(d.memos[0].id, '缺失 id 自动补');
  assert.eq(d.plan.todos.length, 1, '空文本待办被丢');
  assert.eq(d.plan.todos[0].priority, '中', '非法优先级回落默认');
  assert.ok(U.isValidDateStr(d.plan.todos[0].date), '非法日期回落今天');
  assert.eq(d.plan.reviews['2026-11-13'], '今天不错');
  assert.eq(d.plan.reviews['bad-date'], undefined, '非法日期键被丢');
  assert.eq(d.plan.reviews['2026-11-14'], undefined, 'null 值被丢');
  assert.eq(d.consult.incomes[0].amount, 0, '非法金额回落 0');
  assert.eq(d.consult.incomes[0].received, true, 'truthy 转布尔');
  assert.eq(d.diet.weights.length, 1, '非法体重记录被丢');
  assert.eq(d.settings.theme, 'dark');
  assert.deepEq(d.settings.platforms, S.DEFAULT_PLATFORMS, '空平台列表回落默认');
});

test('normalize 去除同集合重复 id', () => {
  const d = S.normalize({ memos: [{ id: 'a', text: '1' }, { id: 'a', text: '2' }] });
  assert.eq(d.memos.length, 1);
  assert.eq(d.memos[0].text, '1', '保留第一条');
});

test('serialize 输出带 savedAt 的 JSON 且可再次 normalize', () => {
  const d = S.defaultData();
  d.memos.push({ id: 'm1', text: 'hi', pinned: false, createdAt: '' });
  const json = S.serialize(d);
  assert.ok(JSON.parse(json).savedAt, 'savedAt 已写入');
  const back = S.normalize(json);
  assert.eq(back.memos[0].text, 'hi');
});

/* ============ oplog ============ */
group('M1 · oplog 重放与合并');

test('upsert：数组集合新增与按 id 覆盖', () => {
  const d = S.defaultData();
  L.applyOp(d, L.opUpsert('memos', { id: 'm1', text: '第一条' }));
  assert.eq(d.memos.length, 1);
  L.applyOp(d, L.opUpsert('memos', { id: 'm1', text: '改过的' }));
  assert.eq(d.memos.length, 1, '同 id 覆盖不新增');
  assert.eq(d.memos[0].text, '改过的');
});

test('mapset：日期键集合写入（回顾/打卡/餐食）', () => {
  const d = S.defaultData();
  L.applyOp(d, L.opMapSet('plan.reviews', '2026-11-13', '今天很好'));
  assert.eq(d.plan.reviews['2026-11-13'], '今天很好');
  L.applyOp(d, L.opMapSet('study.checkins', '2026-11-13', { minutes: 90, note: '论文' }));
  assert.eq(d.study.checkins['2026-11-13'].minutes, 90);
  L.applyOp(d, L.opMapSet('plan.reviews', '坏日期', 'x'));
  assert.eq(d.plan.reviews['坏日期'], undefined, '非法键被拒绝');
});

test('remove：数组与 map 均可删除', () => {
  const d = S.defaultData();
  L.applyOp(d, L.opUpsert('memos', { id: 'm1', text: 'a' }));
  L.applyOp(d, L.opRemove('memos', 'm1'));
  assert.eq(d.memos.length, 0);
  L.applyOp(d, L.opMapSet('plan.reviews', '2026-11-13', 'x'));
  L.applyOp(d, L.opRemove('plan.reviews', '2026-11-13'));
  assert.eq(d.plan.reviews['2026-11-13'], undefined);
});

test('setting op 修改设置', () => {
  const d = S.defaultData();
  L.applyOp(d, L.opSetting('theme', 'dark'));
  assert.eq(d.settings.theme, 'dark');
  L.applyOp(d, L.opSetting('platforms', ['A', 'B']));
  assert.deepEq(d.settings.platforms, ['A', 'B']);
});

test('applyOplog 按时间排序重放，冲突时本地新操作优先', () => {
  const fileData = S.normalize({ memos: [{ id: 'm1', text: '文件里的旧内容' }] });
  const ops = [
    L.opUpsert('memos', { id: 'm1', text: '本地新内容' }, 200),
    L.opUpsert('memos', { id: 'm2', text: '离线新增' }, 100)
  ];
  const n = L.applyOplog(fileData, ops.slice().reverse()); // 输入乱序也要按 t 排
  assert.eq(n, 2);
  assert.eq(fileData.memos.length, 2);
  assert.eq(fileData.memos.filter(m => m.id === 'm1')[0].text, '本地新内容');
});

test('未知路径/类型的 op 被忽略且不崩溃', () => {
  const d = S.defaultData();
  assert.eq(L.applyOp(d, { type: 'upsert', path: 'hack.path', id: 'x', value: {} }), false);
  assert.eq(L.applyOp(d, { type: 'weird' }), false);
  assert.eq(L.applyOp(d, null), false);
});

/* ============ store 保存管道 ============ */
group('M1 · store 自动保存管道（T2 离线暂存 / 写失败保护 / 连接合并）');

test('未连接：修改进入暂存（快照＋oplog），状态=cache', () => {
  const store = App.createStore();
  const cache = mockCache();
  store.setCacheAdapter(cache);
  store.upsert('memos', { id: 'm1', text: '离线备忘' });
  store.saveNow();
  assert.eq(store.saveState(), 'cache');
  assert.ok(cache.loadSnapshot().includes('离线备忘'), '快照含修改');
  assert.eq(cache.loadOps().length, 1, 'oplog 含 1 条操作');
  assert.eq(store.pendingOps().length, 1);
});

test('重启恢复：新 store loadFromCache 拿回数据与未决 ops', () => {
  const cache = mockCache();
  const s1 = App.createStore();
  s1.setCacheAdapter(cache);
  s1.upsert('consult.incomes', { id: 'i1', client: '客户A', amount: 800, date: '2026-11-13' });
  s1.mapSet('plan.reviews', '2026-11-13', '离线写的回顾');
  s1.saveNow();

  const s2 = App.createStore();          // 模拟重新打开
  s2.setCacheAdapter(cache);
  s2.loadFromCache();
  assert.eq(s2.data.consult.incomes.length, 1, '收入记录还在');
  assert.eq(s2.data.consult.incomes[0].amount, 800);
  assert.eq(s2.data.plan.reviews['2026-11-13'], '离线写的回顾');
  assert.eq(s2.pendingOps().length, 2, '未决 ops 恢复');
});

test('连接文件：文件数据＋oplog 合并写回，成功后清空未决 ops（T2 完整链路）', () => {
  const cache = mockCache();
  const file = mockFile();
  /* 离线阶段 */
  const s1 = App.createStore();
  s1.setCacheAdapter(cache);
  s1.upsert('memos', { id: 'm1', text: '文件里没有的备忘' });
  s1.upsert('memos', { id: 'shared', text: '本地较新版本' });
  s1.saveNow();

  /* 模拟重新打开并连接文件：文件里已有旧数据 */
  const s2 = App.createStore();
  s2.setCacheAdapter(cache);
  s2.loadFromCache();
  const fileData = S.normalize(JSON.stringify({ memos: [{ id: 'shared', text: '文件较旧版本' }, { id: 'f1', text: '文件独有' }] }));
  L.applyOplog(fileData, s2.pendingOps());
  file.connected = true;
  s2.setFileAdapter(file);
  s2.setData(fileData);
  s2.saveNow();

  assert.eq(s2.saveState(), 'saved');
  assert.eq(s2.pendingOps().length, 0, '写文件成功后清空未决 ops');
  assert.eq(cache.loadOps().length, 0, '缓存 oplog 同步清空');
  const memos = s2.data.memos;
  assert.eq(memos.length, 3);
  assert.eq(memos.filter(m => m.id === 'shared')[0].text, '本地较新版本', '冲突时本地新操作优先');
  assert.ok(memos.filter(m => m.id === 'f1').length === 1, '文件独有数据保留');
  assert.ok(memos.filter(m => m.id === 'm1').length === 1, '离线新增合并进文件');
  const written = JSON.parse(file.writes[file.writes.length - 1]);
  assert.eq(written.memos.length, 3, '合并结果已写入文件');
});

test('写文件失败：状态=error，未决 ops 保留可重试', () => {
  const cache = mockCache();
  const file = mockFile();
  file.connected = true; file.fail = true;
  const store = App.createStore();
  store.setCacheAdapter(cache);
  store.setFileAdapter(file);
  store.upsert('memos', { id: 'm9', text: '写入会失败' });
  store.saveNow();
  assert.eq(store.saveState(), 'error');
  assert.ok(store.lastError().includes('磁盘写入失败'));
  assert.eq(store.pendingOps().length, 1, 'ops 未丢');
  assert.ok(cache.loadSnapshot().includes('写入会失败'), '快照兜底仍在');
  /* 恢复后重试成功 */
  file.fail = false;
  store.saveNow();
  assert.eq(store.saveState(), 'saved');
  assert.eq(store.pendingOps().length, 0);
});

test('mapSet/remove/setSetting 全部产生对应 op 且改动生效', () => {
  const store = App.createStore();
  store.setCacheAdapter(mockCache());
  store.mapSet('diet.meals', '2026-11-13', { breakfast: '豆浆油条', lunch: '', dinner: '' });
  store.remove('diet.meals', '2026-11-13');
  store.setSetting('theme', 'dark');
  assert.eq(store.pendingOps().length, 3);
  assert.eq(store.data.diet.meals['2026-11-13'], undefined);
  assert.eq(store.data.settings.theme, 'dark');
});

test('upsert 坏数据被拒绝，不污染 store', () => {
  const store = App.createStore();
  store.setCacheAdapter(mockCache());
  assert.eq(store.upsert('memos', { text: '' }), null, '空文本拒绝');
  assert.eq(store.pendingOps().length, 0);
});

/* ============ 待办自动顺延 ============ */
group('M1 · 未完成待办自动顺延（幂等）');

test('过期未完成顺延到今天，完成/未来/今天的不动，重复执行不重复顺延', () => {
  const d = S.defaultData();
  d.plan.todos = [
    { id: 'a', date: '2026-11-10', text: '过期未完成', priority: '中', done: false },
    { id: 'b', date: '2026-11-10', text: '过期已完成', priority: '中', done: true },
    { id: 'c', date: '2026-11-20', text: '未来待办', priority: '中', done: false },
    { id: 'd', date: '2026-11-13', text: '今天的', priority: '中', done: false }
  ].map(t => S.cleanRecord('plan.todos', t));
  const n1 = L.carryOverTodos(d, '2026-11-13');
  assert.eq(n1, 1, '只顺延 1 条');
  const carried = d.plan.todos.filter(t => t.date === '2026-11-13' && t.carriedFrom === '2026-11-10');
  assert.eq(carried.length, 1);
  assert.eq(carried[0].text, '过期未完成');
  assert.eq(d.plan.todos.filter(t => t.id === 'a').length, 1, '历史原条目保留');
  const n2 = L.carryOverTodos(d, '2026-11-13');
  assert.eq(n2, 0, '幂等：再次执行不重复');
  const n3 = L.carryOverTodos(d, '2026-11-14');
  assert.eq(n3, 2, '再过一天：原条目与昨日顺延条目（仍未完成）都顺延');
});

/* ============ 业务纯逻辑 ============ */
group('M1 · 业务纯逻辑（统计/校验/图表序列）');

test('学习连续打卡：今天已打/未打/断档', () => {
  const c1 = { '2026-11-13': { minutes: 60 }, '2026-11-12': { minutes: 30 }, '2026-11-11': { minutes: 30 } };
  assert.eq(L.streakDays(c1, '2026-11-13'), 3);
  const c2 = { '2026-11-12': { minutes: 30 }, '2026-11-11': { minutes: 30 } };
  assert.eq(L.streakDays(c2, '2026-11-13'), 2, '今天还没打不算断');
  const c3 = { '2026-11-13': { minutes: 60 }, '2026-11-11': { minutes: 30 } };
  assert.eq(L.streakDays(c3, '2026-11-13'), 1, '断档归零重计');
  assert.eq(L.streakDays({}, '2026-11-13'), 0);
});

test('checkinTotalMinutes 区间统计', () => {
  const c = { '2026-11-01': { minutes: 60 }, '2026-11-05': { minutes: 90 }, '2026-12-01': { minutes: 10 } };
  assert.eq(L.checkinTotalMinutes(c, '2026-11-01', '2026-11-30'), 150);
});

test('heatGridDays 生成 8 周 56 天且以本周结尾', () => {
  const g = L.heatGridDays('2026-11-13', 8);
  assert.eq(g.days.length, 56);
  assert.eq(g.days[55], '2026-11-15', '最后一天是本周周日');
  assert.eq(U.weekdayCN(g.days[0]), '一', '从周一开始');
});

test('goalProgress 由子任务计算', () => {
  assert.eq(L.goalProgress({ subtasks: [] }), 0);
  const g = { subtasks: [{ done: true }, { done: true }, { done: false }, { done: false }] };
  assert.eq(L.goalProgress(g), 50);
});

test('咨询收入：月汇总/年累计/近6月序列', () => {
  const incomes = [
    { date: '2026-11-01', amount: 1000, received: true },
    { date: '2026-11-15', amount: 500, received: false },
    { date: '2026-10-01', amount: 2000, received: true },
    { date: '2025-01-01', amount: 999, received: true }
  ];
  const s = L.incomeMonthSummary(incomes, '2026-11');
  assert.eq(s.received, 1000);
  assert.eq(s.unreceived, 500);
  assert.eq(s.unreceivedCount, 1);
  assert.eq(L.incomeYearTotal(incomes, 2026), 3000, '年累计只算已收');
  const series = L.monthlyIncomeSeries(incomes, '2026-11-13', 6);
  assert.eq(series.length, 6);
  assert.eq(series[5].month, '2026-11');
  assert.eq(series[4].month, '2026-10');
  assert.eq(series[4].received, 2000);
  assert.eq(series[0].received, 0);
});

test('自媒体 statsSeries 按平台分组、按日期升序、区间过滤', () => {
  const stats = [
    { platform: 'B站', date: '2026-11-10', views: 100 },
    { platform: 'B站', date: '2026-11-01', views: 50 },
    { platform: '抖音', date: '2026-11-05', views: 200 },
    { platform: 'B站', date: '2026-10-01', views: 10 }
  ];
  const series = L.statsSeries(stats, 'views', '2026-11-01', '2026-11-30');
  assert.eq(series.length, 2);
  assert.eq(series[0].platform, 'B站');
  assert.deepEq(series[0].points.map(p => p.value), [50, 100], '升序');
  assert.eq(series[1].points.length, 1);
});

test('nextSchedule 优先未来计划中，无则最近一条', () => {
  const sch = [
    { date: '2026-11-20', status: '计划中', title: 'future' },
    { date: '2026-11-01', status: '已发布', title: 'past' }
  ];
  assert.eq(L.nextSchedule(sch, '2026-11-13').title, 'future');
  assert.eq(L.nextSchedule([{ date: '2026-11-01', status: '已发布', title: 'past' }], '2026-11-13').title, 'past');
  assert.eq(L.nextSchedule([], '2026-11-13'), null);
});

test('devSummary 与 projectChangeLog', () => {
  const projects = [
    { name: 'A', status: '进行中', nextStep: '写接口', updated: '2026-11-13T01:00:00Z' },
    { name: 'B', status: '进行中', nextStep: '', updated: '2026-11-12T01:00:00Z' },
    { name: 'C', status: '已完成', nextStep: '', updated: '2026-11-11T01:00:00Z' }
  ];
  const s = L.devSummary(projects);
  assert.eq(s.inProgressCount, 2);
  assert.eq(s.latestName, 'A');
  const log = L.projectChangeLog({ status: '进行中', progress: 40, nextStep: '旧' }, { status: '已完成', progress: 100, nextStep: '旧' });
  assert.includes(log, '状态：进行中 → 已完成');
  assert.includes(log, '进度：40% → 100%');
  assert.ok(!log.includes('下一步'), '未变化的字段不记录');
});

test('weightSummary 最新值与变化量', () => {
  const w = [{ date: '2026-11-01', kg: 72 }, { date: '2026-11-13', kg: 70.5 }];
  const s = L.weightSummary(w);
  assert.eq(s.latest.kg, 70.5);
  assert.eq(s.change, -1.5);
  assert.eq(L.weightSummary([]), null);
});

test('dietTodayDone 统计已吃餐数', () => {
  const records = { '2026-11-13': { breakfast: { eaten: true }, lunch: { eaten: false }, dinner: { eaten: true } } };
  assert.eq(L.dietTodayDone(records, '2026-11-13'), 2);
  assert.eq(L.dietTodayDone(records, '2026-11-12'), 0);
});

test('funWeekMinutes/funMonthMinutes', () => {
  const recs = [
    { date: '2026-11-09', minutes: 60 },  // 本周一
    { date: '2026-11-13', minutes: 90 },  // 本周五
    { date: '2026-11-16', minutes: 30 },  // 下周一（出界）
    { date: '2026-11-01', minutes: 45 }   // 本月但上周
  ];
  assert.eq(L.funWeekMinutes(recs, '2026-11-13'), 150);
  assert.eq(L.funMonthMinutes(recs, '2026-11-13'), 225);
});

test('buildPickPool + randomPick 排除与兜底', () => {
  const pool = L.buildPickPool([{ id: 'w1', what: '电影夜' }], [{ id: 'p1', text: '塞尔达' }]);
  assert.eq(pool.length, 2);
  const r1 = L.randomPick(pool, [], () => 0);
  assert.eq(r1.id, 'w1');
  const r2 = L.randomPick(pool, ['w1'], () => 0);
  assert.eq(r2.id, 'p1', '排除后抽另一个');
  const r3 = L.randomPick(pool, ['w1', 'p1'], () => 0);
  assert.ok(r3, '全部排除时兜底返回全池随机');
  assert.eq(L.randomPick([], [], () => 0), null);
});

test('planSummary 今日统计', () => {
  const d = S.defaultData();
  d.plan.todos = [
    S.cleanRecord('plan.todos', { date: '2026-11-13', text: 'a', done: true }),
    S.cleanRecord('plan.todos', { date: '2026-11-13', text: 'b', done: false }),
    S.cleanRecord('plan.todos', { date: '2026-11-12', text: 'c', done: false })
  ];
  d.plan.events = [S.cleanRecord('plan.events', { date: '2026-11-13', start: '09:00', end: '10:00', title: 'x' })];
  const s = L.planSummary(d, '2026-11-13');
  assert.deepEq(s, { todoTotal: 2, todoDone: 1, eventCount: 1 });
});

test('校验：必填/数字/时间区间/日程重叠', () => {
  assert.eq(L.validateRequired('', '标题'), '标题不能为空');
  assert.eq(L.validateRequired('  ', '标题'), '标题不能为空');
  assert.eq(L.validateRequired('x', '标题'), null);
  assert.eq(L.validateNumber('abc', '金额'), '金额必须是数字');
  assert.eq(L.validateNumber('-5', '金额', { min: 0 }), '金额不能小于 0');
  assert.eq(L.validateNumber('', '金额', { required: true }), '金额不能为空');
  assert.eq(L.validateNumber('3', '金额', { min: 0 }), null);
  assert.ok(L.validateTimeRange('10:00', '09:00'), '结束早于开始应报错');
  assert.eq(L.validateTimeRange('09:00', '10:00'), null);
  const events = [{ id: 'e1', date: '2026-11-13', start: '09:00', end: '11:00' }];
  assert.eq(L.countOverlaps(events, '2026-11-13', '10:00', '12:00', null), 1);
  assert.eq(L.countOverlaps(events, '2026-11-13', '10:00', '12:00', 'e1'), 0, '排除自身');
  assert.eq(L.countOverlaps(events, '2026-11-13', '11:00', '12:00', null), 0, '首尾相接不算重叠');
  assert.eq(L.countOverlaps(events, '2026-11-14', '09:00', '12:00', null), 0, '不同日期');
});

test('persist 能力探测在 Node 环境返回全 false 且不崩溃', () => {
  assert.ok(App.persist && App.persist.caps);
  assert.eq(App.persist.caps.open, false);
  assert.eq(App.persist.caps.save, false);
  assert.eq(App.persist.caps.dir, false);
});
