/* 68-settings.js — 数据与设置：数据文件管理、备份恢复、统计、个性化设置、危险操作、使用说明 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, D = App.dom, store = App.store;
  var viewEl = null;
  function rerender() { if (viewEl) render(viewEl, {}); }

  function counts() {
    var d = store.data;
    return [
      ['备忘', d.memos.length],
      ['日程', d.plan.events.length],
      ['待办', d.plan.todos.length],
      ['每日回顾', Object.keys(d.plan.reviews).length],
      ['选题', d.media.topics.length],
      ['发布计划', d.media.schedule.length],
      ['平台数据', d.media.stats.length],
      ['开发项目', d.dev.projects.length],
      ['咨询收入', d.consult.incomes.length],
      ['学习目标', d.study.goals.length],
      ['学习打卡', Object.keys(d.study.checkins).length],
      ['学习时段', d.study.timetable.length],
      ['阅读条目', d.study.readings.length],
      ['菜谱', d.diet.recipes.length],
      ['餐食安排', Object.keys(d.diet.meals).length],
      ['饮食记录', Object.keys(d.diet.records).length],
      ['体重记录', d.diet.weights.length],
      ['娱乐记录', d.fun.records.length],
      ['娱乐时段', d.fun.weekly.length],
      ['抽选候选', d.fun.pool.length]
    ];
  }

  function tagManager(title, key) {
    var box = D.el('<div class="card"><b class="small">' + title + '</b><div class="row mt8" style="flex-wrap:wrap;gap:6px"></div>' +
      '<div class="row mt8"><input class="input" placeholder="添加一项，回车确认"><button class="btn btn-small">添加</button></div></div>');
    var chips = box.querySelector('.row.mt8');
    function draw() {
      chips.innerHTML = '';
      (store.data.settings[key] || []).forEach(function (t) {
        var chip = D.el('<span class="tag">' + U.esc(t) + '</span>');
        chip.appendChild(App.comp.iconBtn('✕', '删除', function () {
          store.setSetting(key, store.data.settings[key].filter(function (x) { return x !== t; }));
          rerender();
        }));
        chips.appendChild(chip);
      });
      if (!(store.data.settings[key] || []).length) chips.appendChild(D.el('<span class="muted small">空</span>'));
    }
    draw();
    function add() {
      var input = box.querySelector('input');
      var t = input.value.trim();
      if (!t) return;
      var list = store.data.settings[key] || [];
      if (list.indexOf(t) === -1) store.setSetting(key, list.concat([t]));
      input.value = '';
      rerender();
    }
    box.querySelector('button').addEventListener('click', add);
    box.querySelector('input').addEventListener('keydown', function (e) { if (e.key === 'Enter') add(); });
    return box;
  }

  function render(view) {
    viewEl = view;
    App._view = view;
    var ui = App.ui;
    var P = App.persist;
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">数据与设置</h1><p class="page-sub">你的数据在你自己硬盘上，这里管理它</p>'));

    /* 1 数据文件状态卡 */
    var connected = store.fileConnected();
    var json = JSON.stringify(store.data);
    var card = D.el('<div class="card">' +
      '<div class="row"><b>数据文件</b><span class="tag ' + (connected ? 'tag-on' : '') + '">' + (connected ? '已连接' : '未连接') + '</span></div>' +
      '<div class="muted small mt8">' + (connected ? '文件：' + U.esc(store.fileName()) : '尚未连接数据文件，当前修改暂存在浏览器缓存中') + '</div>' +
      '<div class="muted small">数据量约 ' + (json.length / 1024).toFixed(1) + ' KB · 最后保存 ' + U.esc((store.data.savedAt || '—').slice(0, 19).replace('T', ' ')) + '</div>' +
      '<div class="row mt12" style="flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-a="connect">' + (connected ? '重新连接' : '连接数据文件') + '</button>' +
      '<button class="btn" data-a="create">新建数据文件</button>' +
      '<button class="btn" data-a="backup">立即备份</button>' +
      '<button class="btn" data-a="restore">恢复…</button>' +
      '</div><div class="muted small mt8">备份：有能力时自动写入数据文件旁的「备份」文件夹，否则通过浏览器下载保存（建议开启"下载前询问保存位置"）。</div></div>');
    card.querySelector('[data-a=connect]').addEventListener('click', function () { P.connect(); });
    card.querySelector('[data-a=create]').addEventListener('click', function () { P.createNew(); });
    card.querySelector('[data-a=backup]').addEventListener('click', function () { P.backup(); });
    card.querySelector('[data-a=restore]').addEventListener('click', function () { P.restore(); });
    view.appendChild(card);

    /* 2 数据统计 */
    view.appendChild(D.el('<div class="section-title">数据统计</div>'));
    var tbl = D.el('<table class="tbl"><thead><tr><th>模块数据</th><th style="text-align:right">条数</th></tr></thead><tbody></tbody></table>');
    var tb = tbl.querySelector('tbody');
    counts().forEach(function (c) {
      tb.appendChild(D.el('<tr><td>' + c[0] + '</td><td style="text-align:right"><b>' + c[1] + '</b></td></tr>'));
    });
    view.appendChild(tbl);

    /* 3 设置 */
    view.appendChild(D.el('<div class="section-title">设置</div>'));
    var setCard = D.el('<div class="card">' +
      '<div class="row"><span style="width:120px">主题</span><select class="select" style="width:140px" data-s="theme"><option value="light">浅色</option><option value="dark">深色</option></select></div>' +
      '<div class="row mt12"><span style="width:120px">侧边栏默认收起</span><label class="row small"><input type="checkbox" data-s="sidebar"> 是</label></div></div>');
    var selTheme = setCard.querySelector('[data-s=theme]');
    selTheme.value = store.data.settings.theme || 'light';
    selTheme.addEventListener('change', function () {
      store.setSetting('theme', selTheme.value);
      App.shell.applyTheme(selTheme.value);
    });
    var chkSb = setCard.querySelector('[data-s=sidebar]');
    chkSb.checked = !!store.data.settings.sidebarCollapsed;
    chkSb.addEventListener('change', function () {
      store.setSetting('sidebarCollapsed', chkSb.checked);
      App.shell.applySidebar(chkSb.checked);
    });
    view.appendChild(setCard);
    var mgrs = D.el('<div class="grid mt12" style="grid-template-columns:1fr 1fr"></div>');
    mgrs.appendChild(tagManager('自媒体平台（自媒体模块用）', 'platforms'));
    mgrs.appendChild(tagManager('菜谱标签（饮食模块用）', 'recipeTags'));
    view.appendChild(mgrs);

    /* 4 危险操作 */
    view.appendChild(D.el('<div class="section-title">危险操作</div>'));
    var danger = D.el('<div class="card" style="border-color:var(--danger)">' +
      '<div class="row" style="flex-wrap:wrap"><button class="btn" data-a="export">导出全部数据（下载 JSON）</button>' +
      '<button class="btn btn-danger" data-a="clear">清空全部数据</button></div>' +
      '<div class="muted small mt8">清空不可撤销（会要求输入确认文字）；清空前建议先导出或备份。</div></div>');
    danger.querySelector('[data-a=export]').addEventListener('click', function () { P.exportJSON(); });
    danger.querySelector('[data-a=clear]').addEventListener('click', function () {
      ui.confirm({
        title: '清空全部数据', danger: true, okText: '确认清空',
        text: '这将删除所有模块的全部数据（备忘、计划、收入、打卡……）。\n建议先点「导出全部数据」留底。',
        requireText: '确认清空'
      }).then(function (ok) { if (ok) { P.clearAll(); } });
    });
    view.appendChild(danger);

    /* 5 使用说明 */
    view.appendChild(D.el('<div class="section-title">使用说明</div>'));
    view.appendChild(D.el('<div class="card" style="line-height:1.9;font-size:13px">' +
      '<b>第一次使用</b>：点「新建数据文件」→ 选一个固定位置保存（建议就放在 APP 文件夹）→ 之后所有修改自动写入它。<br>' +
      '<b>每次打开</b>：双击 HTML 文件 → 点顶栏「● 未连接」或本页「连接数据文件」→ 选中你的数据文件（浏览器安全规则要求每次授权一次）。<br>' +
      '<b>忘了连接就改了数据？</b>：不会丢。修改暂存在浏览器里，连接文件后自动合并进去。<br>' +
      '<b>备份</b>：点「立即备份」生成带日期的副本；换电脑/换浏览器时，用「恢复…」选中备份文件即可完整迁移。<br>' +
      '<b>注意</b>：数据跟着"这个浏览器"走，请固定用一个浏览器打开本 App；清理浏览器缓存前请先备份。</div>'));
  }

  App.shell.registerPage('settings', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
