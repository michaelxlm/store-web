/* 首页：并行加载门店 / 热门车型 / 活动 / 资讯 / 视频（任一失败不影响其它板块）
   WO-192 首屏 SSR：门店 / 车型 / 资讯由构建期渲染真实卡片（带 data-ssr="1"）。
   运行期策略——SSR 首屏 + API 增量刷新 + 失败兜底：
     · API 有数据 → 用完整交互卡片覆盖 SSR（收藏/对比按钮恢复交互）；
     · API 空 → 保留 SSR 内容，不用空态抹掉首屏真实数据（活动/视频无 SSR，走空态）；
     · API 失败 → 同上保留 SSR，其余板块给「加载失败」提示，不留永久转圈。 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  function fill(id, html) {
    var el = document.getElementById(id);
    if (el) el.innerHTML = html;
  }

  /** 该板块是否已有构建期 SSR 卡片 */
  function hasSsr(id) {
    var el = document.getElementById(id);
    return !!(el && el.querySelector('[data-ssr="1"]'));
  }

  /** 有真实数据就覆盖；空结果时 SSR 区保留构建期内容，非 SSR 区写空态 */
  function fillRows(id, rowsHtml, emptyHtml) {
    if (rowsHtml) {
      fill(id, rowsHtml);
      return true;
    }
    if (hasSsr(id)) return false;
    fill(id, emptyHtml);
    return false;
  }

  /** 请求失败：SSR 区保留首屏内容；其余板块给失败态，不留永久 spinner */
  function fillFail(id, label) {
    if (hasSsr(id)) return;
    fill(id, Utils.errorHtml(label + '加载失败，请稍后重试'));
  }

  function loadStores() {
    return HttpApi.store.getList({ pageIndex: 1, pageSize: 6 }).then(function (res) {
      var rows = (res && res.rows) || [];
      fillRows('home-stores',
        rows.length ? rows.map(Utils.storeCardHtml).join('') : '',
        Utils.emptyHtml('暂无门店，去看看同城找店', '<a class="btn btn-outline btn-sm" href="/shop/city.html">同城找店</a>'));
    }).catch(function () { fillFail('home-stores', '门店'); });
  }

  function loadGoods() {
    return HttpApi.goods.getHotProducts({ pageSize: 12 }).then(function (res) {
      var rows = (res && res.rows) || [];
      var filled = fillRows('home-goods',
        rows.length ? rows.map(function (g) { return Utils.goodsCardHtml(g); }).join('') : '',
        Utils.emptyHtml('暂无热门车型', '<a class="btn btn-outline btn-sm" href="/shop/shop.html">浏览全部车型</a>'));
      if (filled) Utils.syncActionStates(document.getElementById('home-goods'));
    }).catch(function () { fillFail('home-goods', '车型'); });
  }

  function loadEvents() {
    return HttpApi.activity.getList({ pageIndex: 1, pageSize: 6 }).then(function (res) {
      var rows = (res && res.rows) || [];
      // P0：过滤已结束的活动（复用 Utils.eventStatus，与活动卡片状态口径一致），首页不再展示过期活动
      rows = rows.filter(function (it) {
        var st = (Utils.eventStatus || function () { return { label: '' }; })(it.start_date, it.end_date);
        return st.label !== '已结束';
      });
      fillRows('home-events',
        rows.length ? rows.map(Utils.eventCardHtml).join('') : '',
        Utils.emptyHtml('暂无活动，稍后再来看看'));
    }).catch(function () { fillFail('home-events', '活动'); });
  }

  function loadArticles() {
    return HttpApi.article.getList({ pageIndex: 1, pageSize: 6 }).then(function (res) {
      var rows = (res && res.rows) || [];
      fillRows('home-articles',
        rows.length ? rows.map(Utils.articleCardHtml).join('') : '',
        Utils.emptyHtml('暂无资讯'));
    }).catch(function () { fillFail('home-articles', '资讯'); });
  }

  function loadVideos() {
    return HttpApi.video.getLatestVideos({ pageSize: 9 }).then(function (res) {
      var rows = (res && res.rows) || [];
      fillRows('home-videos',
        rows.length ? rows.map(Utils.videoCardHtml).join('') : '',
        Utils.emptyHtml('暂无视频'));
    }).catch(function () { fillFail('home-videos', '视频'); });
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
