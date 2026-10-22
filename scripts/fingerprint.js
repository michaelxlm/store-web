#!/usr/bin/env node
'use strict';
/* ==========================================================================
   fingerprint.js · 内容哈希（零依赖）
   --------------------------------------------------------------------------
   扫描 assets 下所有 .min.css / .min.js，对内容取 sha256 前 10 位作为版本 token，
   生成 assets/manifest.json：{ "/assets/css/theme.min.css": "a1b2c3d4e5", ... }
   prerender 引用资源时按 manifest 追加 ?v=<token>，实现长效缓存 + 内容变更即失效。
   用法：node scripts/fingerprint.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const ASSETS = path.join(ROOT, 'assets');
const SEARCH_DIRS = ['css', 'css/pages', 'js', 'js/pages'].map((d) => path.join(ASSETS, d));

function hashFile(file) {
  const buf = fs.readFileSync(file);
  return crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
}

function run() {
  const manifest = {};
  SEARCH_DIRS.forEach((dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach((f) => {
      if (!/\.min\.(css|js)$/.test(f)) return;
      const abs = path.join(dir, f);
      const rel = '/' + path.relative(ROOT, abs).replace(/\\/g, '/');
      manifest[rel] = hashFile(abs);
    });
  });
  const target = path.join(ASSETS, 'manifest.json');
  fs.writeFileSync(target, JSON.stringify(manifest, null, 2) + '\n');
  console.log('fingerprint：写入 manifest.json（' + Object.keys(manifest).length + ' 个资源版本）');
  return manifest;
}

if (require.main === module) run();
module.exports = { run };
