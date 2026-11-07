#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build-sitemap-dynamic.js · 动态详情页进 sitemap（接中台 API 的骨架）
   --------------------------------------------------------------------------
   现状：scripts/build-sitemap.js 只收录 data/pages.json 里的静态可收录路由；
        商品/店铺/活动/文章等详情页是 ?id= 动态页，无本地数据源，需部署期
        调中台接口枚举 id 后写入。
   用法：已接入 build.js 管线（buildSitemap 之后自动 await 执行，见 build.js 步骤 5.5）；
         也可单独 `npm run sitemap:dynamic` 在不重跑全量构建时刷新动态块。
         CI/构建机无网络或中台不可达时自动跳过，不阻断构建。
   约定：
     - 复用 data/site.json 的 url（origin）与 api_base；
     - 接口前缀 /api/v1/front/shop，列表参数对齐前端 http-api.js（pageIndex/pageSize/platform/mainUrl）；
     - 详情页统一 ?id=<_id>，路由见 DETAIL_SOURCES；
     - 写入 sitemap.xml 时用 <!-- DYNAMIC-SITEMAP:START/END --> 标记包裹，重复执行幂等；
     - 任何网络/接口异常都不写文件、以 exit 0 退出，避免破坏既有构建。
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SITEMAP = path.join(ROOT, 'sitemap.xml');
const MARK_START = '<!-- DYNAMIC-SITEMAP:START -->';
const MARK_END = '<!-- DYNAMIC-SITEMAP:END -->';
const MAX_PAGES = 100;       // 单源最多翻页数，防死循环
const PAGE_SIZE = 100;

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/* 详情页来源：route 为本站前端路由（?id= 拼在后面），apiPath 为列表接口 */
const DETAIL_SOURCES = [
  { name: 'goods',   route: '/shop/detail.html',    apiPath: '/api/v1/front/shop/goods/list',   priority: '0.7', changefreq: 'weekly' },
  { name: 'store',   route: '/shop/store.html',     apiPath: '/api/v1/front/shop/store/list',   priority: '0.6', changefreq: 'monthly' },
  { name: 'activity',route: '/event/detail.html',   apiPath: '/api/v1/front/shop/activity/list', priority: '0.7', changefreq: 'daily' },
  { name: 'article', route: '/article/detail.html', apiPath: '/api/v1/front/shop/article/list', priority: '0.7', changefreq: 'weekly' }
];

async function apiList(apiBase, apiPath, mainUrl, pageIndex) {
  if (typeof fetch === 'undefined') {
    throw new Error('当前 Node 版本无内置 fetch（需 >= 18）');
  }
  const url = apiBase + apiPath +
    '?pageIndex=' + pageIndex + '&pageSize=' + PAGE_SIZE +
    '&platform=h5&mainUrl=' + encodeURIComponent(mainUrl);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let json;
  try {
    const resp = await fetch(url, { signal: ctrl.signal, headers: { 'content-type': 'application/json' } });
    json = await resp.json().catch(() => null);
  } finally {
    clearTimeout(timer);
  }
  // 中台返回 { code, data:{ rows, total, hasMore } }，对齐 http-api.adapt 的兼容形态
  if (!json || json.code !== 0 || !json.data) {
    throw new Error('接口返回异常：' + (json && json.msg ? json.msg : '空响应'));
  }
  const d = json.data;
  const rows = Array.isArray(d.rows) ? d.rows : (Array.isArray(d.list) ? d.list : []);
  const hasMore = !!d.hasMore;
  const total = Number(d.total || d.count || rows.length);
  return { rows: rows, hasMore: hasMore, total: total };
}

async function collectIds(source, apiBase, mainUrl) {
  const ids = [];
  let page = 1;
  while (page <= MAX_PAGES) {
    const res = await apiList(apiBase, source.apiPath, mainUrl, page);
    res.rows.forEach((row) => {
      const id = row && (row._id || row.id);
      if (id) ids.push(String(id));
    });
    if (!res.hasMore) break;
    if (ids.length >= res.total && res.total > 0) break; // 已够
    page++;
  }
  return ids;
}

function buildBlock(origin, sources, collected) {
  const today = new Date().toISOString().slice(0, 10);
  const lines = sources.map((s) => {
    const ids = collected[s.name] || [];
    return ids.map((id) => {
      const loc = esc(origin + s.route + '?id=' + encodeURIComponent(id));
      return '  <url>\n    <loc>' + loc + '</loc>\n    <lastmod>' + today +
        '</lastmod>\n    <changefreq>' + s.changefreq + '</changefreq>\n    <priority>' + s.priority + '</priority>\n  </url>';
    }).join('\n');
  }).filter(Boolean).join('\n');
  return MARK_START + '\n' + lines + (lines ? '\n' : '') + MARK_END;
}

function injectBlock(xml, block) {
  if (xml.indexOf(MARK_START) !== -1 && xml.indexOf(MARK_END) !== -1) {
    const re = new RegExp(MARK_START + '[\\s\\S]*?' + MARK_END);
    return xml.replace(re, block);
  }
  // 首次：插入到 </urlset> 之前
  return xml.replace(/<\/urlset>/i, block + '\n</urlset>');
}

async function run() {
  const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
  const origin = String(site.url || '').replace(/\/+$/, '');
  const apiBase = String(site.api_base || '').replace(/\/+$/, '');
  const mainUrl = (function () {
    try { return new URL(origin).host; } catch (e) { return 'store.fangkelianmeng.com'; }
  })();
  if (!origin || !apiBase) {
    console.warn('[sitemap-dynamic] 缺少 site.url / site.api_base，跳过');
    return 0;
  }

  console.log('[sitemap-dynamic] 开始枚举动态详情页（mainUrl=' + mainUrl + '）…');
  const collected = {};
  for (const s of DETAIL_SOURCES) {
    try {
      const ids = await collectIds(s, apiBase, mainUrl);
      collected[s.name] = ids;
      console.log('  - ' + s.name + '：' + ids.length + ' 条');
    } catch (e) {
      console.warn('  ! ' + s.name + ' 枚举失败，跳过该源：' + e.message);
      collected[s.name] = [];
    }
  }

  const total = Object.keys(collected).reduce((n, k) => n + collected[k].length, 0);
  if (!total) {
    console.warn('[sitemap-dynamic] 未取到任何动态 id（接口不可达？），保持 sitemap.xml 不变');
    return 0;
  }

  const block = buildBlock(origin, DETAIL_SOURCES, collected);
  const xml = fs.readFileSync(SITEMAP, 'utf8');
  fs.writeFileSync(SITEMAP, injectBlock(xml, block), 'utf8');
  console.log('[sitemap-dynamic] 已写入 ' + total + ' 条动态详情 URL 到 sitemap.xml');
  return total;
}

if (require.main === module) {
  run().then((n) => process.exit(0)).catch((e) => {
    console.error('[sitemap-dynamic] 异常退出（不改动 sitemap.xml）：', e && e.message);
    process.exit(0); // 部署期不阻断
  });
}
module.exports = { run, DETAIL_SOURCES };
