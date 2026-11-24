/* 40-persist.js — 浏览器持久化层：IndexedDB 句柄、FSA 文件连接、localStorage 缓存、备份/恢复/导出/清空 */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var U = App.util, S = App.schema, L = App.logic;

  var caps = {
    open: typeof window !== 'undefined' && typeof window.showOpenFilePicker === 'function',
    save: typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function',
    dir: typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
  };

  var P = { caps: caps };

  if (typeof window === 'undefined') {
    App.persist = P; // Node 环境：仅暴露能力标志，供测试引用
    if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.App;
    return;
  }

  var store = App.store;
  var ui = function () {
    return App.ui || {
      toast: function (m) { console.log('[toast] ' + m); },
      confirm: function (m) { return window.confirm(m); },
      alert: function (m) { window.alert(m); }
    };
  };

  /* ============ localStorage 缓存适配器 ============ */
  var LS_SNAP = 'papp.snap', LS_OPS = 'papp.ops', LS_BACKUPS = 'papp.backupNames';
  var cacheAdapter = {
    saveSnapshot: function (json) { try { localStorage.setItem(LS_SNAP, json); } catch (e) {} },
    loadSnapshot: function () { try { return localStorage.getItem(LS_SNAP); } catch (e) { return null; } },
    pushOps: function (ops) { try { localStorage.setItem(LS_OPS, JSON.stringify(ops)); } catch (e) {} }, // 语义=整体替换为当前全部未决 ops
    loadOps: function () { try { return JSON.parse(localStorage.getItem(LS_OPS) || '[]'); } catch (e) { return []; } },
    clearOps: function () { try { localStorage.removeItem(LS_OPS); } catch (e) {} }
  };

  /* ============ IndexedDB（存文件句柄） ============ */
  function idb() {
    return new Promise(function (res, rej) {
      var req = indexedDB.open('papp-db', 1);
      req.onupgradeneeded = function () {
        if (!req.result.objectStoreNames.contains('kv')) req.result.createObjectStore('kv');
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
  }
  function idbGet(key) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('kv', 'readonly');
        var r = tx.objectStore('kv').get(key);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }
  function idbSet(key, val) {
    return idb().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction('kv', 'readwrite');
        tx.objectStore('kv').put(val, key);
        tx.oncomplete = function () { res(true); };
        tx.onerror = function () { rej(tx.error); };
      });
    }).catch(function () { return false; });
  }

  /* ============ 文件适配器 ============ */
  var fileHandle = null;

  function makeFileAdapter(handle) {
    return {
      isConnected: function () { return !!handle; },
      name: function () { return handle ? handle.name : ''; },
      write: function (json) {
        return handle.createWritable().then(function (w) {
          return w.write(json).then(function () { return w.close(); });
        });
      }
    };
  }

  async function ensurePermission(handle) {
    var opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return (await handle.requestPermission(opts)) === 'granted';
  }

  async function readHandleText(handle) {
    var f = await handle.getFile();
    return await f.text();
  }

  /* 连接成功后的通用流程：读文件 → normalize → 重放 oplog → 写回 */
  async function adoptHandle(handle, opts) {
    opts = opts || {};
    if (!(await ensurePermission(handle))) throw new Error('未获得文件读写授权');
    var text = await readHandleText(handle);
    var fileData = S.normalize(text);
    if (fileData === null) {
      /* 文件内容无法识别 */
      if (!opts.forceOverwrite && !ui().confirm('文件「' + handle.name + '」内容无法识别（不是本 App 的数据格式）。\n是否用当前数据覆盖它？\n（选"取消"则不连接）')) {
        throw new Error('文件内容无法识别');
      }
      fileData = S.normalize(store.data);
    }
    var ops = store.pendingOps();
    if (ops.length) {
      L.applyOplog(fileData, ops);
    }
    fileHandle = handle;
    store.setFileAdapter(makeFileAdapter(handle));
    store.setData(fileData);       // setData→commit→queueSave（合并结果随后写回文件）
    var carried = L.carryOverTodos(store.data, U.today());
    if (carried) store.commit();
    store.saveNow();               // 立即写一次，成功后清空 pendingOps
    idbSet('fileHandle', handle);
    App.shell.setFileState(true, handle.name);
    if (App.shell.rerender) App.shell.rerender();
    return handle.name;
  }

  /* 用户点击「连接数据文件」 */
  P.connect = async function () {
    try {
      /* 1) 优先用记住的句柄 */
      var saved = await idbGet('fileHandle').catch(function () { return null; });
      if (saved) {
        try {
          var name = await adoptHandle(saved);
          ui().toast('已连接：' + name);
          return name;
        } catch (e) { /* 句柄失效则走选择器 */ }
      }
      /* 2) 文件选择器 */
      if (!caps.open) { ui().alert('当前浏览器不支持连接本地文件，请使用「导出/导入」管理数据。'); return null; }
      var [h] = await window.showOpenFilePicker({
        mode: 'readwrite',
        types: [{ description: '数据文件', accept: { 'application/json': ['.json'], 'text/plain': ['.txt'] } }],
        multiple: false
      });
      var name2 = await adoptHandle(h);
      ui().toast('已连接：' + name2);
      return name2;
    } catch (e) {
      if (e && e.name === 'AbortError') return null; // 用户取消
      ui().toast('连接失败：' + (e && e.message || e), true);
      return null;
    }
  };

  /* ============ 下载兜底 ============ */
  function downloadBlob(filename, text) {
    var blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  }
  P.downloadBlob = downloadBlob;

  /* ============ 新建数据文件 ============ */
  P.createNew = async function () {
    var json = S.serialize(store.data);
    if (caps.save) {
      try {
        var handle = await window.showSaveFilePicker({
          suggestedName: '我的数据.json',
          types: [{ description: '数据文件', accept: { 'application/json': ['.json'] } }]
        });
        var name = await adoptHandle(handle, { forceOverwrite: true });
        ui().toast('已创建数据文件：' + name);
        return name;
      } catch (e) {
        if (e && e.name === 'AbortError') return null;
        ui().toast('创建失败：' + (e && e.message || e), true);
        return null;
      }
    }
    /* 降级：下载初始文件 + 引导连接 */
    downloadBlob('我的数据.json', json);
    ui().alert('已下载初始数据文件「我的数据.json」。\n\n请把它移动到固定位置（建议 APP 文件夹），然后点顶栏「● 未连接」→ 在弹出的选择框中选中这个文件，即完成连接。\n\n（也可以手动新建一个空的 .json 文件再连接，App 会自动写入初始数据）');
    return 'downloaded';
  };

  /* ============ 备份 ============ */
  function usedBackupNames() {
    try { return JSON.parse(localStorage.getItem(LS_BACKUPS) || '[]'); } catch (e) { return []; }
  }
  function rememberBackupName(name) {
    var arr = usedBackupNames();
    if (arr.indexOf(name) === -1) arr.push(name);
    if (arr.length > 200) arr = arr.slice(-200);
    try { localStorage.setItem(LS_BACKUPS, JSON.stringify(arr)); } catch (e) {}
  }

  async function backupDirHandle(create) {
    var dh = await idbGet('backupDir').catch(function () { return null; });
    if (dh) return dh;
    if (!create || !caps.dir) return null;
    try {
      dh = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await idbSet('backupDir', dh);
      return dh;
    } catch (e) { return null; }
  }

  P.backup = async function (opts) {
    opts = opts || {};
    var json = S.serialize(store.data);
    var today = U.today();
    try {
      var dh = await backupDirHandle(!opts.noPicker);
      if (dh) {
        var sub = await dh.getDirectoryHandle('备份', { create: true });
        var names = [];
        for await (var n of sub.keys()) names.push(n);
        var fname = U.backupFileName(opts.baseName || '我的数据', today, names);
        var fh = await sub.getFileHandle(fname, { create: true });
        var w = await fh.createWritable();
        await w.write(json); await w.close();
        ui().toast('已备份到「备份」文件夹：' + fname);
        return fname;
      }
    } catch (e) { /* 目录方式失败 → 下载兜底 */ }
    var fname2 = U.backupFileName(opts.baseName || '我的数据', today, usedBackupNames());
    downloadBlob(fname2, json);
    rememberBackupName(fname2);
    ui().toast('已备份（浏览器下载）：' + fname2);
    return fname2;
  };

  /* ============ 恢复 ============ */
  function pickFileFallback() {
    return new Promise(function (res) {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.txt,application/json';
      input.onchange = function () { res(input.files && input.files[0] ? input.files[0] : null); };
      input.click();
    });
  }

  P.restore = async function () {
    try {
      var text = null, fname = '';
      if (caps.open) {
        var [h] = await window.showOpenFilePicker({
          mode: 'readonly',
          types: [{ description: '备份文件', accept: { 'application/json': ['.json'], 'text/plain': ['.txt'] } }],
          multiple: false
        });
        fname = h.name;
        text = await readHandleText(h);
      } else {
        var f = await pickFileFallback();
        if (!f) return false;
        fname = f.name;
        text = await f.text();
      }
      var restored = S.normalize(text);
      if (restored === null) { ui().alert('所选文件无法识别（不是本 App 的数据/备份文件），未做任何改动。'); return false; }
      /* 恢复前快照 */
      try {
        var snapName = '恢复前快照-' + new Date().toISOString().slice(0, 19).replace(/[:T]/g, '') + '.json';
        downloadBlob(snapName, S.serialize(store.data));
      } catch (e) {}
      store.setData(restored);
      store.saveNow();
      syncSettingsToShell();
      if (App.shell.rerender) App.shell.rerender();
      ui().toast('已从「' + fname + '」恢复（恢复前数据已自动另存为快照下载）');
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;
      ui().toast('恢复失败：' + (e && e.message || e), true);
      return false;
    }
  };

  /* ============ 导出 / 清空 ============ */
  P.exportJSON = function () {
    var name = '我的数据-导出-' + U.today() + '.json';
    downloadBlob(name, S.serialize(store.data));
    ui().toast('已导出：' + name);
  };

  P.clearAll = function () {
    store.setData(S.defaultData());
    store.saveNow();
    syncSettingsToShell();
    if (App.shell.rerender) App.shell.rerender();
    ui().toast('已清空全部数据');
  };

  /* ============ 设置同步到外壳 ============ */
  function syncSettingsToShell() {
    var st = store.data.settings;
    App.shell.applyTheme(st.theme || 'light');
    App.shell.applySidebar(!!st.sidebarCollapsed);
  }
  P.syncSettingsToShell = syncSettingsToShell;

  /* ============ 启动 ============ */
  P.boot = async function () {
    store.setCacheAdapter(cacheAdapter);
    store.loadFromCache();
    var carried = L.carryOverTodos(store.data, U.today());
    if (carried) store.commit();
    syncSettingsToShell();
    store.setSaveStateUI(store.pendingOps().length ? 'cache' : 'idle');

    /* 尝试用记住的句柄静默连接（仅在已授权时，不弹权限框） */
    try {
      var saved = await idbGet('fileHandle');
      if (saved && (await saved.queryPermission({ mode: 'readwrite' })) === 'granted') {
        await adoptHandle(saved);
      }
    } catch (e) { /* 静默失败 → 显示未连接 */ }
    App.shell.setFileState(store.fileConnected(), store.fileName());
  };

  App.boot = function () { P.boot(); };
  App.persist = P;

  if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.App;
});
