#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build-entity-pages.js · 可选实体快照 → 可收录静态详情页骨架（零依赖，可复跑）
   --------------------------------------------------------------------------
   WO-192：给「运行时 ?id= 详情页」补一层可被搜索引擎收录的静态骨架。
   仓库默认 **没有** 车型/门店/文章实体数据，因此本脚本默认不产出任何页面，
   仅输出「暂无实体快照，跳过静态化，沿用运行时详情页」并 exit 0，不产出空壳页。
   只有运维在 data/entity-snapshot.json 放入**真实**实体快照后才生成静态页，
   且只写快照里真实存在的字段：缺失字段不写、不填假值、不编造价格/店名/地址/库存。

   用法：
     node scripts/build-entity-pages.js                    # 默认读 data/entity-snapshot.json
     node scripts/build-entity-pages.js --snapshot <path> # 指定快照（自检 / 多环境用）
     npm run entities                                     # 同上
   已接入 scripts/build.js 编排（buildSitemap 之后、sitemap:dynamic 之前自动执行）。
   可复跑：每次先按 data/entity-pages.generated.json 清理上次由本脚本生成的页，
           再按当前快照重建，并同步 sitemap.xml 里的 ENTITY-PAGES-SITEMAP 块；
           快照缺省 / 非法 / 空时清理旧产物、移除 sitemap 块、删除清单文件后 exit 0。

   -------- 快照契约（data/entity-snapshot.json，可选） --------
   {
     "generatedAt": "2026-11-11",            // 可选，仅作来源标注
     "entities": [
       {
         "id": "14b1f540697dad02005e...",   // 必填；仅允许 [A-Za-z0-9_-]，作为文件名 / URL 片段
         "type": "goods",                   // 必填；goods | store | article
         "name": "真实车型名",               // 必填；实体真实名称，脚本不加工、不推断
         "url": "/shop/detail/<id>.html",   // 建议提供；规范站内路径，必须与生成路径一致，否则忽略并回退
         "description": "...",              // 可选；以下均为**可选**，仅当真实存在且非空才写入
         "image": "https://...",
         "sku": "...", "brand": "...",     // goods
         "goods_price": 0,                  // goods；>0 才写 offers.price + priceCurrency:CNY
         "priceCurrency": "CNY",
         "address": "...", "telephone": "...", "openingHours": "...", // store
         "datePublished": "...", "author": "..."                      // article
       }
     ]
   }
   类型 → 目录 / JSON-LD：
     goods   → shop/detail/<id>.html    → Product
     store   → shop/store/<id>.html     → LocalBusiness
     article → article/detail/<id>.html → Article

   -------- 价格口径（与 data/pages.json、详情页 JS 完全一致） --------
     goods_price > 0  → offers.price + offers.priceCurrency = "CNY"，可见文案显示参考价
     goods_price 为 0 / 缺失 → offers 不带 price / priceCurrency，可见文案标注「到店询价」
     任何时候都不写 availability（库存状态无快照依据，不编造）。
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const SITE_FILE = path.join(DATA_DIR, 'site.json');
const SNAPSHOT_DEFAULT = path.join(DATA_DIR, 'entity-snapshot.json');
const GENERATED_LIST = path.join(DATA_DIR, 'entity-pages.generated.json');
const ASSETS_MANIFEST = path.join(ROOT, 'assets', 'manifest.json');
const SITEMAP = path.join(ROOT, 'sitemap.xml');

const MARK_START = '<!-- ENTITY-PAGES-SITEMAP:START -->';
const MARK_END = '<!-- ENTITY-PAGES-SITEMAP:END -->';
const PAGE_MARK = 'data-entity-page'; // 生成页标识，清理时校验，避免误删用户文件
const NO_SNAPSHOT_MSG = '暂无实体快照，跳过静态化，沿用运行时详情页';

