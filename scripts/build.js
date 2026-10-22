#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build.js · 主构建编排（零依赖）
   --------------------------------------------------------------------------
   WO-130：main-store Web 承载平移，纯静态 H5 HTML（/shop/shop.html），
   旧 uni-app 路径（/pages/...）由 nginx 301 到首页。
   流程：
     1. 读 data/site.json + data/pages.json
     2. minify      → assets 下生成 .min 产物
     3. fingerprint → assets/manifest.json（资源版本 token）
     4. prerender   → 逐路由渲染静态 HTML（<path>.html）
     5. build-sitemap → sitemap.xml（仅可收录页）
     6. build-llms  → robots.txt + llms.txt
     7. 404 兜底页 → 根 404.html（Nginx error_page 可直接复用）
     8. inject-scripts（守卫）+ check-links（死链）；任一失败 exit 1
   用法：node scripts/build.js  |  node scripts/build.js --no-check
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { renderRoute, outputOf } = require('./prerender');
const minify = require('./minify');
const fingerprint = require('./fingerprint');
const buildSitemap = require('./build-sitemap');
const buildLlms = require('./build-llms');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function writeFile(rel, content) {
  const abs = path.join(ROOT, rel.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return rel;
}

function writeRoute(route, site, ctx) {
  const html = renderRoute(site, route, ctx);
  return writeFile(outputOf(route), html);
}

/** 清理旧版 uni-app 目录产物（pages/、pages_ucenter/），避免新旧 URL 双份内容 */
function cleanLegacyOutputs() {
  ['pages', 'pages_ucenter'].forEach((dir) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    fs.rmSync(abs, { recursive: true, force: true });
    console.log('clean：删除旧目录产物 ' + dir + '/');
  });
}

function main() {
  const t0 = Date.now();
  const skipCheck = process.argv.indexOf('--no-check') !== -1;
  console.log('== store-web build ==');

  const site = readJson('data/site.json');
  const data = readJson('data/pages.json');
  const routes = data.routes || [];

  minify.run();
  const manifest = fingerprint.run();
  const ctx = { manifest };

  cleanLegacyOutputs();

  let written = 0;
  let fallback404 = '';
  routes.forEach((route) => {
    const out = writeRoute(route, site, ctx);
    if (route.path === 'error/404') fallback404 = out;
    written++;
  });
  console.log('prerender：生成 ' + written + ' 个页面');

  // 根 404.html：Nginx error_page 404 /404.html 直接可用（内容与 /error/404.html 一致）
  if (fallback404) {
    fs.copyFileSync(path.join(ROOT, fallback404), path.join(ROOT, '404.html'));
    console.log('prerender：写入根 404.html（复制 ' + fallback404 + '）');
  }

  buildSitemap.run();
  buildLlms.run();

  if (!skipCheck) {
    require('./inject-scripts').run();
    require('./check-links').run();
  }

  console.log('== 完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(2) + 's ==');
}

try {
  main();
} catch (e) {
  console.error('构建失败：', e && e.stack ? e.stack : e);
  process.exit(1);
}
