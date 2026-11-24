/* 64-consult.js — 咨询工作：收入/收款记录 ＋ 汇总卡 ＋ 月度柱状图 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var U = App.util, L = App.logic, D = App.dom, store = App.store;
  var filterMonth = '';      // '' = 全部
  var onlyUnreceived = false;
  var viewEl = null;
  function rerender() { if (viewEl) render(viewEl, {}); }

  function incomeModal(r) {
    var clients = [];
    store.data.consult.incomes.forEach(function (i) { if (i.client && clients.indexOf(i.client) === -1) clients.push(i.client); });
    App.ui.modal({
      title: r ? '编辑收入记录' : '记一笔收入',
      values: r || { date: U.today(), received: false },
      fields: [
        { key: 'client', label: '客户', type: 'text', required: true, list: 'client-list' },
        { key: 'desc', label: '事项说明', type: 'text' },
        { key: 'amount', label: '金额（元）', type: 'number', required: true, min: 0 },
        { key: 'date', label: '日期', type: 'date', required: true },
        { key: 'received', label: '已收款', type: 'switch', onText: '已收到这笔钱' },
        { key: 'note', label: '备注', type: 'textarea', rows: 2 }
      ],
      onDelete: r ? function () { store.remove('consult.incomes', r.id); rerender(); } : null,
      onSubmit: function (v) {
        store.upsert('consult.incomes', Object.assign({}, r, {
          id: r ? r.id : U.uid(), client: v.client, desc: v.desc, amount: v.amount,
          date: v.date, received: v.received, note: v.note
        }));
        rerender();
        return null;
      }
    });
    /* datalist 供客户名联想 */
    if (clients.length && !document.getElementById('client-list')) {
      var dl = D.el('<datalist id="client-list">' + clients.map(function (c) { return '<option value="' + U.esc(c) + '">'; }).join('') + '</datalist>');
      document.body.appendChild(dl);
    }
  }

  function render(view) {
    viewEl = view;
    App._view = view;
    var ui = App.ui;
    var today = U.today();
    var incomes = store.data.consult.incomes;
    view.innerHTML = '';
    view.appendChild(D.el('<h1 class="page-title">咨询工作</h1><p class="page-sub">每笔收入记清楚：谁、多少钱、收没收到</p>'));

    /* 汇总卡 */
    var ms = L.incomeMonthSummary(incomes, U.monthOf(today));
    var yt = L.incomeYearTotal(incomes, today.slice(0, 4));
    var cards = D.el('<div class="grid" style="grid-template-columns:repeat(3,1fr);margin-bottom:14px"></div>');
    cards.appendChild(App.ui.statCard('本月已收', '¥' + U.fmtMoney(ms.received), '点击只看本月', function () { filterMonth = U.monthOf(today); onlyUnreceived = false; rerender(); }));
    cards.appendChild(App.ui.statCard('本月未收', '¥' + U.fmtMoney(ms.unreceived), ms.unreceivedCount + ' 笔 · 点击只看未收', function () { filterMonth = U.monthOf(today); onlyUnreceived = true; rerender(); }));
    cards.appendChild(App.ui.statCard('本年累计（已收）', '¥' + U.fmtMoney(yt), today.slice(0, 4) + ' 年', function () { filterMonth = ''; onlyUnreceived = false; rerender(); }));
    view.appendChild(cards);

    /* 筛选条 */
    var months = [];
    incomes.forEach(function (r) { var m = U.monthOf(r.date); if (m && months.indexOf(m) === -1) months.push(m); });
    months.sort().reverse();
    var bar = D.el('<div class="row" style="margin-bottom:12px">' +
      '<select class="select" style="width:140px"><option value="">全部月份</option>' + months.map(function (m) { return '<option value="' + m + '">' + m + '</option>'; }).join('') + '</select>' +
      '<label class="row small"><input type="checkbox"' + (onlyUnreceived ? ' checked' : '') + '> 只看未收</label>' +
      '<span class="spacer"></span><button class="btn btn-primary">＋ 记一笔</button></div>');
    var sel = bar.querySelector('select');
    sel.value = filterMonth;
    sel.addEventListener('change', function () { filterMonth = sel.value; rerender(); });
    bar.querySelector('input[type=checkbox]').addEventListener('change', function (e) { onlyUnreceived = e.target.checked; rerender(); });
    bar.querySelector('button').addEventListener('click', function () { incomeModal(null); });
    view.appendChild(bar);

    /* 柱状图 */
    var series = L.monthlyIncomeSeries(incomes, today, 6);
    var chart = D.el('<div class="card" style="margin-bottom:14px"></div>');
    chart.innerHTML = App.charts.barChart(series.map(function (m) {
      return { label: m.month.slice(5) + '月', parts: [{ value: m.received, color: 'var(--ok)', name: '已收' }, { value: m.unreceived, color: 'var(--warn-border)', name: '未收' }] };
    }), { yFmt: function (v) { return '¥' + Math.round(v); } });
    chart.addEventListener('click', function (e) {
      var t = e.target.closest('[data-idx]');
      if (!t) return;
      filterMonth = series[+t.dataset.idx].month;
      rerender();
    });
    view.appendChild(chart);

    /* 记录表 */
    var list = incomes.slice().sort(U.byDateDesc);
    if (filterMonth) list = list.filter(function (r) { return U.monthOf(r.date) === filterMonth; });
    if (onlyUnreceived) list = list.filter(function (r) { return !r.received; });
    if (!list.length) {
      view.appendChild(ui.emptyState('💰', '还没有收入记录', '＋ 记一笔', function () { incomeModal(null); }));
      return;
    }
    var tbl = D.el('<table class="tbl"><thead><tr><th>日期</th><th>客户</th><th>事项</th><th style="text-align:right">金额</th><th>状态</th><th></th></tr></thead><tbody></tbody></table>');
    var tb = tbl.querySelector('tbody');
    list.forEach(function (r) {
      var tr = D.el('<tr><td>' + r.date + '</td><td>' + U.esc(r.client) + '</td><td class="muted">' + U.esc(r.desc || '') + '</td>' +
        '<td style="text-align:right"><b>¥' + U.fmtMoney(r.amount) + '</b></td><td></td><td></td></tr>');
      var tdStatus = tr.children[4];
      tdStatus.appendChild(App.comp.capsule(r.received ? '已收' : '未收', {
        on: r.received,
        title: '点击切换收款状态',
        onClick: function () { store.upsert('consult.incomes', Object.assign({}, r, { received: !r.received })); rerender(); }
      }));
      var tdAct = tr.children[5];
      tdAct.appendChild(App.comp.iconBtn('✏️', '编辑', function () { incomeModal(r); }));
      tdAct.appendChild(App.comp.iconBtn('🗑', '删除', function () {
        ui.confirm({ title: '删除记录', text: '删除 ' + r.date + ' ' + r.client + ' ¥' + U.fmtMoney(r.amount) + '？', danger: true }).then(function (ok) { if (ok) { store.remove('consult.incomes', r.id); rerender(); } });
      }));
      tb.appendChild(tr);
    });
    view.appendChild(tbl);
  }

  App.shell.registerPage('consult', render);

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