const TYPES = {
  goods: {
    dir: 'shop/detail', listLabel: '全部车型', listUrl: '/shop/shop.html',
    ld: 'Product', priority: '0.7', changefreq: 'weekly', runtime: '/shop/detail.html'
  },
  store: {
    dir: 'shop/store', listLabel: '同城找店', listUrl: '/shop/city.html',
    ld: 'LocalBusiness', priority: '0.6', changefreq: 'monthly', runtime: '/shop/store.html'
  },
  article: {
    dir: 'article/detail', listLabel: '文章资讯', listUrl: '/article/article.html',
    ld: 'Article', priority: '0.7', changefreq: 'weekly', runtime: '/article/detail.html'
  }
};

// 与 prerender.js 一致的公共依赖（满足 inject-scripts 守卫：每页必须引用）
const CSS_DEPS = ['assets/css/tokens.min.css', 'assets/css/theme.min.css'];
const JS_DEPS = [
  'assets/js/tracker.min.js', 'assets/js/ad-slots.min.js', 'assets/js/coupon-slot.min.js',
  'assets/js/img-slot.min.js', 'assets/js/wx-h5.min.js', 'assets/js/utils.min.js',
  'assets/js/http-api.min.js'
];

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
function xmlEsc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function str(v) { return String(v == null ? '' : v).trim(); }
function has(v) { return v !== undefined && v !== null && (typeof v !== 'string' || v.trim() !== ''); }
function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function assetUrl(rel, manifest) {
  const clean = rel.replace(/^\/+/, '');
  const href = '/' + clean;
  const token = manifest && manifest['/' + clean];
  return token ? href + '?v=' + token : href;
}
function priceOf(entity) {
  const n = Number(entity.goods_price);
  return isFinite(n) && n > 0 ? n : 0;
}
function snapshotPath() {
  const i = process.argv.indexOf('--snapshot');
  if (i !== -1 && process.argv[i + 1]) return path.resolve(ROOT, process.argv[i + 1]);
  const eq = process.argv.filter((a) => a.indexOf('--snapshot=') === 0)[0];
  if (eq) return path.resolve(ROOT, eq.slice('--snapshot='.length));
  return SNAPSHOT_DEFAULT;
}

/* 清理上次由本脚本生成的静态页（校验标记，绝不误删用户文件） */
function cleanGenerated() {
  const list = readJson(GENERATED_LIST, null);
  const files = list && Array.isArray(list.files) ? list.files : [];
  let removed = 0;
  files.forEach((rel) => {
    if (!/^(shop\/detail|shop\/store|article\/detail)\/[A-Za-z0-9_-]+\.html$/.test(rel)) return;
    const abs = path.join(ROOT, rel.split('/').join(path.sep));
    try {
      if (!fs.existsSync(abs)) return;
      if (fs.readFileSync(abs, 'utf8').indexOf(PAGE_MARK) === -1) return;
      fs.unlinkSync(abs);
      removed++;
    } catch (e) { /* 单个文件清理失败不阻断 */ }
  });
  ['shop/detail', 'shop/store', 'article/detail'].forEach((dir) => {
    const abs = path.join(ROOT, dir);
    try {
      if (fs.existsSync(abs) && fs.readdirSync(abs).length === 0) fs.rmdirSync(abs);
    } catch (e) { /* 非空或权限问题，忽略 */ }
  });
  return removed;
}

