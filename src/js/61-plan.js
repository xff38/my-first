/* 61-plan.js — 今日计划页：时间轴日程（拖拽）＋待办（顺延）＋每日回顾
   timelineLayout 为纯函数，可 Node 测试 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util, L = App.logic;
  var P = {};
  App.planPage = P;

  P.DAY_START = 6 * 60;
  P.DAY_END = 24 * 60;
  P.HOUR_PX = 44;

  /* ---- 纯布局：重叠日程分列 ----
     返回 [{id, start, end, col, colCount}]，colCount 为所属重叠簇的列数 */
  P.timelineLayout = function (events) {
    var items = (events || []).map(function (e) {
      return { id: e.id, start: U.timeToMin(e.start), end: U.timeToMin(e.end), col: 0, colCount: 1 };
    }).sort(function (a, b) { return a.start - b.start || a.end - b.end; });

    /* 贪心分列 */
    var colEnds = [];
    items.forEach(function (it) {
      var col = -1;
      for (var c = 0; c < colEnds.length; c++) if (colEnds[c] <= it.start) { col = c; break; }
      if (col === -1) { col = colEnds.length; colEnds.push(0); }
      colEnds[col] = it.end;
      it.col = col;
    });

    /* 传递性重叠簇 → 簇内列数 */
    var cluster = [];
    var clusterEnd = -1;
    function flush() {
      var n = 0;
      cluster.forEach(function (it) { n = Math.max(n, it.col + 1); });
      cluster.forEach(function (it) { it.colCount = n; });
      cluster = [];
    }
    items.forEach(function (it) {
      if (cluster.length && it.start >= clusterEnd) flush();
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.end);
      if (it.start >= clusterEnd) { flush(); clusterEnd = -1; }
    });
    flush();
    return items;
  };

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var D = App.dom, ui = null; // ui 在渲染时取（App.ui 由 50-dom 注入）
  var store = App.store;
  var currentDate = U.today();
  var carryMsgDismissed = false;

  function hourPx() { return P.HOUR_PX; }

  function eventModal(ev, date) {
    ui = App.ui;
    ui.modal({
      title: ev ? '编辑日程' : '添加日程',
      values: ev || { date: date, start: '09:00', end: '10:00' },
      fields: [
        { key: 'title', label: '事项', type: 'text', required: true, placeholder: '做什么？' },
        { key: 'start', label: '开始时间', type: 'time', required: true },
        { key: 'end', label: '结束时间', type: 'time', required: true, validate: function (v, vals) { return L.validateTimeRange(vals.start, v); } },
        { key: 'note', label: '备注（选填）', type: 'textarea', rows: 2 }
      ],
      onDelete: ev ? function () { store.remove('plan.events', ev.id); render(App._view, { d: currentDate }); } : null,
      deleteText: '删除这条日程「' + (ev ? ev.title : '') + '」？',
      onSubmit: function (vals) {
        var overlaps = L.countOverlaps(store.data.plan.events, date, vals.start, vals.end, ev ? ev.id : null);
        store.upsert('plan.events', {
          id: ev ? ev.id : U.uid(), date: date, start: vals.start, end: vals.end,
          title: vals.title, note: vals.note
        });
        if (overlaps > 0) ui.toast('提示：该时段与 ' + overlaps + ' 条已有安排重叠', true);
        render(App._view, { d: currentDate });
        return null;
      }
    });
  }

  function renderTimeline(card, date) {
    var events = store.data.plan.events.filter(function (e) { return e.date === date; });
    var head = D.el('<div class="row" style="justify-content:space-between;margin-bottom:10px">' +
      '<b>时间轴日程</b><button class="btn btn-small btn-primary">＋ 添加日程</button></div>');
    head.querySelector('button').addEventListener('click', function () { eventModal(null, date); });
    card.appendChild(head);

    var layout = P.timelineLayout(events);
    var totalH = (P.DAY_END - P.DAY_START) / 60 * hourPx();
    var wrap = D.el('<div style="position:relative;height:' + totalH + 'px;border-left:1px solid var(--border);margin-left:44px">');
    /* 小时刻度 */
    for (var h = P.DAY_START / 60; h <= P.DAY_END / 60; h += 2) {
      var y = (h * 60 - P.DAY_START) / 60 * hourPx();
      wrap.appendChild(D.el('<div style="position:absolute;left:-44px;top:' + (y - 7) + 'px;width:38px;text-align:right;font-size:10px;color:var(--text-soft)">' + U.pad2(h) + ':00</div>'));
      wrap.appendChild(D.el('<div style="position:absolute;left:0;right:0;top:' + y + 'px;border-top:1px dashed var(--border)"></div>'));
    }
    if (!layout.length) {
      wrap.appendChild(D.el('<div class="muted small" style="position:absolute;left:8px;top:8px">今天还没有日程，点右上「＋ 添加日程」</div>'));
    }
    layout.forEach(function (it) {
      var ev = events.filter(function (e) { return e.id === it.id; })[0];
      var top = (it.start - P.DAY_START) / 60 * hourPx();
      var hpx = Math.max(20, (it.end - it.start) / 60 * hourPx() - 2);
      var wPct = 100 / it.colCount;
      var block = D.el('<div class="card ev-block" style="position:absolute;top:' + top + 'px;height:' + hpx + 'px;' +
        'left:calc(' + (it.col * wPct) + '% + 2px);width:calc(' + wPct + '% - 6px);padding:4px 8px;cursor:grab;overflow:hidden;' +
        'border-left:3px solid var(--mod-color);background:var(--bg-soft)">' +
        '<div style="font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + U.esc(ev.title) + '</div>' +
        '<div class="muted" style="font-size:10px">' + ev.start + '–' + ev.end + '</div>' +
        '<div class="ev-resize" style="position:absolute;left:0;right:0;bottom:0;height:6px;cursor:ns-resize"></div></div>');
      block.title = ev.title + '（拖拽移动，底边改时长，点击编辑）';
      /* 点击编辑（未拖动时） */
      App.comp.makePointerDrag(block, {
        ignore: '.ev-resize',
        onEnd: function (dy, dx, e, moved) {
          if (!moved) { eventModal(ev, date); return; }
          var dm = Math.round(dy / hourPx() * 60 / 15) * 15;
          if (!dm) return;
          var ns = U.clamp(it.start + dm, P.DAY_START, P.DAY_END - 15);
          var shift = ns - it.start;
          store.upsert('plan.events', Object.assign({}, ev, {
            start: U.minToTime(it.start + shift), end: U.minToTime(Math.min(P.DAY_END, it.end + shift))
          }));
          render(App._view, { d: currentDate });
        },
        onMove: function (dy) { block.style.transform = 'translateY(' + dy + 'px)'; block.style.opacity = '.8'; }
      });
      /* 底边拉伸改时长 */
      App.comp.makePointerDrag(block.querySelector('.ev-resize'), {
        onEnd: function (dy, dx, e, moved) {
          if (!moved) return;
          var dm = Math.round(dy / hourPx() * 60 / 15) * 15;
          var ne = U.clamp(it.end + dm, it.start + 15, P.DAY_END);
          store.upsert('plan.events', Object.assign({}, ev, { end: U.minToTime(ne) }));
          render(App._view, { d: currentDate });
        },
        onMove: function (dy) { block.style.height = Math.max(20, hpx + dy) + 'px'; }
      });
      wrap.appendChild(block);
    });
    card.appendChild(wrap);
  }

  function renderTodos(card, date) {
    var todos = store.data.plan.todos.filter(function (t) { return t.date === date; });
    todos.sort(function (a, b) {
      if (a.done !== b.done) return a.done ? 1 : -1;
      var pr = { '高': 0, '中': 1, '低': 2 };
      return pr[a.priority] - pr[b.priority];
    });
    var head = D.el('<div class="row" style="justify-content:space-between;margin-bottom:10px"><b>待办清单</b>' +
      '<span class="muted small">' + todos.filter(function (t) { return t.done; }).length + '/' + todos.length + ' 完成</span></div>');
    card.appendChild(head);

    var add = D.el('<div class="row" style="margin-bottom:10px"><input class="input" id="todo-quick" placeholder="输入待办，回车添加"></div>');
    card.appendChild(add);
    add.querySelector('input').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.value.trim()) {
        store.upsert('plan.todos', { id: U.uid(), date: date, text: e.target.value.trim(), priority: '中', done: false });
        render(App._view, { d: currentDate });
      }
    });

    if (!todos.length) {
      card.appendChild(ui.emptyState('✅', '今天还没有待办', null, null));
      return;
    }
    var list = D.el('<div></div>');
    todos.forEach(function (t) {
      var row = D.el('<div class="row" style="padding:6px 4px;border-bottom:1px solid var(--border);' + (t.done ? 'opacity:.55' : '') + '">' +
        '<input type="checkbox"' + (t.done ? ' checked' : '') + ' style="width:16px;height:16px">' +
        '<span style="flex:1;' + (t.done ? 'text-decoration:line-through' : '') + '">' + U.esc(t.text) + '</span></div>');
      if (t.carriedFrom) row.querySelector('span').appendChild(D.el('<span class="tag" style="margin-left:6px;font-size:10px">顺延自 ' + U.fmtDateCN(t.carriedFrom) + '</span>'));
      row.querySelector('input').addEventListener('change', function (e) {
        store.upsert('plan.todos', Object.assign({}, t, { done: e.target.checked }));
        render(App._view, { d: currentDate });
      });
      row.appendChild(App.comp.cycleCapsule(t.priority, ['高', '中', '低'], function (np) {
        store.upsert('plan.todos', Object.assign({}, t, { priority: np }));
        render(App._view, { d: currentDate });
      }));
      row.appendChild(App.comp.iconBtn('🗑', '删除待办', function () {
        ui.confirm({ title: '删除待办', text: '删除「' + t.text + '」？', danger: true }).then(function (ok) {
          if (ok) { store.remove('plan.todos', t.id); render(App._view, { d: currentDate }); }
        });
      }));
      list.appendChild(row);
    });
    card.appendChild(list);
  }

  function render(view, params) {
    ui = App.ui;
    App._view = view;
    currentDate = (params && params.d && U.isValidDateStr(params.d)) ? params.d : U.today();
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">今日计划</h1><p class="page-sub">时间安排、待办与每日回顾</p>'));

    /* 自动顺延（幂等） */
    var carried = L.carryOverTodos(store.data, U.today());
    if (carried > 0) { store.commit(); carryMsgDismissed = false; }
    if (carried > 0 && !carryMsgDismissed) {
      var banner = D.el('<div class="banner banner-warn" style="border-radius:8px;margin-bottom:12px"><span>已为你顺延 ' + carried + ' 条未完成待办到今天</span><button class="btn btn-small">知道了</button></div>');
      banner.querySelector('button').addEventListener('click', function () { carryMsgDismissed = true; banner.remove(); });
      view.appendChild(banner);
    }

    var nav = ui.dateNav(currentDate, function (d) { render(view, { d: d }); });
    view.appendChild(nav);

    var grid = D.el('<div class="grid" style="grid-template-columns:1fr 1fr;align-items:start"></div>');
    var tlCard = D.el('<div class="card"></div>');
    var todoCard = D.el('<div class="card"></div>');
    renderTimeline(tlCard, currentDate);
    renderTodos(todoCard, currentDate);
    grid.appendChild(tlCard); grid.appendChild(todoCard);
    view.appendChild(grid);

    /* 每日回顾 */
    var reviewCard = D.el('<div class="card mt16"><b>每日回顾</b><div class="muted small" style="margin:4px 0 8px">今天过得怎么样？随手写两句，自动保存</div></div>');
    var ta = D.el('<textarea class="textarea" rows="3" placeholder="今天完成了什么、有什么想法…">' + U.esc(store.data.plan.reviews[currentDate] || '') + '</textarea>');
    ta.addEventListener('input', function () {
      store.mapSet('plan.reviews', currentDate, ta.value);
    });
    reviewCard.appendChild(ta);
    view.appendChild(reviewCard);
  }

  App.shell.registerPage('plan', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
