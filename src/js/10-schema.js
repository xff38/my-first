/* 10-schema.js — 数据结构定义、默认值与 normalize（纯函数，可 Node 测试） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util;
  var S = {};

  S.APP_VERSION = 1;

  S.DEFAULT_PLATFORMS = ['B站', '抖音', '小红书', '公众号', '视频号', 'YouTube'];
  S.DEFAULT_RECIPE_TAGS = ['主食', '荤', '素', '汤', '外卖'];

  /* 集合元数据：path -> 'array'（按 id 的数组）| 'map'（按日期/键的对象） */
  S.COLLECTIONS = {
    'memos': 'array',
    'plan.events': 'array',
    'plan.todos': 'array',
    'plan.reviews': 'map',
    'media.topics': 'array',
    'media.schedule': 'array',
    'media.stats': 'array',
    'dev.projects': 'array',
    'consult.incomes': 'array',
    'study.goals': 'array',
    'study.checkins': 'map',
    'study.timetable': 'array',
    'study.readings': 'array',
    'diet.recipes': 'array',
    'diet.meals': 'map',
    'diet.records': 'map',
    'diet.weights': 'array',
    'fun.records': 'array',
    'fun.weekly': 'array',
    'fun.pool': 'array'
  };

  S.defaultData = function () {
    return {
      appVersion: S.APP_VERSION,
      savedAt: null,
      settings: {
        theme: 'light',
        sidebarCollapsed: false,
        platforms: S.DEFAULT_PLATFORMS.slice(),
        recipeTags: S.DEFAULT_RECIPE_TAGS.slice()
      },
      memos: [],
      plan: { events: [], todos: [], reviews: {} },
      media: { topics: [], schedule: [], stats: [] },
      dev: { projects: [] },
      consult: { incomes: [] },
      study: { goals: [], checkins: {}, timetable: [], readings: [] },
      diet: { recipes: [], meals: {}, records: {}, weights: [] },
      fun: { records: [], weekly: [], pool: [] }
    };
  };

  /* 路径读写：getPath({a:{b:1}}, 'a.b') === 1 */
  S.getPath = function (obj, path) {
    return path.split('.').reduce(function (o, k) { return (o == null ? o : o[k]); }, obj);
  };
  S.setPath = function (obj, path, value) {
    var keys = path.split('.');
    var last = keys.pop();
    var target = keys.reduce(function (o, k) {
      if (o[k] == null || typeof o[k] !== 'object') o[k] = {};
      return o[k];
    }, obj);
    target[last] = value;
  };
  S.ensurePath = function (obj, path, dft) {
    if (S.getPath(obj, path) == null) S.setPath(obj, path, dft);
    return S.getPath(obj, path);
  };

  /* ---- 单条记录字段清洗（宽容：坏字段给默认值，不整条丢弃） ---- */
  function str(v, dft) { return (typeof v === 'string' ? v : (v == null ? (dft || '') : String(v))); }
  function bool(v, dft) { return (typeof v === 'boolean' ? v : (v == null ? !!dft : !!v)); }
  function num(v, dft) { var n = U.toNum(v, null); return n === null ? (dft === undefined ? null : dft) : n; }
  function dateOr(v, dft) { return U.isValidDateStr(v) ? v : (dft || null); }
  function timeOr(v, dft) { return U.isValidTime(v) ? (v.length === 4 ? '0' + v : v) : (dft || null); }
  function ensureId(rec) { if (!rec || typeof rec !== 'object') return null; if (!rec.id) rec.id = U.uid(); return rec; }

  S.cleanRecord = function (path, rec) {
    if (rec == null || typeof rec !== 'object') return null;
    rec = Object.assign({}, rec);
    ensureId(rec);
    switch (path) {
      case 'memos':
        rec.text = str(rec.text); rec.pinned = bool(rec.pinned, false);
        rec.createdAt = str(rec.createdAt) || new Date().toISOString();
        if (!rec.text) return null;
        break;
      case 'plan.events':
        rec.date = dateOr(rec.date, U.today()); rec.start = timeOr(rec.start, '09:00');
        rec.end = timeOr(rec.end, '10:00'); rec.title = str(rec.title); rec.note = str(rec.note);
        if (!rec.title) return null;
        break;
      case 'plan.todos':
        rec.date = dateOr(rec.date, U.today()); rec.text = str(rec.text);
        rec.priority = ['高', '中', '低'].indexOf(rec.priority) >= 0 ? rec.priority : '中';
        rec.done = bool(rec.done, false);
        rec.carried = bool(rec.carried, false);
        rec.carriedFrom = dateOr(rec.carriedFrom, null);
        rec.carriedId = rec.carriedId ? str(rec.carriedId) : null;
        if (!rec.text) return null;
        break;
      case 'media.topics':
        rec.title = str(rec.title); rec.desc = str(rec.desc); rec.note = str(rec.note);
        rec.status = ['灵感', '制作中', '已发布', '已放弃'].indexOf(rec.status) >= 0 ? rec.status : '灵感';
        rec.createdAt = str(rec.createdAt) || new Date().toISOString();
        if (!rec.title) return null;
        break;
      case 'media.schedule':
        rec.date = dateOr(rec.date, U.today()); rec.platform = str(rec.platform);
        rec.title = str(rec.title);
        rec.status = ['计划中', '已发布'].indexOf(rec.status) >= 0 ? rec.status : '计划中';
        rec.topicId = rec.topicId == null ? null : str(rec.topicId);
        if (!rec.title) return null;
        break;
      case 'media.stats':
        rec.date = dateOr(rec.date, U.today()); rec.platform = str(rec.platform);
        rec.views = num(rec.views, null); rec.likes = num(rec.likes, null); rec.fans = num(rec.fans, null);
        if (!rec.platform) return null;
        break;
      case 'dev.projects':
        rec.name = str(rec.name);
        rec.status = ['未开始', '进行中', '暂停', '已完成'].indexOf(rec.status) >= 0 ? rec.status : '未开始';
        rec.progress = U.clamp(Math.round(num(rec.progress, 0) || 0), 0, 100);
        rec.nextStep = str(rec.nextStep); rec.note = str(rec.note);
        rec.due = dateOr(rec.due, null);
        rec.updated = str(rec.updated) || new Date().toISOString();
        rec.logs = Array.isArray(rec.logs) ? rec.logs.filter(function (l) { return l && typeof l === 'object'; }).map(function (l) {
          return { time: str(l.time) || new Date().toISOString(), text: str(l.text), auto: bool(l.auto, false) };
        }) : [];
        if (!rec.name) return null;
        break;
      case 'consult.incomes':
        rec.date = dateOr(rec.date, U.today()); rec.client = str(rec.client); rec.desc = str(rec.desc);
        rec.amount = num(rec.amount, 0) || 0; rec.received = bool(rec.received, false); rec.note = str(rec.note);
        break;
      case 'study.goals':
        rec.title = str(rec.title); rec.due = dateOr(rec.due, null);
        rec.subtasks = (Array.isArray(rec.subtasks) ? rec.subtasks : []).map(function (st) {
          if (!st || typeof st !== 'object') return null;
          return {
            id: str(st.id) || U.uid(), text: str(st.text), done: bool(st.done, false), due: dateOr(st.due, null),
            checks: (Array.isArray(st.checks) ? st.checks : []).map(function (c) {
              return (c && typeof c === 'object') ? { text: str(c.text), done: bool(c.done, false) } : null;
            }).filter(Boolean)
          };
        }).filter(function (st) { return st && st.text; });
        if (!rec.title) return null;
        break;
      case 'study.timetable':
        rec.weekday = U.clamp(Math.round(num(rec.weekday, 1) || 1), 1, 7);
        rec.start = timeOr(rec.start, '19:00'); rec.end = timeOr(rec.end, '21:00');
        rec.text = str(rec.text); rec.color = U.clamp(Math.round(num(rec.color, 0) || 0), 0, 7);
        if (!rec.text) return null;
        break;
      case 'study.readings':
        rec.name = str(rec.name);
        rec.type = ['书籍', '论文', '课程'].indexOf(rec.type) >= 0 ? rec.type : '书籍';
        rec.status = ['想读', '在读', '读完'].indexOf(rec.status) >= 0 ? rec.status : '想读';
        rec.note = str(rec.note); rec.doneDate = dateOr(rec.doneDate, null);
        if (!rec.name) return null;
        break;
      case 'diet.recipes':
        rec.name = str(rec.name); rec.ingredients = str(rec.ingredients); rec.steps = str(rec.steps);
        rec.tags = Array.isArray(rec.tags) ? rec.tags.map(function (t) { return str(t); }).filter(Boolean) : [];
        if (!rec.name) return null;
        break;
      case 'diet.weights':
        rec.date = dateOr(rec.date, U.today()); rec.kg = num(rec.kg, null); rec.bf = num(rec.bf, null);
        if (rec.kg == null || rec.kg <= 0) return null;
        break;
      case 'fun.records':
        rec.date = dateOr(rec.date, U.today()); rec.what = str(rec.what);
        rec.minutes = Math.max(0, Math.round(num(rec.minutes, 0) || 0));
        rec.mood = ['good', 'ok', 'bad'].indexOf(rec.mood) >= 0 ? rec.mood : null;
        if (!rec.what) return null;
        break;
      case 'fun.weekly':
        rec.weekday = U.clamp(Math.round(num(rec.weekday, 1) || 1), 1, 7);
        rec.time = timeOr(rec.time, '20:00'); rec.what = str(rec.what);
        if (!rec.what) return null;
        break;
      case 'fun.pool':
        rec.text = str(rec.text);
        if (!rec.text) return null;
        break;
      default:
        break;
    }
    return rec;
  };

  /* map 型集合的值清洗（键为日期或特殊键） */
  S.cleanMapValue = function (path, key, value) {
    if (!U.isValidDateStr(key)) return undefined;
    switch (path) {
      case 'plan.reviews':
        var rv = str(value, '');
        return rv === '' ? undefined : rv; // 空回顾不落库
      case 'study.checkins':
        if (value == null || typeof value !== 'object') return undefined;
        return { minutes: Math.max(0, Math.round(num(value.minutes, 0) || 0)), note: str(value.note) };
      case 'diet.meals':
        if (value == null || typeof value !== 'object') return undefined;
        return { breakfast: str(value.breakfast), lunch: str(value.lunch), dinner: str(value.dinner) };
      case 'diet.records':
        if (value == null || typeof value !== 'object') return undefined;
        var out = {};
        ['breakfast', 'lunch', 'dinner'].forEach(function (m) {
          var mv = (value[m] && typeof value[m] === 'object') ? value[m] : {};
          out[m] = { actual: str(mv.actual), eaten: bool(mv.eaten, false) };
        });
        return out;
      default:
        return value;
    }
  };

  /* ---- normalize：把任意外来数据（含残缺/损坏）补全为合法结构 ---- */
  S.normalize = function (input) {
    var data = S.defaultData();
    if (input == null) return data;
    if (typeof input === 'string') {
      var t = input.trim();
      if (!t) return data; // 空文件 → 初始结构
      try { input = JSON.parse(t); } catch (e) { return null; } // 明确损坏 → null（调用方决定报错）
    }
    if (typeof input !== 'object' || Array.isArray(input)) return null;

    /* settings */
    if (input.settings && typeof input.settings === 'object') {
      var st = input.settings;
      data.settings.theme = (st.theme === 'dark' ? 'dark' : 'light');
      data.settings.sidebarCollapsed = bool(st.sidebarCollapsed, false);
      if (Array.isArray(st.platforms) && st.platforms.length) {
        data.settings.platforms = st.platforms.map(function (p) { return str(p); }).filter(Boolean);
      }
      if (Array.isArray(st.recipeTags) && st.recipeTags.length) {
        data.settings.recipeTags = st.recipeTags.map(function (p) { return str(p); }).filter(Boolean);
      }
    }
    data.savedAt = str(input.savedAt, null);
    data.appVersion = num(input.appVersion, S.APP_VERSION) || S.APP_VERSION;

    /* 集合 */
    Object.keys(S.COLLECTIONS).forEach(function (path) {
      var kind = S.COLLECTIONS[path];
      var src = S.getPath(input, path);
      if (kind === 'array') {
        var arr = Array.isArray(src) ? src : [];
        var seen = {};
        var out = [];
        arr.forEach(function (rec) {
          var c = S.cleanRecord(path, rec);
          if (c && !seen[c.id]) { seen[c.id] = 1; out.push(c); }
        });
        S.setPath(data, path, out);
      } else {
        var map = {};
        if (src && typeof src === 'object' && !Array.isArray(src)) {
          Object.keys(src).forEach(function (k) {
            var v = S.cleanMapValue(path, k, src[k]);
            if (v !== undefined) map[k] = v;
          });
        }
        S.setPath(data, path, map);
      }
    });
    return data;
  };

  S.serialize = function (data) {
    var copy = U.deepClone(data);
    copy.savedAt = new Date().toISOString();
    return JSON.stringify(copy, null, 1);
  };

  App.schema = S;

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
