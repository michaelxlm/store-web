/* 文章资讯：分类 / 关键词 / 关联车型门店筛选 + 分页 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var state = {
    pageIndex: 1,
    pageSize: 10,
    category: 'all',
    keyword: '',
    goodsId: '',
    storeId: '',
    merchantId: '',
    loading: false
  };

  var listEl;
  var moreBtn;

  function params() {
    var data = {
      pageIndex: state.pageIndex,
      pageSize: state.pageSize
    };
    if (state.category !== 'all') data.category = state.category;
    if (state.keyword) data.keyword = state.keyword;
    if (state.goodsId) data.goodsId = state.goodsId;
    if (state.storeId) data.storeId = state.storeId;
    if (state.merchantId) data.merchantId = state.merchantId;
    return data;
  }

  function load(reset) {
    if (state.loading) return;
    state.loading = true;
    if (reset) {
      state.pageIndex = 1;
      listEl.innerHTML = Utils.loadingHtml('加载资讯…');
      moreBtn.hidden = true;
    } else {
      moreBtn.textContent = '加载中…';
    }
    HttpApi.article.getList(params()).then(function (res) {
      state.loading = false;
      moreBtn.textContent = '加载更多';
      var rows = (res && res.rows) || [];
      if (reset) listEl.innerHTML = '';
      if (!rows.length && reset) {
        listEl.innerHTML = Utils.emptyHtml('暂无相关文章', '<a class="btn btn-outline btn-sm" href="/article/article.html">看看全部资讯</a>');
        return;
      }
      listEl.insertAdjacentHTML('beforeend', rows.map(function (item) {
        return Utils.articleCardHtml(item);
      }).join(''));
      if (res && res.hasMore) {
        state.pageIndex += 1;
        moreBtn.hidden = false;
      } else {
        moreBtn.hidden = true;
      }
    });
  }

  function init() {
    listEl = document.getElementById('article-list');
    moreBtn = document.getElementById('article-more');
    if (!listEl || !moreBtn) return;

    var query = Utils.queryAll();
    state.goodsId = query.goodsId || '';
    state.storeId = query.storeId || '';
    state.merchantId = query.merchantId || '';

    document.getElementById('article-search').addEventListener('submit', function (e) {
      e.preventDefault();
      state.keyword = document.getElementById('article-keyword').value.trim();
      Utils.track('search_exec', { keyword: state.keyword, from: 'article' });
      load(true);
    });

    Utils.delegate(document.getElementById('article-tabs'), '.tab', 'click', function () {
      state.category = this.getAttribute('data-category') || 'all';
      Utils.qsa('#article-tabs .tab').forEach(function (btn) {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-selected', 'false');
      });
      this.classList.add('is-active');
      this.setAttribute('aria-selected', 'true');
      load(true);
    });

    moreBtn.addEventListener('click', function () { load(false); });

    load(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
