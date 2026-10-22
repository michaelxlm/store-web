/* 我的收藏：车型 / 文章 / 视频三分类（本地存储） */
(function () {
  'use strict';

  var Utils = window.Utils;

  var TYPE_META = {
    goods: { label: '车型', empty: '暂无车型收藏', action: '<a class="btn btn-outline btn-sm" href="/shop/shop.html">去逛车型</a>' },
    article: { label: '文章', empty: '暂无文章收藏', action: '<a class="btn btn-outline btn-sm" href="/article/article.html">去读资讯</a>' },
    video: { label: '视频', empty: '暂无视频收藏', action: '<a class="btn btn-outline btn-sm" href="/media/index.html">去媒体库</a>' }
  };

  var state = { type: 'goods' };
  var listEl;

  function hrefOf(type, item) {
    var id = item._id || item.id;
    if (type === 'goods') return '/shop/detail.html?id=' + encodeURIComponent(id);
    if (type === 'article') return '/article/detail.html?id=' + encodeURIComponent(id);
    if (item.video_url) {
      return '/media/video-play.html?url=' + encodeURIComponent(item.video_url) +
        '&poster=' + encodeURIComponent(Utils.firstImage(item.cover) || '') +
        '&title=' + encodeURIComponent(item.title || '');
    }
    return '/media/index.html';
  }

  function subText(type, item) {
    if (type === 'goods') {
      return Number(item.goods_price) > 0 ? Utils.money(item.goods_price) : '价格面议';
    }
    if (type === 'article') return item.summary || '';
    return item.title ? '点击继续观看' : '';
  }

  function itemHtml(type, item) {
    var id = item._id || item.id || '';
    var title = item.name || item.title || '未命名内容';
    var thumb = Utils.thumb(item.goods_thumb || item.cover || item.thumb || '', 240, 240);
    return '<article class="favorite-item card" data-id="' + Utils.escapeHtml(id) + '">' +
      '<a class="favorite-thumb" href="' + hrefOf(type, item) + '" aria-label="' + Utils.escapeHtml(title) + '">' +
      (thumb ? '<img src="' + Utils.escapeHtml(thumb) + '" alt="' + Utils.escapeHtml(title) + '" loading="lazy" decoding="async">' : '<span>暂无图片</span>') +
      '</a>' +
      '<div class="favorite-info">' +
      '<a class="favorite-title" href="' + hrefOf(type, item) + '">' + Utils.escapeHtml(title) + '</a>' +
      '<p class="favorite-sub">' + Utils.escapeHtml(subText(type, item)) + '</p>' +
      '</div>' +
      '<button type="button" class="btn btn-ghost btn-sm favorite-remove" data-remove="' + Utils.escapeHtml(id) + '">取消收藏</button>' +
      '</article>';
  }

  function renderCounts() {
    var counts = Utils.favorite.counts();
    ['goods', 'article', 'video'].forEach(function (type) {
      var el = document.getElementById('fav-count-' + type);
      if (!el) return;
      var n = counts[type] || 0;
      el.textContent = '(' + n + ')';
      el.hidden = n <= 0;
    });
  }

  function renderList() {
    var items = Utils.favorite.list(state.type);
    renderCounts();
    if (!items.length) {
      var meta = TYPE_META[state.type];
      listEl.innerHTML = Utils.emptyHtml(meta.empty,
        '<p class="text-muted">浏览时点击 ☆ 即可加入收藏</p>' + meta.action);
      return;
    }
    listEl.innerHTML = items.map(function (item) {
      return itemHtml(state.type, item);
    }).join('');
  }

  function switchType(type) {
    if (!TYPE_META[type] || state.type === type) return;
    state.type = type;
    Utils.qsa('#fav-tabs .tab').forEach(function (btn) {
      var active = btn.getAttribute('data-type') === type;
      btn.classList.toggle('is-active', active);
      btn.setAttribute('aria-selected', active ? 'true' : 'false');
    });
    renderList();
  }

  function removeItem(id) {
    var meta = TYPE_META[state.type];
    if (!id) return;
    if (!window.confirm('确定要取消收藏该' + meta.label + '吗？')) return;
    Utils.favorite.remove(state.type, id);
    renderList();
    Utils.toast('已取消收藏');
    Utils.track('favorite_remove', { type: state.type, id: id });
  }

  function init() {
    listEl = document.getElementById('fav-list');
    if (!listEl) return;

    Utils.delegate(document.getElementById('fav-tabs'), '.tab', 'click', function () {
      switchType(this.getAttribute('data-type') || 'goods');
    });

    Utils.delegate(listEl, '[data-remove]', 'click', function () {
      removeItem(this.getAttribute('data-remove'));
    });

    window.addEventListener('pageshow', renderList);
    renderList();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