/* JSON-LD：只写快照里真实存在且非空的字段；缺 price 时 offers 不带 price */
function buildJsonLd(entity, cfg, site, origin, pageUrl) {
  const graph = [];
  graph.push({
    '@type': 'WebPage',
    name: entity.name + ' - ' + site.site_name,
    url: pageUrl,
    inLanguage: 'zh-CN',
    isPartOf: { '@id': origin + '/#website' }
  });
  graph.push({
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: '首页', item: origin + '/' },
      { '@type': 'ListItem', position: 2, name: cfg.listLabel, item: origin + cfg.listUrl },
      { '@type': 'ListItem', position: 3, name: entity.name, item: pageUrl }
    ]
  });

  const node = { '@type': cfg.ld, name: entity.name, url: pageUrl };
  if (has(entity.description)) node.description = str(entity.description);
  if (has(entity.image)) node.image = str(entity.image);

  if (cfg.ld === 'Product') {
    if (has(entity.sku)) node.sku = str(entity.sku);
    if (has(entity.brand)) node.brand = { '@type': 'Brand', name: str(entity.brand) };
    const price = priceOf(entity);
    const offers = { '@type': 'Offer', url: pageUrl };
    if (price > 0) {
      offers.price = String(price);
      offers.priceCurrency = has(entity.priceCurrency) ? str(entity.priceCurrency) : 'CNY';
    }
    node.offers = offers; // 无 price 时不带 price / priceCurrency / availability（不编造库存）
  } else if (cfg.ld === 'LocalBusiness') {
    if (has(entity.telephone)) node.telephone = str(entity.telephone);
    if (has(entity.openingHours)) node.openingHours = str(entity.openingHours);
    if (has(entity.address)) {
      const address = { '@type': 'PostalAddress', streetAddress: str(entity.address) };
      if (has(entity.addressLocality)) address.addressLocality = str(entity.addressLocality);
      if (has(entity.addressRegion)) address.addressRegion = str(entity.addressRegion);
      if (has(entity.addressCountry)) address.addressCountry = str(entity.addressCountry);
      node.address = address;
    }
  } else if (cfg.ld === 'Article') {
    node.headline = has(entity.headline) ? str(entity.headline) : entity.name;
    if (has(entity.datePublished)) node.datePublished = str(entity.datePublished);
    if (has(entity.dateModified)) node.dateModified = str(entity.dateModified);
    if (has(entity.author)) node.author = entity.author; // 原样透传，不臆断 Person/Organization
    node.publisher = { '@type': 'Organization', name: site.site_name };
  }
  graph.push(node);
  return JSON.stringify({ '@context': 'https://schema.org', '@graph': graph }).replace(/</g, '\\u003c');
}

