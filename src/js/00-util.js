/* 00-util.js — 纯工具函数（无 DOM 依赖，可在 Node 中测试） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = {};

  /* ---- ID ---- */
  U.uid = function () {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  };

  /* ---- 日期（一律本地时区，格式 YYYY-MM-DD） ---- */
  U.pad2 = function (n) { return (n < 10 ? '0' : '') + n; };

  U.toDateStr = function (d) {
    return d.getFullYear() + '-' + U.pad2(d.getMonth() + 1) + '-' + U.pad2(d.getDate());
  };

  U.today = function () { return U.toDateStr(new Date()); };

  U.parseDate = function (s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    var d = new Date(+m[1], +m[2] - 1, +m[3]);
    if (d.getFullYear() !== +m[1] || d.getMonth() !== +m[2] - 1 || d.getDate() !== +m[3]) return null;
    return d;
  };

  U.isValidDateStr = function (s) { return U.parseDate(s) !== null; };

  U.addDays = function (dateStr, n) {
    var d = U.parseDate(dateStr);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return U.toDateStr(d);
  };

  U.diffDays = function (a, b) { // b - a 的天数
    var da = U.parseDate(a), db = U.parseDate(b);
    if (!da || !db) return NaN;
    return Math.round((db - da) / 86400000);
  };

  U.weekdayCN = function (dateStr) {
    var d = U.parseDate(dateStr);
    if (!d) return '';
    return '日一二三四五六'.charAt(d.getDay());
  };

  /* 本周周一的日期 */
  U.mondayOf = function (dateStr) {
    var d = U.parseDate(dateStr);
    if (!d) return null;
    var wd = (d.getDay() + 6) % 7; // 周一=0
    d.setDate(d.getDate() - wd);
    return U.toDateStr(d);
  };

  U.monthOf = function (dateStr) { return (dateStr || '').slice(0, 7); }; // YYYY-MM

  U.fmtDateCN = function (dateStr) {
    var d = U.parseDate(dateStr);
    if (!d) return dateStr || '';
    return (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };

  U.greeting = function (hour) {
    if (hour == null) hour = new Date().getHours();
    if (hour < 6) return '夜深了';
    if (hour < 9) return '早上好';
    if (hour < 12) return '上午好';
    if (hour < 14) return '中午好';
    if (hour < 18) return '下午好';
    return '晚上好';
  };

  /* ---- 时间 HH:MM <-> 分钟 ---- */
  U.isValidTime = function (s) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(s || '');
    return !!m && +m[1] <= 23 && +m[2] <= 59;
  };
  U.timeToMin = function (s) {
    if (!U.isValidTime(s)) return NaN;
    var p = s.split(':');
    return (+p[0]) * 60 + (+p[1]);
  };
  U.minToTime = function (m) {
    m = Math.max(0, Math.min(24 * 60, Math.round(m)));
    return U.pad2(Math.floor(m / 60)) + ':' + U.pad2(m % 60);
  };
  U.fmtMinutes = function (mins) {
    mins = Math.max(0, Math.round(mins || 0));
    var h = Math.floor(mins / 60), m = mins % 60;
    if (h && m) return h + ' 小时 ' + m + ' 分';
    if (h) return h + ' 小时';
    return m + ' 分钟';
  };

  /* ---- 数字/金额 ---- */
  /* 严格解析：'12a' 这类脏输入视为非法（返回 dft），不做 parseFloat 的宽松前缀解析 */
  U.toNum = function (v, dft) {
    if (typeof v === 'number') return isFinite(v) ? v : (dft === undefined ? null : dft);
    var s = String(v == null ? '' : v).trim();
    if (!/^-?(\d+(\.\d*)?|\.\d+)$/.test(s)) return (dft === undefined ? null : dft);
    var n = parseFloat(s);
    return isFinite(n) ? n : (dft === undefined ? null : dft);
  };
  U.fmtMoney = function (n) {
    n = U.toNum(n, 0);
    return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  /* ---- 杂项 ---- */
  U.clamp = function (v, lo, hi) { return Math.min(hi, Math.max(lo, v)); };

  U.debounce = function (fn, ms) {
    var t = null;
    var wrapped = function () {
      var args = arguments, self = this;
      if (t) clearTimeout(t);
      t = setTimeout(function () { t = null; fn.apply(self, args); }, ms);
    };
    wrapped.flush = function () { if (t) { clearTimeout(t); t = null; fn(); } };
    return wrapped;
  };

  U.deepClone = function (o) { return JSON.parse(JSON.stringify(o)); };

  U.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  U.nl2br = function (s) { return U.esc(s).replace(/\n/g, '<br>'); };

  /* 数组按 key 分组，保持出现顺序 */
  U.groupBy = function (arr, keyFn) {
    var map = new Map();
    (arr || []).forEach(function (it) {
      var k = keyFn(it);
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(it);
    });
    return map;
  };

  U.sum = function (arr, fn) {
    return (arr || []).reduce(function (a, b) { return a + (fn ? fn(b) : b); }, 0);
  };

  /* 备份文件名：我的数据-2026-11-13.json，冲突时加 -HHmmss */
  U.backupFileName = function (baseName, dateStr, usedNames, now) {
    now = now || new Date();
    var stem = (baseName || '数据').replace(/\.json$/i, '');
    var simple = stem + '-' + dateStr + '.json';
    if (!usedNames || usedNames.indexOf(simple) === -1) return simple;
    var t = U.pad2(now.getHours()) + U.pad2(now.getMinutes()) + U.pad2(now.getSeconds());
    return stem + '-' + dateStr + '-' + t + '.json';
  };

  U.byDateDesc = function (a, b) { return (b.date || '').localeCompare(a.date || ''); };
  U.byDateAsc = function (a, b) { return (a.date || '').localeCompare(b.date || ''); };

  App.util = U;

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
