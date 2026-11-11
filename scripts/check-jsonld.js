#!/usr/bin/env node
'use strict';
/* ==========================================================================
   check-jsonld.js · 商家信息结构化数据门禁（零依赖）
   --------------------------------------------------------------------------
   背景：Search Console 2026-11-11 对 store.fangkelianmeng.com 报 4 条「商家信息」
   结构化数据问题，其中两条是**严重问题**（会让网页完全不显示商家信息）：
     - 应指定 "price" 或 "priceSpecification"（在 "offers" 中）
     - 未填写字段 "image"
   根因：车型详情的静态骨架里挂着占位 Product + 空 offers（{"@type":"Offer"}），
   构建期既不知道是哪个车型、也没有真实价格与图片，却把 offers 写了出来。
   本门禁把「宁缺毋错」口径固化成构建期校验，防止回归：
     1. Product 必须有 image，且至少一个 http(s) 绝对地址（相对地址 Google 不认）
     2. offers 一旦出现就必须带 price 或 priceSpecification；带 price 时必须带
        priceCurrency，且 price 为可解析的正数（0 价 / 占位价一律不写 offers）
     3. 禁止空壳 offers（只有 @type）——无真实报价就整块不写
     4. 每个 ld+json 块必须可解析（构建期 JSON.stringify 产物，解析失败=模板污染）
   口径来源（三处必须一致，改一处就要改其余）：
     - data/pages.json 车型详情路由的 jsonld（骨架不写 Product）
     - assets/js/pages/shop-detail.js 的 syncProductJsonLd（运行时按接口真实数据整块注入）
     - scripts/build-entity-pages.js 的 buildEntityNode（快照静态页同一门禁）
   注：?id= 详情页的 Product 由运行时 JS 注入，本门禁只能校验构建产物的静态可见
       部分；运行时产物的复验见 README「收录（SEO）」一节。
   用法：node scripts/check-jsonld.js
   ========================================================================== */

const fs = require('fs');
const path = require('path');

// 站点根目录双态解析：与 check-links.js 一致（被 build.js require 时以入口为基准）
const ROOT = require.main === module
  ? path.resolve(__dirname, '..')
  : require.main
    ? path.resolve(path.dirname(require.main.filename), '..')
    : process.cwd();
const SKIP = new Set(['node_modules', '.git', '.github', 'scripts', 'data', 'templates', 'reports']);

const LD_RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

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

function typesOf(node) {
  const t = node['@type'];
  return Array.isArray(t) ? t.map(String) : (t == null ? [] : [String(t)]);
}

/** 图片字段（字符串 / 对象 / 数组混合）→ 合法绝对地址列表 */
function absoluteImages(image) {
  const list = Array.isArray(image) ? image : [image];
  return list
    .map((x) => {
      if (typeof x === 'string') return x.trim();
      if (x && typeof x === 'object') return String(x.url || x.contentUrl || x['@id'] || '').trim();
      return '';
    })
    .filter((u) => /^https?:\/\//i.test(u));
}

function checkOffers(offers, where, errs) {
  const list = Array.isArray(offers) ? offers : [offers];
  list.forEach((o, i) => {
    const at = where + ' offers[' + i + ']';
    if (!o || typeof o !== 'object') { errs.push(at + ' 不是对象'); return; }
    const keys = Object.keys(o).filter((k) => k !== '@type');
    if (!keys.length) {
      errs.push(at + ' 是空壳 offers（只有 @type）→ 无真实报价时整块不写 offers');
      return;
    }
    if (typesOf(o).indexOf('AggregateOffer') !== -1) return; // 聚合报价不要求单值 price
    const hasPrice = o.price !== undefined && o.price !== null && String(o.price).trim() !== '';
    const hasSpec = o.priceSpecification !== undefined && o.priceSpecification !== null;
    if (!hasPrice && !hasSpec) {
      errs.push(at + ' 缺 price / priceSpecification → 严重问题「应指定 price 或 priceSpecification」；无真实价格请整块不写 offers');
      return;
    }
    if (hasPrice) {
      const n = Number(String(o.price).replace(/[¥,\s]/g, ''));
      if (!isFinite(n) || n <= 0) errs.push(at + ' price 不是正数（' + o.price + '）：0 价 / 占位价不写 offers');
      if (!o.priceCurrency) errs.push(at + ' 有 price 但缺 priceCurrency');
    }
  });
}

/** 递归校验：任何 Product 节点必须有合法 image；任何 offers 必须完整 */
function checkNode(node, where, errs) {
  if (Array.isArray(node)) {
    node.forEach((x, i) => checkNode(x, where + '[' + i + ']', errs));
    return;
  }
  if (!node || typeof node !== 'object') return;

  if (typesOf(node).indexOf('Product') !== -1) {
    if (!absoluteImages(node.image).length) {
      errs.push(where + ' Product 缺合法 image（需 http(s) 绝对地址）→ 严重问题「未填写字段 image」');
    }
  }
  if (node.offers !== undefined && node.offers !== null) {
    checkOffers(node.offers, typesOf(node).indexOf('Product') !== -1 ? where : where + '（非 Product）', errs);
  }

  Object.keys(node).forEach((k) => {
    const v = node[k];
    if (v && typeof v === 'object') checkNode(v, where + '.' + k, errs);
  });
}

function run() {
  const files = walk(ROOT, []);
  const errs = [];
  let blocks = 0;

  files.forEach((file) => {
    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const html = fs.readFileSync(file, 'utf8');
    let m;
    LD_RE.lastIndex = 0;
    while ((m = LD_RE.exec(html))) {
      blocks++;
      let json;
      try {
        json = JSON.parse(m[1].replace(/\\u003c/g, '<'));
      } catch (e) {
        errs.push(rel + ' ld+json 解析失败：' + e.message);
        continue;
      }
      checkNode(json, rel, errs);
    }
  });

  if (errs.length) {
    console.error('check-jsonld：发现 ' + errs.length + ' 处商家信息结构化数据问题（扫描 ' + files.length + ' 页 / ' + blocks + ' 个 ld+json 块）：');
    errs.slice(0, 80).forEach((e) => console.error('  ✗ ' + e));
    process.exit(1);
  }
  console.log('check-jsonld：扫描 ' + files.length + ' 页 / ' + blocks + ' 个 ld+json 块，商家信息口径合规 ✓');
  return files.length;
}

if (require.main === module) run();
module.exports = { run, checkNode, absoluteImages };
