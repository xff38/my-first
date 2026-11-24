/* 20-logic.js — 纯业务逻辑：oplog、合并、顺延、统计摘要、校验（可 Node 测试） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util, S = App.schema;
  var L = {};

  /* ============ oplog：未连接期间的操作日志 ============ */
  L.opUpsert = function (path, record, t) {
    return { t: t || Date.now(), type: 'upsert', path: path, id: record.id, value: U.deepClone(record) };
  };
  L.opMapSet = function (path, key, value, t) {
    return { t: t || Date.now(), type: 'mapset', path: path, id: key, value: (value && typeof value === 'object') ? U.deepClone(value) : value };
  };
  L.opRemove = function (path, id, t) {
    return { t: t || Date.now(), type: 'remove', path: path, id: id };
  };
  L.opSetting = function (key, value, t) {
    return { t: t || Date.now(), type: 'setting', key: key, value: (value && typeof value === 'object') ? U.deepClone(value) : value };
  };

  /* 应用单条 op 到 data（就地修改）。冲突规则：按 t 顺序重放，后到覆盖先到（本地新操作优先）。 */
  L.applyOp = function (data, op) {
    if (!op || !op.type) return false;
    if (op.type === 'setting') {
      data.settings = data.settings || {};
      data.settings[op.key] = (op.value && typeof op.value === 'object') ? U.deepClone(op.value) : op.value;
      return true;
    }
    var kind = S.COLLECTIONS[op.path];
    if (!kind) return false;
    if (op.type === 'upsert') {
      if (kind === 'array') {
        var arr = S.ensurePath(data, op.path, []);
        var idx = -1;
        for (var i = 0; i < arr.length; i++) if (arr[i] && arr[i].id === op.id) { idx = i; break; }
        var cleaned = S.cleanRecord(op.path, op.value);
        if (!cleaned) { if (idx >= 0) arr.splice(idx, 1); return true; }
        cleaned.id = op.id || cleaned.id;
        if (idx >= 0) arr[idx] = cleaned; else arr.push(cleaned);
      } else {
        var map = S.ensurePath(data, op.path, {});
        var v = S.cleanMapValue(op.path, op.id, op.value);
        if (v !== undefined) map[op.id] = v;
      }
      return true;
    }
    if (op.type === 'mapset') {
      var map2 = S.ensurePath(data, op.path, {});
      var v2 = S.cleanMapValue(op.path, op.id, op.value);
      if (v2 !== undefined) map2[op.id] = v2;
      else delete map2[op.id]; // 空值重放 = 删除键
      return true;
    }
    if (op.type === 'remove') {
      if (kind === 'array') {
        var arr2 = S.ensurePath(data, op.path, []);
        for (var j = arr2.length - 1; j >= 0; j--) if (arr2[j] && arr2[j].id === op.id) arr2.splice(j, 1);
      } else {
        var map3 = S.ensurePath(data, op.path, {});
        delete map3[op.id];
      }
      return true;
    }
    return false;
  };

  /* 重放整个 oplog（按时间稳定排序） */
  L.applyOplog = function (data, ops) {
    var sorted = (ops || []).slice().sort(function (a, b) { return (a.t || 0) - (b.t || 0); });
    var n = 0;
    sorted.forEach(function (op) { if (L.applyOp(data, op)) n++; });
    return n;
  };

  /* ============ 今日计划：未完成待办自动顺延 ============ */
  /* 把 date < today 且未完成、未被顺延过的待办复制到 today（carriedFrom=来源日期，carriedId=链根 id 去重），
     来源条目打 carried 标记（仍保留在历史日期，不算完成）。链式去重：同一根链每天最多顺延一条。
     返回顺延条数。幂等：重复调用不会重复顺延。 */
  L.carryOverTodos = function (data, today) {
    var todos = data.plan.todos;
    var existingCarried = {};
    todos.forEach(function (t) {
      if (t.date === today && t.carriedId) existingCarried[t.carriedId] = true;
    });
    var overdue = todos.filter(function (t) {
      return !t.done && !t.carried && t.date && t.date < today;
    }).sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); }); // 新日期优先
    var added = 0;
    overdue.forEach(function (t) {
      var root = t.carriedId || t.id;
      t.carried = true; // 已被顺延过，不再作为源头
      if (existingCarried[root]) return;
      todos.push({
        id: U.uid(), date: today, text: t.text, priority: t.priority || '中',
        done: false, carriedFrom: t.date, carriedId: root
      });
      existingCarried[root] = true;
      added++;
    });
    return added;
  };

  /* ============ 学习：连续打卡 ============ */
  /* 连续天数：从今天往回数（今天没打卡则从昨天起算，今天尚未结束不算断） */
  L.streakDays = function (checkins, today) {
    var n = 0;
    var d = today;
    if (!checkins[d]) d = U.addDays(today, -1);
    while (checkins[d]) { n++; d = U.addDays(d, -1); }
    return n;
  };

  L.checkinTotalMinutes = function (checkins, from, to) {
    var sum = 0;
    Object.keys(checkins).forEach(function (k) {
      if (k >= from && k <= to && checkins[k]) sum += (checkins[k].minutes || 0);
    });
    return sum;
  };

  /* 热力格：以今天所在周的周一为终点，往前 weeks 周的周一列表 */
  L.heatGridDays = function (today, weeks) {
    var monday = U.mondayOf(today);
    var start = U.addDays(monday, -(weeks - 1) * 7);
    var days = [];
    for (var i = 0; i < weeks * 7; i++) days.push(U.addDays(start, i));
    return { start: start, days: days };
  };

  /* ============ 目标进度 ============ */
  L.goalProgress = function (goal) {
    var subs = (goal && goal.subtasks) || [];
    if (!subs.length) return 0;
    var done = subs.filter(function (s) { return s.done; }).length;
    return Math.round(done / subs.length * 100);
  };

  /* ============ 咨询：收入统计 ============ */
  L.incomeMonthSummary = function (incomes, month) { // month: 'YYYY-MM'
    var received = 0, unreceived = 0, unreceivedCount = 0;
    (incomes || []).forEach(function (r) {
      if (U.monthOf(r.date) !== month) return;
      if (r.received) received += (r.amount || 0);
      else { unreceived += (r.amount || 0); unreceivedCount++; }
    });
    return { received: received, unreceived: unreceived, unreceivedCount: unreceivedCount };
  };

  L.incomeYearTotal = function (incomes, year) {
    return U.sum((incomes || []).filter(function (r) { return (r.date || '').slice(0, 4) === String(year) && r.received; }), function (r) { return r.amount || 0; });
  };

  /* 近 n 个月序列（含当月），返回 [{month:'YYYY-MM', received, unreceived}] */
  L.monthlyIncomeSeries = function (incomes, today, n) {
    var out = [];
    var d = U.parseDate(today);
    d.setDate(1);
    for (var i = n - 1; i >= 0; i--) {
      var dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
      var m = dd.getFullYear() + '-' + U.pad2(dd.getMonth() + 1);
      var s = L.incomeMonthSummary(incomes, m);
      out.push({ month: m, received: s.received, unreceived: s.unreceived });
    }
    return out;
  };

  /* ============ 自媒体：图表序列 ============ */
  /* 返回 [{platform, points:[{date, value}]}]，按日期升序，metric ∈ views/likes/fans */
  L.statsSeries = function (stats, metric, from, to) {
    var byPlatform = new Map();
    (stats || []).forEach(function (r) {
      if (r.date < from || r.date > to) return;
      var v = r[metric];
      if (v == null) return;
      if (!byPlatform.has(r.platform)) byPlatform.set(r.platform, []);
      byPlatform.get(r.platform).push({ date: r.date, value: v });
    });
    var out = [];
    byPlatform.forEach(function (points, platform) {
      points.sort(U.byDateAsc);
      out.push({ platform: platform, points: points });
    });
    out.sort(function (a, b) { return a.platform < b.platform ? -1 : (a.platform > b.platform ? 1 : 0); });
    return out;
  };

  L.nextSchedule = function (schedule, today) {
    var future = (schedule || []).filter(function (s) { return s.status === '计划中' && s.date >= today; }).sort(U.byDateAsc);
    if (future.length) return future[0];
    var past = (schedule || []).slice().sort(U.byDateDesc);
    return past.length ? past[0] : null;
  };

  /* ============ 开发：摘要 ============ */
  L.devSummary = function (projects) {
    var inProgress = (projects || []).filter(function (p) { return p.status === '进行中'; });
    var latest = (projects || []).slice().sort(function (a, b) { return (b.updated || '').localeCompare(a.updated || ''); })[0] || null;
    return { inProgressCount: inProgress.length, latestNextStep: latest ? (latest.nextStep || '') : '', latestName: latest ? latest.name : '' };
  };

  /* 项目更新时生成自动进展记录文本 */
  L.projectChangeLog = function (oldP, newP) {
    var parts = [];
    if (oldP.status !== newP.status) parts.push('状态：' + oldP.status + ' → ' + newP.status);
    if (oldP.progress !== newP.progress) parts.push('进度：' + oldP.progress + '% → ' + newP.progress + '%');
    if ((oldP.nextStep || '') !== (newP.nextStep || '')) parts.push('下一步：' + (newP.nextStep || '（空）'));
    return parts.join('；');
  };

  /* ============ 饮食/体重 ============ */
  L.weightSummary = function (weights) {
    var sorted = (weights || []).slice().sort(U.byDateAsc);
    if (!sorted.length) return null;
    var last = sorted[sorted.length - 1];
    var prev = sorted.length > 1 ? sorted[sorted.length - 2] : null;
    return { latest: last, change: prev ? (last.kg - prev.kg) : 0 };
  };

  L.dietTodayDone = function (records, today) {
    var r = records[today];
    if (!r) return 0;
    return ['breakfast', 'lunch', 'dinner'].filter(function (m) { return r[m] && r[m].eaten; }).length;
  };

  /* ============ 游戏娱乐 ============ */
  L.funWeekMinutes = function (funRecords, today) {
    var mon = U.mondayOf(today);
    var sun = U.addDays(mon, 6);
    return U.sum((funRecords || []).filter(function (r) { return r.date >= mon && r.date <= sun; }), function (r) { return r.minutes || 0; });
  };

  L.funMonthMinutes = function (funRecords, today) {
    var m = U.monthOf(today);
    return U.sum((funRecords || []).filter(function (r) { return U.monthOf(r.date) === m; }), function (r) { return r.minutes || 0; });
  };

  /* 抽选池 = 每周娱乐安排 + 手动 pool；随机抽一个，可排除若干 id */
  L.buildPickPool = function (weekly, pool) {
    var items = [];
    (weekly || []).forEach(function (w) { items.push({ id: w.id, text: w.what, src: 'weekly' }); });
    (pool || []).forEach(function (p) { items.push({ id: p.id, text: p.text, src: 'pool' }); });
    return items;
  };

  L.randomPick = function (items, excludeIds, rand) {
    var r = rand || Math.random;
    var avail = (items || []).filter(function (it) { return !(excludeIds || []).includes(it.id); });
    if (!avail.length) avail = items || [];
    if (!avail.length) return null;
    return avail[Math.floor(r() * avail.length) % avail.length];
  };

  /* ============ 今日计划摘要 ============ */
  L.planSummary = function (data, today) {
    var todos = data.plan.todos.filter(function (t) { return t.date === today; });
    var events = data.plan.events.filter(function (e) { return e.date === today; });
    return {
      todoTotal: todos.length,
      todoDone: todos.filter(function (t) { return t.done; }).length,
      eventCount: events.length
    };
  };

  /* ============ 校验 ============ */
  L.validateRequired = function (v, label) {
    return (v == null || String(v).trim() === '') ? (label + '不能为空') : null;
  };
  L.validateNumber = function (v, label, opts) {
    opts = opts || {};
    if (v === '' || v == null) return opts.required ? (label + '不能为空') : null;
    var n = U.toNum(v, null);
    if (n === null) return label + '必须是数字';
    if (opts.min != null && n < opts.min) return label + '不能小于 ' + opts.min;
    if (opts.max != null && n > opts.max) return label + '不能大于 ' + opts.max;
    return null;
  };
  L.validateTimeRange = function (start, end) {
    if (!U.isValidTime(start)) return '开始时间格式应为 HH:MM';
    if (!U.isValidTime(end)) return '结束时间格式应为 HH:MM';
    if (U.timeToMin(end) <= U.timeToMin(start)) return '结束时间必须晚于开始时间';
    return null;
  };
  /* 日程重叠检测：返回与 [start,end) 重叠的其他日程数量 */
  L.countOverlaps = function (events, date, start, end, excludeId) {
    var s = U.timeToMin(start), e = U.timeToMin(end);
    return (events || []).filter(function (ev) {
      return ev.date === date && ev.id !== excludeId &&
        U.timeToMin(ev.start) < e && s < U.timeToMin(ev.end);
    }).length;
  };

  App.logic = L;

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
