/* 60-home.js — 首页总览：问候条、今日计划卡、快速备忘、模块摘要卡 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, L = App.logic;
  var D = App.dom, store = App.store;

  function render(view) {
    var ui = App.ui;
    App._view = view;
    var today = U.today();
    var data = store.data;
    view.innerHTML = '';

    /* 1 问候条 */
    var ps = L.planSummary(data, today);
    view.appendChild(D.el('<h1 class="page-title">' + U.greeting() + '，今天是 ' +
      new Date().getFullYear() + '年' + (new Date().getMonth() + 1) + '月' + new Date().getDate() + '日 周' + U.weekdayCN(today) + '</h1>' +
      '<p class="page-sub">今日待办 ' + ps.todoDone + '/' + ps.todoTotal + ' 完成 · 日程 ' + ps.eventCount + ' 项</p>'));

    /* 2 今日计划卡 */
    var planCard = D.el('<div class="card"><div class="grid" style="grid-template-columns:1fr 1fr"></div></div>');
    var grid = planCard.firstElementChild;
    var evBox = D.el('<div><b class="small">今日日程</b><div style="margin-top:6px"></div></div>');
    var evList = evBox.lastElementChild;
    var events = data.plan.events.filter(function (e) { return e.date === today; }).sort(function (a, b) { return a.start < b.start ? -1 : 1; });
    if (!events.length) evList.appendChild(D.el('<div class="muted small">暂无日程</div>'));
    events.slice(0, 5).forEach(function (e) {
      var row = D.el('<div class="row small" style="padding:3px 0;cursor:pointer"><span class="muted" style="width:86px">' + e.start + '–' + e.end + '</span><span>' + U.esc(e.title) + '</span></div>');
      row.addEventListener('click', function () { App.router.go('plan'); });
      evList.appendChild(row);
    });
    grid.appendChild(evBox);

    var tdBox = D.el('<div><b class="small">今日待办</b><div style="margin-top:6px"></div></div>');
    var tdList = tdBox.lastElementChild;
    var todos = data.plan.todos.filter(function (t) { return t.date === today && !t.done; }).slice(0, 5);
    if (!todos.length) tdList.appendChild(D.el('<div class="muted small">待办都完成啦 🎉</div>'));
    todos.forEach(function (t) {
      var row = D.el('<div class="row small" style="padding:3px 0"><input type="checkbox" style="width:15px;height:15px"><span style="flex:1">' + U.esc(t.text) + '</span></div>');
      row.querySelector('input').addEventListener('change', function () {
        store.upsert('plan.todos', Object.assign({}, t, { done: true }));
        render(view);
      });
      tdList.appendChild(row);
    });
    var link = D.el('<div class="small" style="margin-top:8px"><a href="#/plan" style="color:var(--mod-color)">共 ' + ps.todoTotal + ' 条，去今日计划 →</a></div>');
    tdBox.appendChild(link);
    grid.appendChild(tdBox);
    view.appendChild(planCard);

    /* 3 快速备忘 */
    var memoCard = D.el('<div class="card mt16"><b>快速备忘</b><div class="muted small" style="margin:2px 0 8px">Ctrl+N 快速聚焦，随手记一条</div>' +
      '<div class="row"><input class="input" id="memo-input" placeholder="记一笔…"><button class="btn btn-primary" id="memo-add">记一笔</button></div><div id="memo-list" style="margin-top:10px"></div></div>');
    view.appendChild(memoCard);
    var memoList = memoCard.querySelector('#memo-list');
    function renderMemos() {
      memoList.innerHTML = '';
      var memos = data.memos.slice().sort(function (a, b) {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      if (!memos.length) { memoList.appendChild(D.el('<div class="muted small">还没有备忘</div>')); return; }
      memos.forEach(function (m) {
        var row = D.el('<div class="row" style="padding:5px 2px;border-bottom:1px solid var(--border)">' +
          (m.pinned ? '<span class="tag tag-on">置顶</span>' : '') +
          '<span style="flex:1">' + U.nl2br(m.text) + '</span></div>');
        row.appendChild(App.comp.iconBtn(m.pinned ? '📌' : '📍', m.pinned ? '取消置顶' : '置顶', function () {
          store.upsert('memos', Object.assign({}, m, { pinned: !m.pinned }));
          render(view);
        }));
        row.appendChild(App.comp.iconBtn('🗑', '删除备忘', function () {
          ui.confirm({ title: '删除备忘', text: '删除「' + m.text.slice(0, 30) + '」？', danger: true }).then(function (ok) {
            if (ok) { store.remove('memos', m.id); render(view); }
          });
        }));
        memoList.appendChild(row);
      });
    }
    function addMemo() {
      var input = memoCard.querySelector('#memo-input');
      var text = input.value.trim();
      if (!text) { input.focus(); return; }
      store.upsert('memos', { id: U.uid(), text: text, pinned: false, createdAt: new Date().toISOString() });
      input.value = '';
      render(view);
      var ni = document.getElementById('memo-input');
      if (ni) ni.focus();
    }
    memoCard.querySelector('#memo-add').addEventListener('click', addMemo);
    memoCard.querySelector('#memo-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') addMemo(); });
    renderMemos();

    /* 4 模块摘要卡 */
    view.appendChild(D.el('<div class="section-title">各模块摘要</div>'));
    var cards = D.el('<div class="grid" style="grid-template-columns:repeat(3,1fr)"></div>');
    function card(mod, title, lines, onClick) {
      var el = D.el('<div class="card" style="cursor:pointer;border-top:3px solid var(' + mod.color + ')">' +
        '<b class="small">' + U.esc(mod.name) + '</b><div style="margin-top:6px;font-size:13px;line-height:1.7">' +
        lines.map(function (l) { return '<div>' + l + '</div>'; }).join('') + '</div></div>');
      el.addEventListener('click', onClick);
      cards.appendChild(el);
      return el;
    }
    var M = {};
    App.modules.forEach(function (m) { M[m.id] = m; });

    var ns = L.nextSchedule(data.media.schedule, today);
    card(M.media, '', [
      ns ? U.esc((ns.status === '计划中' ? '下次发布：' : '最近发布：') + U.fmtDateCN(ns.date) + ' ' + U.esc(ns.platform || '') + '《' + ns.title + '》') : '<span class="muted">暂无发布计划</span>',
      '<span class="muted small">选题 ' + data.media.topics.filter(function (t) { return t.status !== '已放弃' && t.status !== '已发布'; }).length + ' 个进行中</span>'
    ], function () { App.router.go('media'); });

    var ds = L.devSummary(data.dev.projects);
    card(M.dev, '', [
      '进行中项目 <b>' + ds.inProgressCount + '</b> 个',
      ds.latestNextStep ? '下一步：' + U.esc(ds.latestNextStep) : '<span class="muted">暂无项目</span>'
    ], function () { App.router.go('dev'); });

    var cs = L.incomeMonthSummary(data.consult.incomes, U.monthOf(today));
    card(M.consult, '', [
      '本月收入 <b>¥' + U.fmtMoney(cs.received) + '</b>',
      cs.unreceivedCount ? '未收 ' + cs.unreceivedCount + ' 笔 ¥' + U.fmtMoney(cs.unreceived) : '<span class="muted">无未收款</span>'
    ], function () { App.router.go('consult'); });

    var streak = L.streakDays(data.study.checkins, today);
    card(M.study, '', [
      '连续打卡 <b>' + streak + '</b> 天',
      data.study.checkins[today] ? '今日已学 ' + U.fmtMinutes(data.study.checkins[today].minutes) : '<span class="muted">今天还没打卡</span>'
    ], function () { App.router.go('study'); });

    var ws = L.weightSummary(data.diet.weights);
    var eaten = L.dietTodayDone(data.diet.records, today);
    card(M.diet, '', [
      '今日三餐已记 ' + eaten + '/3',
      ws ? '最近体重 ' + ws.latest.kg + ' kg（' + (ws.change > 0 ? '+' : '') + ws.change.toFixed(1) + '）' : '<span class="muted">暂无体重记录</span>'
    ], function () { App.router.go('diet'); });

    card(M.fun, '', [
      '本周娱乐 ' + U.fmtMinutes(L.funWeekMinutes(data.fun.records, today)),
      '<span class="muted small">本月 ' + U.fmtMinutes(L.funMonthMinutes(data.fun.records, today)) + '</span>'
    ], function () { App.router.go('fun'); });

    view.appendChild(cards);
  }

  App.shell.registerPage('home', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
