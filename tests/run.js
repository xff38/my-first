/* tests/run.js — 测试入口：加载全部 *.test.js 并汇总结果 */
'use strict';
const fs = require('fs');
const path = require('path');
const { report } = require('./harness.js');

const files = fs.readdirSync(__dirname)
  .filter(f => f.endsWith('.test.js'))
  .sort();

console.log('运行测试文件: ' + files.join(', '));
for (const f of files) {
  require(path.join(__dirname, f));
}
const ok = report();
process.exit(ok ? 0 : 1);
