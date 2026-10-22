/* 账户中心：游客 / 商家双态（商家工作台与个人服务合并到「我的」） */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;
  var Merchant = window.Merchant;

  function $(id) { return document.getElementById(id); }

  function setBadge(el, count) {
    if (!el) return;
    var total = Number(count) || 0;
    el.textContent = total > 99 ? '99+' : String(total);
    el.hidden = total <= 0;
  }

  function refreshCounts() {
    var counts = Utils.favorite.counts();
    setBadge(document.getElementById('uc-fav-badge'), counts.total);
    setBadge(document.getElementById('uc-compare-badge'), Utils.compare.count());
  }

  function bindStoreLink() {
    var link = document.getElementById('uc-store-link');
    if (!link) return;
    HttpApi.store.getList({ page: 1, rows: 1 }).then(function (res) {
      var rows = (res && res.rows) || [];
      if (rows.length && rows[0]._id) {
        link.href = '/shop/store.html?id=' + encodeURIComponent(rows[0]._id);
      }
    }).catch(function () {
      /* 拿不到店铺时保持同城找店入口 */
    });
  }

  function bindShare() {
    var btn = document.getElementById('uc-share');
    if (!btn) return;
    btn.addEventListener('click', function () {
      Utils.share({
        title: '东北电动车汇',
        text: '本地电动车型号浏览、对比、同城找店与活动优惠',
        url: Utils.pageUrl()
      });
      Utils.track('share_click', { from: 'ucenter' });
    });
  }

  /* ------------------------------ 双态渲染 ------------------------------ */

  /** 商家登录后隐藏侧栏「我是商家」推广卡，避免身份引导矛盾 */
  function syncSidebar(isMerchant) {
    var card = document.querySelector('.sidebar-card');
    if (card) card.hidden = !!isMerchant;
  }

  function renderGuest() {
    $('uc-guest').hidden = false;
    $('uc-merchant').hidden = true;
    syncSidebar(false);
    $('uc-avatar').innerHTML = '<img src="/assets/img/logo.png" alt="" width="42" height="42">';
    $('uc-hero-title').textContent = '我的';
    $('uc-hero-sub').textContent = '收藏 · 对比 · 同城找店 · 商家服务';
    $('uc-hero-actions').innerHTML =
      '<a class="btn btn-hero-ghost" href="/merchant/login.html">商家登录</a>' +
      '<a class="btn btn-hero-solid" href="/merchant/login.html">免费入驻</a>';
  }

  function renderMerchant(merchant, current) {
    var m = merchant || {};
    var name = m.storeName || m.username || '商家';
    $('uc-guest').hidden = true;
    $('uc-merchant').hidden = false;
    syncSidebar(true);

    $('uc-avatar').textContent = String(name).charAt(0) || '商';
    $('uc-hero-title').textContent = name;
    $('uc-hero-sub').textContent = '商家中心 · ' + (Merchant.statusText(m.status) || '');
    $('uc-hero-actions').innerHTML = '<a class="btn btn-hero-solid" href="/merchant/index.html">进入商家中心</a>';

    $('uc-merchant-name').textContent = name;
    var badge = $('uc-merchant-badge');
    badge.className = 'merchant-badge merchant-badge--' + (m.status || 'pending');
    badge.textContent = Merchant.statusText(m.status);

    var expire = $('uc-merchant-expire');
    if (current && current.expireAt) {
      expire.textContent = '套餐到期 ' + Merchant.fmtDate(current.expireAt);
    } else if (m.status === 'approved') {
      expire.textContent = '公域展示资格以套餐为准';
    } else {
      expire.textContent = '';
    }
  }

  /** 登录过期：账户中心就地降级为游客态（不跳商家登录页） */
  function handleExpired(res) {
    if (!(res && res.authExpired)) return false;
    HttpApi.session.clear();
    renderGuest();
    Merchant.toast('登录已过期，请重新登录商家账号');
    return true;
  }

  function loadSubscription() {
    HttpApi.merchant.subscriptionList().then(function (res) {
      if (handleExpired(res)) return;
      if (res && res.code === 0 && res.data && res.data.current) {
        renderMerchant(Merchant.profile(), res.data.current);
      }
    }).catch(function () {
      /* 非阻断：拿不到套餐时展示通用提示 */
    });
  }

  function loadMerchant() {
    if (!Merchant || !Merchant.isLogged()) {
      renderGuest();
      return;
    }
    renderMerchant(Merchant.profile());
    HttpApi.merchant.info().then(function (res) {
      if (handleExpired(res)) return;
      if (res && res.code === 0 && res.data && res.data.merchant) {
        HttpApi.session.updateProfile(res.data.merchant);
        renderMerchant(res.data.merchant);
        loadSubscription();
      } else if (res && res.code !== 0) {
        Merchant.toast(res.msg || '获取商家信息失败');
      }
    }).catch(function () {
      /* 离线时沿用本地缓存资料 */
    });
  }

  function bindLogout() {
    var btn = $('uc-logout');
    if (!btn) return;
    btn.addEventListener('click', function () {
      Merchant.confirm('退出后需重新登录才能管理店铺，确定退出？').then(function (ok) {
        if (!ok) return;
        HttpApi.session.clear();
        renderGuest();
        Merchant.toast('已退出登录');
      });
    });
  }

  function init() {
    refreshCounts();
    bindStoreLink();
    bindShare();
    bindLogout();
    loadMerchant();
    window.addEventListener('pageshow', refreshCounts);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
