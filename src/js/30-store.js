/* 30-store.js — 内存 store + 变更 API + 自动保存管道（适配器注入，可 Node 测试） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util, S = App.schema, L = App.logic;

  function createStore() {
    var data = S.defaultData();
    var subs = [];
    var fileAdapter = null;   // {isConnected(), name(), write(json):Promise|void}
    var cacheAdapter = null;  // {saveSnapshot(json), pushOps(ops), loadOps(), clearOps(), saveMeta(obj), loadMeta(), loadSnapshot()}
    var pendingOps = [];      // 未落盘到文件的操作日志
    var saveState = 'idle';   // idle | saved | cache | error
    var lastError = null;

    var store = {};

    Object.defineProperty(store, 'data', { get: function () { return data; } });
    store.pendingOps = function () { return pendingOps.slice(); };
    store.saveState = function () { return saveState; };
    store.lastError = function () { return lastError; };

    store.setFileAdapter = function (a) { fileAdapter = a; };
    store.setCacheAdapter = function (a) { cacheAdapter = a; };
    store.fileConnected = function () { return !!(fileAdapter && fileAdapter.isConnected()); };
    store.fileName = function () { return (fileAdapter && fileAdapter.name()) || ''; };

    store.subscribe = function (fn) { subs.push(fn); };
    store.notify = function () {
      subs.forEach(function (fn) {
        try { fn(data); } catch (e) { if (typeof console !== 'undefined') console.error(e); }
      });
    };

    function setSaveStateUI(state, errText) {
      saveState = state;
      lastError = errText || null;
      if (typeof document !== 'undefined' && App.shell) {
        if (state === 'saved') App.shell.setSaveState('已保存 ✓', 'ok');
        else if (state === 'cache') App.shell.setSaveState('暂存浏览器', '');
        else if (state === 'error') App.shell.setSaveState('保存失败 ⚠', 'err');
        else App.shell.setSaveState('—', '');
        App.shell.setFileState(store.fileConnected(), store.fileName());
      }
    }
    store.setSaveStateUI = setSaveStateUI;

    /* ---- 变更 API（全部经过这里，自动记 op） ---- */
    function pushOp(op) {
      pendingOps.push(op);
      if (pendingOps.length > 5000) pendingOps = pendingOps.slice(-4000);
    }

    store.upsert = function (path, record) {
      var cleaned = S.cleanRecord(path, record);
      if (!cleaned) return null;
      var arr = S.ensurePath(data, path, []);
      var idx = -1;
      for (var i = 0; i < arr.length; i++) if (arr[i].id === cleaned.id) { idx = i; break; }
      if (idx >= 0) arr[idx] = cleaned; else arr.push(cleaned);
      pushOp(L.opUpsert(path, cleaned));
      store.commit();
      return cleaned;
    };

    store.mapSet = function (path, key, value) {
      var cleaned = S.cleanMapValue(path, key, value);
      var map = S.ensurePath(data, path, {});
      if (cleaned === undefined) {
        /* 清洗后为空（如清空回顾）= 删除该键 */
        if (Object.prototype.hasOwnProperty.call(map, key)) {
          delete map[key];
          pushOp(L.opRemove(path, key));
          store.commit();
        }
        return false;
      }
      map[key] = cleaned;
      pushOp(L.opMapSet(path, key, cleaned));
      store.commit();
      return true;
    };

    store.remove = function (path, id) {
      var kind = S.COLLECTIONS[path];
      if (kind === 'array') {
        var arr = S.ensurePath(data, path, []);
        for (var i = arr.length - 1; i >= 0; i--) if (arr[i].id === id) arr.splice(i, 1);
      } else if (kind === 'map') {
        delete S.ensurePath(data, path, {})[id];
      }
      pushOp(L.opRemove(path, id));
      store.commit();
    };

    store.setSetting = function (key, value) {
      data.settings[key] = (value && typeof value === 'object') ? U.deepClone(value) : value;
      pushOp(L.opSetting(key, data.settings[key]));
      store.commit();
    };

    /* 整体替换数据（连接文件/恢复/清空时用）：skipOps=不记 op */
    store.setData = function (newData) {
      data = S.normalize(newData) || S.defaultData();
      store.commit();
    };

    store.commit = function () {
      store.notify();
      store.queueSave();
    };

    /* ---- 保存管道 ---- */
    store.saveNow = function () {
      var json = S.serialize(data);
      /* 快照缓存始终写（应急兜底） */
      if (cacheAdapter) {
        try {
          cacheAdapter.saveSnapshot(json);
          if (pendingOps.length) cacheAdapter.pushOps(pendingOps.slice());
        } catch (e) { /* 缓存失败不阻塞 */ }
      }
      if (fileAdapter && fileAdapter.isConnected()) {
        var done = function (err) {
          if (err) {
            setSaveStateUI('error', String(err && err.message || err));
            if (cacheAdapter) { try { cacheAdapter.pushOps(pendingOps.slice()); } catch (e2) {} }
          } else {
            pendingOps = [];
            if (cacheAdapter) { try { cacheAdapter.clearOps(); } catch (e2) {} }
            setSaveStateUI('saved');
          }
        };
        try {
          var r = fileAdapter.write(json);
          if (r && typeof r.then === 'function') r.then(function () { done(null); }, function (e) { done(e); });
          else done(null);
        } catch (e) { done(e); }
      } else {
        setSaveStateUI('cache');
      }
    };

    store.queueSave = U.debounce(store.saveNow, 500);

    /* 清空未决 op（连接文件重放成功后由 persist 调用） */
    store.takePendingOps = function () {
      var ops = pendingOps.slice();
      pendingOps = [];
      if (cacheAdapter) { try { cacheAdapter.clearOps(); } catch (e) {} }
      return ops;
    };
    store.restorePendingOps = function (ops) { pendingOps = ops.slice(); };

    /* 启动：从缓存恢复（未连接文件时的暂存数据） */
    store.loadFromCache = function () {
      if (!cacheAdapter) return false;
      var snap = null;
      try { snap = cacheAdapter.loadSnapshot(); } catch (e) {}
      if (snap) {
        var norm = S.normalize(snap);
        if (norm) data = norm;
      }
      var ops = [];
      try { ops = cacheAdapter.loadOps() || []; } catch (e) {}
      pendingOps = ops.slice();
      if (pendingOps.length) L.applyOplog(data, pendingOps);
      return true;
    };

    return store;
  }

  App.createStore = createStore;
  if (typeof document !== 'undefined' || !App.store) {
    App.store = App.store || createStore();
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
