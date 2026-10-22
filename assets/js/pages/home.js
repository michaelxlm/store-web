/* 首页：并行加载门店 / 热门车型 / 活动 / 资讯 / 视频（任一失败不影响其它板块） */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  function fill(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  function loadStores() {
    return HttpApi.store.getList({ pageIndex: 1, pageSize: 6 }).then(function (res) {
      var rows = (res && res.rows) || [];
      if (!rows.length) {
        fill('home-stores', Utils.emptyHtml('暂无门店，去看看同城找店', '<a class="btn btn-outline btn-sm" href="/shop/city.html">同城找店</a>'));
        return;
      }
      fill('home-stores', rows.map(Utils.storeCardHtml).join(''));
    });
  }

  function loadGoods() {
    return HttpApi.goods.getHotProducts({ pageSize: 12 }).then(function (res) {
      var rows = (res && res.rows) || [];
      if (!rows.length) {
        fill('home-goods', Utils.emptyHtml('暂无热门车型', '<a class="btn btn-outline btn-sm" href="/shop/shop.html">浏览全部车型</a>'));
        return;
      }
      fill('home-goods', rows.map(function (g) { return Utils.goodsCardHtml(g); }).join(''));
      Utils.syncActionStates(document.getElementById('home-goods'));
    });
  }

  function loadEvents() {
    return HttpApi.activity.getList({ pageIndex: 1, pageSize: 6 }).then(function (res) {
      var rows = (res && res.rows) || [];
      if (!rows.length) {
        fill('home-events', Utils.emptyHtml('暂无活动，稍后再来看看'));
        return;
      }
      fill('home-events', rows.map(Utils.eventCardHtml).join(''));
    });
  }

  function loadArticles() {
    return HttpApi.article.getList({ pageIndex: 1, pageSize: 6 }).then(function (res) {
      var rows = (res && res.rows) || [];
      if (!rows.length) {
        fill('home-articles', Utils.emptyHtml('暂无资讯'));
        return;
      }
      fill('home-articles', rows.map(Utils.articleCardHtml).join(''));
    });
  }

  function loadVideos() {
    return HttpApi.video.getLatestVideos({ pageSize: 9 }).then(function (res) {
      var rows = (res && res.rows) || [];
      if (!rows.length) {
        fill('home-videos', Utils.emptyHtml('暂无视频'));
        return;
      }
      fill('home-videos', rows.map(Utils.videoCardHtml).join(''));
    });
  }

  function init() {
    Utils.bindCardActions();
    Utils.track('home_view');
    Promise.all([
      loadStores(),
      loadGoods(),
      loadEvents(),
      loadArticles(),
      loadVideos()
    ]);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
