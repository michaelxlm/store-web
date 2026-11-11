#!/usr/bin/env node
'use strict';
/* ==========================================================================
   build.js · 主构建编排（零依赖）
   --------------------------------------------------------------------------
   WO-130：main-store Web 承载平移，纯静态 H5 HTML（/shop/shop.html），
   旧 uni-app 路径（/pages/...）由 nginx 301 到首页。
   流程：
     0. slot-loader 自愈（WO-210）→ prerender 已引用 slot-loader.js 时，先由 site-sdk 单源生成再构建
     1. 读 data/site.json + data/pages.json
     2. minify      → assets 下生成 .min 产物
     3. fingerprint → assets/manifest.json（资源版本 token）
     4. prerender   → 逐路由渲染静态 HTML（<path>.html）
     5. build-sitemap → sitemap.xml（仅可收录静态页；重建时保留既有 DYNAMIC-SITEMAP / ENTITY-PAGES-SITEMAP 块）
     5.2 build-entity-pages（可选实体快照）→ 车型/门店/文章静态详情页骨架 + ENTITY-PAGES-SITEMAP 块；
         无快照时仅输出「暂无实体快照，跳过静态化，沿用运行时详情页」并跳过，不产出空壳页，异常不阻断构建
     5.5 build-sitemap-dynamic（接中台 API）→ 枚举商品/店铺/活动/文章的 ?id= 详情页，
         写入 sitemap.xml 的 DYNAMIC-SITEMAP 标记块；API 不可达/异常自动跳过，不阻断构建
     6. build-llms  → robots.txt + llms.txt
     7. 404 兜底页 → 根 404.html（Nginx error_page 可直接复用）
     8. inject-scripts（守卫）+ check-links（死链）+ check-jsonld（商家信息结构化数据）；任一失败 exit 1
   用法：node scripts/build.js  |  node scripts/build.js --no-check
   注：步骤 5.5 需构建机能访问 site.api_base（api.xuyiheng.com）才能枚举动态详情页；
       离线/接口异常时自动跳过，仅产出静态 sitemap，不会令构建失败。
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { renderRoute, outputOf } = require('./prerender');
const minify = require('@xuyiheng/static-build-kit/minify'); // WO-164 ④ 私有包化
const fingerprint = require('@xuyiheng/static-build-kit/fingerprint'); // WO-164 ④ 私有包化
const buildSitemap = require('./build-sitemap');
const buildLlms = require('./build-llms');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function writeFile(rel, content) {
  const abs = path.join(ROOT, rel.replace(/\//g, path.sep));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, content);
  return rel;
}

function writeRoute(route, site, ctx) {
  const html = renderRoute(site, route, ctx);
  return writeFile(outputOf(route), html);
}

/** 清理旧版 uni-app 目录产物（pages/、pages_ucenter/），避免新旧 URL 双份内容 */
function cleanLegacyOutputs() {
  ['pages', 'pages_ucenter'].forEach((dir) => {
    const abs = path.join(ROOT, dir);
    if (!fs.existsSync(abs)) return;
    fs.rmSync(abs, { recursive: true, force: true });
    console.log('clean：删除旧目录产物 ' + dir + '/');
  });
}

/* ==========================================================================
   WO-210 slot-loader 自愈（构建期物化单源生成物）
   --------------------------------------------------------------------------
   assets/js/slot-loader.js 不是手写文件，而是 packages/site-sdk/sync.js 把
   ad-slots / coupon-slot / img-slot / mp-slot 四个单源文件拼接出的**生成物**
   （文件头自带「自动生成，勿手改」）。deploy.yml 只做 checkout + 克隆 packages
   单源仓 + npm ci + build.js，**不跑 sync**，所以一旦 prerender 改成引用
   slot-loader.js 而该生成物没进仓库，CI 全新 clone 就会缺文件：
     - inject-scripts 守卫要求每页引用 slot-loader.js（源码里有、产物里 404）
     - check-links 随后按死链失败，部署整段红
   这里在 minify/fingerprint 之前按单源把它物化出来，使「提交与否」都不致构建断裂；
   生成逻辑仍留在 site-sdk/sync.js 单源（子进程调用，不在此复制拼接/头注释文本）。
   保守边界：
     - 仅当 scripts/prerender.js 确实引用 slot-loader.js 时才动手（WO-210 之前的
       HEAD 状态完全不受影响，不会凭空多出未使用产物）；
     - 单源不可得 / 子进程异常 → 只打提示不阻断（沿用仓库现状，交由原有门禁判定）。
   CI 与本地同路径：deploy.yml 把 packages 克隆到 $GITHUB_WORKSPACE 的兄弟目录，
   与工作区里 packages/ 与 store-web/ 平级的布局一致。
   ========================================================================== */
