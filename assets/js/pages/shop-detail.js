/* 车型详情：参数 / 图集 / 门店 / 收藏对比分享 / 相关推荐 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var SPEC_ROWS = [
    { key: 'battery_specifications', label: '电池规格' },
    { key: 'controller_specifications', label: '控制器规格' },
    { key: 'vacuum_tire_specification', label: '真空胎规格' },
    { key: 'overall_specifications_motor', label: '电机规格' },
    { key: 'security_device_specifications', label: '防盗器/套锁' },
    { key: 'locking_mechanism_specification', label: '套锁规格' }
  ];

  var goods = null;
  var galleryIndex = 0;
  var images = [];

  function el(id) {
    return document.getElementById(id);
  }

  function renderGallery() {
    var wrap = el('detail-gallery');
    var thumbs = el('detail-thumbs');
    if (!wrap) return;
    if (!images.length) {
      wrap.innerHTML = '<span class="goods-media-empty">暂无图片</span>';
      thumbs.innerHTML = '';
      return;
    }
    wrap.innerHTML = '<img src="' + Utils.escapeHtml(Utils.ossImg(images[galleryIndex], { w: 960, h: 720, mode: 'fit' })) +
      '" alt="' + Utils.escapeHtml(goods.name || '车型图片') + '">';
    if (images.length > 1) {
      thumbs.innerHTML = images.map(function (src, i) {
        return '<button type="button" class="' + (i === galleryIndex ? 'is-active' : '') + '" data-index="' + i +
          '" aria-label="查看第 ' + (i + 1) + ' 张图片"><img src="' +
          Utils.escapeHtml(Utils.ossImg(src, { w: 128, h: 128 })) + '" alt=""></button>';
      }).join('');
    } else {
      thumbs.innerHTML = '';
    }
  }

  function renderSpecs() {
    var box = el('detail-specs');
    var cfg = (Array.isArray(goods.shop_array) && goods.shop_array[0]) || {};
    var rows = [];
    SPEC_ROWS.forEach(function (row) {
      var value = cfg[row.key] || goods[row.key] || '';
      if (value) rows.push('<dl class="spec-item"><dt>' + row.label + '</dt><dd>' + Utils.escapeHtml(value) + '</dd></dl>');
    });
    if (goods.goods_price > 0) {
      rows.push('<dl class="spec-item"><dt>参考价格</dt><dd>¥' + Utils.num(goods.goods_price) + '</dd></dl>');
    }
    if (goods.rating) {
      rows.push('<dl class="spec-item"><dt>用户评分</dt><dd>' + Utils.num(goods.rating) + ' 分</dd></dl>');
    }
    if (goods.rating_count) {
      rows.push('<dl class="spec-item"><dt>评级次数</dt><dd>' + Utils.num(goods.rating_count) + ' 次</dd></dl>');
    }
    box.innerHTML = rows.length ? rows.join('') : '<p class="text-muted">暂无参数</p>';
  }

  function renderStore() {
    var box = el('detail-store');
    var store = (Array.isArray(goods.store) && goods.store[0]) || null;
    if (!store) {
      box.innerHTML = '<p class="text-muted">暂无关联门店</p>';
      return;
    }
    var hours = store.business_hours
      ? (typeof store.business_hours === 'string' ? store.business_hours : JSON.stringify(store.business_hours))
      : '';
    box.innerHTML = [
      '<div class="card-head"><span class="card-title">' + Utils.escapeHtml(store.name || '门店') + '</span>' +
      '<a class="section-more" href="/shop/store.html?id=' + encodeURIComponent(store._id || '') + '">进入店铺 →</a></div>',
      '<div class="store-meta" style="gap:6px 14px">',
      store.phone ? '<span>电话 ' + Utils.escapeHtml(store.phone) + '</span>' : '',
      store.address ? '<span>' + Utils.escapeHtml(store.address) + '</span>' : '',
      hours ? '<span>营业时间 ' + Utils.escapeHtml(hours) + '</span>' : '',
      '</div>',
      store.phone ? '<div class="form-actions"><a class="btn btn-outline btn-sm" href="tel:' + Utils.escapeHtml(store.phone) + '">拨打电话</a></div>' : ''
    ].join('');
  }

  function renderActions() {
    var favBtn = el('detail-fav');
    var cmpBtn = el('detail-compare');
    var id = String(goods._id || '');
    function refresh() {
      var faved = Utils.favorite.is('goods', id);
      favBtn.textContent = faved ? '已收藏' : '收藏';
      favBtn.classList.toggle('is-active', faved);
      var inCompare = Utils.compare.is(id);
      cmpBtn.textContent = inCompare ? '移出对比' : '加入对比';
      cmpBtn.classList.toggle('is-active', inCompare);
    }
    favBtn.onclick = function () {
      var added = Utils.favorite.toggle('goods', goods);
      refresh();
      Utils.toast(added ? '已收藏' : '已取消收藏');
      Utils.track(added ? 'favorite_add' : 'favorite_remove', { id: id, type: 'goods', from: 'detail' });
    };
    cmpBtn.onclick = function () {
      var res = Utils.compare.toggle(goods);
      if (!res.ok && res.full) {
        Utils.toast('最多同时对比 3 款车型');
        return;
      }
      refresh();
      Utils.toast(res.added ? '已加入对比' : '已取消对比');
      Utils.track(res.added ? 'compare_add' : 'compare_remove', { id: id, from: 'detail' });
    };
    el('detail-share').onclick = function () {
      Utils.share({ title: goods.name || document.title, url: location.href });
    };
    refresh();
  }

  function renderRelated() {
    HttpApi.goods.list({ pageIndex: 1, pageSize: 8, onlyHot: true }).then(function (res) {
      var rows = ((res && res.rows) || []).filter(function (g) {
        return String(g._id) !== String(goods._id);
      }).slice(0, 4);
      var box = el('detail-related');
      if (!box) return;
      box.innerHTML = rows.length
        ? rows.map(function (g) { return Utils.goodsCardHtml(g); }).join('')
        : Utils.emptyHtml('暂无相关推荐');
      Utils.syncActionStates(box);
    });
  }

  function render(data) {
    goods = data || {};
    var name = goods.name || '车型详情';
    el('detail-title').textContent = name;

    var tags = [];
    (Array.isArray(goods.goods_tags) ? goods.goods_tags : []).forEach(function (t) { if (t) tags.push(t); });
    (Array.isArray(goods.tag) ? goods.tag : []).forEach(function (t) { if (t && tags.indexOf(t) === -1) tags.push(t); });
    el('detail-tags').innerHTML = tags.map(function (t) {
      return '<span class="tag tag-primary">' + Utils.escapeHtml(t) + '</span>';
    }).join('');

    var price = Utils.num(goods.goods_price);
    el('detail-price').innerHTML = price > 0
      ? '<span class="price"><small>¥</small>' + Utils.num(price) + '</span>' + (goods.goods_tip ? '<span class="tag tag-warn">' + Utils.escapeHtml(goods.goods_tip) + '</span>' : '')
      : '<span class="text-muted">价格面议</span>';

    var subParts = [];
    if (goods.shop_name) subParts.push(goods.shop_name);
    if (goods.rating) subParts.push('评分 ' + Utils.num(goods.rating));
    el('detail-sub').textContent = subParts.join(' · ');

    var meta = [];
    if (goods.rating_count) meta.push('<span>' + Utils.num(goods.rating_count) + ' 次评级</span>');
    if (goods.is_hot) meta.push('<span>热门车型</span>');
    if (goods.is_new) meta.push('<span>新上架</span>');
    el('detail-meta').innerHTML = meta.join('');

    // 图集字段兼容数组 / JSON 数组字符串（管理端 crudPage 落库格式） / 逗号分隔
    images = Utils.imageList(goods.goods_banner_imgs);
    if (!images.length && goods.goods_thumb) images = Utils.imageList(goods.goods_thumb);
    images = images.map(function (src) { return Utils.safeUrl(src); }).filter(Boolean);
    galleryIndex = 0;
    renderGallery();
    renderSpecs();
    renderStore();
    renderActions();

    el('detail-desc').innerHTML = goods.goods_desc
      ? Utils.sanitizeHtml(goods.goods_desc)
      : '<p class="text-muted">暂无介绍</p>';

    Utils.setSeo({
      title: name + (price > 0 ? ' ¥' + Utils.num(price) : '') + ' - 东北电动车汇',
      description: Utils.truncate(goods.goods_desc || ('查看' + name + '的详细参数、配置与报价。'), 110),
      canonical: location.origin + location.pathname + '?id=' + encodeURIComponent(goods._id || '')
    });
    renderRelated();
  }

  function init() {
    var id = Utils.query('id');
    if (!id) {
      el('detail-title').textContent = '缺少车型参数';
      el('detail-gallery').innerHTML = Utils.emptyHtml('请从车型列表进入详情', '<a class="btn btn-outline btn-sm" href="/shop/shop.html">浏览全部车型</a>');
      el('detail-price').innerHTML = '';
      return;
    }
    Utils.track('goods_detail_view', { id: id });
    HttpApi.goods.getDetail({ id: id }).then(function (res) {
      if (res && res.code === 0 && res.data) {
        var data = res.data.goods || res.data;
        if (data && data._id) {
          render(data);
          return;
        }
      }
      el('detail-title').textContent = '车型不存在或已下架';
      el('detail-gallery').innerHTML = Utils.emptyHtml('车型不存在或已下架', '<a class="btn btn-outline btn-sm" href="/shop/shop.html">浏览全部车型</a>');
      el('detail-related').innerHTML = '';
    });

    Utils.delegate(el('detail-thumbs'), 'button', 'click', function () {
      galleryIndex = Number(this.getAttribute('data-index')) || 0;
      renderGallery();
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
