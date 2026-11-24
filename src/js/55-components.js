/* 55-components.js — 跨模块复用的小组件：拖拽看板、状态/优先级胶囊等 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util;
  var comp = {};
  App.comp = comp;

  if (typeof document === 'undefined') {
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  var D = App.dom;

  /* ---- 看板拖拽：容器内 [data-drag-id] 元素可拖到 [data-col] 列 ---- */
  comp.makeKanbanDraggable = function (boardEl, onDrop) {
    var dragId = null;
    boardEl.addEventListener('dragstart', function (e) {
      var card = e.target.closest('[data-drag-id]');
      if (!card) return;
      dragId = card.dataset.dragId;
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (err) {}
      card.classList.add('dragging');
    });
    boardEl.addEventListener('dragend', function () {
      dragId = null;
      boardEl.querySelectorAll('.dragging').forEach(function (el) { el.classList.remove('dragging'); });
      boardEl.querySelectorAll('.col-over').forEach(function (el) { el.classList.remove('col-over'); });
    });
    boardEl.addEventListener('dragover', function (e) {
      var col = e.target.closest('[data-col]');
      if (!col || !dragId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      boardEl.querySelectorAll('.col-over').forEach(function (el) { if (el !== col) el.classList.remove('col-over'); });
      col.classList.add('col-over');
    });
    boardEl.addEventListener('drop', function (e) {
      var col = e.target.closest('[data-col]');
      if (!col || !dragId) return;
      e.preventDefault();
      var status = col.dataset.col;
      var id = dragId;
      dragId = null;
      onDrop(id, status);
    });
  };

  /* ---- 通用拖拽（时间轴块等）：pointer 事件，15 分钟吸附由调用方处理 ---- */
  comp.makePointerDrag = function (el, opts) {
    /* opts: {onStart(e, el), onMove(dy, e), onEnd(dy, e), axis} */
    el.addEventListener('mousedown', function (e) {
      if (e.button !== 0) return;
      if (opts.ignore && e.target.closest(opts.ignore)) return;
      var startY = e.clientY, startX = e.clientX;
      var moved = false;
      if (opts.onStart) opts.onStart(e, el);
      function mm(ev) {
        var dy = ev.clientY - startY, dx = ev.clientX - startX;
        if (Math.abs(dy) > 3 || Math.abs(dx) > 3) moved = true;
        if (moved && opts.onMove) opts.onMove(dy, dx, ev);
        ev.preventDefault();
      }
      function mu(ev) {
        document.removeEventListener('mousemove', mm);
        document.removeEventListener('mouseup', mu);
        if (opts.onEnd) opts.onEnd(moved ? ev.clientY - startY : 0, moved ? ev.clientX - startX : 0, ev, moved);
      }
      document.addEventListener('mousemove', mm);
      document.addEventListener('mouseup', mu);
    });
  };

  /* ---- 胶囊标签（点击循环切换） ---- */
  comp.capsule = function (text, opts) {
    opts = opts || {};
    var el = D.el('<span class="tag clickable' + (opts.on ? ' tag-on' : '') + '" title="' + U.esc(opts.title || '点击切换') + '">' + U.esc(text) + '</span>');
    if (opts.onClick) el.addEventListener('click', function (e) { e.stopPropagation(); opts.onClick(); });
    return el;
  };

  comp.cycleCapsule = function (value, list, onCycle, colorMap) {
    return comp.capsule(value, {
      on: !!(colorMap && colorMap[value] === 'on'),
      title: '当前：' + value + '，点击切换',
      onClick: function () {
        var i = list.indexOf(value);
        onCycle(list[(i + 1) % list.length]);
      }
    });
  };

  /* ---- 列表行内小按钮 ---- */
  comp.iconBtn = function (icon, title, onClick, cls) {
    var el = D.el('<button class="btn btn-ghost btn-small" title="' + U.esc(title) + '">' + icon + '</button>');
    if (cls) el.classList.add(cls);
    el.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
    return el;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
