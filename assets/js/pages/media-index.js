/* 媒体库：车型视频列表（withGoods 关联车型） */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var state = {
    pageIndex: 1,
    pageSize: 10,
    hasMore: false,
    loading: false
  };

  var listEl;
  var moreBtn;
  var endEl;

  function goodsOf(item) {
    return item.goods_info || item.goods || null;
  }

  function cardHtml(item) {
    var goods = goodsOf(item);
    var desc = item.video_desc || item.title || '产品视频';
    var src = Utils.safeUrl(item.video_url || item.url || '');
    var posterRaw = item.goods_thumb || (goods && goods.goods_thumb) || item.cover || '';
    var poster = Utils.thumb(posterRaw, 640, 360);
    var goodsLink = goods && (goods._id || goods.id)
      ? '<a class="media-goods-link" href="/shop/detail.html?id=' + encodeURIComponent(goods._id || goods.id) + '">关联车型：' +
        Utils.escapeHtml(goods.name || '查看详情') + ' →</a>'
      : '';

    return '<article class="video-card">' +
      '<div class="video-cover media-player">' +
      (src
        ? '<video src="' + Utils.escapeHtml(src) + '"' + (poster ? ' poster="' + Utils.escapeHtml(poster) + '"' : '') +
          ' controls preload="metadata" playsinline></video>'
        : '<div class="media-empty">视频暂不可用</div>') +
      '</div>' +
      '<div class="video-body">' +
      '<h3 class="video-title">' + Utils.escapeHtml(desc) + '</h3>' +
      (goodsLink ? '<p class="video-meta">' + goodsLink + '</p>' : '') +
      '</div>' +
      '</article>';
  }

  function load(reset) {
    if (state.loading) return;
    if (!reset && !state.hasMore) return;
    state.loading = true;
    if (reset) {
      state.pageIndex = 1;
      state.hasMore = false;
      listEl.innerHTML = Utils.loadingHtml('加载视频…');
      moreBtn.hidden = true;
      endEl.hidden = true;
    } else {
      moreBtn.textContent = '加载中…';
      moreBtn.disabled = true;
    }

    HttpApi.video.getLatestVideos({
      pageIndex: state.pageIndex,
      pageSize: state.pageSize,
      withGoods: true
    }).then(function (res) {
      state.loading = false;
      moreBtn.textContent = '加载更多';
      moreBtn.disabled = false;
      var rows = (res && res.rows) || [];
      if (reset) listEl.innerHTML = '';
      if (!rows.length && reset) {
        listEl.innerHTML = Utils.emptyHtml('暂无产品视频', '<a class="btn btn-outline btn-sm" href="/shop/shop.html">先看看车型</a>');
        endEl.hidden = true;
        return;
      }
      listEl.insertAdjacentHTML('beforeend', rows.map(cardHtml).join(''));
      state.hasMore = !!(res && res.hasMore);
      if (state.hasMore) {
        state.pageIndex += 1;
        moreBtn.hidden = false;
        endEl.hidden = true;
      } else {
        moreBtn.hidden = true;
        endEl.hidden = false;
      }
    }).catch(function () {
      state.loading = false;
      moreBtn.textContent = '加载更多';
      moreBtn.disabled = false;
      if (reset) {
        listEl.innerHTML = Utils.errorHtml('视频加载失败');
      } else {
        Utils.toast('加载失败，请稍后重试');
      }
    });
  }

  function init() {
    listEl = document.getElementById('media-list');
    moreBtn = document.getElementById('media-more');
    endEl = document.getElementById('media-end');
    if (!listEl || !moreBtn || !endEl) return;

    moreBtn.addEventListener('click', function () { load(false); });
    Utils.delegate(listEl, '[data-retry]', 'click', function () { load(true); });
    load(true);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
