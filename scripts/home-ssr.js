#!/usr/bin/env node
'use strict';
/* ==========================================================================
   home-ssr.js · 首页五大区块构建期 SSR（WO-192 首屏扩面 / 零依赖）
   --------------------------------------------------------------------------
   背景：首页门店 / 车型 / 资讯三区原先只有 <div class="loading"> 占位，由
         assets/js/pages/home.js 运行期拉 api.xuyiheng.com 渲染，首屏无业务数据、
         SEO 不可见、API 失败白屏。本模块在中台导出的真实实体快照
         （data/entity-snapshot.json，由 build-entity-pages.js 同口径消费）基础上，
         于构建期把三区渲染成静态卡片，链接指向已生成的静态实体详情页。

   诚实口径（硬约束）：
     - 只渲染快照中真实存在的 goods / store / article 实体；活动、视频无快照
       数据源，保留原 loading 占位（运行期 API 拉取），绝不编造。
     - 快照无价格字段 → 车型卡片统一显示「到店询价」，与 WO-192 价格口径一致。
     - 无快照 / 解析失败 / 该类型无实体时原样保留模板，不产出空壳。

   运行期配合（assets/js/pages/home.js）：
     每张 SSR 卡片带 data-ssr="1"；API 成功则以完整交互卡片覆盖，API 空/失败
     则保留 SSR 内容，不用空态抹掉首屏真实数据 —— 即「SSR 首屏 + API 增量刷新
     + 失败兜底」。

   用法：node scripts/home-ssr.js（打印注入后的 home 模板，供人工核对）
        脚本导出 injectHomeSsr(html, snapshot) / loadSnapshot() 供 prerender 调用。
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SNAPSHOT_REL = 'data/entity-snapshot.json';

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** 只放行 http(s) 绝对地址与站内绝对路径，拦截 javascript: 等危险协议 */
function safeUrl(url) {
  const raw = String(url == null ? '' : url).trim();
  if (!raw) return '';
  if (/^javascript:/i.test(raw)) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  if (/^\/(?!\/)/.test(raw)) return raw;
  return '';
}

function loadSnapshot() {
  const file = path.join(ROOT, SNAPSHOT_REL);
  if (!fs.existsSync(file)) return null;
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && Array.isArray(data.entities) ? data : null;
  } catch (e) {
    console.warn('[home-ssr] 实体快照解析失败，跳过首页 SSR：' + e.message);
    return null;
  }
}

function byType(snapshot, type, limit) {
  if (!snapshot) return [];
  return snapshot.entities.filter((e) => e && e.type === type).slice(0, limit);
}

function storeCard(e) {
  const href = safeUrl(e.url);
  if (!href) return '';
  const name = escapeHtml(e.name || '未命名店铺');
  const img = safeUrl(e.image);
  const addr = [e.addressRegion, e.addressLocality, e.address].filter(Boolean).join(' ');
  const logo = img
    ? '<img src="' + escapeHtml(img) + '" alt="' + name + '" loading="lazy" decoding="async">'
    : '<span class="store-logo-empty">店</span>';
  return [
    '<a class="store-card" href="' + escapeHtml(href) + '" data-ssr="1">',
    '<span class="store-logo">' + logo + '</span>',
    '<span class="store-info">',
    '<span class="store-name">' + name + '</span>',
    addr ? '<span class="store-meta">' + escapeHtml(addr) + '</span>' : '',
    e.openingHours ? '<span class="store-meta">' + escapeHtml(e.openingHours) + '</span>' : '',
    '</span>',
    '</a>',
  ].filter(Boolean).join('');
}

