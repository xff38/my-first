/* 50-dom.js — DOM 助手与全局 UI（toast/弹窗表单/确认框/空状态/标签页/日期导航）
   纯校验逻辑 validateFieldValue 可在 Node 测试 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util, L = App.logic;
  var D = {};

  /* ---- 纯校验（Node 可测） ----
     field: {key,label,type,required,min,max,validate(value, values)} */
  D.validateFieldValue = function (field, value, values) {
    if (field.validate) return field.validate(value, values || {}) || null;
    switch (field.type) {
      case 'number':
        return L.validateNumber(value, field.label, { required: !!field.required, min: field.min, max: field.max });
      case 'time':
        if (field.required && !value) return field.label + '不能为空';
        if (value && !U.isValidTime(value)) return field.label + '格式应为 HH:MM';
        return null;
      case 'date':
        if (field.required && !value) return field.label + '不能为空';
        if (value && !U.isValidDateStr(value)) return field.label + '格式应为 YYYY-MM-DD';
        return null;
      default:
        if (field.required) return L.validateRequired(value, field.label);
        return null;
    }
  };

  if (typeof document === 'undefined') {
    App.dom = D;
    if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
    return;
  }

  /* ---- DOM 助手 ---- */
  D.el = function (html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  };
  D.els = function (html) {
    var t = document.createElement('template');
    t.innerHTML = html.trim();
    return Array.prototype.slice.call(t.content.children);
  };
  D.on = function (root, selector, evt, fn) {
    root.addEventListener(evt, function (e) {
      var t = e.target.closest(selector);
      if (t && root.contains(t)) fn(e, t);
    });
  };

  var ui = {};
  App.ui = ui;
  App.dom = D;

  /* ---- toast ---- */
  ui.toast = function (msg, isErr) {
    var root = document.getElementById('toast-root');
    var el = D.el('<div class="toast' + (isErr ? ' toast-err' : '') + '">' + U.esc(msg) + '</div>');
    root.appendChild(el);
    setTimeout(function () { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; }, 2200);
    setTimeout(function () { el.remove(); }, 2600);
  };

  /* ---- 弹窗表单 ----
     opts: {title, fields:[...], values:{}, wide, submitText, onSubmit(values)->errMap|null, onDelete}
     返回 {close} */
  ui.modal = function (opts) {
    var mask = D.el('<div class="modal-mask"><div class="modal' + (opts.wide ? ' wide' : '') + '"></div></div>');
    var box = mask.firstElementChild;
    var html = '<div class="modal-title">' + U.esc(opts.title || '') + '</div><form novalidate>';
    (opts.fields || []).forEach(function (f) {
      var v = (opts.values || {})[f.key];
      html += '<div class="form-row" data-key="' + f.key + '"><label' + (f.required ? ' class="required"' : '') + '>' + U.esc(f.label) + '</label>';
      switch (f.type) {
        case 'textarea':
          html += '<textarea class="textarea" rows="' + (f.rows || 3) + '" data-key="' + f.key + '" placeholder="' + U.esc(f.placeholder || '') + '">' + U.esc(v == null ? '' : v) + '</textarea>';
          break;
        case 'select':
          html += '<select class="select" data-key="' + f.key + '">' + (f.options || []).map(function (o) {
            var val = typeof o === 'object' ? o.value : o, lab = typeof o === 'object' ? o.label : o;
            return '<option value="' + U.esc(val) + '"' + (String(v) === String(val) ? ' selected' : '') + '>' + U.esc(lab) + '</option>';
          }).join('') + '</select>';
          break;
        case 'switch':
          html += '<label class="row"><input type="checkbox" data-key="' + f.key + '"' + (v ? ' checked' : '') + '><span>' + U.esc(f.onText || '是') + '</span></label>';
          break;
        case 'slider':
          html += '<div class="row"><input type="range" min="' + (f.min || 0) + '" max="' + (f.max || 100) + '" step="' + (f.step || 1) + '" value="' + (v == null ? (f.min || 0) : v) + '" data-key="' + f.key + '"><span class="slider-val muted">' + (v == null ? (f.min || 0) : v) + (f.unit || '') + '</span></div>';
          break;
        case 'number':
          html += '<input class="input" type="number" step="any" data-key="' + f.key + '" value="' + U.esc(v == null ? '' : v) + '" placeholder="' + U.esc(f.placeholder || '') + '">';
          break;
        case 'date':
          html += '<input class="input" type="date" data-key="' + f.key + '" value="' + U.esc(v == null ? '' : v) + '">';
          break;
        case 'time':
          html += '<input class="input" type="time" data-key="' + f.key + '" value="' + U.esc(v == null ? '' : v) + '">';
          break;
        default:
          html += '<input class="input" type="text" data-key="' + f.key + '" value="' + U.esc(v == null ? '' : v) + '" placeholder="' + U.esc(f.placeholder || '') + '"' + (f.list ? ' list="' + f.list + '"' : '') + '>';
      }
      html += '<div class="field-error"></div></div>';
    });
    html += '<div class="modal-actions">' +
      (opts.onDelete ? '<button type="button" class="btn btn-danger" data-act="delete">删除</button><span class="spacer" style="flex:1"></span>' : '') +
      '<button type="button" class="btn" data-act="cancel">取消</button>' +
      '<button type="submit" class="btn btn-primary">' + U.esc(opts.submitText || '保存') + '</button></div></form>';
    box.innerHTML = html;
    document.getElementById('modal-root').appendChild(mask);

    var form = box.querySelector('form');
    function readValues() {
      var vals = {};
      (opts.fields || []).forEach(function (f) {
        var input = form.querySelector('[data-key="' + f.key + '"]:not(.form-row)');
        if (!input) { vals[f.key] = (opts.values || {})[f.key]; return; }
        if (f.type === 'switch') vals[f.key] = input.checked;
        else if (f.type === 'number') vals[f.key] = input.value === '' ? null : U.toNum(input.value, null);
        else if (f.type === 'slider') vals[f.key] = U.toNum(input.value, f.min || 0);
        else vals[f.key] = input.value;
      });
      return vals;
    }
    function showErrors(errs) {
      var any = false;
      (opts.fields || []).forEach(function (f) {
        var row = form.querySelector('.form-row[data-key="' + f.key + '"]');
        if (!row) return;
        var msg = errs && errs[f.key];
        row.querySelector('.field-error').textContent = msg || '';
        var input = row.querySelector('.input, .textarea');
        if (input) input.classList.toggle('invalid', !!msg);
        if (msg) any = true;
      });
      return any;
    }
    form.addEventListener('input', function (e) {
      if (e.target.type === 'range') {
        var f = (opts.fields || []).filter(function (x) { return x.key === e.target.dataset.key; })[0];
        e.target.parentElement.querySelector('.slider-val').textContent = e.target.value + ((f && f.unit) || '');
      }
      var row = e.target.closest('.form-row');
      if (row) { row.querySelector('.field-error').textContent = ''; var i = row.querySelector('.input, .textarea'); if (i) i.classList.remove('invalid'); }
    });
    form.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); submit(); }
      if (e.key === 'Escape') close();
    });
    form.addEventListener('submit', function (e) { e.preventDefault(); submit(); });
    function submit() {
      var vals = readValues();
      var errs = {};
      (opts.fields || []).forEach(function (f) {
        var err = D.validateFieldValue(f, vals[f.key], vals);
        if (err) errs[f.key] = err;
      });
      if (showErrors(errs)) return;
      var ret = opts.onSubmit ? opts.onSubmit(vals) : null;
      if (ret && typeof ret === 'object') { if (showErrors(ret)) return; }
      close();
    }
    box.querySelector('[data-act="cancel"]').addEventListener('click', close);
    if (opts.onDelete) box.querySelector('[data-act="delete"]').addEventListener('click', function () {
      ui.confirm({ title: '删除确认', text: opts.deleteText || '确定删除吗？此操作不可撤销。', danger: true }).then(function (ok) {
        if (ok) { opts.onDelete(); close(); }
      });
    });
    mask.addEventListener('mousedown', function (e) { if (e.target === mask) close(); });
    function close() { mask.remove(); }
    var first = form.querySelector('.input, .textarea, select');
    if (first) setTimeout(function () { first.focus(); }, 30);
    return { close: close, readValues: readValues };
  };

  /* ---- 确认框 ---- */
  ui.confirm = function (opts) {
    return new Promise(function (resolve) {
      var mask = D.el('<div class="modal-mask"><div class="modal"></div></div>');
      var box = mask.firstElementChild;
      var need = opts.requireText || null;
      box.innerHTML = '<div class="modal-title">' + U.esc(opts.title || '确认') + '</div>' +
        '<div style="white-space:pre-wrap;line-height:1.7">' + U.esc(opts.text || '') + '</div>' +
        (need ? '<div class="form-row mt12"><label>请输入「' + U.esc(need) + '」以确认</label><input class="input" id="confirm-input"></div>' : '') +
        '<div class="modal-actions"><button class="btn" data-act="no">取消</button>' +
        '<button class="btn ' + (opts.danger ? 'btn-danger' : 'btn-primary') + '" data-act="yes"' + (need ? ' disabled' : '') + '>' + U.esc(opts.okText || '确定') + '</button></div>';
      document.getElementById('modal-root').appendChild(mask);
      var yes = box.querySelector('[data-act="yes"]');
      if (need) {
        var input = box.querySelector('#confirm-input');
        input.addEventListener('input', function () { yes.disabled = input.value.trim() !== need; });
        setTimeout(function () { input.focus(); }, 30);
      }
      function done(v) { mask.remove(); resolve(v); }
      yes.addEventListener('click', function () { done(true); });
      box.querySelector('[data-act="no"]').addEventListener('click', function () { done(false); });
      mask.addEventListener('mousedown', function (e) { if (e.target === mask) done(false); });
      mask.addEventListener('keydown', function (e) { if (e.key === 'Escape') done(false); });
    });
  };

  ui.alert = function (text, title) {
    return ui.confirm({ title: title || '提示', text: text, okText: '知道了' });
  };

  /* ---- 空状态 ---- */
  ui.emptyState = function (icon, text, btnText, onAdd) {
    var el = D.el('<div class="empty-state"><div class="empty-icon">' + (icon || '📭') + '</div><div>' + U.esc(text) + '</div>' +
      (btnText ? '<button class="btn btn-primary">' + U.esc(btnText) + '</button>' : '') + '</div>');
    if (btnText && onAdd) el.querySelector('button').addEventListener('click', onAdd);
    return el;
  };

  /* ---- 标签页 ---- */
  ui.tabs = function (list, activeId, onChange) {
    var el = D.el('<div class="tabs"></div>');
    el.innerHTML = list.map(function (t) {
      return '<button class="tab-btn' + (t.id === activeId ? ' active' : '') + '" data-id="' + t.id + '">' + U.esc(t.label) + '</button>';
    }).join('');
    el.addEventListener('click', function (e) {
      var b = e.target.closest('.tab-btn');
      if (b && b.dataset.id !== activeId) onChange(b.dataset.id);
    });
    return el;
  };

  /* ---- 日期导航条 ---- */
  ui.dateNav = function (current, onChange) {
    var el = D.el('<div class="row" style="margin-bottom:14px">' +
      '<button class="btn btn-small" data-act="prev">← 前一天</button>' +
      '<button class="btn btn-small" data-act="today">今天</button>' +
      '<button class="btn btn-small" data-act="next">后一天 →</button>' +
      '<input type="date" class="input" style="width:160px" value="' + U.esc(current) + '">' +
      '<span class="muted small date-label"></span></div>');
    var input = el.querySelector('input');
    var label = el.querySelector('.date-label');
    function set(d) { onChange(d); }
    el.querySelector('[data-act="prev"]').addEventListener('click', function () { set(U.addDays(current, -1)); });
    el.querySelector('[data-act="next"]').addEventListener('click', function () { set(U.addDays(current, 1)); });
    el.querySelector('[data-act="today"]').addEventListener('click', function () { set(U.today()); });
    input.addEventListener('change', function () { if (U.isValidDateStr(input.value)) set(input.value); });
    el.refresh = function (d) {
      current = d;
      input.value = d;
      label.textContent = d === U.today() ? '' : '正在查看 ' + U.fmtDateCN(d) + ' 周' + U.weekdayCN(d);
    };
    el.refresh(current);
    return el;
  };

  /* ---- 统计卡 ---- */
  ui.statCard = function (label, value, sub, onClick) {
    var el = D.el('<div class="card" style="padding:12px 16px' + (onClick ? ';cursor:pointer' : '') + '">' +
      '<div class="muted small">' + U.esc(label) + '</div>' +
      '<div style="font-size:20px;font-weight:700;margin:4px 0">' + U.esc(value) + '</div>' +
      (sub ? '<div class="muted small">' + U.esc(sub) + '</div>' : '') + '</div>');
    if (onClick) el.addEventListener('click', onClick);
    return el;
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