function buildHtml(entity, cfg, site, origin, pagePath, manifest) {
  const pageUrl = origin + pagePath;
  const price = priceOf(entity);
  const ld = buildJsonLd(entity, cfg, site, origin, pageUrl);
  const descText = has(entity.description)
    ? str(entity.description)
    : '本页为静态详情骨架，仅展示快照中已存在的字段；完整图文信息以运行时详情页与门店实际信息为准。';

  const facts = [];
  if (has(entity.sku)) facts.push('<dt>sku</dt><dd>' + esc(str(entity.sku)) + '</dd>');
  if (has(entity.brand)) facts.push('<dt>品牌</dt><dd>' + esc(str(entity.brand)) + '</dd>');
  if (has(entity.telephone)) facts.push('<dt>电话</dt><dd>' + esc(str(entity.telephone)) + '</dd>');
  if (has(entity.address)) facts.push('<dt>地址</dt><dd>' + esc(str(entity.address)) + '</dd>');
  if (has(entity.openingHours)) facts.push('<dt>营业时间</dt><dd>' + esc(str(entity.openingHours)) + '</dd>');
  if (has(entity.datePublished)) facts.push('<dt>发布时间</dt><dd>' + esc(str(entity.datePublished)) + '</dd>');
  const factsHtml = facts.length
    ? '<section class="section"><h2 class="section-title">快照中已有的字段</h2><dl class="spec-grid">' + facts.join('') + '</dl></section>'
    : '';

  let priceHtml = '';
  let priceNote = '';
  if (cfg.ld === 'Product') {
    priceHtml = price > 0
      ? '<p class="price"><small>¥</small>' + esc(String(price)) + '</p>'
      : '<p class="text-muted">到店询价</p>';
    priceNote = '<p class="field-hint" id="entity-price-note">价格口径：仅当车型已公开标价且价格大于 0 时展示参考价并写入 offers.price + priceCurrency(CNY)；未公开标价或价格为 0 时不写价格、标注「到店询价」。价格以门店实际报价为准。</p>';
  }

  const runtimeUrl = cfg.runtime + '?id=' + encodeURIComponent(entity.id);
  const cssLinks = CSS_DEPS.map((d) =>
    '  <link rel="stylesheet" href="' + esc(assetUrl(d, manifest)) + '">').join('\n');
  const scriptTags = JS_DEPS.map((d) =>
    '  <script src="' + esc(assetUrl(d, manifest)) + '" defer></script>').join('\n');

  const head = [
    '<!doctype html>',
    '<html lang="' + esc(site.lang || 'zh-CN') + '">',
    '<head>',
    '  <meta charset="utf-8">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '  <title>' + esc(entity.name + ' - ' + site.site_name) + '</title>',
    '  <meta name="description" content="' + esc(descText) + '">',
    '  <meta name="robots" content="index, follow, max-snippet:-1, max-image-preview:large">',
    '  <link rel="canonical" href="' + esc(pageUrl) + '">',
    '  <meta property="og:type" content="website">',
    '  <meta property="og:title" content="' + esc(entity.name) + '">',
    '  <meta property="og:description" content="' + esc(descText) + '">',
    '  <meta property="og:url" content="' + esc(pageUrl) + '">',
    cssLinks,
    '  <script type="application/ld+json">' + ld + '</script>',
    '</head>'
  ].join('\n');

  const body = [
    '<body data-page="entity-detail" ' + PAGE_MARK + '="' + esc(entity.id) +
      '" data-entity-type="' + esc(entity.type) + '" data-path="' + esc(pagePath) + '">',
    '<a class="skip-link" href="#main">跳至内容</a>',
    '<main class="site-main" id="main">',
    '  <div class="main-inner">',
    '    <nav class="breadcrumb" aria-label="面包屑">' +
      '<a href="/">首页</a><span class="breadcrumb-sep" aria-hidden="true">/</span>' +
      '<a href="' + esc(cfg.listUrl) + '">' + esc(cfg.listLabel) + '</a>' +
      '<span class="breadcrumb-sep" aria-hidden="true">/</span><span>' + esc(entity.name) + '</span></nav>',
    '    <section class="page-heading">',
    '      <h1>' + esc(entity.name) + '</h1>',
    '      <p>' + esc(descText) + '</p>',
    '    </section>',
    priceHtml ? '    <div class="detail-price">' + priceHtml + '</div>' : '',
    priceNote ? '    ' + priceNote : '',
    factsHtml ? '    ' + factsHtml : '',
    '    <section class="section">',
    '      <h2 class="section-title">站内导航</h2>',
    '      <div class="chips">',
    '        <a class="chip" href="' + esc(cfg.listUrl) + '">返回' + esc(cfg.listLabel) + '</a>',
    '        <a class="chip" href="' + esc(runtimeUrl) + '">查看运行时详情</a>',
    '        <a class="chip" href="/">返回首页</a>',
    '      </div>',
    '      <p class="field-hint">本页为静态收录骨架：仅展示实体快照中真实存在的字段，缺失字段留空、不填假值；图文详情由运行时页面补充。</p>',
    '    </section>',
    '  </div>',
    '</main>',
    scriptTags,
    '</body>',
    '</html>'
  ].filter(Boolean).join('\n');

  return head + '\n' + body + '\n';
}

