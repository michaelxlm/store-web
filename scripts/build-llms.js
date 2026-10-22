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
