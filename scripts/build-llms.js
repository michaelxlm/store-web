'use strict';
/* ==========================================================================
   build-llms.js · 生成 robots.txt + llms.txt（零依赖）
   --------------------------------------------------------------------------
   robots.txt 与站点 noindex 口径保持一致（个人/管理/交互页禁止抓取），
   sitemap 指向 /sitemap.xml；llms.txt 输出公开内容页的 Markdown 导览。
   ========================================================================== */

const fs = require('fs');
const path = require('path');
const { urlPathOf } = require('./prerender');

const ROOT = path.resolve(__dirname, '..');
const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'site.json'), 'utf8'));
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'pages.json'), 'utf8'));

const AI_BOTS = ['GPTBot', 'ChatGPT-User', 'OAI-SearchBot', 'ClaudeBot', 'anthropic-ai', 'PerplexityBot', 'Google-Extended', 'CCBot'];

const DISALLOW = [
  '/node_modules/',
  '/scripts/',
  '/data/',
  '/ucenter/',
  '/merchant/',
  '/settings/',
  '/favorite/',
  '/media/',
  '/search/',
  '/webview/',
  '/error/',
];

// robots.txt 例外：整段目录被 Disallow，但其中确有公开、需被收录的页面。
// Google 采用「最长匹配优先」，此处更精确的 Allow 会覆盖上面的 Disallow，
// 既放行这些公开页，又继续屏蔽同目录下的管理/登录页。
// 维护约定：凡 sitemap.xml 收录且 indexable 的路由，若落在某个 Disallow 目录内，
// 必须在此登记对应路径，否则会被 Search Console 判定「已被 robots.txt 屏蔽」而无法编入索引。
const ALLOW_EXCEPTIONS = [
  '/merchant/pricing.html', // 商家入驻套餐报价页：公开营销页，需被收录
];

function run() {
  const origin = site.url.replace(/\/+$/, '');

  const robots = [
    '# robots.txt for ' + origin,
    '# 由 scripts/build-llms.js 生成，与 sitemap.xml / 页面 noindex 口径保持一致',
    '',
    'User-agent: *',
    'Allow: /',
    '',
    ...DISALLOW.map((p) => 'Disallow: ' + p),
    '',
    ...ALLOW_EXCEPTIONS.map((p) => 'Allow: ' + p),
    '',
    '# AI 搜索爬虫（GEO / LLM-SEO）：允许读取公共内容页',
    ...AI_BOTS.map((ua) => 'User-agent: ' + ua),
    'Allow: /',
    '',
    'Crawl-delay: 1',
    '',
    'Sitemap: ' + origin + '/sitemap.xml',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(ROOT, 'robots.txt'), robots);

  const routes = (data.routes || []).filter((r) => r.indexable !== false);
  let llms = '# ' + site.site_name + '\n\n';
  llms += '> ' + (site.description || '') + '\n\n';
  llms += '本站为本地商户综合推广平台，公开页无需登录即可浏览。\n\n';
  llms += '## 核心页面\n';
  routes.forEach((r) => {
    llms += '- [' + r.title.split(' - ')[0] + '](' + origin + urlPathOf(r) + '): ' + (r.description || '') + '\n';
  });
  llms += '\n';
  fs.writeFileSync(path.join(ROOT, 'llms.txt'), llms);

  console.log('build-llms：写入 robots.txt + llms.txt（' + routes.length + ' 页）');
  return routes.length;
}

if (require.main === module) run();
module.exports = { run };
