/* 90-router.js — hash 路由（核心逻辑纯函数，可测试） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var R = {};
  var routes = {};       // id -> {render, module}
  var order = [];
  var current = null;

  R.register = function (id, render) {
    if (!routes[id]) order.push(id);
    routes[id] = { render: render };
  };

  R.ids = function () { return order.slice(); };

  /* 解析 hash：'#/plan?d=2026-11-13' -> {id:'plan', params:{d:'...'}} */
  R.parseHash = function (hash) {
    var s = String(hash || '').replace(/^#\/?/, '');
    var qi = s.indexOf('?');
    var id = (qi === -1 ? s : s.slice(0, qi)) || 'home';
    var params = {};
    if (qi !== -1) {
      s.slice(qi + 1).split('&').forEach(function (kv) {
        if (!kv) return;
        var p = kv.split('=');
        params[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || '');
      });
    }
    return { id: id, params: params };
  };

  R.has = function (id) { return Object.prototype.hasOwnProperty.call(routes, id); };

  /* 供 app 层注入的钩子 */
  R.onNavigate = null;

  R.go = function (id, params) {
    var h = '#/' + id;
    if (params) {
      var qs = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]);
      }).join('&');
      if (qs) h += '?' + qs;
    }
    if (typeof location !== 'undefined') location.hash = h;
    else R.handle(h); // Node 测试环境
  };

  R.handle = function (hash) {
    var r = R.parseHash(hash);
    var id = R.has(r.id) ? r.id : 'home';
    current = id;
    if (R.onNavigate) R.onNavigate(id, r.params);
    return id;
  };

  R.current = function () { return current; };

  App.router = R;

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
