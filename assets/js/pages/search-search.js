/* 搜索：热门词 / 本地历史 / 车型检索与排序 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var state = {
    keyword: '',
    sort: 'default',
    pageIndex: 1,
    pageSize: 20,
    total: 0,
    hasMore: false,
    loading: false,
    searched: false
  };

  var inputEl;
  var resetBtn;
  var hotWrap;
  var historyWrap;
  var resultsEl;
  var gridEl;
  var moreBtn;
  var emptyEl;
  var countEl;
  var hotKeywords = [];

  function hotList(res) {
    var data = res && res.data;
    if (Array.isArray(data)) return data;
    if (data && Array.isArray(data.list)) return data.list;
    return [];
  }

  function hotChipHtml(word, action) {
    return '<button type="button" class="chip" data-word="' + Utils.escapeHtml(word) + '" data-action="' + action + '">' +
      Utils.escapeHtml(word) + '</button>';
  }

  function renderHot() {
    if (!hotWrap) return;
    var el = document.getElementById('search-hot');
    if (!hotKeywords.length) {
      hotWrap.hidden = true;
      return;
    }
    el.innerHTML = hotKeywords.map(function (word) {
      return hotChipHtml(word, 'hot');
    }).join('');
    hotWrap.hidden = false;
  }

  function renderHistory() {
    var list = Utils.searchHistory.list();
    var el = document.getElementById('search-history');
    if (!historyWrap || !el) return;
    if (!list.length) {
      historyWrap.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.innerHTML = list.map(function (word) {
      return '<span class="chip search-history-item">' +
        '<button type="button" class="search-history-word" data-word="' + Utils.escapeHtml(word) + '" data-action="history">' + Utils.escapeHtml(word) + '</button>' +
        '<button type="button" class="search-history-del" data-remove="' + Utils.escapeHtml(word) + '" aria-label="删除搜索历史 ' + Utils.escapeHtml(word) + '">×</button>' +
        '</span>';
    }).join('');
    historyWrap.hidden = false;
  }

  function syncInputState() {
    resetBtn.hidden = !inputEl.value;
  }

  function updateSortButtons() {
    Utils.qsa('#search-sort button').forEach(function (btn) {
      var active = btn.getAttribute('data-sort') === state.sort;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
  }

  function showHomeSections() {
    resultsEl.hidden = true;
    emptyEl.hidden = true;
    renderHot();
    renderHistory();
  }

  function renderEmpty() {
    var top = hotKeywords.slice(0, 4);
    var suggestion = top.length
      ? '<p class="text-muted mt-8">推荐搜索</p><div class="chips mt-8">' + top.map(function (word) {
        return hotChipHtml(word, 'hot');
      }).join('') + '</div>'
      : '';
    emptyEl.innerHTML = Utils.emptyHtml('未找到相关车型', '<p class="text-muted">换个关键词试试吧</p>' + suggestion);
    emptyEl.hidden = false;
  }

  function doSearch(reset) {
    var keyword = inputEl.value.trim();
    if (!keyword) {
      Utils.toast('请输入搜索关键词');
      inputEl.focus();
      return;
    }
    state.keyword = keyword;
    state.searched = true;
    Utils.searchHistory.add(keyword);
    renderHistory();

    if (reset) {
      state.pageIndex = 1;
      state.hasMore = false;
      state.total = 0;
      gridEl.innerHTML = Utils.skeletonHtml(8);
      resultsEl.hidden = false;
      emptyEl.hidden = true;
      moreBtn.hidden = true;
    } else {
      moreBtn.textContent = '加载中…';
      moreBtn.disabled = true;
    }

    if (state.loading) return;
    state.loading = true;

    HttpApi.goods.search({
      keyword: keyword,
      pageIndex: state.pageIndex,
      pageSize: state.pageSize,
      sort: state.sort
    }).then(function (res) {
      state.loading = false;
      moreBtn.textContent = '加载更多';
      moreBtn.disabled = false;
      var rows = (res && res.rows) || [];
      state.total = (res && res.total) || 0;
      if (reset) gridEl.innerHTML = '';
      if (!rows.length && reset) {
        resultsEl.hidden = true;
        renderEmpty();
        Utils.track('search_no_result', { keyword: keyword });
        return;
      }
      gridEl.insertAdjacentHTML('beforeend', rows.map(function (item) {
        return Utils.goodsCardHtml(item);
      }).join(''));
      Utils.syncActionStates(gridEl);
      countEl.textContent = state.total ? '共 ' + state.total + ' 款' : '';
      state.hasMore = rows.length >= state.pageSize && gridEl.children.length < (state.total || Infinity);
      if (state.hasMore) {
        state.pageIndex += 1;
        moreBtn.hidden = false;
      } else {
        moreBtn.hidden = true;
        if (reset) Utils.track('search_exec', { keyword: keyword, count: state.total });
      }
    }).catch(function () {
      state.loading = false;
      moreBtn.textContent = '加载更多';
      moreBtn.disabled = false;
      if (reset) {
        resultsEl.hidden = false;
        gridEl.innerHTML = Utils.errorHtml('搜索失败，请稍后重试');
      } else {
        Utils.toast('加载失败，请稍后重试');
      }
    });
  }

  function loadMore() {
    if (!state.hasMore || state.loading) return;
    doSearch(false);
  }

  function changeSort(sort) {
    if (sort === state.sort) return;
    state.sort = sort;
    updateSortButtons();
    Utils.track('search_sort_change', { sort: sort });
    if (state.searched) doSearch(true);
  }

  function bindChips() {
    Utils.delegate(document.body, '[data-action="hot"]', 'click', function () {
      var word = this.getAttribute('data-word') || '';
      if (!word) return;
      Utils.track('search_hot_click', { keyword: word });
      inputEl.value = word;
      syncInputState();
      doSearch(true);
    });
    Utils.delegate(document.body, '[data-action="history"]', 'click', function () {
      var word = this.getAttribute('data-word') || '';
      if (!word) return;
      inputEl.value = word;
      syncInputState();
      doSearch(true);
    });
    Utils.delegate(document.body, '[data-remove]', 'click', function () {
      var word = this.getAttribute('data-remove');
      Utils.searchHistory.remove(word);
      renderHistory();
    });
  }

  function init() {
    inputEl = document.getElementById('search-input');
    resetBtn = document.getElementById('search-reset');
    hotWrap = document.getElementById('search-hot-wrap');
    historyWrap = document.getElementById('search-history-wrap');
    resultsEl = document.getElementById('search-results');
    gridEl = document.getElementById('search-grid');
    moreBtn = document.getElementById('search-more');
    emptyEl = document.getElementById('search-empty');
    countEl = document.getElementById('search-count');
    if (!inputEl || !gridEl) return;

    Utils.bindCardActions();
    bindChips();

    var query = Utils.queryAll();
    var initial = query.keyword || query.q || '';
    if (initial) {
      try { initial = decodeURIComponent(initial); } catch (e) { /* 保持原值 */ }
      inputEl.value = initial;
    }
    syncInputState();

    document.getElementById('search-form').addEventListener('submit', function (e) {
      e.preventDefault();
      doSearch(true);
    });

    inputEl.addEventListener('input', function () {
      syncInputState();
      if (!inputEl.value.trim() && !state.searched) showHomeSections();
    });

    resetBtn.addEventListener('click', function () {
      inputEl.value = '';
      state.searched = false;
      syncInputState();
      showHomeSections();
      inputEl.focus();
    });

    document.getElementById('search-history-clear').addEventListener('click', function () {
      if (!Utils.searchHistory.list().length) return;
      Utils.searchHistory.clear();
      renderHistory();
      Utils.track('search_history_clear');
      Utils.toast('搜索历史已清除');
    });

    Utils.delegate(document.getElementById('search-sort'), 'button[data-sort]', 'click', function () {
      changeSort(this.getAttribute('data-sort') || 'default');
    });

    moreBtn.addEventListener('click', loadMore);
    Utils.delegate(gridEl, '[data-retry]', 'click', function () {
      doSearch(true);
    });

    updateSortButtons();
    showHomeSections();

    HttpApi.goods.getHotKeywords({}).then(function (res) {
      hotKeywords = hotList(res).filter(function (word) { return !!word; }).slice(0, 20);
      renderHot();
      if (state.searched && !resultsEl.hidden) return;
      if (emptyEl && !emptyEl.hidden) renderEmpty();
    }).catch(function () {
      hotKeywords = [];
      renderHot();
    });

    if (initial) doSearch(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
