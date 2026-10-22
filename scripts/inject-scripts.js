'use strict';
/* ==========================================================================
   inject-scripts.js · 公共脚本/样式完整性守卫（零依赖，幂等）
   --------------------------------------------------------------------------
   扫描构建产物 HTML，确认每页都按序引用：
   tokens.min.css → theme.min.css → tracker → ad-slots → coupon-slot →
   img-slot → wx-h5 → utils → http-api。缺失即 exit 1，防止手写整页漏引。
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
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
  let bad = 0;
  files.forEach((file) => {
    const html = fs.readFileSync(file, 'utf8');
    const missing = REQUIRED.filter((dep) => html.indexOf(dep) === -1);
    if (missing.length) {
      bad++;
      console.log('  ✗ ' + path.relative(ROOT, file).replace(/\\/g, '/') + '  缺：' + missing.join(', '));
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
