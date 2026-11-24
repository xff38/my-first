/* 52-charts.js — 轻量 SVG 图表（纯字符串构建，可 Node 测试；无外部依赖） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util;
  var C = {};

  C.PALETTE = ['#4f7cff', '#e85d9a', '#22a06b', '#ff8c42', '#7a5cff', '#2bb3c0', '#d9a514', '#f2555a'];

  function esc(s) { return U.esc(s); }

  function emptySvg(w, h, text) {
    return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" height="' + h + '" role="img">' +
      '<text x="' + (w / 2) + '" y="' + (h / 2) + '" text-anchor="middle" fill="var(--text-soft)" font-size="13">' + esc(text || '暂无数据') + '</text></svg>';
  }

  /* ---- 折线图 ----
     series: [{name, points:[{date, value}]}]
     opts: {width, height, from, to, yFmt} */
  C.lineChart = function (series, opts) {
    opts = opts || {};
    var W = opts.width || 720, H = opts.height || 240;
    var pad = { l: 46, r: 14, t: 14, b: 26 };
    var all = [];
    (series || []).forEach(function (s) { (s.points || []).forEach(function (p) { all.push(p); }); });
    if (!all.length) return emptySvg(W, H);

    var dates = all.map(function (p) { return p.date; }).sort();
    var from = opts.from || dates[0], to = opts.to || dates[dates.length - 1];
    var span = Math.max(1, U.diffDays(from, to));
    var vals = all.map(function (p) { return p.value; });
    var maxV = Math.max.apply(null, vals.concat([1]));
    var minV = Math.min.apply(null, vals.concat([0]));
    if (maxV === minV) maxV = minV + 1;

    function x(date) { return pad.l + (U.diffDays(from, date) / span) * (W - pad.l - pad.r); }
    function y(v) { return pad.t + (1 - (v - minV) / (maxV - minV)) * (H - pad.t - pad.b); }

    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" class="chart">'];
    /* 网格与 y 轴刻度（4 档） */
    for (var g = 0; g <= 4; g++) {
      var vy = minV + (maxV - minV) * g / 4;
      var yy = y(vy);
      parts.push('<line x1="' + pad.l + '" y1="' + yy + '" x2="' + (W - pad.r) + '" y2="' + yy + '" stroke="var(--border)" stroke-width="1"/>');
      parts.push('<text x="' + (pad.l - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="var(--text-soft)">' + esc(opts.yFmt ? opts.yFmt(vy) : Math.round(vy)) + '</text>');
    }
    /* x 轴首尾日期 */
    parts.push('<text x="' + pad.l + '" y="' + (H - 8) + '" font-size="10" fill="var(--text-soft)">' + esc(U.fmtDateCN(from)) + '</text>');
    parts.push('<text x="' + (W - pad.r) + '" y="' + (H - 8) + '" text-anchor="end" font-size="10" fill="var(--text-soft)">' + esc(U.fmtDateCN(to)) + '</text>');

    (series || []).forEach(function (s, si) {
      var color = s.color || C.PALETTE[si % C.PALETTE.length];
      var pts = (s.points || []).slice().sort(U.byDateAsc);
      if (!pts.length) return;
      var d = pts.map(function (p, i) {
        return (i ? 'L' : 'M') + x(p.date).toFixed(1) + ' ' + y(p.value).toFixed(1);
      }).join(' ');
      parts.push('<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="2"/>');
      pts.forEach(function (p) {
        parts.push('<circle cx="' + x(p.date).toFixed(1) + '" cy="' + y(p.value).toFixed(1) + '" r="3" fill="' + color + '"><title>' + esc(s.name + ' ' + p.date + '：' + p.value) + '</title></circle>');
      });
      /* 图例 */
      parts.push('<g><rect x="' + (pad.l + si * 110) + '" y="2" width="10" height="10" rx="2" fill="' + color + '"/>' +
        '<text x="' + (pad.l + si * 110 + 14) + '" y="11" font-size="11" fill="var(--text-soft)">' + esc(s.name) + '</text></g>');
    });
    parts.push('</svg>');
    return parts.join('');
  };

  /* ---- 堆叠柱状图 ----
     groups: [{label, parts:[{value, color?, name?}]}]
     opts: {width, height, yFmt, onHint} */
  C.barChart = function (groups, opts) {
    opts = opts || {};
    var W = opts.width || 720, H = opts.height || 220;
    var pad = { l: 52, r: 14, t: 14, b: 26 };
    groups = groups || [];
    if (!groups.length) return emptySvg(W, H);
    var totals = groups.map(function (g) { return U.sum(g.parts, function (p) { return p.value || 0; }); });
    var maxV = Math.max.apply(null, totals.concat([1]));

    var bw = (W - pad.l - pad.r) / groups.length;
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" height="' + H + '" role="img" class="chart">'];
    for (var g = 0; g <= 4; g++) {
      var vy = maxV * g / 4;
      var yy = pad.t + (1 - g / 4) * (H - pad.t - pad.b);
      parts.push('<line x1="' + pad.l + '" y1="' + yy + '" x2="' + (W - pad.r) + '" y2="' + yy + '" stroke="var(--border)" stroke-width="1"/>');
      parts.push('<text x="' + (pad.l - 6) + '" y="' + (yy + 4) + '" text-anchor="end" font-size="10" fill="var(--text-soft)">' + esc(opts.yFmt ? opts.yFmt(vy) : Math.round(vy)) + '</text>');
    }
    groups.forEach(function (grp, gi) {
      var cx = pad.l + gi * bw + bw / 2;
      var barW = Math.min(46, bw * 0.6);
      var yCursor = pad.t + (H - pad.t - pad.b);
      (grp.parts || []).forEach(function (p, pi) {
        var h = (p.value || 0) / maxV * (H - pad.t - pad.b);
        if (h <= 0) return;
        yCursor -= h;
        parts.push('<rect data-idx="' + gi + '" x="' + (cx - barW / 2) + '" y="' + yCursor.toFixed(1) + '" width="' + barW + '" height="' + h.toFixed(1) + '" fill="' + (p.color || C.PALETTE[pi % C.PALETTE.length]) + '" rx="2"><title>' + esc(grp.label + ' ' + (p.name || '') + '：' + (opts.yFmt ? opts.yFmt(p.value) : p.value)) + '</title></rect>');
      });
      parts.push('<text data-idx="' + gi + '" x="' + cx + '" y="' + (H - 8) + '" text-anchor="middle" font-size="10" fill="var(--text-soft)">' + esc(grp.label) + '</text>');
    });
    parts.push('</svg>');
    return parts.join('');
  };

  /* ---- 热力格（周×周网格） ----
     days: ['YYYY-MM-DD'...]（从周一开始，7 的倍数）
     valueFn(date) -> number（分钟等）
     opts: {cell, buckets:[阈值...]} */
  C.heatGrid = function (days, valueFn, opts) {
    opts = opts || {};
    var cell = opts.cell || 14, gap = 3;
    days = days || [];
    if (!days.length) return emptySvg(300, 100);
    var weeks = Math.ceil(days.length / 7);
    var W = weeks * (cell + gap) + 30, H = 7 * (cell + gap) + 20;
    var buckets = opts.buckets || [1, 30, 60, 120];
    var parts = ['<svg viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" role="img" class="chart">'];
    days.forEach(function (d, i) {
      var col = Math.floor(i / 7), row = i % 7;
      var v = valueFn ? (valueFn(d) || 0) : 0;
      var level = 0;
      for (var b = 0; b < buckets.length; b++) if (v >= buckets[b]) level = b + 1;
      var op = [0.12, 0.3, 0.5, 0.75, 1][level];
      parts.push('<rect data-date="' + d + '" x="' + (26 + col * (cell + gap)) + '" y="' + (4 + row * (cell + gap)) + '" width="' + cell + '" height="' + cell + '" rx="3" fill="var(--mod-color, var(--primary))" fill-opacity="' + op + '" stroke="var(--border)" stroke-width="0.5"><title>' + esc(d + '：' + v + ' 分钟') + '</title></rect>');
    });
    ['一', '三', '五', '日'].forEach(function (w, i) {
      parts.push('<text x="8" y="' + (4 + [0, 2, 4, 6][i] * (cell + gap) + cell - 3) + '" font-size="9" fill="var(--text-soft)">' + w + '</text>');
    });
    parts.push('</svg>');
    return parts.join('');
  };

  App.charts = C;

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
