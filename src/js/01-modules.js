/* 01-modules.js — 模块注册表（导航顺序、名称、主题色、图标） */
(function (root, factory) {
  factory(root.App = root.App || {});
})(typeof globalThis !== 'undefined' ? globalThis : this, function (App) {
  'use strict';

  var svg = function (path, viewBox) {
    return '<svg viewBox="' + (viewBox || '0 0 24 24') + '" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">' + path + '</svg>';
  };

  App.modules = [
    { id: 'home',    name: '首页总览', color: '--c-home',    icon: svg('<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h5v-6h4v6h5V9.5"/>') },
    { id: 'plan',    name: '今日计划', color: '--c-plan',    icon: svg('<rect x="3" y="4.5" width="18" height="17" rx="2"/><path d="M8 2.5v4M16 2.5v4M3 10h18M8.5 15l2 2 4-4.5"/>') },
    { id: 'media',   name: '自媒体',   color: '--c-media',   icon: svg('<path d="M3 11v3a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z"/><path d="M16 8.5a5 5 0 0 1 0 7M18.8 6a8.5 8.5 0 0 1 0 12"/>') },
    { id: 'dev',     name: '开发工作', color: '--c-dev',     icon: svg('<path d="m8 6-5 6 5 6M16 6l5 6-5 6M13.5 4l-3 16"/>') },
    { id: 'consult', name: '咨询工作', color: '--c-consult', icon: svg('<circle cx="12" cy="12" r="9"/><path d="M15 9.2c-.4-1-1.6-1.7-3-1.7-1.9 0-3.3 1-3.3 2.5 0 3 6.6 1.6 6.6 4.7 0 1.5-1.4 2.6-3.3 2.6-1.6 0-2.8-.7-3.2-1.9M12 5.5v13"/>') },
    { id: 'study',   name: '学习计划', color: '--c-study',   icon: svg('<path d="M12 4 2.5 8.5 12 13l9.5-4.5L12 4z"/><path d="M6 10.7V16c0 1.7 2.7 3 6 3s6-1.3 6-3v-5.3M21.5 8.5v5"/>') },
    { id: 'diet',    name: '饮食计划', color: '--c-diet',    icon: svg('<path d="M4 3v8a3 3 0 0 0 3 3v7M7 3v7M10 3v7"/><path d="M17 3c-1.7 1.5-2.5 3.5-2.5 6 0 2 1 3 2.5 3.5V21"/>') },
    { id: 'fun',     name: '游戏娱乐', color: '--c-fun',     icon: svg('<rect x="2.5" y="7" width="19" height="11" rx="5.5"/><path d="M7 10.5v3M5.5 12h3M15.5 11.5h.01M18 13.5h.01"/>') },
    { id: 'settings',name: '数据与设置',color: '--c-set',    icon: svg('<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.11a1.7 1.7 0 0 0-1-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.11a1.7 1.7 0 0 0 1.56-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.11a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.11a1.7 1.7 0 0 0-1.56 1z"/>') }
  ];

  if (typeof module !== 'undefined' && module.exports) module.exports = (typeof globalThis !== 'undefined' ? globalThis : this).App;
});
