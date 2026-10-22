#!/usr/bin/env node
'use strict';
/* ==========================================================================
   check-links.js · 站内死链检测（零依赖）
   --------------------------------------------------------------------------
   扫描构建产物 HTML（跳过 templates/assets/data/scripts 源目录），抽取所有站内
   绝对链接（href/src 以 / 开头、非 //协议相对、非 http 外链）：
     - 页面链接 /shop/shop.html → 校验对应文件存在
     - 目录链接 /a/b/          → 校验 a/b/index.html 是否存在
     - 资源   /assets/x.css    → 校验文件存在（忽略 ?v= 查询）
   任一目标缺失即死链，exit 1（验收：站内无死链）。
   用法：node scripts/check-links.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.github', 'scripts', 'data', 'templates', 'reports']);

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

/** 站内绝对链接 → 磁盘路径 */
function resolveTarget(href) {
  let p = href.split('?')[0].split('#')[0];
  if (!p) return null;
  p = decodeURIComponent(p).replace(/^\/+/, '');
  if (!p) return path.join(ROOT, 'index.html');
  if (/\/$/.test(p)) return path.join(ROOT, p, 'index.html');
  if (/\.(html|css|js|json|xml|svg|png|jpg|jpeg|webp|ico|txt|webmanifest)$/.test(p)) return path.join(ROOT, p);
  // 无扩展无斜杠：按目录路由处理（补 /index.html）
  return path.join(ROOT, p, 'index.html');
}

function run() {
  const files = walk(ROOT, []);
  const hrefRe = /(?:href|src)="(\/[^"]*)"/g;
  const broken = [];
  const seen = new Set();

  files.forEach((file) => {
    const html = fs.readFileSync(file, 'utf8');
    let m;
    while ((m = hrefRe.exec(html))) {
      const href = m[1];
      if (href.startsWith('//')) continue; // 协议相对外链
      const target = resolveTarget(href);
      if (!target) continue;
      const key = path.relative(ROOT, target);
      if (seen.has(key + '@' + file)) continue;
      seen.add(key + '@' + file);
      if (!fs.existsSync(target)) {
        broken.push(path.relative(ROOT, file).replace(/\\/g, '/') + ' → ' + href);
      }
    }
  });

  if (broken.length) {
    console.error('check-links：发现 ' + broken.length + ' 处死链：');
    [...new Set(broken)].slice(0, 80).forEach((b) => console.error('  ✗ ' + b));
    process.exit(1);
  }
  console.log('check-links：扫描 ' + files.length + ' 页，站内链接全部可达 ✓');
  return files.length;
}

if (require.main === module) run();
module.exports = { run };
