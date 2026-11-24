/* 62-media.js — 自媒体：选题库 │ 发布计划 │ 数据统计 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, L = App.logic, D = App.dom, store = App.store;
  var TAB = 'topics', VIEW = 'week', METRIC = 'views', RANGE = '30';
  var TOPIC_STATUS = ['灵感', '制作中', '已发布', '已放弃'];

  function platforms() { return store.data.settings.platforms || []; }

  function topicModal(t) {
    App.ui.modal({
      title: t ? '编辑选题' : '新选题',
      values: t || { status: '灵感' },
      fields: [
        { key: 'title', label: '选题标题', type: 'text', required: true },
        { key: 'desc', label: '一句话说明', type: 'text' },
        { key: 'status', label: '状态', type: 'select', options: TOPIC_STATUS },
        { key: 'note', label: '备注', type: 'textarea', rows: 2 }
      ],
      onDelete: t ? function () { store.remove('media.topics', t.id); rerender(); } : null,
      onSubmit: function (v) {
        store.upsert('media.topics', Object.assign({}, t, {
          id: t ? t.id : U.uid(), title: v.title, desc: v.desc, status: v.status, note: v.note,
          createdAt: t ? t.createdAt : new Date().toISOString()
        }));
        rerender();
        return null;
      }
    });
  }

  function scheduleModal(s) {
    var topics = store.data.media.topics;
    App.ui.modal({
      title: s ? '编辑发布计划' : '新发布计划',
      values: s || { date: U.today(), platform: platforms()[0] || '', status: '计划中' },
      fields: [
        { key: 'title', label: '内容标题', type: 'text', required: true },
        { key: 'date', label: '发布日期', type: 'date', required: true },
        { key: 'platform', label: '平台', type: 'select', options: platforms() },
        { key: 'status', label: '状态', type: 'select', options: ['计划中', '已发布'] },
        { key: 'topicId', label: '关联选题（选填）', type: 'select', options: [{ value: '', label: '（不关联）' }].concat(topics.map(function (t) { return { value: t.id, label: t.title }; })) }
      ],
      onDelete: s ? function () { store.remove('media.schedule', s.id); rerender(); } : null,
      onSubmit: function (v) {
        store.upsert('media.schedule', Object.assign({}, s, {
          id: s ? s.id : U.uid(), title: v.title, date: v.date, platform: v.platform,
          status: v.status, topicId: v.topicId || null
        }));
        rerender();
        return null;
      }
    });
  }

  function markPublished(s) {
    App.ui.modal({
      title: '标记已发布 · 顺手记个初始数据',
      values: { views: null, likes: null },
      fields: [
        { key: 'views', label: '播放量（选填）', type: 'number', min: 0 },
        { key: 'likes', label: '点赞数（选填）', type: 'number', min: 0 }
      ],
      submitText: '保存（可跳过）',
      onSubmit: function (v) {
        store.upsert('media.schedule', Object.assign({}, s, { status: '已发布' }));
        if (v.views != null || v.likes != null) {
          store.upsert('media.stats', { id: U.uid(), platform: s.platform, date: U.today(), views: v.views, likes: v.likes, fans: null });
        }
        var topic = store.data.media.topics.filter(function (t) { return t.id === s.topicId; })[0];
        if (topic && topic.status !== '已发布') {
          store.upsert('media.topics', Object.assign({}, topic, { status: '已发布' }));
        }
        rerender();
        return null;
      }
    });
  }

  function renderTopics(box) {
    var ui = App.ui;
    var add = D.el('<div class="row" style="margin-bottom:12px"><input class="input" placeholder="快速记一个选题灵感，回车添加"><button class="btn btn-primary">＋ 新选题</button></div>');
    var input = add.querySelector('input');
    function quick() {
      var t = input.value.trim();
      if (!t) return;
      store.upsert('media.topics', { id: U.uid(), title: t, desc: '', status: '灵感', note: '', createdAt: new Date().toISOString() });
      input.value = '';
      rerender();
    }
    input.addEventListener('keydown', function (e) { if (e.key === 'Enter') quick(); });
    add.querySelector('button').addEventListener('click', function () { topicModal(null); });
    box.appendChild(add);

    var filters = D.el('<div class="row" style="margin-bottom:12px"></div>');
    ['全部'].concat(TOPIC_STATUS).forEach(function (st) {
      var on = (TAB === 'topics:' + st) || (st === '全部' && TAB === 'topics');
      filters.appendChild(App.comp.capsule(st, { on: on, onClick: function () { TAB = st === '全部' ? 'topics' : 'topics:' + st; rerender(); } }));
    });
    box.appendChild(filters);

    var list = store.data.media.topics.slice().sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
    var cur = TAB.indexOf('topics:') === 0 ? TAB.slice(7) : null;
    if (cur) list = list.filter(function (t) { return t.status === cur; });
    if (!list.length) { box.appendChild(ui.emptyState('💡', '还没有选题，上面输入框记一个灵感', '＋ 新选题', function () { topicModal(null); })); return; }
    var grid = D.el('<div class="grid" style="grid-template-columns:repeat(3,1fr)"></div>');
    list.forEach(function (t) {
      var card = D.el('<div class="card" style="padding:12px 14px"><div class="row" style="justify-content:space-between"><b>' + U.esc(t.title) + '</b></div>' +
        (t.desc ? '<div class="muted small" style="margin:6px 0">' + U.esc(t.desc) + '</div>' : '<div style="height:6px"></div>') +
        '<div class="row small muted"><span class="tag">' + U.esc(t.status) + '</span><span>' + U.fmtDateCN((t.createdAt || '').slice(0, 10)) + '</span></div>' +
        '<div class="row mt8"></div></div>');
      var acts = card.querySelector('.row.mt8');
      acts.appendChild(App.comp.cycleCapsule(t.status, TOPIC_STATUS, function (ns) {
        store.upsert('media.topics', Object.assign({}, t, { status: ns }));
        rerender();
      }));
      acts.appendChild(App.comp.iconBtn('📅', '排入发布计划', function () {
        scheduleModal({ date: U.today(), platform: platforms()[0] || '', status: '计划中', title: t.title, topicId: t.id });
      }));
      acts.appendChild(App.comp.iconBtn('✏️', '编辑', function () { topicModal(t); }));
      acts.appendChild(App.comp.iconBtn('🗑', '删除', function () {
        ui.confirm({ title: '删除选题', text: '删除「' + t.title + '」？', danger: true }).then(function (ok) { if (ok) { store.remove('media.topics', t.id); rerender(); } });
      }));
      grid.appendChild(card);
    });
    box.appendChild(grid);
  }

  function renderSchedule(box) {
    var ui = App.ui;
    var head = D.el('<div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="row"></div><button class="btn btn-primary">＋ 新发布计划</button></div>');
    head.querySelector('button').addEventListener('click', function () { scheduleModal(null); });
    var views = head.querySelector('.row');
    [['week', '本周'], ['month', '本月'], ['all', '全部'], ['done', '已发布']].forEach(function (v) {
      views.appendChild(App.comp.capsule(v[1], { on: VIEW === v[0], onClick: function () { VIEW = v[0]; rerender(); } }));
    });
    box.appendChild(head);

    var today = U.today();
    var mon = U.mondayOf(today);
    var list = store.data.media.schedule.slice().sort(U.byDateDesc);
    if (VIEW === 'week') list = list.filter(function (s) { return s.date >= mon && s.date <= U.addDays(mon, 6); });
    else if (VIEW === 'month') list = list.filter(function (s) { return U.monthOf(s.date) === U.monthOf(today); });
    else if (VIEW === 'done') list = list.filter(function (s) { return s.status === '已发布'; });

    if (!list.length) { box.appendChild(ui.emptyState('📅', '这个视图下还没有发布计划', '＋ 新发布计划', function () { scheduleModal(null); })); return; }
    var groups = U.groupBy(list, function (s) { return s.date; });
    groups.forEach(function (items, date) {
      box.appendChild(D.el('<div class="section-title" style="margin:10px 0 6px">' + U.fmtDateCN(date) + ' 周' + U.weekdayCN(date) + (date === today ? '（今天）' : '') + '</div>'));
      items.forEach(function (s) {
        var row = D.el('<div class="card row" style="padding:10px 14px;margin-bottom:8px">' +
          '<span class="tag">' + U.esc(s.platform || '未定平台') + '</span>' +
          '<span style="flex:1">' + U.esc(s.title) + '</span></div>');
        row.appendChild(App.comp.capsule(s.status, {
          on: s.status === '已发布',
          onClick: function () { if (s.status === '计划中') markPublished(s); else { store.upsert('media.schedule', Object.assign({}, s, { status: '计划中' })); rerender(); } }
        }));
        row.appendChild(App.comp.iconBtn('✏️', '编辑', function () { scheduleModal(s); }));
        row.appendChild(App.comp.iconBtn('🗑', '删除', function () {
          ui.confirm({ title: '删除发布计划', text: '删除「' + s.title + '」？', danger: true }).then(function (ok) { if (ok) { store.remove('media.schedule', s.id); rerender(); } });
        }));
        box.appendChild(row);
      });
    });
  }

  function renderStats(box) {
    var ui = App.ui;
    var head = D.el('<div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="row">' +
      '<select class="select" style="width:110px"><option value="views">播放量</option><option value="likes">点赞数</option><option value="fans">粉丝数</option></select>' +
      '<select class="select" style="width:110px"><option value="30">近 30 天</option><option value="90">近 90 天</option><option value="all">全部</option></select>' +
      '</div><button class="btn btn-primary">＋ 录入数据</button></div>');
    var selM = head.querySelectorAll('select')[0], selR = head.querySelectorAll('select')[1];
    selM.value = METRIC; selR.value = RANGE;
    selM.addEventListener('change', function () { METRIC = selM.value; rerender(); });
    selR.addEventListener('change', function () { RANGE = selR.value; rerender(); });
    head.querySelector('button').addEventListener('click', function () { statModal(null); });
    box.appendChild(head);

    function statModal(s) {
      ui.modal({
        title: s ? '编辑数据记录' : '录入平台数据',
        values: s || { date: U.today(), platform: platforms()[0] || '' },
        fields: [
          { key: 'platform', label: '平台', type: 'select', options: platforms(), required: true },
          { key: 'date', label: '日期', type: 'date', required: true },
          { key: 'views', label: '播放量', type: 'number', min: 0 },
          { key: 'likes', label: '点赞数', type: 'number', min: 0 },
          { key: 'fans', label: '粉丝总数', type: 'number', min: 0 }
        ],
        onDelete: s ? function () { store.remove('media.stats', s.id); rerender(); } : null,
        onSubmit: function (v) {
          store.upsert('media.stats', Object.assign({}, s, { id: s ? s.id : U.uid(), platform: v.platform, date: v.date, views: v.views, likes: v.likes, fans: v.fans }));
          rerender();
          return null;
        }
      });
    }

    var today = U.today();
    var from = RANGE === 'all' ? '0000-00-00' : U.addDays(today, -(+RANGE - 1));
    var series = L.statsSeries(store.data.media.stats, METRIC, from, today);
    var chartBox = D.el('<div class="card"></div>');
    chartBox.innerHTML = App.charts.lineChart(series.map(function (s) { return { name: s.platform, points: s.points }; }), { from: RANGE === 'all' ? undefined : from, to: today });
    box.appendChild(chartBox);

    var recs = store.data.media.stats.slice().sort(U.byDateDesc);
    if (!recs.length) { box.appendChild(D.el('<div class="mt12"></div>')); box.lastChild.appendChild(ui.emptyState('📈', '还没有数据记录，点右上录入', null, null)); return; }
    var tbl = D.el('<table class="tbl mt12"><thead><tr><th>日期</th><th>平台</th><th>播放</th><th>点赞</th><th>粉丝</th><th></th></tr></thead><tbody></tbody></table>');
    var tb = tbl.querySelector('tbody');
    recs.forEach(function (r) {
      var tr = D.el('<tr><td>' + r.date + '</td><td>' + U.esc(r.platform) + '</td><td>' + (r.views == null ? '—' : r.views) + '</td><td>' + (r.likes == null ? '—' : r.likes) + '</td><td>' + (r.fans == null ? '—' : r.fans) + '</td><td></td></tr>');
      var td = tr.lastElementChild;
      td.appendChild(App.comp.iconBtn('✏️', '编辑', function () { statModal(r); }));
      td.appendChild(App.comp.iconBtn('🗑', '删除', function () {
        ui.confirm({ title: '删除记录', text: '删除 ' + r.date + ' ' + r.platform + ' 的数据？', danger: true }).then(function (ok) { if (ok) { store.remove('media.stats', r.id); rerender(); } });
      }));
      tb.appendChild(tr);
    });
    box.appendChild(tbl);
  }

  var viewEl = null;
  function rerender() { if (viewEl) render(viewEl, {}); }

  function render(view) {
    viewEl = view;
    App._view = view;
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">自媒体</h1><p class="page-sub">选题 → 排期 → 发布 → 数据</p>'));
    var tab = TAB.indexOf('topics') === 0 ? 'topics' : TAB;
    var tabs = App.ui.tabs([{ id: 'topics', label: '选题库' }, { id: 'schedule', label: '发布计划' }, { id: 'stats', label: '数据统计' }], tab, function (id) { TAB = id; rerender(); });
    view.appendChild(tabs);
    var box = D.el('<div></div>');
    view.appendChild(box);
    if (tab === 'topics') renderTopics(box);
    else if (tab === 'schedule') renderSchedule(box);
    else renderStats(box);
  }

  App.shell.registerPage('media', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
