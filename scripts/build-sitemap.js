#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build-sitemap.js · 生成 sitemap.xml（零依赖，单一事实源）
   --------------------------------------------------------------------------
   收敛 store-web（过滤 r.sitemap）与 xuyiheng-tools（过滤 r.indexable!==false）
   两谱系的差异，通过 data/site.json 的 site.build.sitemapMode 切换：
     - "explicit"（默认）：仅收录显式标记 sitemap 的路由（store-web 口径）
     - "indexable"        ：收录所有 indexable!==false 的路由（xuyiheng 口径）
   priority 兼容两谱系：explicit 优先取 r.sitemap.priority，否则按类型/默认。
   依赖同目录 prerender.js 的 urlPathOf（prerender 仍为各站自管，不纳入 kit）。
   用法：node scripts/build-sitemap.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { urlPathOf } = require('./prerender');

// 与 build-sitemap-dynamic.js 约定的动态块标记，重建时保留上次有效动态 URL
const DYN_START = '<!-- DYNAMIC-SITEMAP:START -->';
const DYN_END = '<!-- DYNAMIC-SITEMAP:END -->';

const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pages.json'), 'utf8'));

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function run() {
  const mode = (site.build && site.build.sitemapMode) || 'explicit';
  const origin = site.url.replace(/\/+$/, '');
  const today = new Date().toISOString().slice(0, 10);

  const routes = (data.routes || []).filter((r) =>
    mode === 'explicit' ? !!r.sitemap : r.indexable !== false
  );

  const urls = routes.map((r) => {
    const loc = esc(origin + urlPathOf(r));
    let pri = '0.6';
    let freq = 'weekly';
    if (mode === 'explicit') {
      const cfg = r.sitemap === true ? {} : r.sitemap || {};
      pri = cfg.priority || (r.path === 'index' ? '1.0' : '0.6');
      freq = cfg.changefreq || 'weekly';
    } else {
      pri = r.path === 'index' ? '1.0' : r.type === 'tool' ? '0.8' : '0.6';
    }
    return (
      '  <url>\n    <loc>' + loc + '</loc>\n    <lastmod>' + today +
      '</lastmod>\n    <changefreq>' + freq + '</changefreq>\n    <priority>' + pri + '</priority>\n  </url>'
    );
  }).join('\n');

  let xml =
    '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls + '\n</urlset>\n';
  // 保留既有动态详情块（build-sitemap-dynamic 写入的 ?id= 条目）：
  // 即便后续动态步骤因 API 不可达失败，上次有效的动态 URL 也不丢失
  try {
    const old = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    const i = old.indexOf(DYN_START), j = old.indexOf(DYN_END);
    if (i !== -1 && j !== -1 && j > i) {
      const block = old.slice(i, j + DYN_END.length);
      xml = xml.replace(/<\/urlset>/i, block + '\n</urlset>');
    }
  } catch (e) { /* 首次生成无旧 sitemap.xml，忽略 */ }
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log('build-sitemap[' + mode + ']：写入 sitemap.xml（' + routes.length + ' 条静态 URL）');
  return routes.length;
}

if (require.main === module) run();
module.exports = { run };
