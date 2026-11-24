/* tests/m0-shell.test.js — M0 骨架外壳测试：工具函数、路由、模块注册表、构建产物结构 */
'use strict';
const fs = require('fs');
const path = require('path');
const { test, group, assert } = require('./harness.js');
const App = require('./harness.js').loadApp();
const U = App.util;
const R = App.router;
const builder = require('../build.js');

/* ---------- 工具函数 ---------- */
group('M0 · 工具函数 util');

test('today() 返回 YYYY-MM-DD 且为合法日期', () => {
  const t = U.today();
  assert.match(t, /^\d{4}-\d{2}-\d{2}$/);
  assert.ok(U.isValidDateStr(t));
});

test('parseDate/addDays 跨月跨年正确', () => {
  assert.eq(U.addDays('2026-11-30', 1), '2026-12-01');
  assert.eq(U.addDays('2026-12-31', 1), '2027-01-01');
  assert.eq(U.addDays('2026-03-01', -1), '2026-02-28');
  assert.eq(U.addDays('2028-03-01', -1), '2028-02-29', '闰年');
  assert.eq(U.addDays('bad-date', 1), null);
});

test('diffDays 计算日期差', () => {
  assert.eq(U.diffDays('2026-11-01', '2026-11-13'), 12);
  assert.eq(U.diffDays('2026-11-13', '2026-11-01'), -12);
  assert.eq(U.diffDays('2026-11-13', '2026-11-13'), 0);
});

test('weekdayCN 与 mondayOf', () => {
  assert.eq(U.weekdayCN('2026-11-13'), '五'); // 2026-11-13 是周五
  assert.eq(U.mondayOf('2026-11-13'), '2026-11-09');
  assert.eq(U.mondayOf('2026-11-09'), '2026-11-09', '周一自身');
  assert.eq(U.mondayOf('2026-11-15'), '2026-11-09', '周日归本周');
});

test('greeting 按时段返回问候', () => {
  assert.eq(U.greeting(7), '早上好');
  assert.eq(U.greeting(10), '上午好');
  assert.eq(U.greeting(13), '中午好');
  assert.eq(U.greeting(15), '下午好');
  assert.eq(U.greeting(20), '晚上好');
  assert.eq(U.greeting(2), '夜深了');
});

test('时间转换与校验', () => {
  assert.ok(U.isValidTime('09:00'));
  assert.ok(!U.isValidTime('24:00'));
  assert.ok(!U.isValidTime('9:5'));
  assert.eq(U.timeToMin('09:30'), 570);
  assert.eq(U.minToTime(570), '09:30');
  assert.eq(U.fmtMinutes(125), '2 小时 5 分');
  assert.eq(U.fmtMinutes(45), '45 分钟');
  assert.eq(U.fmtMinutes(120), '2 小时');
});

test('toNum 严格解析拒绝脏输入', () => {
  assert.eq(U.toNum('12a', null), null, "'12a' 非法");
  assert.eq(U.toNum('12', null), 12);
  assert.eq(U.toNum(' 3.5 ', null), 3.5);
  assert.eq(U.toNum('', 0), 0);
  assert.eq(U.toNum(NaN, null), null);
});

test('fmtMoney 千分位两位小数', () => {
  assert.eq(U.fmtMoney(12345.5), '12,345.50');
  assert.eq(U.fmtMoney(0), '0.00');
});

test('esc 转义 HTML 防注入', () => {
  assert.eq(U.esc('<img src=x onerror=alert(1)>'), '&lt;img src=x onerror=alert(1)&gt;');
  assert.includes(U.esc('"a"'), '&quot;');
});

test('backupFileName 生成与冲突加时间', () => {
  const now = new Date(2026, 10, 13, 14, 30, 5);
  assert.eq(U.backupFileName('我的数据.json', '2026-11-13', [], now), '我的数据-2026-11-13.json');
  assert.eq(
    U.backupFileName('我的数据.json', '2026-11-13', ['我的数据-2026-11-13.json'], now),
    '我的数据-2026-11-13-143005.json'
  );
});

test('uid 唯一', () => {
  const s = new Set();
  for (let i = 0; i < 500; i++) s.add(U.uid());
  assert.eq(s.size, 500);
});

test('groupBy/sum', () => {
  const g = U.groupBy([{ k: 'a', v: 1 }, { k: 'b', v: 2 }, { k: 'a', v: 3 }], x => x.k);
  assert.eq(g.get('a').length, 2);
  assert.eq(U.sum([1, 2, 3]), 6);
  assert.eq(U.sum([{ v: 2 }, { v: 3 }], x => x.v), 5);
});

/* ---------- 路由 ---------- */
group('M0 · hash 路由');