/* 幂等同步 sitemap.xml 的 ENTITY-PAGES-SITEMAP 块（无实体时移除） */
function syncSitemap(entries, origin) {
  if (!fs.existsSync(SITEMAP)) return;
  const before = fs.readFileSync(SITEMAP, 'utf8');
  let xml = before;
  const re = new RegExp(escapeRegex(MARK_START) + '[\\s\\S]*?' + escapeRegex(MARK_END), 'g');
  xml = xml.replace(re, '');
  if (entries.length) {
    const today = new Date().toISOString().slice(0, 10);
    const lines = entries.map((e) =>
      '  <url>\n    <loc>' + xmlEsc(origin + e.path) + '</loc>\n    <lastmod>' + today +
      '</lastmod>\n    <changefreq>' + e.cfg.changefreq + '</changefreq>\n    <priority>' + e.cfg.priority + '</priority>\n  </url>'
    ).join('\n');
    xml = xml.replace(/<\/urlset>/i, MARK_START + '\n' + lines + '\n' + MARK_END + '\n</urlset>');
  }
  xml = xml.replace(/\n{3,}/g, '\n\n');
  if (xml !== before) fs.writeFileSync(SITEMAP, xml, 'utf8');
}

function run() {
  const site = readJson(SITE_FILE, null);
  if (!site || !site.url || !site.site_name) {
    throw new Error('缺少 data/site.json 的 url / site_name');
  }
  const origin = String(site.url).replace(/\/+$/, '');
  const manifest = readJson(ASSETS_MANIFEST, {});
  const snapFile = snapshotPath();

  cleanGenerated();

  const snap = readJson(snapFile, null);
  const raw = snap && Array.isArray(snap.entities) ? snap.entities : [];
  const entities = [];
  raw.forEach((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) {
      console.warn('[entity-pages] 第 ' + (i + 1) + ' 项不是对象，跳过');
      return;
    }
    const id = str(e.id);
    const name = str(e.name);
    const type = str(e.type);
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      console.warn('[entity-pages] 第 ' + (i + 1) + ' 项 id 非法（仅允许字母/数字/_/-），跳过');
      return;
    }
    if (!name || !TYPES[type]) {
      console.warn('[entity-pages] 第 ' + (i + 1) + ' 项缺 name 或 type 不支持，跳过');
      return;
    }
    entities.push(Object.assign({}, e, { id: id, name: name, type: type }));
  });

  // 缺省 / 非法 / 空快照：清理旧产物、移除 sitemap 块、删除清单，只输出约定话术并 exit 0
  if (!entities.length) {
    syncSitemap([], origin);
    try { if (fs.existsSync(GENERATED_LIST)) fs.unlinkSync(GENERATED_LIST); } catch (e) { /* ignore */ }
    console.log(NO_SNAPSHOT_MSG);
    return 0;
  }

  const written = [];
  const entries = [];
  entities.forEach((e) => {
    const cfg = TYPES[e.type];
    const pagePath = '/' + cfg.dir + '/' + e.id + '.html';
    if (has(e.url)) {
      const u = str(e.url);
      if (u !== pagePath && u !== origin + pagePath) {
        console.warn('[entity-pages] ' + e.id + ' 的 url 与生成路径不一致，忽略并回退到 ' + pagePath + '：' + u);
      }
    }
    const html = buildHtml(e, cfg, site, origin, pagePath, manifest);
    const rel = pagePath.replace(/^\//, '');
    const abs = path.join(ROOT, rel.split('/').join(path.sep));
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, html, 'utf8');
    written.push(rel);
    entries.push({ path: pagePath, cfg: cfg });
  });

  fs.writeFileSync(GENERATED_LIST, JSON.stringify({
    generatedAt: new Date().toISOString().slice(0, 10),
    files: written
  }, null, 2) + '\n', 'utf8');
  syncSitemap(entries, origin);
  console.log('[entity-pages] 生成 ' + written.length + ' 个静态详情页骨架，同步 sitemap ' + entries.length + ' 条实体 URL');
  return written.length;
}

if (require.main === module) {
  try {
    run();
    process.exit(0);
  } catch (e) {
    console.error('[entity-pages] 失败：', e && e.stack ? e.stack : e);
    process.exit(1);
  }
}
module.exports = { run, NO_SNAPSHOT_MSG, TYPES, MARK_START, MARK_END };
