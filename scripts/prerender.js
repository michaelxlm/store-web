'use strict';
/* ==========================================================================
   prerender.js · 构建期预渲染引擎（零依赖纯 Node）
   --------------------------------------------------------------------------
   为 data/pages.json 的每个路由生成完整静态 HTML：
     - head：title/description/keywords/canonical/robots/OG/Twitter/JSON-LD
     - body：skip-link + header + side/main + bottom-nav + footer
     - 公共脚本：tracker → ad-slots → coupon-slot → img-slot → wx-h5 →
                 utils → http-api → 页面脚本
   URL 口径（纯静态 H5 HTML）：
     - 首页 → /
     - 其余 → /shop/shop.html（显式 .html、无尾斜杠），磁盘产物与 URL 一一对应
       如 /shop/shop → shop/shop.html
       Nginx 需配 try_files $uri =404; 并把旧 /pages/* 路径 301 到首页
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const P = require('./shared-partials');

const ROOT = path.resolve(__dirname, '..');
const TPL_DIR = path.join(ROOT, 'templates', 'pages');

/** 路由 → 模板/页面资源 slug */
function slugOf(route) {
  const p = String(route.path || '');
  if (!p || p === 'index') return 'home';
  return p.replace(/^\/+|\/+$/g, '').replace(/\//g, '-');
}

/** 路由 → 站点绝对路径（显式 .html，首页为 /） */
function urlPathOf(route) {
  const p = String(route.path || '');
  if (!p || p === 'index') return '/';
  return '/' + p.replace(/^\/+|\/+$/g, '') + '.html';
}

/** 路由 → 构建产物相对路径（与 URL 一一对应） */
function outputOf(route) {
  if (route.output) return route.output;
  return urlPathOf(route).replace(/^\//, '') || 'index.html';
}

/** 资源引用：绝对路径 + fingerprint 版本 token（若有） */
function assetUrl(rel, manifest) {
  const clean = rel.replace(/^\/+/, '');
  const href = '/' + clean;
  const token = manifest && manifest['/' + clean];
  return token ? href + '?v=' + token : href;
}

/* ---------------------------- JSON-LD ---------------------------- */
function buildJsonLd(site, route) {
  const origin = site.url.replace(/\/+$/, '');
  const pageUrl = origin + urlPathOf(route);
  const graph = [];
  const isHome = !route.path || route.path === 'index';

  if (isHome) {
    graph.push({
      '@type': 'WebSite',
      '@id': origin + '/#website',
      url: origin + '/',
      name: site.site_name,
      description: site.description,
      inLanguage: 'zh-CN',
      publisher: { '@id': origin + '/#organization' },
    });
    graph.push({
      '@type': 'Organization',
      '@id': origin + '/#organization',
      url: origin + '/',
      name: site.site_name,
      description: site.description,
      logo: origin + (site.logo || '/assets/img/logo.svg'),
    });
  }

  graph.push({
    '@type': 'WebPage',
    name: route.title,
    url: pageUrl,
    description: route.description,
    inLanguage: 'zh-CN',
    isPartOf: { '@id': origin + '/#website' },
  });

  if (!isHome) {
    const crumbs = [{ name: '首页', item: origin + '/' }];
    (route.crumbs || []).forEach((c) => crumbs.push({ name: c.label, item: origin + c.url }));
    crumbs.push({ name: route.crumb_title || route.title.split(' - ')[0], item: pageUrl });
    graph.push({
      '@type': 'BreadcrumbList',
      itemListElement: crumbs.map((c, i) => ({ '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
    });
  }

  if (Array.isArray(route.jsonld)) graph.push(...route.jsonld);

  const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph });
  return json.replace(/</g, '\\u003c');
}

/* ---------------------------- 面包屑 HTML ---------------------------- */
function renderBreadcrumb(route) {
  if (!route.path || route.path === 'index') return '';
  const parts = ['<a href="/">首页</a>'];
  (route.crumbs || []).forEach((c) => {
    parts.push('<span class="breadcrumb-sep" aria-hidden="true">/</span>');
    parts.push('<a href="' + P.escapeHtml(c.url) + '">' + P.escapeHtml(c.label) + '</a>');
  });
  parts.push('<span class="breadcrumb-sep" aria-hidden="true">/</span>');
  parts.push('<span>' + P.escapeHtml(route.crumb_title || route.title.split(' - ')[0]) + '</span>');
  return '        <nav class="breadcrumb" aria-label="面包屑">' + parts.join('') + '</nav>\n';
}

/* ---------------------------- 页级资源检测 ---------------------------- */
function hasPageAsset(kind, name, ext) {
  return fs.existsSync(path.join(ROOT, 'assets', kind, 'pages', name + '.' + ext));
}

/* ---------------------------- 读页面正文模板 ---------------------------- */
function loadContent(route) {
  const tpl = route.template || slugOf(route);
  const file = path.join(TPL_DIR, tpl + '.html');
  if (fs.existsSync(file)) return fs.readFileSync(file, 'utf8').trim();
  return [
    '        <section class="page-heading">',
    '          <h1>' + P.escapeHtml(route.title.split(' - ')[0]) + '</h1>',
    '          <p>' + P.escapeHtml(route.description || '') + '</p>',
    '        </section>',
    '        <div class="card"><p class="text-muted">页面正在迁移中，敬请期待。</p></div>',
  ].join('\n');
}

/* ---------------------------- 主渲染 ---------------------------- */
function renderRoute(site, route, ctx) {
  ctx = ctx || {};
  const manifest = ctx.manifest || {};
  const slug = slugOf(route);
  const pageCss = route.style || slug;
  const pageJs = route.script || slug;
  const urlPath = urlPathOf(route);
  const origin = site.url.replace(/\/+$/, '');
  const canonical = origin + urlPath;
  const ogImage = route.og_image || site.og_image || (origin + '/assets/img/share.jpg');
  const indexable = route.indexable !== false;

  const cssLinks = [
    '    <link rel="stylesheet" href="' + assetUrl('assets/css/tokens.min.css', manifest) + '">',
    '    <link rel="stylesheet" href="' + assetUrl('assets/css/theme.min.css', manifest) + '">',
  ];
  if (hasPageAsset('css', pageCss, 'css')) {
    cssLinks.push('    <link rel="stylesheet" href="' + assetUrl('assets/css/pages/' + pageCss + '.min.css', manifest) + '">');
  }
  // 可选多样式：需要在基础样式上叠加其它页面样式时（如账户中心复用商家徽标/卡片）用 styles 数组
  (Array.isArray(route.styles) ? route.styles : []).forEach((name) => {
    if (name !== pageCss && hasPageAsset('css', name, 'css')) {
      cssLinks.push('    <link rel="stylesheet" href="' + assetUrl('assets/css/pages/' + name + '.min.css', manifest) + '">');
    }
  });

  const scriptTags = [
    '    <script src="' + assetUrl('assets/js/tracker.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/ad-slots.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/coupon-slot.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/img-slot.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/wx-h5.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/utils.min.js', manifest) + '" defer></script>',
    '    <script src="' + assetUrl('assets/js/http-api.min.js', manifest) + '" defer></script>',
  ];
  (Array.isArray(route.extra_scripts) ? route.extra_scripts : []).forEach((name) => {
    if (hasPageAsset('js', name, 'js')) {
      scriptTags.push('    <script src="' + assetUrl('assets/js/pages/' + name + '.min.js', manifest) + '" defer></script>');
    }
  });
  if (hasPageAsset('js', pageJs, 'js')) {
    scriptTags.push('    <script src="' + assetUrl('assets/js/pages/' + pageJs + '.min.js', manifest) + '" defer></script>');
  }

  const robots = indexable
    ? 'index, follow, max-snippet:-1, max-image-preview:large'
    : 'noindex, nofollow';
  const ldJson = buildJsonLd(site, route);

  const head = [
    '  <meta charset="utf-8">',
    '  <meta http-equiv="X-UA-Compatible" content="IE=edge">',
    '  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">',
    '  <meta name="color-scheme" content="light">',
    '  <title>' + P.escapeHtml(route.title) + '</title>',
    '  <meta name="title" content="' + P.escapeHtml(route.title) + '">',
    '  <meta name="description" content="' + P.escapeHtml(route.description || '') + '">',
    route.keywords ? '  <meta name="keywords" content="' + P.escapeHtml(route.keywords) + '">' : '',
    '  <meta name="author" content="' + P.escapeHtml(site.author || site.site_name) + '">',
    '  <meta name="language" content="zh-CN">',
    '  <meta name="geo.region" content="CN">',
    '  <meta name="geo.placename" content="China">',
    '  <meta name="robots" content="' + robots + '">',
    indexable ? '  <meta name="googlebot" content="index, follow">\n  <meta name="bingbot" content="index, follow">\n  <meta name="baiduspider" content="index, follow">' : '',
    '  <link rel="canonical" href="' + P.escapeHtml(canonical) + '">',
    '  <meta property="og:type" content="website">',
    '  <meta property="og:url" content="' + P.escapeHtml(canonical) + '">',
    '  <meta property="og:title" content="' + P.escapeHtml(route.title) + '">',
    '  <meta property="og:description" content="' + P.escapeHtml(route.description || '') + '">',
    '  <meta property="og:image" content="' + P.escapeHtml(ogImage) + '">',
    '  <meta property="og:image:width" content="1280">',
    '  <meta property="og:image:height" content="1024">',
    '  <meta property="og:site_name" content="' + P.escapeHtml(site.site_name) + '">',
    '  <meta property="og:locale" content="zh_CN">',
    '  <meta name="twitter:card" content="summary_large_image">',
    '  <meta name="twitter:url" content="' + P.escapeHtml(canonical) + '">',
    '  <meta name="twitter:title" content="' + P.escapeHtml(route.title) + '">',
    '  <meta name="twitter:description" content="' + P.escapeHtml(route.description || '') + '">',
    '  <meta name="twitter:image" content="' + P.escapeHtml(ogImage) + '">',
    '  <meta name="mobile-web-app-capable" content="yes">',
    '  <meta name="apple-mobile-web-app-capable" content="yes">',
    '  <meta name="apple-mobile-web-app-status-bar-style" content="default">',
    '  <meta name="apple-mobile-web-app-title" content="' + P.escapeHtml(site.site_name) + '">',
    '  <meta name="format-detection" content="telephone=no, email=no, address=no">',
    '  <link rel="dns-prefetch" href="//' + P.escapeHtml(site.api_base.replace(/^https?:\/\//, '')) + '">',
    '  <link rel="preconnect" href="' + P.escapeHtml(site.api_base) + '" crossorigin>',
    '  <link rel="preconnect" href="' + P.escapeHtml(site.oss_base || site.api_base) + '" crossorigin>',
    '  <link rel="icon" type="image/svg+xml" href="' + P.escapeHtml(site.favicon || '/assets/img/favicon.svg') + '">',
    '  <link rel="apple-touch-icon" href="' + P.escapeHtml(site.logo || '/assets/img/logo.svg') + '">',
    '  <link rel="manifest" href="/site.webmanifest">',
    '  <meta name="theme-color" content="' + P.escapeHtml(site.theme_color || '#4B5BF0') + '">',
    '  <link rel="sitemap" type="application/xml" title="Sitemap" href="/sitemap.xml">',
    cssLinks.join('\n'),
    '  <script type="application/ld+json">' + ldJson + '</script>',
  ].filter(Boolean).join('\n');

  const content = loadContent(route);
  const header = P.renderHeader(site, route);
  const sidebar = P.renderSidebar(site, route);
  const bottomNav = P.renderBottomNav(site, route);
  const footer = P.renderFooter(site);
  const breadcrumb = renderBreadcrumb(route);

  const slots = ['        <div class="ad-slot" data-ad-slot="inline"></div>'];
  if (!route.path || route.path === 'index') {
    slots.push(P.renderCouponSlot('main-store'));
    slots.push(P.renderImgSlot('main-store'));
  }

  const configScript = '  <script>window.AdSlotsConfig={site:\'main-store\',fallbackSrc:\'\'};window.CouponSlotConfig={mainUrl:\'store.fangkelianmeng.com\',moreUrl:\'https://coupon.zangeng.com/\'};window.ImgSlotConfig={mainUrl:\'store.fangkelianmeng.com\',moreUrl:\'https://img.fangkelianmeng.com/\'};window.TrackerConfig={project:\'main-store\',terminal:\'h5\'};</script>';

  const body = [
    '<body data-page="' + P.escapeHtml(slug) + '" data-page-id="' + P.escapeHtml(slug) + '" data-path="' + P.escapeHtml(urlPath) + '">',
    '<a class="skip-link" href="#main">跳至内容</a>',
    header,
    '<div class="site-body">',
    sidebar,
    '  <main class="site-main" id="main">',
    '    <div class="main-inner">',
    breadcrumb + content + '\n' + slots.join('\n'),
    '    </div>',
    '  </main>',
    '</div>',
    bottomNav,
    footer,
    configScript,
    scriptTags.join('\n'),
    '</body>',
  ].join('\n');

  return '<!doctype html>\n<html lang="' + (site.lang || 'zh-CN') + '">\n<head>\n' + head + '\n</head>\n' + body + '\n';
}

module.exports = { renderRoute, slugOf, urlPathOf, outputOf, assetUrl };