test('parseHash 解析模块与参数', () => {
  assert.deepEq(R.parseHash('#/plan'), { id: 'plan', params: {} });
  assert.deepEq(R.parseHash('#/plan?d=2026-11-13'), { id: 'plan', params: { d: '2026-11-13' } });
  assert.deepEq(R.parseHash(''), { id: 'home', params: {} }, '空 hash 回落首页');
  assert.deepEq(R.parseHash('#/media?tab=stats&x=1'), { id: 'media', params: { tab: 'stats', x: '1' } });
});

test('register/has/未知路由回落 home', () => {
  R.register('home', () => {});
  R.register('plan', () => {});
  assert.ok(R.has('home'));
  assert.ok(R.has('plan'));
  assert.ok(!R.has('nonexistent'));
  let navigated = null;
  R.onNavigate = (id) => { navigated = id; };
  R.handle('#/nonexistent');
  assert.eq(navigated, 'home', '未知路由回落 home');
  R.handle('#/plan');
  assert.eq(navigated, 'plan');
  R.onNavigate = null;
});

/* ---------- 模块注册表 ---------- */
group('M0 · 模块注册表');

test('9 个模块且顺序与 PRD 导航一致', () => {
  const ids = App.modules.map(m => m.id);
  assert.deepEq(ids, ['home', 'plan', 'media', 'dev', 'consult', 'study', 'diet', 'fun', 'settings']);
  const names = App.modules.map(m => m.name);
  assert.deepEq(names, ['首页总览', '今日计划', '自媒体', '开发工作', '咨询工作', '学习计划', '饮食计划', '游戏娱乐', '数据与设置']);
});

test('每个模块有主题色变量和 SVG 图标', () => {
  for (const m of App.modules) {
    assert.match(m.color, /^--c-/, m.id + ' 主题色');
    assert.includes(m.icon, '<svg', m.id + ' 图标');
  }
});

/* ---------- 构建产物 ---------- */
group('M0 · 构建产物（单文件 HTML）');

const tmpOut = path.join(__dirname, '.tmp-build.html');
const r = builder.build({ out: tmpOut, version: 'test' });
const html = fs.readFileSync(tmpOut, 'utf8');

test('构建成功且模板占位符全部被替换', () => {
  assert.ok(r.size > 10000, '产物大小合理');
  assert.ok(!html.includes('<!--STYLES-->'), '样式已内联');
  assert.ok(!html.includes('<!--SCRIPTS-->'), '脚本已内联');
  assert.includes(html, '<style>', '含内联样式');
  assert.includes(html, '<script>', '含内联脚本');
});

test('零外部资源引用（无 http src/href/link/@import）', () => {
  assert.ok(!/<script[^>]+src=/i.test(html), '无外链脚本');
  assert.ok(!/<link[^>]+href=/i.test(html), '无外链样式');
  assert.ok(!/@import/i.test(html), '无 CSS import');
  assert.ok(!/https?:\/\/(?!www\.w3\.org)/i.test(html), '除 SVG 命名空间外无 http(s) 地址');
});

test('外壳结构齐全：侧边栏/顶栏/横幅/弹窗与 toast 容器', () => {
  for (const id of ['sidebar', 'nav', 'topbar', 'top-date', 'save-state', 'file-state', 'theme-toggle', 'view', 'net-banner', 'compat-banner', 'modal-root', 'toast-root']) {
    assert.includes(html, 'id="' + id + '"', '缺少 #' + id);
  }
});

test('9 个模块的脚本均已打进产物', () => {
  for (const f of r.included) {
    assert.includes(html, '==== ' + f + ' ====', '缺少脚本 ' + f);
  }
  assert.includes(r.included.join(','), '00-util.js');
  assert.includes(r.included.join(','), '99-app.js');
});

test('初始化顺序：App.boot()（加载缓存）必须先于首屏渲染 R.handle', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'js', '99-app.js'), 'utf8');
  const iBoot = src.indexOf('if (App.boot) App.boot();');
  const iRender = src.lastIndexOf('R.handle(location.hash);'); // 首屏渲染是最后一次调用（hashchange 监听在前）
  assert.ok(iBoot !== -1 && iRender !== -1, '两处代码都存在');
  assert.ok(iBoot < iRender, 'boot 在首屏渲染之前');
});

test('CSS 保证 [hidden] 元素不显示（防止 display 覆盖 hidden 属性的回归）', () => {
  assert.match(html, /\[hidden\]\s*\{\s*display:\s*none\s*!important/);
});

test('深浅色主题变量都存在', () => {
  assert.includes(html, 'data-theme="light"');
  assert.includes(html, '[data-theme="dark"]');
});

fs.unlinkSync(tmpOut);
