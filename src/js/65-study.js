/* 65-study.js — 学习计划：目标 │ 打卡 │ 时间表 │ 阅读清单 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, L = App.logic, D = App.dom, store = App.store;
  var TAB = 'goals';
  var expandedGoals = {};
  var viewEl = null;
  function rerender() { if (viewEl) render(viewEl, {}); }

  function goalModal(g) {
    App.ui.modal({
      title: g ? '编辑目标' : '新目标',
      values: g || {},
      fields: [
        { key: 'title', label: '目标（如：毕业论文）', type: 'text', required: true },
        { key: 'due', label: '截止日期（选填）', type: 'date' }
      ],
      onDelete: g ? function () { store.remove('study.goals', g.id); rerender(); } : null,
      onSubmit: function (v) {
        store.upsert('study.goals', Object.assign({}, g, { id: g ? g.id : U.uid(), title: v.title, due: v.due || null, subtasks: g ? g.subtasks : [] }));
        rerender();
        return null;
      }
    });
  }

  function checkinModal(date) {
    var cur = store.data.study.checkins[date];
    App.ui.modal({
      title: (date === U.today() ? '今日' : U.fmtDateCN(date)) + '学习打卡',
      values: cur || { minutes: 60, note: '' },
      fields: [
        { key: 'minutes', label: '学习时长（分钟）', type: 'number', required: true, min: 0, max: 1440 },
        { key: 'note', label: '今天学了什么（选填）', type: 'text' }
      ],
      onDelete: cur ? function () { store.remove('study.checkins', date); rerender(); } : null,
      deleteText: '删除这天打卡记录？',
      onSubmit: function (v) {
        store.mapSet('study.checkins', date, { minutes: v.minutes, note: v.note });
        rerender();
        return null;
      }
    });
  }

  function renderGoals(box) {
    var ui = App.ui;
    var head = D.el('<div class="row" style="justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary">＋ 新目标</button></div>');
    head.querySelector('button').addEventListener('click', function () { goalModal(null); });
    box.appendChild(head);
    var goals = store.data.study.goals;
    if (!goals.length) { box.appendChild(ui.emptyState('🎯', '还没有学习目标，先立一个（比如毕业论文）', '＋ 新目标', function () { goalModal(null); })); return; }
    goals.forEach(function (g) {
      var prog = L.goalProgress(g);
      var card = D.el('<div class="card" style="margin-bottom:12px"></div>');
      var top = D.el('<div class="row" style="justify-content:space-between"><div><b>' + U.esc(g.title) + '</b>' + (g.due ? '<span class="muted small"> · 截止 ' + g.due + '</span>' : '') + '</div><span class="tag">' + prog + '%</span></div>');
      card.appendChild(top);
      card.appendChild(D.el('<div style="height:8px;border-radius:4px;background:var(--bg-hover);margin:8px 0;overflow:hidden"><div style="width:' + prog + '%;height:100%;background:var(--mod-color)"></div></div>'));
      var subBox = D.el('<div></div>');
      (g.subtasks || []).forEach(function (st) {
        var row = D.el('<div class="row small" style="padding:4px 0"><input type="checkbox"' + (st.done ? ' checked' : '') + '><span style="flex:1;' + (st.done ? 'text-decoration:line-through;opacity:.6' : '') + '">' + U.esc(st.text) + (st.due ? ' <span class="muted">(' + st.due + ')</span>' : '') + '</span></div>');
        row.querySelector('input').addEventListener('change', function (e) {
          var subs = g.subtasks.map(function (x) { return x.id === st.id ? Object.assign({}, x, { done: e.target.checked }) : x; });
          store.upsert('study.goals', Object.assign({}, g, { subtasks: subs }));
          rerender();
        });
        row.appendChild(App.comp.iconBtn('🗑', '删除子任务', function () {
          store.upsert('study.goals', Object.assign({}, g, { subtasks: g.subtasks.filter(function (x) { return x.id !== st.id; }) }));
          rerender();
        }));
        subBox.appendChild(row);
        /* 第二层检查项 */
        if (expandedGoals[g.id + ':' + st.id]) {
          var chkBox = D.el('<div style="margin-left:26px;border-left:2px solid var(--border);padding-left:10px"></div>');
          (st.checks || []).forEach(function (c, ci) {
            var cr = D.el('<div class="row small" style="padding:2px 0"><input type="checkbox"' + (c.done ? ' checked' : '') + '><span style="flex:1;' + (c.done ? 'opacity:.6' : '') + '">' + U.esc(c.text) + '</span></div>');
            cr.querySelector('input').addEventListener('change', function (e) {
              var subs = g.subtasks.map(function (x) {
                if (x.id !== st.id) return x;
                return Object.assign({}, x, { checks: x.checks.map(function (cc, i) { return i === ci ? Object.assign({}, cc, { done: e.target.checked }) : cc; }) });
              });
              store.upsert('study.goals', Object.assign({}, g, { subtasks: subs }));
              rerender();
            });
            chkBox.appendChild(cr);
          });
          var addChk = D.el('<div class="row small mt8"><input class="input" placeholder="＋检查项，回车添加" style="padding:3px 8px;font-size:12px"></div>');
          addChk.querySelector('input').addEventListener('keydown', function (e) {
            if (e.key !== 'Enter' || !e.target.value.trim()) return;
            var subs = g.subtasks.map(function (x) {
              if (x.id !== st.id) return x;
              return Object.assign({}, x, { checks: (x.checks || []).concat([{ text: e.target.value.trim(), done: false }]) });
            });
            store.upsert('study.goals', Object.assign({}, g, { subtasks: subs }));
            rerender();
          });
          chkBox.appendChild(addChk);
          subBox.appendChild(chkBox);
        }
        row.insertBefore(App.comp.iconBtn(expandedGoals[g.id + ':' + st.id] ? '▾' : '▸', '检查项', function () {
          expandedGoals[g.id + ':' + st.id] = !expandedGoals[g.id + ':' + st.id];
          rerender();
        }), row.lastElementChild);
      });
      card.appendChild(subBox);
      var addSub = D.el('<div class="row mt8"><input class="input" placeholder="＋子任务，回车添加"><button class="btn btn-small">添加</button></div>');
      function addSubFn() {
        var input = addSub.querySelector('input');
        var t = input.value.trim();
        if (!t) return;
        store.upsert('study.goals', Object.assign({}, g, { subtasks: (g.subtasks || []).concat([{ id: U.uid(), text: t, done: false, due: null, checks: [] }]) }));
        rerender();
      }
      addSub.querySelector('input').addEventListener('keydown', function (e) { if (e.key === 'Enter') addSubFn(); });
      addSub.querySelector('button').addEventListener('click', addSubFn);
      card.appendChild(addSub);
      var acts = D.el('<div class="row mt8"></div>');
      acts.appendChild(App.comp.iconBtn('✏️', '编辑目标', function () { goalModal(g); }));
      acts.appendChild(App.comp.iconBtn('🗑', '删除目标', function () {
        ui.confirm({ title: '删除目标', text: '删除「' + g.title + '」及其全部子任务？', danger: true }).then(function (ok) { if (ok) { store.remove('study.goals', g.id); rerender(); } });
      }));
      card.appendChild(acts);
      box.appendChild(card);
    });
  }

  function renderCheckin(box) {
    var ui = App.ui;
    var today = U.today();
    var data = store.data.study.checkins;
    var cur = data[today];
    var big = D.el('<div class="card" style="text-align:center;padding:22px;margin-bottom:14px"></div>');
    if (cur) {
      big.innerHTML = '<div style="font-size:15px">今天已打卡 ✅</div><div style="font-size:26px;font-weight:800;margin:6px 0">' + U.fmtMinutes(cur.minutes) + '</div>' +
        (cur.note ? '<div class="muted small">' + U.esc(cur.note) + '</div>' : '');
      var editBtn = D.el('<button class="btn mt12">修改今日记录</button>');
      editBtn.addEventListener('click', function () { checkinModal(today); });
      big.appendChild(editBtn);
    } else {
      big.innerHTML = '<div class="muted small">今天学习了吗？</div>';
      var btn = D.el('<button class="btn btn-primary" style="font-size:17px;padding:12px 34px;margin-top:10px">今日打卡</button>');
      btn.addEventListener('click', function () { checkinModal(today); });
      big.appendChild(btn);
    }
    box.appendChild(big);

    var mon = U.mondayOf(today);
    var cards = D.el('<div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px"></div>');
    cards.appendChild(App.ui.statCard('连续打卡', L.streakDays(data, today) + ' 天'));
    cards.appendChild(App.ui.statCard('本周总时长', U.fmtMinutes(L.checkinTotalMinutes(data, mon, U.addDays(mon, 6)))));
    cards.appendChild(App.ui.statCard('本月总时长', U.fmtMinutes(L.checkinTotalMinutes(data, U.monthOf(today) + '-01', U.monthOf(today) + '-31'))));
    box.appendChild(cards);

    var grid = L.heatGridDays(today, 8);
    var heat = D.el('<div class="card"><b class="small">近 8 周打卡热力（点格子查看/修改）</b><div class="mt8"></div></div>');
    var heatBox = heat.lastElementChild;
    heatBox.innerHTML = App.charts.heatGrid(grid.days, function (d) { return data[d] ? data[d].minutes : 0; }, {});
    heatBox.addEventListener('click', function (e) {
      var t = e.target.closest('[data-date]');
      if (t) checkinModal(t.dataset.date);
    });
    box.appendChild(heat);
  }

  function renderTimetable(box) {
    var ui = App.ui;
    var WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
    var COLORS = ['var(--c-home)', 'var(--c-plan)', 'var(--c-media)', 'var(--c-dev)', 'var(--c-study)', 'var(--c-diet)', 'var(--c-fun)', 'var(--c-consult)'];
    function ttModal(t, weekday) {
      ui.modal({
        title: t ? '编辑学习时段' : '添加学习时段',
        values: t || { weekday: weekday, start: '19:00', end: '21:00' },
        fields: [
          { key: 'weekday', label: '星期', type: 'select', options: WD.map(function (w, i) { return { value: i + 1, label: w }; }) },
          { key: 'start', label: '开始', type: 'time', required: true },
          { key: 'end', label: '结束', type: 'time', required: true, validate: function (v, vals) { return L.validateTimeRange(vals.start, v); } },
          { key: 'text', label: '学什么', type: 'text', required: true },
          { key: 'color', label: '颜色', type: 'select', options: [0, 1, 2, 3, 4, 5, 6, 7].map(function (i) { return { value: i, label: '颜色 ' + (i + 1) }; }) }
        ],
        onDelete: t ? function () { store.remove('study.timetable', t.id); rerender(); } : null,
        onSubmit: function (v) {
          store.upsert('study.timetable', Object.assign({}, t, { id: t ? t.id : U.uid(), weekday: +v.weekday, start: v.start, end: v.end, text: v.text, color: +v.color }));
          rerender();
          return null;
        }
      });
    }
    var grid = D.el('<div class="grid" style="grid-template-columns:repeat(7,1fr)"></div>');
    for (var wd = 1; wd <= 7; wd++) {
      var col = D.el('<div class="card" style="padding:8px;min-height:140px;background:var(--bg-soft)"></div>');
      var head = D.el('<div class="row" style="justify-content:space-between;margin-bottom:6px"><b class="small">' + WD[wd - 1] + '</b><button class="btn btn-ghost btn-small">＋</button></div>');
      (function (w) { head.querySelector('button').addEventListener('click', function () { ttModal(null, w); }); })(wd);
      col.appendChild(head);
      store.data.study.timetable.filter(function (t) { return t.weekday === wd; })
        .sort(function (a, b) { return a.start < b.start ? -1 : 1; })
        .forEach(function (t) {
          var chip = D.el('<div style="border-left:3px solid ' + COLORS[t.color % 8] + ';background:var(--bg-card);border-radius:6px;padding:4px 6px;margin-bottom:6px;font-size:12px;cursor:pointer">' +
            '<div class="muted">' + t.start + '–' + t.end + '</div><div>' + U.esc(t.text) + '</div></div>');
          chip.addEventListener('click', function () { ttModal(t); });
          col.appendChild(chip);
        });
      grid.appendChild(col);
    }
    box.appendChild(grid);
    box.appendChild(D.el('<div class="muted small mt8">点击格子条目编辑；时间表仅作计划展示，第一版不与打卡联动</div>'));
  }

  function renderReadings(box) {
    var ui = App.ui;
    var STATUS = ['想读', '在读', '读完'];
    function readModal(r) {
      ui.modal({
        title: r ? '编辑阅读条目' : '加入阅读清单',
        values: r || { type: '书籍', status: '想读' },
        fields: [
          { key: 'name', label: '书名 / 文献名 / 课程名', type: 'text', required: true },
          { key: 'type', label: '类型', type: 'select', options: ['书籍', '论文', '课程'] },
          { key: 'status', label: '状态', type: 'select', options: STATUS },
          { key: 'note', label: '我的笔记', type: 'textarea', rows: 4 }
        ],
        onDelete: r ? function () { store.remove('study.readings', r.id); rerender(); } : null,
        onSubmit: function (v) {
          var doneDate = r ? r.doneDate : null;
          if (v.status === '读完' && !doneDate) doneDate = U.today();
          if (v.status !== '读完') doneDate = null;
          store.upsert('study.readings', Object.assign({}, r, { id: r ? r.id : U.uid(), name: v.name, type: v.type, status: v.status, note: v.note, doneDate: doneDate }));
          rerender();
          return null;
        }
      });
    }
    var head = D.el('<div class="row" style="justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary">＋ 加入清单</button></div>');
    head.querySelector('button').addEventListener('click', function () { readModal(null); });
    box.appendChild(head);
    var list = store.data.study.readings;
    if (!list.length) { box.appendChild(ui.emptyState('📚', '阅读清单是空的', '＋ 加入清单', function () { readModal(null); })); return; }
    list.forEach(function (r) {
      var row = D.el('<div class="card row" style="padding:10px 14px;margin-bottom:8px">' +
        '<span class="tag">' + U.esc(r.type) + '</span><span style="flex:1"><b>' + U.esc(r.name) + '</b>' +
        (r.doneDate ? '<span class="muted small"> · 读完于 ' + r.doneDate + '</span>' : '') +
        (r.note ? '<div class="muted small" style="white-space:pre-wrap;margin-top:4px">' + U.esc(r.note) + '</div>' : '') + '</span></div>');
      row.appendChild(App.comp.cycleCapsule(r.status, STATUS, function (ns) {
        store.upsert('study.readings', Object.assign({}, r, { status: ns, doneDate: ns === '读完' ? (r.doneDate || U.today()) : null }));
        rerender();
      }));
      row.appendChild(App.comp.iconBtn('✏️', '编辑/写笔记', function () { readModal(r); }));
      row.appendChild(App.comp.iconBtn('🗑', '删除', function () {
        ui.confirm({ title: '删除', text: '从清单移除「' + r.name + '」？', danger: true }).then(function (ok) { if (ok) { store.remove('study.readings', r.id); rerender(); } });
      }));
      box.appendChild(row);
    });
  }

  function render(view) {
    viewEl = view;
    App._view = view;
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">学习计划</h1><p class="page-sub">目标拆解 · 每日打卡 · 固定时间表 · 阅读笔记</p>'));
    view.appendChild(App.ui.tabs([
      { id: 'goals', label: '目标' }, { id: 'checkin', label: '打卡' },
      { id: 'timetable', label: '时间表' }, { id: 'readings', label: '阅读清单' }
    ], TAB, function (id) { TAB = id; rerender(); }));
    var box = D.el('<div></div>');
    view.appendChild(box);
    if (TAB === 'goals') renderGoals(box);
    else if (TAB === 'checkin') renderCheckin(box);
    else if (TAB === 'timetable') renderTimetable(box);
    else renderReadings(box);
  }

  App.shell.registerPage('study', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
