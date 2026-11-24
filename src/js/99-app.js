/* 99-app.js — 外壳初始化：侧边栏、顶栏、主题、路由挂载（浏览器环境） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util, R = App.router;
  var shell = {};
  var scrollTops = {};
  var lastModuleId = null;

  /* ---------- 顶栏状态 ---------- */
  shell.setSaveState = function (text, cls) {
    var el = document.getElementById('save-state');
    if (!el) return;
    el.textContent = text;
    el.className = 'save-state' + (cls ? ' ' + cls : '');
  };

  shell.setFileState = function (connected, fileName) {
    var el = document.getElementById('file-state');
    if (!el) return;
    el.className = 'file-state ' + (connected ? 'file-state-on' : 'file-state-off');
    el.textContent = connected ? ('● 已连接' + (fileName ? '：' + fileName : '')) : '● 未连接';
    var banner = document.getElementById('net-banner');
    if (banner) banner.hidden = !!connected;
    syncBannerSpace();
  };

  function syncBannerSpace() {
    var any = ['compat-banner', 'net-banner'].some(function (id) {
      var el = document.getElementById(id);
      return el && !el.hidden;
    });
    document.body.classList.toggle('has-banner', any);
  }

  shell.refreshTopDate = function () {
    var el = document.getElementById('top-date');
    if (!el) return;
    var d = new Date();
    el.textContent = d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 周' + U.weekdayCN(U.today());
  };

  /* ---------- 主题与侧边栏（M1 后与 store 设置打通） ---------- */
  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = document.getElementById('theme-toggle');
    if (btn) btn.textContent = theme === 'dark' ? '☀️' : '🌙';
    try { localStorage.setItem('papp.theme', theme); } catch (e) {}
  }
  shell.applyTheme = applyTheme;

  function applySidebar(collapsed) {
    document.body.classList.toggle('sidebar-collapsed', !!collapsed);
    try { localStorage.setItem('papp.sidebarCollapsed', collapsed ? '1' : '0'); } catch (e) {}
  }
  shell.applySidebar = applySidebar;

  /* ---------- 视图渲染 ---------- */
  shell.placeholder = function (view, mod) {
    view.innerHTML =
      '<h1 class="page-title">' + U.esc(mod.name) + '</h1>' +
      '<p class="page-sub">模块 ' + mod.id + '</p>' +
      '<div class="empty-state"><div class="empty-icon">🚧</div>本模块将在后续里程碑完成</div>';
  };

  shell.rerender = function () {
    if (lastModuleId) renderModule(lastModuleId, R.parseHash(location.hash).params);
  };

  function renderModule(id, params) {
    var view = document.getElementById('view');
    var mod = App.modules.filter(function (m) { return m.id === id; })[0] || App.modules[0];
    view.style.setProperty('--mod-color', 'var(' + mod.color + ')');
    var renderer = R.has(id) ? R._renderers[id] : null;
    if (renderer) {
      try {
        renderer(view, params || {});
      } catch (err) {
        view.innerHTML = '<div class="empty-state"><div class="empty-icon">⚠️</div>页面渲染出错：' + U.esc(err && err.message) + '</div>';
        if (typeof console !== 'undefined') console.error(err);
      }
    } else {
      shell.placeholder(view, mod);
    }
  }

  /* 在 router.register 之外单独存 render 函数，便于 shell 主动重渲染 */
  R._renderers = {};
  shell.registerPage = function (id, render) {
    R._renderers[id] = render;
    R.register(id, render);
  };

  /* ---------- 初始化 ---------- */
  function buildNav() {
    var nav = document.getElementById('nav');
    nav.innerHTML = App.modules.map(function (m) {
      return '<button class="nav-item" data-id="' + m.id + '" style="--mod-color:var(' + m.color + ')" title="' + U.esc(m.name) + '">' +
        '<span class="nav-icon">' + m.icon + '</span><span class="nav-label">' + U.esc(m.name) + '</span></button>';
    }).join('');
    nav.addEventListener('click', function (e) {
      var btn = e.target.closest('.nav-item');
      if (btn) R.go(btn.dataset.id);
    });
  }

  function highlightNav(id) {
    document.querySelectorAll('.nav-item').forEach(function (el) {
      el.classList.toggle('active', el.dataset.id === id);
    });
  }

  function init() {
    buildNav();

    var theme = 'light';
    try { theme = localStorage.getItem('papp.theme') || 'light'; } catch (e) {}
    applyTheme(theme);
    document.getElementById('theme-toggle').addEventListener('click', function () {
      var cur = document.documentElement.getAttribute('data-theme');
      var next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      if (App.store && App.store.data && App.store.data.settings) {
        App.store.data.settings.theme = next;
        App.store.save();
      }
    });

    var collapsed = false;
    try { collapsed = localStorage.getItem('papp.sidebarCollapsed') === '1'; } catch (e) {}
    applySidebar(collapsed);
    document.getElementById('sidebar-toggle').addEventListener('click', function () {
      var next = !document.body.classList.contains('sidebar-collapsed');
      applySidebar(next);
      if (App.store && App.store.data && App.store.data.settings) {
        App.store.data.settings.sidebarCollapsed = next;
        App.store.save();
      }
    });

    shell.refreshTopDate();
    setInterval(shell.refreshTopDate, 30000);

    /* 兼容检测：核心链路只需 showOpenFilePicker（连接/读写）；save/dir 缺失由 persist 层自适应降级 */
    var fsaOk = typeof window.showOpenFilePicker === 'function';
    App.env = { fsaSupported: fsaOk };
    if (!fsaOk) {
      document.getElementById('compat-banner').hidden = false;
    }
    syncBannerSpace();

    /* 数据文件横幅按钮 */
    document.getElementById('net-banner-btn').addEventListener('click', function () {
      if (App.persist && App.persist.connect) App.persist.connect();
    });
    document.getElementById('file-state').addEventListener('click', function () {
      if (App.persist && App.persist.connect) App.persist.connect();
    });

    /* 路由 */
    R.onNavigate = function (id) {
      var view = document.getElementById('view');
      if (lastModuleId) scrollTops[lastModuleId] = view.scrollTop;
      lastModuleId = id;
      highlightNav(id);
      renderModule(id, R.parseHash(location.hash).params);
      view.scrollTop = scrollTops[id] || 0;
    };
    window.addEventListener('hashchange', function () { R.handle(location.hash); });

    /* 全局快捷键 */
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && (e.key === 'n' || e.key === 'N')) {
        var ta = document.getElementById('memo-input');
        if (ta) { e.preventDefault(); R.go('home'); setTimeout(function () { ta.focus(); }, 50); }
        else if (R.current() === 'home') { e.preventDefault(); }
      }
    });

    /* 初始文件状态 */
    shell.setFileState(false);

    /* 数据层先就绪（boot 的同步部分加载缓存），再渲染首屏 */
    if (App.boot) App.boot();

    if (!location.hash) location.hash = '#/home';
    R.handle(location.hash);
  }

  shell.init = init;
  App.shell = shell;

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
