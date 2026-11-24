/* 66-diet.js — 饮食计划：本周安排 │ 今日记录 │ 菜谱库 │ 体重 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, L = App.logic, D = App.dom, store = App.store;
  var TAB = 'week';
  var weekMonday = U.mondayOf(U.today());
  var recordDate = U.today();
  var viewEl = null;
  function rerender() { if (viewEl) render(viewEl, {}); }
  var MEALS = [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']];

  function mealCellModal(date, mealKey, mealLabel) {
    var recipes = store.data.diet.recipes;
    var cur = (store.data.diet.meals[date] || {})[mealKey] || '';
    var matched = recipes.filter(function (r) { return r.name === cur; })[0];
    App.ui.modal({
      title: U.fmtDateCN(date) + ' ' + mealLabel,
      values: { pick: matched ? matched.id : '', free: matched ? '' : cur },
      fields: [
        { key: 'pick', label: '从菜谱库选', type: 'select', options: [{ value: '', label: '（手输内容）' }].concat(recipes.map(function (r) { return { value: r.id, label: r.name }; })) },
        { key: 'free', label: '或手动输入', type: 'text', placeholder: '如：楼下沙县' }
      ],
      onSubmit: function (v) {
        var text = v.free.trim();
        if (v.pick) {
          var r = recipes.filter(function (x) { return x.id === v.pick; })[0];
          if (r) text = r.name;
        }
        var day = Object.assign({ breakfast: '', lunch: '', dinner: '' }, store.data.diet.meals[date]);
        day[mealKey] = text;
        store.mapSet('diet.meals', date, day);
        rerender();
        return null;
      }
    });
  }

  function renderWeek(box) {
    var ui = App.ui;
    var nav = D.el('<div class="row" style="margin-bottom:12px"><button class="btn btn-small" data-a="prev">← 上周</button><button class="btn btn-small" data-a="cur">本周</button><button class="btn btn-small" data-a="next">下周 →</button><button class="btn btn-small" data-a="copy">复制上周</button><span class="muted small week-label"></span></div>');
    nav.querySelector('[data-a=prev]').addEventListener('click', function () { weekMonday = U.addDays(weekMonday, -7); rerender(); });
    nav.querySelector('[data-a=next]').addEventListener('click', function () { weekMonday = U.addDays(weekMonday, 7); rerender(); });
    nav.querySelector('[data-a=cur]').addEventListener('click', function () { weekMonday = U.mondayOf(U.today()); rerender(); });
    nav.querySelector('[data-a=copy]').addEventListener('click', function () {
      ui.confirm({ title: '复制上周', text: '把上周的餐食安排复制到本周（覆盖本周已有安排）？' }).then(function (ok) {
        if (!ok) return;
        var prevMon = U.addDays(weekMonday, -7);
        for (var i = 0; i < 7; i++) {
          var pd = U.addDays(prevMon, i), cd = U.addDays(weekMonday, i);
          var pv = store.data.diet.meals[pd];
          if (pv) store.mapSet('diet.meals', cd, Object.assign({}, pv));
        }
        rerender();
      });
    });
    nav.querySelector('.week-label').textContent = U.fmtDateCN(weekMonday) + ' – ' + U.fmtDateCN(U.addDays(weekMonday, 6));
    box.appendChild(nav);

    var today = U.today();
    var grid = D.el('<div class="grid" style="grid-template-columns:repeat(7,1fr)"></div>');
    for (var i = 0; i < 7; i++) {
      var date = U.addDays(weekMonday, i);
      var isToday = date === today;
      var col = D.el('<div class="card" style="padding:8px;' + (isToday ? 'border:2px solid var(--mod-color)' : '') + '"></div>');
      col.appendChild(D.el('<div class="small" style="font-weight:700;margin-bottom:6px">' + '一二三四五六日'.charAt(i) + ' ' + U.fmtDateCN(date) + (isToday ? ' ·今天' : '') + '</div>'));
      var day = store.data.diet.meals[date] || {};
      MEALS.forEach(function (m) {
        var cell = D.el('<div style="border:1px dashed var(--border);border-radius:6px;padding:4px 6px;margin-bottom:6px;font-size:12px;cursor:pointer;min-height:34px">' +
          '<div class="muted" style="font-size:10px">' + m[1] + '</div><div>' + (day[m[0]] ? U.esc(day[m[0]]) : '<span class="muted">—</span>') + '</div></div>');
        cell.addEventListener('click', function () { mealCellModal(date, m[0], m[1]); });
        col.appendChild(cell);
      });
      grid.appendChild(col);
    }
    box.appendChild(grid);
  }

  function renderRecords(box) {
    var nav = App.ui.dateNav(recordDate, function (d) { recordDate = d; rerender(); });
    box.appendChild(nav);
    var meals = store.data.diet.meals[recordDate] || {};
    var recs = store.data.diet.records[recordDate] || { breakfast: { actual: '', eaten: false }, lunch: { actual: '', eaten: false }, dinner: { actual: '', eaten: false } };
    var grid = D.el('<div class="grid" style="grid-template-columns:repeat(3,1fr)"></div>');
    MEALS.forEach(function (m) {
      var r = recs[m[0]] || { actual: '', eaten: false };
      var card = D.el('<div class="card"><b class="small">' + m[1] + '</b>' +
        '<div class="muted small mt8">计划：' + (meals[m[0]] ? U.esc(meals[m[0]]) : '未安排') + '</div>' +
        '<div class="form-row mt8"><label>实际吃了</label><input class="input actual" value="' + U.esc(r.actual) + '" placeholder="实际吃了什么"></div>' +
        '<label class="row small"><input type="checkbox" class="eaten"' + (r.eaten ? ' checked' : '') + '> 已吃 ✓</label></div>');
      function save() {
        var day = Object.assign({ breakfast: { actual: '', eaten: false }, lunch: { actual: '', eaten: false }, dinner: { actual: '', eaten: false } }, store.data.diet.records[recordDate]);
        day[m[0]] = { actual: card.querySelector('.actual').value, eaten: card.querySelector('.eaten').checked };
        store.mapSet('diet.records', recordDate, day);
      }
      card.querySelector('.actual').addEventListener('change', save);
      card.querySelector('.eaten').addEventListener('change', save);
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  function recipeModal(r) {
    App.ui.modal({
      title: r ? '编辑菜谱' : '新菜谱',
      wide: true,
      values: r || { tags: (r && r.tags || []).join('、') },
      fields: [
        { key: 'name', label: '菜名', type: 'text', required: true },
        { key: 'tags', label: '标签（顿号分隔，如：主食、荤）', type: 'text', placeholder: (store.data.settings.recipeTags || []).join('、') },
        { key: 'ingredients', label: '食材清单', type: 'textarea', rows: 2 },
        { key: 'steps', label: '简单做法', type: 'textarea', rows: 4 }
      ],
      onDelete: r ? function () { store.remove('diet.recipes', r.id); rerender(); } : null,
      onSubmit: function (v) {
        var tags = String(v.tags || '').split(/[、,，]/).map(function (t) { return t.trim(); }).filter(Boolean);
        store.upsert('diet.recipes', Object.assign({}, r, { id: r ? r.id : U.uid(), name: v.name, tags: tags, ingredients: v.ingredients, steps: v.steps }));
        rerender();
        return null;
      }
    });
  }

  function renderRecipes(box) {
    var ui = App.ui;
    var head = D.el('<div class="row" style="justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary">＋ 新菜谱</button></div>');
    head.querySelector('button').addEventListener('click', function () { recipeModal(null); });
    box.appendChild(head);
    var list = store.data.diet.recipes;
    if (!list.length) { box.appendChild(ui.emptyState('🍳', '菜谱库是空的，先记一道常吃的', '＋ 新菜谱', function () { recipeModal(null); })); return; }
    var grid = D.el('<div class="grid" style="grid-template-columns:repeat(3,1fr)"></div>');
    list.forEach(function (r) {
      var card = D.el('<div class="card" style="padding:12px 14px"><b>' + U.esc(r.name) + '</b>' +
        '<div class="row mt8" style="gap:4px;flex-wrap:wrap">' + r.tags.map(function (t) { return '<span class="tag">' + U.esc(t) + '</span>'; }).join('') + '</div>' +
        (r.ingredients ? '<div class="muted small mt8">食材：' + U.esc(r.ingredients.slice(0, 60)) + '</div>' : '') +
        '<div class="row mt8"></div></div>');
      var acts = card.querySelector('.row.mt8');
      acts.appendChild(App.comp.iconBtn('📅', '排入本周', function () {
        ui.modal({
          title: '把「' + r.name + '」排到哪顿？',
          values: { date: U.today(), meal: 'lunch' },
          fields: [
            { key: 'date', label: '日期', type: 'date', required: true },
            { key: 'meal', label: '餐次', type: 'select', options: MEALS.map(function (m) { return { value: m[0], label: m[1] }; }) }
          ],
          onSubmit: function (v) {
            var day = Object.assign({ breakfast: '', lunch: '', dinner: '' }, store.data.diet.meals[v.date]);
            day[v.meal] = r.name;
            store.mapSet('diet.meals', v.date, day);
            rerender();
            return null;
          }
        });
      }));
      acts.appendChild(App.comp.iconBtn('✏️', '编辑', function () { recipeModal(r); }));
      acts.appendChild(App.comp.iconBtn('🗑', '删除', function () {
        ui.confirm({ title: '删除菜谱', text: '删除「' + r.name + '」？', danger: true }).then(function (ok) { if (ok) { store.remove('diet.recipes', r.id); rerender(); } });
      }));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  function renderWeight(box) {
    var ui = App.ui;
    function weightModal(w) {
      ui.modal({
        title: w ? '修改体重记录' : '记体重',
        values: w || { date: U.today() },
        fields: [
          { key: 'date', label: '日期', type: 'date', required: true },
          { key: 'kg', label: '体重（kg）', type: 'number', required: true, min: 20, max: 300 },
          { key: 'bf', label: '体脂率 %（选填）', type: 'number', min: 0, max: 80 }
        ],
        onDelete: w ? function () { store.remove('diet.weights', w.id); rerender(); } : null,
        onSubmit: function (v) {
          /* 同一天重复记录则覆盖 */
          var existing = w || store.data.diet.weights.filter(function (x) { return x.date === v.date; })[0];
          if (existing && !w) ui.toast('该日期已有记录，已覆盖', true);
          store.upsert('diet.weights', { id: existing ? existing.id : U.uid(), date: v.date, kg: v.kg, bf: v.bf });
          rerender();
          return null;
        }
      });
    }
    var head = D.el('<div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="row">' +
      '<select class="select" style="width:110px"><option value="30">近 30 天</option><option value="90">近 90 天</option><option value="all">全部</option></select></div>' +
      '<button class="btn btn-primary">＋ 记一笔</button></div>');
    var sel = head.querySelector('select');
    var RANGE = '30';
    sel.addEventListener('change', function () { RANGE = sel.value; rerender(); });
    head.querySelector('button').addEventListener('click', function () { weightModal(null); });
    box.appendChild(head);

    var ws = L.weightSummary(store.data.diet.weights);
    if (ws) {
      var info = D.el('<div class="row" style="margin-bottom:10px">' +
        App.ui.statCard('最近体重', ws.latest.kg + ' kg', ws.latest.date).outerHTML +
        App.ui.statCard('较上次', (ws.change > 0 ? '+' : '') + ws.change.toFixed(1) + ' kg').outerHTML + '</div>');
      box.appendChild(info);
    }
    var today = U.today();
    var from = RANGE === 'all' ? '0000-00-00' : U.addDays(today, -(+RANGE - 1));
    var pts = store.data.diet.weights.filter(function (w) { return w.date >= from; }).sort(U.byDateAsc)
      .map(function (w) { return { date: w.date, value: w.kg }; });
    var chart = D.el('<div class="card"></div>');
    chart.innerHTML = App.charts.lineChart(pts.length ? [{ name: '体重(kg)', points: pts }] : [], { from: RANGE === 'all' ? undefined : from, to: today });
    box.appendChild(chart);

    var recs = store.data.diet.weights.slice().sort(U.byDateDesc);
    if (recs.length) {
      var tbl = D.el('<table class="tbl mt12"><thead><tr><th>日期</th><th>体重 kg</th><th>体脂 %</th><th></th></tr></thead><tbody></tbody></table>');
      var tb = tbl.querySelector('tbody');
      recs.forEach(function (w) {
        var tr = D.el('<tr><td>' + w.date + '</td><td>' + w.kg + '</td><td>' + (w.bf == null ? '—' : w.bf) + '</td><td></td></tr>');
        var td = tr.lastElementChild;
        td.appendChild(App.comp.iconBtn('✏️', '修改', function () { weightModal(w); }));
        td.appendChild(App.comp.iconBtn('🗑', '删除', function () {
          ui.confirm({ title: '删除记录', text: '删除 ' + w.date + ' 的体重记录？', danger: true }).then(function (ok) { if (ok) { store.remove('diet.weights', w.id); rerender(); } });
        }));
        tb.appendChild(tr);
      });
      box.appendChild(tbl);
    }
  }

  function render(view) {
    viewEl = view;
    App._view = view;
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">饮食计划</h1><p class="page-sub">排餐 · 记录 · 菜谱 · 体重</p>'));
    view.appendChild(App.ui.tabs([
      { id: 'week', label: '本周安排' }, { id: 'records', label: '今日记录' },
      { id: 'recipes', label: '菜谱库' }, { id: 'weight', label: '体重' }
    ], TAB, function (id) { TAB = id; rerender(); }));
    var box = D.el('<div></div>');
    view.appendChild(box);
    if (TAB === 'week') renderWeek(box);
    else if (TAB === 'records') renderRecords(box);
    else if (TAB === 'recipes') renderRecipes(box);
    else renderWeight(box);
  }

  App.shell.registerPage('diet', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
