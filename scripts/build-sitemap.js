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
   重建 sitemap.xml 时保留既有 DYNAMIC-SITEMAP（API 动态详情）与
   ENTITY-PAGES-SITEMAP（build-entity-pages.js 静态实体页）标记块，避免上游步骤
   因接口不可达/快照缺省失败时丢失上次有效的 URL。
   用法：node scripts/build-sitemap.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { urlPathOf } = require('./prerender');

// 与 build-sitemap-dynamic.js / build-entity-pages.js 约定的标记块，重建时保留
const DYN_START = '<!-- DYNAMIC-SITEMAP:START -->';
const DYN_END = '<!-- DYNAMIC-SITEMAP:END -->';
const ENT_START = '<!-- ENTITY-PAGES-SITEMAP:START -->';
const ENT_END = '<!-- ENTITY-PAGES-SITEMAP:END -->';

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
  // 保留既有标记块（按原文件出现顺序回放）：
  //   DYNAMIC-SITEMAP      → build-sitemap-dynamic 写入的 ?id= 动态详情 URL
  //   ENTITY-PAGES-SITEMAP → build-entity-pages 写入的静态实体详情页 URL
  // 即便后续步骤因 API 不可达 / 快照缺省失败，上次有效 URL 也不丢失。
  try {
    const old = fs.readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
    const blocks = [];
    [[DYN_START, DYN_END], [ENT_START, ENT_END]].forEach((pair) => {
      const i = old.indexOf(pair[0]), j = old.indexOf(pair[1]);
      if (i !== -1 && j !== -1 && j > i) {
        blocks.push({ at: i, text: old.slice(i, j + pair[1].length) });
      }
    });
    blocks.sort((a, b) => a.at - b.at);
    if (blocks.length) {
      const joined = blocks.map((b) => b.text).join('\n');
      xml = xml.replace(/<\/urlset>/i, joined + '\n</urlset>');
    }
  } catch (e) { /* 首次生成无旧 sitemap.xml，忽略 */ }
  fs.writeFileSync(path.join(ROOT, 'sitemap.xml'), xml);
  console.log('build-sitemap[' + mode + ']：写入 sitemap.xml（' + routes.length + ' 条静态 URL）');
  return routes.length;
}

if (require.main === module) run();
module.exports = { run };
