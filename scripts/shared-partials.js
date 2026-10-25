'use strict';
/* ==========================================================================
   shared-partials.js · 公共 HTML 片段单一事实源（store 版）
   --------------------------------------------------------------------------
   header / sidebar / bottom-nav / footer / 广告券位容器。
   对齐 xuyiheng-tools 范式，导航与文案改为 main-store 口径：
     - PC：header 64px + left sidebar 220px（≥1024 显示）
     - 移动：底部 tabBar 首页 / 车型 / 活动 / 我的
   ========================================================================== */

function escapeHtml(input) {
  return String(input == null ? '' : input)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const ICON_SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"></circle><path d="m20 20-3.2-3.2"></path></svg>';
const ICON_USER = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"></circle><path d="M4 21a8 8 0 0 1 16 0"></path></svg>';
const ICON_HOME = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 10 9-7 9 7"></path><path d="M5 9v11h14V9"></path><path d="M9 20v-6h6v6"></path></svg>';
const ICON_CAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 17h14"></path><path d="M6 17V9l2-4h8l2 4v8"></path><circle cx="7.5" cy="17.5" r="1.5"></circle><circle cx="16.5" cy="17.5" r="1.5"></circle><path d="M6 11h12"></path></svg>';
const ICON_CAL = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2"></rect><path d="M16 3v4M8 3v4M3 11h18"></path><path d="M8 15h.01M12 15h.01M16 15h.01"></path></svg>';
const ICON_STORE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10h18"></path><path d="M5 10V6l1-2h12l1 2v4"></path><path d="M5 10v10h14V10"></path><path d="M9 20v-5h6v5"></path></svg>';
const ICON_ARTICLE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 4h14v16H5z"></path><path d="M8 8h8M8 12h8M8 16h5"></path></svg>';
const ICON_FAQ = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7v.5"></path><path d="M12 17h.01"></path></svg>';
const ICON_STAR = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9Z"></path></svg>';
const ICON_SETTING = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6V21h-4v-.1a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.6-1H3v-4h.1a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7l2.8-2.8.1.1a1.7 1.7 0 0 0 1.9.3 1.7 1.7 0 0 0 1-1.6V3h4v.1a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.1v4h-.1a1.7 1.7 0 0 0-1.6 1Z"></path></svg>';
const ICON_MEDIA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"></rect><path d="m10 9 5 3-5 3z"></path></svg>';

const BRAND_LOGO = '<span class="brand-logo" aria-hidden="true"><svg viewBox="0 0 40 40" width="32" height="32"><rect width="40" height="40" rx="11" fill="#4B5BF0"/><path d="M22.4 8.5 13 21.5h6.2l-1.6 10L27 18.4h-6.4l1.8-9.9Z" fill="#fff"/></svg></span>';

/** 站点绝对路径（显式 .html，首页为 /） */
function pathOf(route) {
  const p = String((route && route.path) || '');
  if (!p || p === 'index') return '/';
  return '/' + p.replace(/^\/+|\/+$/g, '') + '.html';
}

function isActive(navUrl, page) {
  const current = pathOf(page);
  if (navUrl === '/') return current === '/';
  return current === navUrl;
}

/**
 * 渲染站点头部（sticky，PC/移动共用）
 * @param {Object} site
 * @param {Object} page - 当前路由
 */
function renderHeader(site, page) {
  const navLinks = (site.nav || []).map((n) => {
    const active = isActive(n.url, page);
    return '      <a href="' + escapeHtml(n.url) + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' + escapeHtml(n.label) + '</a>';
  }).join('\n');

  return '<header class="site-header" id="top">\n' +
    '  <div class="header-inner">\n' +
    '    <a class="brand" href="/" aria-label="' + escapeHtml(site.site_name) + ' 首页">\n' +
    '      ' + BRAND_LOGO + '\n' +
    '      <span class="brand-text"><strong>' + escapeHtml(site.site_name) + '</strong><small>' + escapeHtml(site.short_name || '') + '</small></span>\n' +
    '    </a>\n' +
    '    <nav class="site-nav" aria-label="主导航">\n' + navLinks + '\n    </nav>\n' +
    '    <form class="header-search" action="/search/search.html" method="get" role="search">\n' +
    '      ' + ICON_SEARCH + '\n' +
    '      <input type="search" name="q" placeholder="搜索车型、店铺、文章…" aria-label="站内搜索" autocomplete="off">\n' +
    '      <button type="submit">搜索</button>\n' +
    '    </form>\n' +
    '    <div class="header-actions">\n' +
    '      <a class="icon-btn" href="/search/search.html" aria-label="搜索">' + ICON_SEARCH + '</a>\n' +
    '      <a class="icon-btn" href="/ucenter/ucenter.html" aria-label="我的">' + ICON_USER + '</a>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</header>';
}

/**
 * 渲染侧栏（仅 PC ≥1024 显示）
 */
function renderSidebar(site, page) {
  const groups = (site.sidebar_categories || []).map((cat) => {
    const items = (cat.items || []).map((item) => {
      const active = isActive(item.url, page);
      return '      <a href="' + escapeHtml(item.url) + '"' + (active ? ' class="active" aria-current="page"' : '') + '>' + escapeHtml(item.label) + '</a>';
    }).join('\n');
    return '  <div class="sidebar-group">\n' +
      '    <div class="sidebar-title">' + escapeHtml(cat.label) + '</div>\n' +
      '    <nav class="sidebar-nav" aria-label="' + escapeHtml(cat.label) + '">\n' + items + '\n    </nav>\n' +
      '  </div>';
  }).join('\n');

  return '<aside class="site-sidebar" aria-label="站点导航">\n' + groups + '\n' +
    '  <div class="sidebar-card">\n' +
    '    <strong>我是商家</strong>\n' +
    '    <p>看套餐报价、开通同城公域展示，一站管理门店。</p>\n' +
    '    <a href="/merchant/pricing.html">查看入驻套餐 →</a>\n' +
    '    <a href="/merchant/login.html">进入商家中心 →</a>\n' +
    '  </div>\n' +
    '</aside>';
}

/**
 * 渲染底部导航（仅移动端）
 */
function renderBottomNav(site, page) {
  const current = pathOf(page);
  const tabs = [
    { label: '首页', url: '/', icon: ICON_HOME },
    { label: '车型', url: '/shop/shop.html', icon: ICON_CAR },
    { label: '活动', url: '/event/list.html', icon: ICON_CAL },
    { label: '我的', url: '/ucenter/ucenter.html', icon: ICON_USER },
  ];
  const links = tabs.map((t) => {
    let active = false;
    if (t.url === '/') active = current === '/';
    else if (t.url === '/shop/shop.html') active = current.indexOf('/shop/') === 0 && current !== '/shop/city.html';
    else if (t.url === '/event/list.html') active = current.indexOf('/event/') === 0;
    else active = current.indexOf('/ucenter/') === 0 || current.indexOf('/merchant/') === 0;
    return '  <a href="' + t.url + '"' + (active ? ' class="active" aria-current="page"' : '') + '><span class="tab-icon">' + t.icon + '</span>' + t.label + '</a>';
  }).join('\n');

  return '<nav class="bottom-nav" aria-label="底部导航">\n' + links + '\n</nav>';
}

/**
 * 渲染页脚
 */
function renderFooter(site) {
  const footer = site.footer || {};
  const sections = (footer.sections || []).map((sec) => {
    const links = (sec.links || []).map((l) => '      <a href="' + escapeHtml(l.url) + '">' + escapeHtml(l.label) + '</a>').join('\n');
    return '    <div class="footer-section">\n    <h3>' + escapeHtml(sec.title) + '</h3>\n' + links + '\n    </div>';
  }).join('\n');

  const sister = footer.sister_sites || [];
  let sisterSection = '';
  if (sister.length) {
    const sLinks = sister.map((l) => '      <a href="' + escapeHtml(l.url) + '" target="_blank" rel="noopener">' + escapeHtml(l.label) + '</a>').join('\n');
    sisterSection = '\n    <div class="footer-section footer-sister">\n    <h3>更多站点</h3>\n' + sLinks + '\n    </div>';
  }

  const beian = footer.icp
    ? '    <a class="site-beian" href="' + escapeHtml(footer.icp_url || 'https://beian.miit.gov.cn/') + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(footer.icp) + '</a>\n'
    : '';

  return '<footer class="site-footer">\n' +
    '  <div class="footer-inner">\n' +
    '    <div class="footer-brand">\n' +
    '      <a class="brand" href="/">' + BRAND_LOGO + '<span class="brand-text"><strong>' + escapeHtml(site.site_name) + '</strong></span></a>\n' +
    '      <p class="footer-blurb">' + escapeHtml(site.description || '') + '</p>\n' +
    '    </div>\n' +
    sections + sisterSection + '\n' +
    '  </div>\n' +
    '  <div class="footer-bottom">\n' +
    '    <span>' + escapeHtml(footer.copyright || '') + '</span>\n' +
    '    <div class="footer-legal">\n' + beian +
    '      <a href="#top">回到顶部 ↑</a>\n' +
    '    </div>\n' +
    '  </div>\n' +
    '</footer>';
}

function renderAdSlot(scene) {
  return '        <div class="ad-slot" data-ad-slot="' + escapeHtml(scene || 'inline') + '"></div>';
}

function renderCouponSlot(placement) {
  return '        <div class="coupon-slot" data-coupon-slot="' + escapeHtml(placement || 'main-store') + '"></div>';
}

function renderImgSlot(placement) {
  return '        <div class="img-slot" data-img-slot="' + escapeHtml(placement || 'main-store') + '"></div>';
}

module.exports = {
  escapeHtml,
  pathOf,
  renderHeader,
  renderSidebar,
  renderBottomNav,
  renderFooter,
  renderAdSlot,
  renderCouponSlot,
  renderImgSlot,
  icons: { ARTICLE: ICON_ARTICLE, FAQ: ICON_FAQ, STAR: ICON_STAR, SETTING: ICON_SETTING, MEDIA: ICON_MEDIA, STORE: ICON_STORE, CAR: ICON_CAR },
};
