/* tests/m2-components.test.js — M2 组件库测试：SVG 图表纯构建 + 表单字段校验 */
'use strict';
const { test, group, assert } = require('./harness.js');
const App = require('./harness.js').loadApp();
const C = App.charts, D = App.dom, U = App.util;

group('M2 · 折线图 lineChart');

test('空数据返回占位 SVG 而非崩溃', () => {
  const svg = C.lineChart([], {});
  assert.includes(svg, '暂无数据');
  assert.includes(svg, '<svg');
});

test('圆点数量=数据点数量，路径段数正确，无 NaN', () => {
  const series = [
    { name: 'B站', points: [{ date: '2026-11-01', value: 10 }, { date: '2026-11-05', value: 30 }, { date: '2026-11-10', value: 20 }] },
    { name: '抖音', points: [{ date: '2026-11-02', value: 5 }, { date: '2026-11-08', value: 15 }] }
  ];
  const svg = C.lineChart(series, { from: '2026-11-01', to: '2026-11-10' });
  assert.eq((svg.match(/<circle/g) || []).length, 5, '5 个数据点 5 个圆');
  assert.eq((svg.match(/<path/g) || []).length, 2, '两条折线');
  assert.ok(!svg.includes('NaN'), '坐标无 NaN');
  assert.includes(svg, 'B站', '图例含序列名');
  assert.includes(svg, '抖音');
});

test('单点数据不崩溃且 y 轴有刻度', () => {
  const svg = C.lineChart([{ name: 'x', points: [{ date: '2026-11-01', value: 7 }] }], {});
  assert.ok(!svg.includes('NaN'));
  assert.eq((svg.match(/<line/g) || []).length, 5, '5 条网格线');
});

test('yFmt 自定义刻度格式', () => {
  const svg = C.lineChart([{ name: 'x', points: [{ date: '2026-11-01', value: 1000 }, { date: '2026-11-02', value: 2000 }] }], { yFmt: v => (v / 1000) + 'k' });
  assert.includes(svg, '2k');
});

group('M2 · 柱状图 barChart');

test('空数据占位；正常数据每段一个 rect 且带 data-idx', () => {
  assert.includes(C.barChart([], {}), '暂无数据');
  const groups = [
    { label: '6月', parts: [{ value: 100, name: '已收' }, { value: 50, name: '未收' }] },
    { label: '7月', parts: [{ value: 0, name: '已收' }, { value: 0, name: '未收' }] },
    { label: '8月', parts: [{ value: 200, name: '已收' }, { value: 0, name: '未收' }] }
  ];
  const svg = C.barChart(groups, {});
  assert.eq((svg.match(/<rect/g) || []).length, 3, '值为 0 的段不画 rect');
  assert.includes(svg, 'data-idx="0"', '柱带索引供点击筛选');
  assert.includes(svg, 'data-idx="2"');
  assert.ok(!svg.includes('NaN'));
});

group('M2 · 热力格 heatGrid');

test('格子数=天数，空数据占位，data-date 可供点击', () => {
  assert.includes(C.heatGrid([], null, {}), '暂无数据');
  const days = [];
  for (let i = 0; i < 56; i++) days.push(U.addDays('2026-09-21', i));
  const svg = C.heatGrid(days, d => (d === '2026-11-13' ? 90 : 0), {});
  assert.eq((svg.match(/<rect/g) || []).length, 56);
  assert.includes(svg, 'data-date="2026-11-13"');
  assert.includes(svg, 'fill-opacity="0.75"', '90 分钟落在第 4 档');
  assert.ok(!svg.includes('NaN'));
});

group('M2 · 表单字段校验 validateFieldValue');

test('必填/数字/时间/日期/自定义校验', () => {
  assert.eq(D.validateFieldValue({ key: 't', label: '标题', type: 'text', required: true }, ''), '标题不能为空');
  assert.eq(D.validateFieldValue({ key: 't', label: '标题', type: 'text', required: true }, '有'), null);
  assert.eq(D.validateFieldValue({ key: 'a', label: '金额', type: 'number', required: true, min: 0 }, ''), '金额不能为空');
  assert.eq(D.validateFieldValue({ key: 'a', label: '金额', type: 'number', min: 0 }, '-1'), '金额不能小于 0');
  assert.eq(D.validateFieldValue({ key: 'a', label: '金额', type: 'number' }, null), null, '非必填空值通过');
  assert.eq(D.validateFieldValue({ key: 's', label: '开始', type: 'time', required: true }, ''), '开始不能为空');
  assert.eq(D.validateFieldValue({ key: 's', label: '开始', type: 'time' }, '25:00'), '开始格式应为 HH:MM');
  assert.eq(D.validateFieldValue({ key: 'd', label: '日期', type: 'date', required: true }, 'x'), '日期格式应为 YYYY-MM-DD');
  assert.eq(D.validateFieldValue({ key: 'x', label: 'x', validate: v => (v === 'bad' ? '不行' : null) }, 'bad'), '不行');
  assert.eq(D.validateFieldValue({ key: 'sw', label: '开关', type: 'switch' }, false), null);
});