const SLOT_LOADER_REL = path.join('assets', 'js', 'slot-loader.js');

function slotLoaderSourceRoots() {
  return [
    path.resolve(ROOT, '..', 'packages', 'site-sdk'),
    path.resolve(ROOT, 'node_modules', '@xuyiheng', 'site-sdk'),
  ];
}

function ensureSlotLoader() {
  let prerenderSrc = '';
  try { prerenderSrc = fs.readFileSync(path.join(ROOT, 'scripts', 'prerender.js'), 'utf8'); } catch (e) { return; }
  if (prerenderSrc.indexOf('slot-loader.js') === -1) return; // 仍在用四分片，无需物化

  const dest = path.join(ROOT, SLOT_LOADER_REL);
  const existed = fs.existsSync(dest);
  const sync = slotLoaderSourceRoots()
    .map((dir) => path.join(dir, 'sync.js'))
    .filter((f) => fs.existsSync(f))[0];
  if (!sync) {
    // 单源不可得：仓库已有该文件则沿用（运维已提交生成物同样合法），否则只提示不阻断
    if (existed) return;
    console.warn('[build] slot-loader 自愈跳过：找不到 packages/site-sdk/sync.js 单源，且仓库无 ' + SLOT_LOADER_REL);
    return;
  }

  // 只生成 slot-loader.js：--only 过滤下 sync 不会覆盖本站其它 SDK 副本
  const r = require('child_process').spawnSync(process.execPath,
    [sync, '--site=' + ROOT, '--only=slot-loader.js'],
    { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  if (r.status !== 0 || !fs.existsSync(dest)) {
    const msg = (r.stderr && r.stderr.toString().trim().split('\n').slice(-1)[0]) || ('exit=' + r.status);
    console.warn('[build] slot-loader 自愈失败（不阻断，按原有门禁暴露问题）：', msg);
    return;
  }
  console.log('slot-loader：已由 site-sdk 单源物化 ' + SLOT_LOADER_REL + (existed ? '（内容已对齐）' : '（仓库原本缺失，CI 全新 clone 同样可得）'));
}

async function main() {
  const t0 = Date.now();
  const skipCheck = process.argv.indexOf('--no-check') !== -1;
  console.log('== store-web build ==');

  ensureSlotLoader(); // WO-210：先物化单源生成物，再进入 minify/fingerprint

  const site = readJson('data/site.json');
  const data = readJson('data/pages.json');
  const routes = data.routes || [];

  minify.run();
  const manifest = fingerprint.run();
  const ctx = { manifest };

  cleanLegacyOutputs();

  let written = 0;
  let fallback404 = '';
  routes.forEach((route) => {
    const out = writeRoute(route, site, ctx);
    if (route.path === 'error/404') fallback404 = out;
    written++;
  });
  console.log('prerender：生成 ' + written + ' 个页面');

  // 根 404.html：Nginx error_page 404 /404.html 直接可用（内容与 /error/404.html 一致）
  if (fallback404) {
    fs.copyFileSync(path.join(ROOT, fallback404), path.join(ROOT, '404.html'));
    console.log('prerender：写入根 404.html（复制 ' + fallback404 + '）');
  }

  buildSitemap.run();

  // 可选实体快照 → 可收录静态详情页骨架 + 实体 sitemap 条目（WO-192）
  // 缺省无快照时脚本只输出「暂无实体快照，跳过静态化，沿用运行时详情页」并跳过，不产出空壳页
  try {
    require('./build-entity-pages').run();
  } catch (e) {
    console.warn('[build] entity-pages 跳过（不影响主构建）：', e && e.message);
  }

  // 动态详情页进 sitemap：接中台 API 枚举 ?id= 详情页（商品/店铺/活动/文章）
  // API 不可达或异常时自动跳过，绝不阻断构建
  try {
    await require('./build-sitemap-dynamic').run();
  } catch (e) {
    console.warn('[build] sitemap:dynamic 跳过（不影响静态 sitemap）：', e && e.message);
  }

  buildLlms.run();

  if (!skipCheck) {
    require('@xuyiheng/static-build-kit/inject-scripts').run(); // WO-164 ④ 私有包化
    require('@xuyiheng/static-build-kit/check-links').run(); // WO-164 ④ 私有包化
    require('./check-jsonld').run(); // 商家信息「宁缺毋错」门禁（Search Console 严重问题回归防线）
  }

  console.log('== 完成，用时 ' + ((Date.now() - t0) / 1000).toFixed(2) + 's ==');
}

main().catch((e) => {
  console.error('构建失败：', e && e.stack ? e.stack : e);
  process.exit(1);
});
