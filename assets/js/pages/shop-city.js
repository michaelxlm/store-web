/* 同城找店：城市 / 品类筛选 + 关键词 + 就近排序 + 分页 + 分面计数展示（WO-192） */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var state = {
    pageIndex: 1,
    pageSize: 20,
    city: '',
    category: '',
    keyword: '',
    nearby: false,
    coords: null,
    loading: false
  };

  // 分面计数：仅当接口显式返回 facets / facetCounts / aggregations / counts 等对象时才展示；
  // 否则明确标注「当前接口未提供分面计数」，不推算、不伪造计数。
  var facetState = { available: false, data: null };

  var listEl;
  var moreBtn;
  var totalEl;

  function normalizeOption(item) {
    if (item === null || item === undefined) return '';
    if (typeof item === 'string') return item;
    return String(item.name || item.city || item.category || item.label || item.value || '');
  }

  function renderChips(boxId, attr, options, allLabel) {
    var box = document.getElementById(boxId);
    if (!box) return;
    var html = ['<button type="button" class="chip is-active" data-' + attr + '="">' + allLabel + '</button>'];
    options.forEach(function (name) {
      if (!name) return;
      html.push('<button type="button" class="chip" data-' + attr + '="' + Utils.escapeHtml(name) + '">' + Utils.escapeHtml(name) + '</button>');
    });
    box.innerHTML = html.join('');
  }

  function extractFacets(res) {
    if (!res || typeof res !== 'object') return null;
    var candidates = [res.facets, res.facetCounts, res.aggregations, res.counts, res.facet_counts];
    if (res.data && typeof res.data === 'object') {
      candidates.push(res.data.facets, res.data.facetCounts, res.data.aggregations, res.data.counts);
    }
    for (var i = 0; i < candidates.length; i++) {
      var v = candidates[i];
      if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length) return v;
    }
    return null;
  }

  function facetText(data) {
    return Object.keys(data).slice(0, 2).map(function (k) {
      var v = data[k];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        return k + '：' + Object.keys(v).slice(0, 5).map(function (n) {
          return n + '(' + v[n] + ')';
        }).join('、');
      }
      return k + '：' + String(v);
    }).join('；');
  }

  // WO-192 本地 facet：接口无分面计数时，基于当前已加载的真实门店统计城市/品类，
  // 渲染为可点击 chips；点击走服务端 city/category 筛选，不本地伪造结果。
  var facetRows = [];
  function countBy(rows, field) {
    var counts = Object.create(null);
    rows.forEach(function (row) {
      var store = (row && row.data && typeof row.data === 'object') ? Object.assign({}, row.data, row) : (row || {});
      var val = field === 'city' ? (row && row.city) : store.category;
      val = String(val == null ? '' : val).trim();
      if (val) counts[val] = (counts[val] || 0) + 1;
    });
    return Object.keys(counts).map(function (k) { return { name: k, count: counts[k] }; })
      .sort(function (a, b) { return b.count - a.count; }).slice(0, 6);
  }
  function renderLocalFacets() {
    var box = document.getElementById('city-local-facets');
    if (!box) return;
    var cities = countBy(facetRows, 'city');
    var cats = countBy(facetRows, 'category');
    if (!cities.length && !cats.length) { box.innerHTML = ''; box.hidden = true; return; }
    function group(label, attr, list) {
      if (!list.length) return '';
      return '<span class="filter-label">' + label + '</span><div class="filter-options">' +
        list.map(function (f) {
          return '<button type="button" class="chip" data-local-' + attr + '="' + Utils.escapeHtml(f.name) + '">' +
            Utils.escapeHtml(f.name) + ' <span class="facet-count">' + f.count + '</span></button>';
        }).join('') + '</div>';
    }
    box.hidden = false;
    box.innerHTML = group('本地城市', 'city', cities) + group('本地品类', 'category', cats);
  }

  function renderFacetSummary(total) {
    var box = document.getElementById('city-facet-summary');
    if (!box) return;
    var parts = ['已选：' + (state.city || '全部城市') + ' · ' + (state.category || '全部品类')];
    if (state.keyword) parts.push('关键词「' + state.keyword + '」');
    if (state.nearby) parts.push('按距离排序');
    parts.push('结果 ' + Utils.num(total, 0) + ' 条');
    if (facetState.available && facetState.data) {
      parts.push('分面计数（接口返回）：' + facetText(facetState.data));
    } else {
      parts.push('城市/品类计数来自当前结果集（本地统计）');
    }
    box.textContent = parts.join(' · ');
  }

  function loadFilters() {
    HttpApi.store.getFilters({}).then(function (res) {
      var data = (res && res.data) || {};
      var cities = (data.cities || []).map(normalizeOption).filter(Boolean);
      var categories = (data.categories || []).map(normalizeOption).filter(Boolean);
      renderChips('city-cities', 'city', cities, '全部城市');
      renderChips('city-categories', 'category', categories, '全部品类');
      var f = extractFacets(res);
      if (f) { facetState.available = true; facetState.data = f; }
      renderFacetSummary(totalEl ? totalEl.textContent : 0);
    });
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.pageIndex = 1;
      listEl.innerHTML = Utils.skeletonHtml(4);
      moreBtn.hidden = true;
    }
    var request;
    if (state.nearby && state.coords) {
      request = HttpApi.store.getNearby({
        lat: state.coords.lat,
        lng: state.coords.lng,
        city: state.city,
        category: state.category,
        keyword: state.keyword,
        pageIndex: state.pageIndex,
        pageSize: state.pageSize
      });
    } else {
      request = HttpApi.store.getList({
        pageIndex: state.pageIndex,
        pageSize: state.pageSize,
        city: state.city,
        category: state.category,
        keyword: state.keyword
      });
    }
    request.then(function (res) {
      state.loading = false;
      var rows = (res && res.rows) || [];
      var f = extractFacets(res);
      facetState.available = !!f;
      facetState.data = f || null;
      if (reset) { listEl.innerHTML = ''; facetRows = []; }
      facetRows = facetRows.concat(rows);
      if (!rows.length && reset) {
        listEl.innerHTML = Utils.emptyHtml('没有找到符合条件的门店', '<a class="btn btn-outline btn-sm" href="/merchant/login.html">我要入驻</a>');
        totalEl.textContent = '0';
        moreBtn.hidden = true;
        renderFacetSummary(0);
        renderLocalFacets();
        return;
      }
      listEl.insertAdjacentHTML('beforeend', rows.map(function (row) {
        return Utils.storeCardHtml(row);
      }).join(''));
      var total = Utils.num(res && (res.total !== undefined ? res.total : res.count), rows.length);
      totalEl.textContent = reset ? String(total) : String(Utils.num(totalEl.textContent) + rows.length);
      renderFacetSummary(totalEl.textContent);
      renderLocalFacets();
      if (res && res.hasMore) {
        state.pageIndex += 1;
        moreBtn.hidden = false;
      } else {
        moreBtn.hidden = true;
      }
    });
  }

  function bindChips(boxId, attr, key) {
    Utils.delegate(document.getElementById(boxId), '.chip', 'click', function () {
      state[key] = this.getAttribute('data-' + attr) || '';
      Utils.qsa('#' + boxId + ' .chip').forEach(function (btn) { btn.classList.remove('is-active'); });
      this.classList.add('is-active');
      Utils.track('city_filter_change', { type: key, value: state[key] });
      load(true);
    });
  }

  function locate() {
    var hint = document.getElementById('city-nearby-hint');
    if (!navigator.geolocation) {
      hint.textContent = '当前浏览器不支持定位';
      return;
    }
    hint.textContent = '正在获取位置…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      state.nearby = true;
      state.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      hint.textContent = '已按距离排序';
      Utils.track('store_nearby', {});
      load(true);
    }, function () {
      hint.textContent = '定位失败，可在浏览器设置中允许定位';
    }, { timeout: 8000, maximumAge: 60000 });
  }

  function init() {
    listEl = document.getElementById('city-stores');
    moreBtn = document.getElementById('city-more');
    totalEl = document.getElementById('city-total');
    if (!listEl || !moreBtn) return;

    bindChips('city-cities', 'city', 'city');
    bindChips('city-categories', 'category', 'category');

    // WO-192：点击本地 facet chip → 走服务端真实筛选，并同步顶部筛选 chips 激活态
    Utils.delegate(document.getElementById('city-local-facets'), '[data-local-city]', 'click', function () {
      var val = this.getAttribute('data-local-city') || '';
      if (!val) return;
      state.city = val;
      Utils.qsa('#city-cities .chip').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-city') === val);
      });
      Utils.track('city_facet_click', { type: 'city', value: val });
      load(true);
    });
    Utils.delegate(document.getElementById('city-local-facets'), '[data-local-category]', 'click', function () {
      var val = this.getAttribute('data-local-category') || '';
      if (!val) return;
      state.category = val;
      Utils.qsa('#city-categories .chip').forEach(function (btn) {
        btn.classList.toggle('is-active', btn.getAttribute('data-category') === val);
      });
      Utils.track('city_facet_click', { type: 'category', value: val });
      load(true);
    });

    document.getElementById('city-search').addEventListener('submit', function (e) {
      e.preventDefault();
      state.keyword = document.getElementById('city-keyword').value.trim();
      load(true);
    });

    document.getElementById('city-nearby').addEventListener('click', locate);
    moreBtn.addEventListener('click', function () { load(false); });

    Utils.delegate(listEl, '.store-card', 'click', function () {
      Utils.track('city_store_click', {});
    });

    loadFilters();
    load(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
