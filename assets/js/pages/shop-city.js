/* 同城找店：城市 / 品类筛选 + 关键词 + 就近排序 + 分页 */
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

  function loadFilters() {
    HttpApi.store.getFilters({}).then(function (res) {
      var data = (res && res.data) || {};
      var cities = (data.cities || []).map(normalizeOption).filter(Boolean);
      var categories = (data.categories || []).map(normalizeOption).filter(Boolean);
      renderChips('city-cities', 'city', cities, '全部城市');
      renderChips('city-categories', 'category', categories, '全部品类');
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
      if (reset) listEl.innerHTML = '';
      if (!rows.length && reset) {
        listEl.innerHTML = Utils.emptyHtml('没有找到符合条件的门店', '<a class="btn btn-outline btn-sm" href="/merchant/login.html">我要入驻</a>');
        totalEl.textContent = '0';
        moreBtn.hidden = true;
        return;
      }
      listEl.insertAdjacentHTML('beforeend', rows.map(function (row) {
        return Utils.storeCardHtml(row);
      }).join(''));
      var total = Utils.num(res && (res.total !== undefined ? res.total : res.count), rows.length);
      totalEl.textContent = reset ? String(total) : String(Utils.num(totalEl.textContent) + rows.length);
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
