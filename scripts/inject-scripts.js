'use strict';
/* ==========================================================================
   inject-scripts.js · 公共脚本/样式完整性守卫（零依赖，幂等）
   --------------------------------------------------------------------------
   扫描构建产物 HTML，确认每页都按序引用公共依赖：
   tokens.min.css → theme.min.css → tracker → ad-slots → coupon-slot →
   img-slot → wx-h5 → utils → http-api。缺失即 exit 1，防止手写整页漏引。
   slot 类组件（img-slot / wx-h5 等）按站点差异挂载——某依赖仅当本站
   至少有一页引用了它才纳入必选（即“本站启用了该组件”），被 0 页引用的
   组件（如仅用 mp-slot 的站点的 wx-h5/img-slot）不激活，避免误红。
   ========================================================================== */

const fs = require('fs');
const path = require('path');

// 站点根目录双态解析：被站点 build.js require 时（WO-164 ④ 私有包化，模块位于
// node_modules/@xuyiheng/static-build-kit）以进程入口为基准；直接 CLI 运行
// （各站 scripts/ 本地副本）时以自身位置为基准；无入口（node -e）时约定 cwd 即站点根。
const ROOT = require.main === module
  ? path.resolve(__dirname, '..')
  : require.main
    ? path.resolve(path.dirname(require.main.filename), '..')
    : process.cwd();
const SKIP = new Set(['node_modules', '.git', '.github', 'scripts', 'data', 'templates', 'assets', 'reports', 'deploy']);

const REQUIRED = [
  'assets/css/tokens.min.css',
  'assets/css/theme.min.css',
  'assets/js/tracker.min.js',
  'assets/js/ad-slots.min.js',
  'assets/js/coupon-slot.min.js',
  'assets/js/img-slot.min.js',
  'assets/js/wx-h5.min.js',
  'assets/js/utils.min.js',
  'assets/js/http-api.min.js',
];

function walk(dir, out) {
  let entries;
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  for (const ent of entries) {
    if (ent.isDirectory()) {
      if (SKIP.has(ent.name)) continue;
      walk(path.join(dir, ent.name), out);
    } else if (ent.name.endsWith('.html')) {
      out.push(path.join(dir, ent.name));
    }
  }
  return out;
}

function run() {
  const files = walk(ROOT, []);
  // 先读全部页面，据此判定「本站实际启用」的依赖：某依赖只要被至少一页引用，
  // 即视为本站启用、要求每页都引用（防手写整页漏引）；被 0 页引用的组件不激活，
  // 从而同一份单源守卫能适配挂载不同 slot 组件的各站（mp-slot 型站点不再被 wx-h5 误红）。
  const pages = files.map((f) => ({ f, html: fs.readFileSync(f, 'utf8') }));
  const active = REQUIRED.filter((dep) => pages.some((p) => p.html.indexOf(dep) !== -1));
  let bad = 0;
  pages.forEach((p) => {
    const missing = active.filter((dep) => p.html.indexOf(dep) === -1);
    if (missing.length) {
      bad++;
      console.log('  ✗ ' + path.relative(ROOT, p.f).replace(/\\/g, '/') + '  缺：' + missing.join(', '));
    }
  });
  if (bad) {
    console.error('inject-scripts：' + bad + '/' + files.length + ' 页缺公共依赖');
    process.exit(1);
  }
  console.log('inject-scripts：' + files.length + ' 页公共依赖齐全 ✓');
  return files.length;
}

if (require.main === module) run();
module.exports = { run, REQUIRED };
