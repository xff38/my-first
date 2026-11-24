/* build.js — 将 src/ 下模板、样式、脚本合并为单文件 HTML 交付物 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SRC = path.join(ROOT, 'src');
const OUT = path.join(ROOT, '我的工作生活APP.html');

/* 里程碑版本标记：随进度更新 */
const VERSION = process.env.APP_VERSION || '0.1.0-M0';

/* JS 文件加载顺序（依赖关系：util -> 注册表 -> schema/logic/store -> 组件 -> 路由/外壳 -> 页面模块）
   注意：99-app 的工厂只定义 shell 与 init 钩子（init 在 DOMContentLoaded 执行），
   因此必须排在页面模块之前，页面模块才能调用 App.shell.registerPage。 */
const JS_FILES = [
  'js/00-util.js',
  'js/01-modules.js',
  'js/10-schema.js',
  'js/20-logic.js',
  'js/30-store.js',
  'js/40-persist.js',
  'js/50-dom.js',
  'js/52-charts.js',
  'js/55-components.js',
  'js/90-router.js',
  'js/99-app.js',
  'js/60-home.js',
  'js/61-plan.js',
  'js/62-media.js',
  'js/63-dev.js',
  'js/64-consult.js',
  'js/65-study.js',
  'js/66-diet.js',
  'js/67-fun.js',
  'js/68-settings.js'
];

function build(opts) {
  opts = opts || {};
  const out = opts.out || OUT;
  const version = opts.version || VERSION;
  let html = fs.readFileSync(path.join(SRC, 'index.template.html'), 'utf8');
  const css = fs.readFileSync(path.join(SRC, 'css', 'styles.css'), 'utf8');

  html = html.replace('<!--STYLES-->', '<style>\n' + css + '\n</style>');

  const scripts = JS_FILES
    .filter(f => fs.existsSync(path.join(SRC, f))) // 里程碑推进中，未创建的文件跳过
    .map(f => {
      const code = fs.readFileSync(path.join(SRC, f), 'utf8');
      return '<script>\n/* ==== ' + f + ' ==== */\n' + code + '\n</script>';
    })
    .join('\n');
  html = html.replace('<!--SCRIPTS-->', scripts);

  const banner = '<!-- 我的工作生活APP · 单文件本地应用 · 版本 ' + version +
    ' · 构建于 ' + new Date().toISOString().slice(0, 19).replace('T', ' ') + ' · 零外部依赖，无任何网络请求 -->';
  html = banner + '\n' + html;

  fs.writeFileSync(out, html, 'utf8');
  return { out, version, size: Buffer.byteLength(html, 'utf8'), included: JS_FILES.filter(f => fs.existsSync(path.join(SRC, f))) };
}

if (require.main === module) {
  const r = build();
  console.log('构建完成: ' + r.out);
  console.log('版本: ' + r.version + '  大小: ' + (r.size / 1024).toFixed(1) + ' KB');
  console.log('包含脚本: ' + r.included.length + ' 个');
}

module.exports = { build, JS_FILES, OUT, SRC };
