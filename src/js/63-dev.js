/* 63-dev.js — 开发工作：四列看板（拖拽换状态）＋项目详情（进展记录时间线） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, L = App.logic, D = App.dom, store = App.store;
  var COLS = ['未开始', '进行中', '暂停', '已完成'];
  var doneExpanded = false;
  var viewEl = null;
  function rerender() { if (viewEl) render(viewEl, {}); }

  function projectModal(p) {
    App.ui.modal({
      title: p ? '编辑项目：' + p.name : '新项目',
      wide: true,
      values: p || { status: '未开始', progress: 0 },
      fields: [
        { key: 'name', label: '项目名称', type: 'text', required: true },
        { key: 'status', label: '状态', type: 'select', options: COLS },
        { key: 'progress', label: '完成进度', type: 'slider', min: 0, max: 100, step: 5, unit: '%' },
        { key: 'nextStep', label: '下一步要做什么', type: 'text', placeholder: '一句话，回到项目时一眼看到' },
        { key: 'due', label: '截止日期（选填）', type: 'date' },
        { key: 'note', label: '备注', type: 'textarea', rows: 3 }
      ],
      onDelete: p ? function () {
        store.remove('dev.projects', p.id);
        rerender();
      } : null,
      onSubmit: function (v) {
        var old = p || { status: v.status, progress: v.progress, nextStep: '' };
        var changed = L.projectChangeLog(old, v);
        var logs = (p && p.logs ? p.logs.slice() : []);
        if (changed) logs.push({ time: new Date().toISOString(), text: changed, auto: true });
        store.upsert('dev.projects', {
          id: p ? p.id : U.uid(), name: v.name, status: v.status, progress: v.progress,
          nextStep: v.nextStep, note: v.note, due: v.due || null,
          updated: new Date().toISOString(), logs: logs
        });
        rerender();
        return null;
      }
    });
  }

  function detailModal(p) {
    var box = App.ui.modal({
      title: '项目详情：' + p.name,
      wide: true,
      values: p,
      fields: [
        { key: 'name', label: '项目名称', type: 'text', required: true },
        { key: 'status', label: '状态', type: 'select', options: COLS },
        { key: 'progress', label: '完成进度', type: 'slider', min: 0, max: 100, step: 5, unit: '%' },
        { key: 'nextStep', label: '下一步要做什么', type: 'text' },
        { key: 'due', label: '截止日期（选填）', type: 'date' },
        { key: 'note', label: '备注', type: 'textarea', rows: 3 }
      ],
      onDelete: function () {
        store.remove('dev.projects', p.id);
        rerender();
      },
      onSubmit: function (v) {
        var changed = L.projectChangeLog(p, v);
        var logs = p.logs.slice();
        if (changed) logs.push({ time: new Date().toISOString(), text: changed, auto: true });
        store.upsert('dev.projects', Object.assign({}, p, {
          name: v.name, status: v.status, progress: v.progress, nextStep: v.nextStep,
          note: v.note, due: v.due || null, updated: new Date().toISOString(), logs: logs
        }));
        rerender();
        return null;
      }
    });
    /* 进展记录时间线 + 手动补记：追加到弹窗内 */
    var mask = document.querySelector('#modal-root .modal-mask:last-child');
    if (mask) {
      var form = mask.querySelector('form');
      var sec = D.el('<div class="section-title" style="margin-top:6px">进展记录</div><div class="log-list" style="max-height:150px;overflow:auto;border:1px solid var(--border);border-radius:8px;padding:8px;font-size:12px"></div>' +
        '<div class="row mt8"><input class="input" placeholder="手动补记一条进展…"><button type="button" class="btn btn-small">添加</button></div>');
      var listEl = sec.querySelector('.log-list');
      function drawLogs() {
        var cur = store.data.dev.projects.filter(function (x) { return x.id === p.id; })[0] || p;
        listEl.innerHTML = '';
        if (!cur.logs.length) listEl.appendChild(D.el('<div class="muted">暂无进展记录</div>'));
        cur.logs.slice().reverse().forEach(function (lg) {
          listEl.appendChild(D.el('<div style="padding:3px 0;border-bottom:1px dashed var(--border)"><span class="muted">' + U.esc(lg.time.slice(0, 16).replace('T', ' ')) + (lg.auto ? ' · 自动' : '') + '</span> ' + U.esc(lg.text) + '</div>'));
        });
      }
      drawLogs();
      sec.querySelector('button').addEventListener('click', function () {
        var input = sec.querySelector('input');
        var t = input.value.trim();
        if (!t) return;
        var cur = store.data.dev.projects.filter(function (x) { return x.id === p.id; })[0];
        if (!cur) return;
        var logs = cur.logs.slice();
        logs.push({ time: new Date().toISOString(), text: t, auto: false });
        store.upsert('dev.projects', Object.assign({}, cur, { logs: logs, updated: new Date().toISOString() }));
        input.value = '';
        drawLogs();
        rerender();
      });
      form.insertBefore(sec, form.querySelector('.modal-actions'));
    }
    return box;
  }

  function render(view) {
    viewEl = view;
    App._view = view;
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">开发工作</h1><p class="page-sub">拖拽卡片换列即改状态；点卡片看详情与进展记录</p>'));
    var head = D.el('<div class="row" style="justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary">＋ 新项目</button></div>');
    head.querySelector('button').addEventListener('click', function () { projectModal(null); });
    view.appendChild(head);

    var board = D.el('<div class="grid" style="grid-template-columns:repeat(4,1fr);align-items:start"></div>');
    var projects = store.data.dev.projects;
    COLS.forEach(function (col) {
      var items = projects.filter(function (p) { return p.status === col; })
        .sort(function (a, b) { return (b.updated || '').localeCompare(a.updated || ''); });
      var colEl = D.el('<div class="card" data-col="' + col + '" style="padding:10px;min-height:160px;background:var(--bg-soft)"></div>');
      var title = D.el('<div class="row" style="justify-content:space-between;margin-bottom:8px"><b class="small">' + col + '</b><span class="tag">' + items.length + '</span></div>');
      colEl.appendChild(title);
      if (col === '已完成' && !doneExpanded && items.length) {
        var toggle = D.el('<button class="btn btn-small btn-ghost">展开 ' + items.length + ' 个已完成项目 ▾</button>');
        toggle.addEventListener('click', function () { doneExpanded = true; rerender(); });
        colEl.appendChild(toggle);
        board.appendChild(colEl);
        return;
      }
      if (col === '已完成' && doneExpanded && items.length) {
        var fold = D.el('<button class="btn btn-small btn-ghost" style="margin-bottom:6px">收起 ▴</button>');
        fold.addEventListener('click', function () { doneExpanded = false; rerender(); });
        colEl.appendChild(fold);
      }
      if (!items.length) colEl.appendChild(D.el('<div class="muted small" style="text-align:center;padding:18px 0">空</div>'));
      items.forEach(function (p) {
        var card = D.el('<div class="card" draggable="true" data-drag-id="' + p.id + '" style="padding:10px 12px;margin-bottom:8px;cursor:grab;background:var(--bg-card)">' +
          '<b style="font-size:13px">' + U.esc(p.name) + '</b>' +
          '<div class="row mt8" style="gap:6px"><div style="flex:1;height:6px;border-radius:3px;background:var(--bg-hover);overflow:hidden"><div style="width:' + p.progress + '%;height:100%;background:var(--mod-color)"></div></div><span class="muted small">' + p.progress + '%</span></div>' +
          (p.nextStep ? '<div class="small" style="margin-top:6px">下一步：<b>' + U.esc(p.nextStep) + '</b></div>' : '') +
          '<div class="muted" style="font-size:10px;margin-top:6px">更新 ' + U.esc((p.updated || '').slice(0, 10)) + (p.due ? ' · 截止 ' + p.due : '') + '</div></div>');
        card.addEventListener('click', function (e) {
          if (e.target.closest('[draggable]') && card.dataset.justDragged) { card.dataset.justDragged = ''; return; }
          detailModal(p);
        });
        colEl.appendChild(card);
      });
      board.appendChild(colEl);
    });
    view.appendChild(board);

    App.comp.makeKanbanDraggable(board, function (id, status) {
      var p = store.data.dev.projects.filter(function (x) { return x.id === id; })[0];
      if (!p || p.status === status) return;
      var logs = p.logs.slice();
      logs.push({ time: new Date().toISOString(), text: '状态：' + p.status + ' → ' + status, auto: true });
      store.upsert('dev.projects', Object.assign({}, p, { status: status, updated: new Date().toISOString(), logs: logs }));
      rerender();
    });
    board.addEventListener('dragend', function () {
      board.querySelectorAll('[data-drag-id]').forEach(function (c) { c.dataset.justDragged = '1'; setTimeout(function () { delete c.dataset.justDragged; }, 50); });
    });
  }

  App.shell.registerPage('dev', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
