#!/usr/bin/env node
'use strict';
/* ==========================================================================
   check-wo192.js · WO-192 three front-end residuals regression guard
   --------------------------------------------------------------------------
   Zero-dependency gate (same family as check-links / check-jsonld). Verifies
   the three residuals stay delivered:
     1) search suggest: shared script + build-time word pool + page wiring
     2) city->store->goods hub: generator present + generated hub pages + sitemap
     3) local facet: counting/filter code + template containers in built pages
   ASCII-only comments: this repo was historically saved as GBK on Windows.
   ========================================================================== */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (rel) => {
  try { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); } catch (e) { return ''; }
};
const checks = [];
function has(rel, needle, label) {
  checks.push({ label, ok: read(rel).indexOf(needle) !== -1 });
}
function ok(label, cond) {
  checks.push({ label, ok: !!cond });
}

/* --- 1) search suggest --- */
has('assets/js/search-suggest.js', 'search-suggest-panel', 'shared suggest script exists');
has('assets/js/search-suggest.js', 'header-search input[type="search"]', 'suggest binds header search box');
has('assets/js/search-suggest.js', 'hero-search input[type="search"]', 'suggest binds hero search box');
has('scripts/home-ssr.js', 'function searchWords', 'build-time search word pool extractor');
has('scripts/prerender.js', 'window.SearchWords=', 'prerender injects SearchWords');
has('scripts/prerender.js', 'assets/js/search-suggest.min.js', 'prerender loads shared suggest script');
has('index.html', 'window.SearchWords=[', 'built home has non-empty word pool');
has('index.html', 'search-suggest.min.js', 'built home loads suggest script');

/* --- 2) city -> store -> goods hub --- */
has('scripts/build-entity-pages.js', 'function citySlug', 'hub slug generator');
has('scripts/build-entity-pages.js', 'function groupStoresByCity', 'hub city grouping');
has('scripts/build-entity-pages.js', 'function buildCityHubHtml', 'hub page builder');
has('scripts/build-entity-pages.js', 'HUB_MARK', 'hub page marker');
const guideDir = path.join(ROOT, 'guide');
const hubFiles = fs.existsSync(guideDir)
  ? fs.readdirSync(guideDir).filter((f) => /^city-[A-Za-z0-9_-]+\.html$/.test(f))
  : [];
ok('at least one generated city hub page', hubFiles.length > 0);
if (hubFiles.length) {
  const hubHtml = read('guide/' + hubFiles[0]);
  ok('hub page carries data-city-hub marker', hubHtml.indexOf('data-city-hub') !== -1);
  ok('hub page links to static store page', hubHtml.indexOf('/shop/store/') !== -1);
  ok('hub page links to goods list', hubHtml.indexOf('/shop/shop.html') !== -1);
  ok('hub page has BreadcrumbList', hubHtml.indexOf('BreadcrumbList') !== -1);
}
has('sitemap.xml', '/guide/city-', 'sitemap includes city hub URL');

/* --- 3) local facet --- */
has('assets/js/pages/shop.js', 'function countLocalFacets', 'goods local facet counting');
has('assets/js/pages/shop.js', 'data-local-tag', 'goods local facet click binding');
has('assets/js/pages/shop-city.js', 'function countBy', 'store local facet counting');
has('assets/js/pages/shop-city.js', 'data-local-city', 'store local facet click binding');
has('templates/pages/shop.html', 'id="shop-local-facets"', 'goods template facet container');
has('templates/pages/shop-city.html', 'id="city-local-facets"', 'store template facet container');
has('shop/shop.html', 'id="shop-local-facets"', 'built goods page facet container');
has('shop/city.html', 'id="city-local-facets"', 'built store page facet container');

const failed = checks.filter((c) => !c.ok);
if (failed.length) {
  console.error('[check-wo192] FAIL:');
  failed.forEach((c) => console.error('  - ' + c.label));
  process.exit(1);
}
console.log('[check-wo192] PASS: ' + checks.length + ' invariants verified (suggest / hub / local facet)');
