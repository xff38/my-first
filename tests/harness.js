/* tests/harness.js — 极简测试框架：test(name, fn) + assert 系列，失败即抛出，汇总退出码 */
'use strict';

const results = [];
let currentGroup = '';

function group(name) { currentGroup = name; }

function test(name, fn) {
  try {
    fn();
    results.push({ group: currentGroup, name, ok: true });
  } catch (err) {
    results.push({ group: currentGroup, name, ok: false, err });
  }
}

function fail(msg) { throw new Error(msg || '断言失败'); }

const assert = {
  ok(v, msg) { if (!v) fail(msg || '期望为真，实际 ' + JSON.stringify(v)); },
  eq(a, b, msg) {
    if (a !== b) fail((msg ? msg + '：' : '') + '期望 ' + JSON.stringify(b) + '，实际 ' + JSON.stringify(a));
  },
  deepEq(a, b, msg) {
    const sa = JSON.stringify(a), sb = JSON.stringify(b);
    if (sa !== sb) fail((msg ? msg + '：' : '') + '期望 ' + sb + '，实际 ' + sa);
  },
  ne(a, b, msg) { if (a === b) fail(msg || '期望不相等，实际都是 ' + JSON.stringify(a)); },
  throws(fn, msg) {
    let threw = false;
    try { fn(); } catch (e) { threw = true; }
    if (!threw) fail(msg || '期望抛出异常，但没有');
  },
  match(s, re, msg) { if (!re.test(String(s))) fail((msg || '字符串不匹配') + '：' + re + ' vs ' + s); },
  includes(hay, needle, msg) {
    const found = typeof hay === 'string' ? hay.includes(needle) : Array.isArray(hay) && hay.includes(needle);
    if (!found) fail((msg || '未包含') + '：' + JSON.stringify(needle));
  }
};

function report() {
  const byGroup = new Map();
  for (const r of results) {
    if (!byGroup.has(r.group)) byGroup.set(r.group, []);
    byGroup.get(r.group).push(r);
  }
  let pass = 0, failed = 0;
  for (const [g, list] of byGroup) {
    console.log('\n▍' + g);
    for (const r of list) {
      if (r.ok) { pass++; console.log('  ✓ ' + r.name); }
      else { failed++; console.log('  ✗ ' + r.name + '\n      ' + (r.err && r.err.message)); }
    }
  }
  console.log('\n──────────────────────────');
  console.log('共 ' + results.length + ' 个测试：' + pass + ' 通过，' + failed + ' 失败');
  if (failed > 0) process.exitCode = 1;
  return failed === 0;
}

/* 依次加载 src/js 中可纯 Node 运行的文件（遇到依赖 DOM 且未防护的会抛错，测试即失败） */
function loadApp() {
  const path = require('path');
  const SRC = path.join(__dirname, '..', 'src');
  const files = require('../build.js').JS_FILES;
  const loaded = [];
  for (const f of files) {
    const p = path.join(SRC, f);
    if (!require('fs').existsSync(p)) continue;
    require(p);
    loaded.push(f);
  }
  return globalThis.App;
}

module.exports = { test, group, assert, report, loadApp };
