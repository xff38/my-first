/* 67-fun.js — 游戏娱乐：时间记录 │ 娱乐安排 │ 今天玩什么 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, L = App.logic, D = App.dom, store = App.store;
  var TAB = 'records';
  var viewEl = null;
  var pickState = { spinning: false, result: null, skipped: [] };
  function rerender() { if (viewEl) render(viewEl, {}); }
  var WD = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'];
  var MOODS = { good: '😀', ok: '😐', bad: '😞' };

  function recordModal(r) {
    App.ui.modal({
      title: r ? '编辑娱乐记录' : '记一笔娱乐时间',
      values: r || { date: U.today(), minutes: 60 },
      fields: [
        { key: 'date', label: '日期', type: 'date', required: true },
        { key: 'what', label: '玩了/看了什么', type: 'text', required: true },
        { key: 'minutes', label: '时长（分钟）', type: 'number', required: true, min: 0, max: 1440 },
        { key: 'mood', label: '心情（选填）', type: 'select', options: [{ value: '', label: '（不记）' }, { value: 'good', label: '😀 开心' }, { value: 'ok', label: '😐 一般' }, { value: 'bad', label: '😞 不行' }] }
      ],
      onDelete: r ? function () { store.remove('fun.records', r.id); rerender(); } : null,
      onSubmit: function (v) {
        store.upsert('fun.records', Object.assign({}, r, { id: r ? r.id : U.uid(), date: v.date, what: v.what, minutes: v.minutes, mood: v.mood || null }));
        rerender();
        return null;
      }
    });
  }

  function weeklyModal(w) {
    App.ui.modal({
      title: w ? '编辑娱乐时段' : '添加每周固定娱乐',
      values: w || { weekday: 6, time: '20:00' },
      fields: [
        { key: 'weekday', label: '星期', type: 'select', options: WD.map(function (x, i) { return { value: i + 1, label: x }; }) },
        { key: 'time', label: '时间', type: 'time', required: true },
        { key: 'what', label: '内容（如：电影夜）', type: 'text', required: true }
      ],
      onDelete: w ? function () { store.remove('fun.weekly', w.id); rerender(); } : null,
      onSubmit: function (v) {
        store.upsert('fun.weekly', Object.assign({}, w, { id: w ? w.id : U.uid(), weekday: +v.weekday, time: v.time, what: v.what }));
        rerender();
        return null;
      }
    });
  }

  function renderRecords(box) {
    var ui = App.ui;
    var today = U.today();
    var recs = store.data.fun.records;
    var head = D.el('<div class="row" style="justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary">＋ 记一笔</button></div>');
    head.querySelector('button').addEventListener('click', function () { recordModal(null); });
    box.appendChild(head);
    var cards = D.el('<div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px"></div>');
    var wm = L.funWeekMinutes(recs, today), mm = L.funMonthMinutes(recs, today);
    var daysInMonth = +today.slice(8, 10);
    cards.appendChild(App.ui.statCard('本周合计', U.fmtMinutes(wm)));
    cards.appendChild(App.ui.statCard('本月合计', U.fmtMinutes(mm)));
    cards.appendChild(App.ui.statCard('本月日均', U.fmtMinutes(Math.round(mm / daysInMonth)), '和学习打卡对照看看平衡'));
    box.appendChild(cards);
    if (!recs.length) { box.appendChild(ui.emptyState('🎮', '还没有娱乐记录', '＋ 记一笔', function () { recordModal(null); })); return; }
    var tbl = D.el('<table class="tbl"><thead><tr><th>日期</th><th>内容</th><th>时长</th><th>心情</th><th></th></tr></thead><tbody></tbody></table>');
    var tb = tbl.querySelector('tbody');
    recs.slice().sort(U.byDateDesc).forEach(function (r) {
      var tr = D.el('<tr><td>' + r.date + '</td><td>' + U.esc(r.what) + '</td><td>' + U.fmtMinutes(r.minutes) + '</td><td>' + (r.mood ? MOODS[r.mood] : '—') + '</td><td></td></tr>');
      var td = tr.lastElementChild;
      td.appendChild(App.comp.iconBtn('✏️', '编辑', function () { recordModal(r); }));
      td.appendChild(App.comp.iconBtn('🗑', '删除', function () {
        ui.confirm({ title: '删除记录', text: '删除 ' + r.date + '「' + r.what + '」？', danger: true }).then(function (ok) { if (ok) { store.remove('fun.records', r.id); rerender(); } });
      }));
      tb.appendChild(tr);
    });
    box.appendChild(tbl);
  }

  function renderWeekly(box) {
    var ui = App.ui;
    var head = D.el('<div class="row" style="justify-content:flex-end;margin-bottom:12px"><button class="btn btn-primary">＋ 添加时段</button></div>');
    head.querySelector('button').addEventListener('click', function () { weeklyModal(null); });
    box.appendChild(head);
    var list = store.data.fun.weekly;
    if (!list.length) { box.appendChild(ui.emptyState('🗓', '还没有每周固定娱乐时段（如：周六晚电影夜）', '＋ 添加时段', function () { weeklyModal(null); })); return; }
    var grid = D.el('<div class="grid" style="grid-template-columns:repeat(7,1fr)"></div>');
    for (var wd = 1; wd <= 7; wd++) {
      var col = D.el('<div class="card" style="padding:8px;min-height:110px;background:var(--bg-soft)"><b class="small">' + WD[wd - 1] + '</b></div>');
      list.filter(function (w) { return w.weekday === wd; }).sort(function (a, b) { return a.time < b.time ? -1 : 1; }).forEach(function (w) {
        var chip = D.el('<div style="background:var(--bg-card);border-radius:6px;padding:4px 6px;margin-top:6px;font-size:12px;cursor:pointer"><div class="muted">' + w.time + '</div><div>' + U.esc(w.what) + '</div></div>');
        chip.addEventListener('click', function () { weeklyModal(w); });
        col.appendChild(chip);
      });
      grid.appendChild(col);
    }
    box.appendChild(grid);
    box.appendChild(D.el('<div class="muted small mt8">这些时段会自动进入「今天玩什么」的抽选池</div>'));
  }

  function renderPick(box) {
    var ui = App.ui;
    var pool = L.buildPickPool(store.data.fun.weekly, store.data.fun.pool);
    var card = D.el('<div class="card" style="text-align:center;padding:30px"></div>');
    var nameEl = D.el('<div style="font-size:30px;font-weight:800;min-height:44px" class="pick-name">—</div>');
    card.appendChild(D.el('<div class="muted small" style="margin-bottom:14px">抽选池共 ' + pool.length + ' 项（每周安排 ' + store.data.fun.weekly.length + ' ＋ 手动 ' + store.data.fun.pool.length + '）</div>'));
    card.appendChild(nameEl);
    var btns = D.el('<div class="row mt16" style="justify-content:center"></div>');
    var spinBtn = D.el('<button class="btn btn-primary" style="font-size:16px;padding:10px 30px">🎲 抽一个</button>');
    var okBtn = D.el('<button class="btn" disabled>就它了</button>');
    var againBtn = D.el('<button class="btn" disabled>不满意，重抽</button>');
    var skipBtn = D.el('<button class="btn" disabled>换一个（跳过）</button>');
    btns.appendChild(spinBtn); btns.appendChild(okBtn); btns.appendChild(againBtn); btns.appendChild(skipBtn);
    card.appendChild(btns);
    box.appendChild(card);

    function spin(exclude) {
      if (!pool.length) { ui.toast('抽选池是空的，先去「娱乐安排」或下面添加候选', true); return; }
      pickState.spinning = true;
      okBtn.disabled = againBtn.disabled = skipBtn.disabled = true;
      var ticks = 0, total = 14;
      var timer = setInterval(function () {
        var rnd = pool[Math.floor(Math.random() * pool.length)];
        nameEl.textContent = rnd.text;
        nameEl.style.opacity = ticks % 2 ? '.45' : '1';
        ticks++;
        if (ticks > total) {
          clearInterval(timer);
          var picked = L.randomPick(pool, exclude);
          pickState.result = picked;
          pickState.spinning = false;
          nameEl.textContent = picked ? picked.text : '（池空）';
          nameEl.style.opacity = '1';
          okBtn.disabled = againBtn.disabled = skipBtn.disabled = !picked;
        }
      }, 70);
    }
    spinBtn.addEventListener('click', function () { pickState.skipped = []; spin([]); });
    againBtn.addEventListener('click', function () { spin(pickState.skipped); });
    skipBtn.addEventListener('click', function () {
      if (pickState.result) pickState.skipped.push(pickState.result.id);
      spin(pickState.skipped);
    });
    okBtn.addEventListener('click', function () {
      var p = pickState.result;
      if (!p) return;
      store.upsert('fun.records', { id: U.uid(), date: U.today(), what: p.text, minutes: 0, mood: null });
      ui.toast('已预填一条今天的娱乐记录（' + p.text + '），时长可去「时间记录」补');
      pickState.result = null;
      rerender();
    });
    box.appendChild(card);

    /* 手动候选管理 */
    var mg = D.el('<div class="card mt16"><b class="small">手动候选池</b><div class="row mt8"><input class="input" placeholder="加一个候选，如：塞尔达、某部电影"><button class="btn btn-small btn-primary">添加</button></div><div class="row mt8" style="flex-wrap:wrap;gap:6px"></div></div>');
    var chips = mg.querySelector('.row.mt8');
    function addPool() {
      var input = mg.querySelector('input');
      var t = input.value.trim();
      if (!t) return;
      store.upsert('fun.pool', { id: U.uid(), text: t });
      input.value = '';
      rerender();
    }
    mg.querySelector('button').addEventListener('click', addPool);
    mg.querySelector('input').addEventListener('keydown', function (e) { if (e.key === 'Enter') addPool(); });
    store.data.fun.pool.forEach(function (p) {
      var chip = D.el('<span class="tag">' + U.esc(p.text) + '</span>');
      chip.appendChild(App.comp.iconBtn('✕', '移除候选', function () { store.remove('fun.pool', p.id); rerender(); }));
      chips.appendChild(chip);
    });
    if (!store.data.fun.pool.length) chips.appendChild(D.el('<span class="muted small">暂无手动候选</span>'));
    box.appendChild(mg);
  }

  function render(view) {
    viewEl = view;
    App._view = view;
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">游戏娱乐</h1><p class="page-sub">玩得开心，也留个痕迹</p>'));
    view.appendChild(App.ui.tabs([
      { id: 'records', label: '时间记录' }, { id: 'weekly', label: '娱乐安排' }, { id: 'pick', label: '今天玩什么' }
    ], TAB, function (id) { TAB = id; rerender(); }));
    var box = D.el('<div></div>');
    view.appendChild(box);
    if (TAB === 'records') renderRecords(box);
    else if (TAB === 'weekly') renderWeekly(box);
    else renderPick(box);
  }

  App.shell.registerPage('fun', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
