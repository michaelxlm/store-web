/* 常见问题：分类 / 关键词 / 分页 + 推荐车型 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var CATEGORY_LABELS = {
    purchase: '选车指南',
    maintenance: '使用维护',
    policy: '政策法规',
    faq: '使用常识'
  };

  var state = {
    pageIndex: 1,
    pageSize: 20,
    category: 'all',
    keyword: '',
    hasMore: true,
    loading: false
  };

  var listEl;
  var moreBtn;
  var endEl;
  var clearBtn;

  function categoryTag(category) {
    var label = CATEGORY_LABELS[category];
    return label ? '<span class="tag tag-primary">' + Utils.escapeHtml(label) + '</span>' : '';
  }

  function itemHtml(item) {
    var title = Utils.escapeHtml(item.title || '未命名问题');
    var answer = item.answer ? Utils.sanitizeHtml(item.answer) : '<p class="text-muted">暂无详细内容</p>';
    var tags = Array.isArray(item.tags) && item.tags.length
      ? '<div class="faq-tags">' + item.tags.map(function (tag) {
        return '<span class="tag">' + Utils.escapeHtml(tag) + '</span>';
      }).join('') + '</div>'
      : '';
    return '<details class="faq-item card">' +
      '<summary class="faq-summary">' + categoryTag(item.category) +
      '<span class="faq-question">' + title + '</span>' +
      '<span class="faq-arrow" aria-hidden="true">›</span></summary>' +
      '<div class="prose faq-answer">' + answer + '</div>' + tags +
      '</details>';
  }

  function renderRecommend(list) {
    var wrap = document.getElementById('faq-goods');
    var grid = document.getElementById('faq-goods-list');
    if (!wrap || !grid) return;
    var rows = (list || []).filter(function (item) { return item && (item._id || item.id); });
    if (!rows.length) {
      wrap.hidden = true;
      return;
    }
    grid.innerHTML = rows.map(function (item) { return Utils.goodsCardHtml(item); }).join('');
    Utils.syncActionStates(grid);
    wrap.hidden = false;
  }

  function load(reset) {
    if (state.loading) return;
    if (!reset && !state.hasMore) return;
    state.loading = true;
    if (reset) {
      state.pageIndex = 1;
      state.hasMore = true;
      listEl.innerHTML = Utils.loadingHtml('加载常见问题…');
      moreBtn.hidden = true;
      endEl.hidden = true;
    } else {
      moreBtn.textContent = '加载中…';
      moreBtn.disabled = true;
    }

    var params = {
      pageIndex: state.pageIndex,
      pageSize: state.pageSize
    };
    if (state.category !== 'all') params.category = state.category;
    if (state.keyword) params.keyword = state.keyword;

    HttpApi.article.getFaqList(params).then(function (res) {
      state.loading = false;
      moreBtn.textContent = '加载更多';
      moreBtn.disabled = false;
      var rows = (res && res.rows) || [];
      if (reset) listEl.innerHTML = '';
      if (!rows.length && reset) {
        listEl.innerHTML = Utils.emptyHtml('暂无相关问题', '<p>换个关键词试试</p>');
        state.hasMore = false;
        endEl.hidden = true;
        return;
      }
      listEl.insertAdjacentHTML('beforeend', rows.map(itemHtml).join(''));
      state.hasMore = !!(res && res.hasMore);
      if (state.hasMore) {
        state.pageIndex += 1;
        moreBtn.hidden = false;
        endEl.hidden = true;
      } else {
        moreBtn.hidden = true;
        endEl.hidden = !listEl.children.length;
      }
      if (reset && res && res.data && res.data.recommendGoods) {
        renderRecommend(res.data.recommendGoods);
      }
    }).catch(function () {
      state.loading = false;
      moreBtn.textContent = '加载更多';
      moreBtn.disabled = false;
      if (!listEl.children.length || reset) {
        listEl.innerHTML = Utils.errorHtml('常见问题加载失败');
      } else {
        Utils.toast('加载失败，请稍后重试');
      }
    });
  }

  function bindTabs() {
    var tabs = document.getElementById('faq-tabs');
    if (!tabs) return;
    Utils.delegate(tabs, '.tab', 'click', function () {
      var category = this.getAttribute('data-category') || 'all';
      if (category === state.category) return;
      state.category = category;
      Utils.qsa('#faq-tabs .tab').forEach(function (btn) {
        btn.classList.remove('is-active');
        btn.setAttribute('aria-selected', 'false');
      });
      this.classList.add('is-active');
      this.setAttribute('aria-selected', 'true');
      load(true);
    });
  }

  function init() {
    listEl = document.getElementById('faq-list');
    moreBtn = document.getElementById('faq-more');
    endEl = document.getElementById('faq-end');
    clearBtn = document.getElementById('faq-clear');
    if (!listEl || !moreBtn || !endEl) return;

    Utils.bindCardActions();
    bindTabs();

    document.getElementById('faq-search').addEventListener('submit', function (e) {
      e.preventDefault();
      state.keyword = document.getElementById('faq-keyword').value.trim();
      clearBtn.hidden = !state.keyword;
      Utils.track('search_exec', { keyword: state.keyword, from: 'faq' });
      load(true);
    });

    clearBtn.addEventListener('click', function () {
      document.getElementById('faq-keyword').value = '';
      state.keyword = '';
      clearBtn.hidden = true;
      load(true);
    });

    moreBtn.addEventListener('click', function () { load(false); });

    Utils.delegate(listEl, '[data-retry]', 'click', function () {
      load(true);
    });

    load(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