function goodsCard(e) {
  const href = safeUrl(e.url);
  if (!href) return '';
  const name = escapeHtml(e.name || '未命名车型');
  const img = safeUrl(e.image);
  return [
    '<article class="goods-card" data-id="' + escapeHtml(e.id || '') + '" data-ssr="1">',
    '<a class="goods-media" href="' + escapeHtml(href) + '" aria-label="' + name + '">',
    img
      ? '<img src="' + escapeHtml(img) + '" alt="' + name + '" loading="lazy" decoding="async">'
      : '<span class="goods-media-empty">暂无图片</span>',
    '</a>',
    '<div class="goods-body">',
    '<a class="goods-title" href="' + escapeHtml(href) + '">' + name + '</a>',
    e.model ? '<p class="goods-meta">' + escapeHtml(e.model) + '</p>' : '',
    '<div class="goods-foot"><span class="goods-meta">到店询价</span></div>',
    '</div>',
    '</article>',
  ].filter(Boolean).join('');
}

function articleCard(e) {
  const href = safeUrl(e.url);
  if (!href) return '';
  const name = escapeHtml(e.name || '未命名文章');
  const img = safeUrl(e.image);
  return [
    '<article class="article-card" data-ssr="1">',
    '<div class="article-main">',
    '<a class="article-title" href="' + escapeHtml(href) + '">' + name + '</a>',
    e.description ? '<p class="article-summary">' + escapeHtml(e.description) + '</p>' : '',
    e.datePublished ? '<div class="article-meta"><span>' + escapeHtml(e.datePublished) + '</span></div>' : '',
    '</div>',
    img
      ? '<a class="article-cover" href="' + escapeHtml(href) + '" tabindex="-1" aria-hidden="true"><img src="' + escapeHtml(img) + '" alt="' + name + '" loading="lazy" decoding="async"></a>'
      : '',
    '</article>',
  ].filter(Boolean).join('');
}

/* 有真实快照数据的三区。活动、视频不在其中：无构建期数据源，保留 loading。 */
const SLOTS = {
  stores: { type: 'store', limit: 6, render: storeCard },
  goods: { type: 'goods', limit: 12, render: goodsCard },
  articles: { type: 'article', limit: 6, render: articleCard },
};

/**
 * 把 SSR 卡片注入首页 HTML。仅替换 <!-- ssr:<slot>:start/end --> 标记区间；
 * 无数据 / 无标记时原样返回（幂等，可反复构建）。
 */
function injectHomeSsr(html, snapshot) {
  let out = String(html == null ? '' : html);
  Object.keys(SLOTS).forEach((slot) => {
    const cfg = SLOTS[slot];
    const cards = byType(snapshot, cfg.type, cfg.limit).map(cfg.render).filter(Boolean);
    if (!cards.length) return;
    const re = new RegExp('(<!-- ssr:' + slot + ':start -->)[\\s\\S]*?(<!-- ssr:' + slot + ':end -->)');
    if (!re.test(out)) return;
    out = out.replace(re, function (m, open, close) {
      return open + '\n' + cards.join('\n') + '\n' + close;
    });
  });
  return out;
}

/**
 * WO-192：从实体快照提取公共搜索联想词库（车型名 / sku / model / 门店名 / 城市）。
 * 只取快照真实词条，去重、限量；供 prerender 注入 window.SearchWords。
 */
function searchWords(snapshot, limit) {
  const out = [];
  const seen = Object.create(null);
  const max = limit || 120;
  function add(v) {
    const s = String(v == null ? '' : v).trim();
    if (s && !seen[s]) { seen[s] = 1; out.push(s); }
  }
  (snapshot && Array.isArray(snapshot.entities) ? snapshot.entities : []).forEach((e) => {
    if (!e) return;
    add(e.name);
    if (e.type === 'goods') { add(e.sku); add(e.model); }
    if (e.type === 'store') { add(e.addressLocality); add(e.addressRegion); }
  });
  return out.slice(0, max);
}

function run() {
  const tpl = fs.readFileSync(path.join(ROOT, 'templates', 'pages', 'home.html'), 'utf8');
  return injectHomeSsr(tpl, loadSnapshot());
}

module.exports = { injectHomeSsr, loadSnapshot, searchWords, run };

if (require.main === module) process.stdout.write(run());
