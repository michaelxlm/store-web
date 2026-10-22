/* 套餐与续费：套餐列表 / 下单 / 微信 JSAPI / 线下收款指引 / 订阅记录 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;
  var WxH5 = window.WxH5;
  var Merchant = window.Merchant;

  if (!Merchant) return;
  if (!Merchant.requireLogin()) return;

  var state = {
    loading: true,
    buying: false,
    plans: [],
    subs: [],
    current: null,
    oauthRetried: false,
    payInfo: { outTradeNo: '', payHint: '', amountText: '' }
  };

  function $(id) { return document.getElementById(id); }

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function planId(plan) { return plan && (plan._id || plan.id) || ''; }

  function subStatusText(status) {
    return {
      pending: '待支付',
      paid: '生效中',
      expired: '已到期',
      refunded: '已退款',
      canceled: '已取消'
    }[status] || status || '';
  }

  function renderCurrent() {
    var box = $('mp-current');
    var cur = state.current;
    if (cur) {
      box.className = 'merchant-plan-current is-ok';
      box.innerHTML = '<strong>✅ 公域展示服务生效中</strong>' +
        '<span>' + esc(cur.planName || '当前套餐') + ' · 到期 ' + esc(Merchant.fmtDate(cur.expireAt)) + '</span>' +
        '<span class="merchant-pay-note">现在续费将从现有到期时间顺延，不亏天数</span>';
    } else {
      box.className = 'merchant-plan-current is-off';
      box.innerHTML = '<strong>⭕ 公域展示未开通</strong>' +
        '<span>选购下方基础年费套餐，开通「同城找店」公域展示资格</span>';
    }
  }

  function renderPlans() {
    var box = $('mp-plans');
    var empty = $('mp-empty');
    if (!state.plans.length) {
      if (state.loading) {
        box.hidden = false;
        box.innerHTML = '<div class="loading"><span class="spinner" aria-hidden="true"></span><span>加载套餐…</span></div>';
        empty.hidden = true;
        return;
      }
      box.innerHTML = '';
      box.hidden = true;
      empty.hidden = false;
      return;
    }
    box.hidden = false;
    empty.hidden = true;

    var featured = state.plans.length > 1;
    box.innerHTML = state.plans.map(function (plan, index) {
      var price = Number(plan.price) || 0;
      var original = Number(plan.originalPrice) || 0;
      var benefits = Array.isArray(plan.benefits) ? plan.benefits : [];
      var benefitHtml = benefits.map(function (b) {
        var title = b && typeof b === 'object' ? b.title : b;
        var desc = b && typeof b === 'object' ? b.desc : '';
        return '<span>✓ ' + esc(title || '') + (desc ? '<small>' + esc(desc) + '</small>' : '') + '</span>';
      }).join('');

      return '<div class="merchant-plan merchant-card' + (featured && index === 0 ? ' is-featured' : '') + '">' +
        (featured && index === 0 ? '<span class="merchant-plan-flag">推荐</span>' : '') +
        '<div class="merchant-plan-name">' + esc(plan.name || '套餐') + '</div>' +
        '<div class="merchant-plan-price">' +
          '<strong>￥' + esc(Merchant.fenToYuan(price)) + '</strong>' +
          (original > price ? '<del>￥' + esc(Merchant.fenToYuan(original)) + '</del>' : '') +
        '</div>' +
        '<div class="merchant-plan-duration">有效期 ' + esc(plan.durationDays || 365) + ' 天 · 可带 ' + esc(plan.maxStores || 1) + ' 家店铺上公域</div>' +
        (plan.describe ? '<div class="merchant-plan-desc">' + esc(plan.describe) + '</div>' : '') +
        (benefitHtml ? '<div class="merchant-plan-benefits">' + benefitHtml + '</div>' : '') +
        '<button class="btn btn-primary btn-block" type="button" data-plan="' + esc(planId(plan)) + '"' + (state.buying ? ' disabled' : '') + '>' +
          (state.current ? '续费' : '立即购买') +
        '</button>' +
      '</div>';
    }).join('');
  }

  function renderSubs() {
    var card = $('mp-subs-card');
    if (!state.subs.length) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    $('mp-subs').innerHTML = state.subs.map(function (sub) {
      return '<div class="merchant-sub">' +
        '<div class="merchant-sub-main">' +
          '<span><strong>' + esc(sub.planName || '套餐') + '</strong> ' +
            '<span class="merchant-status' + (sub.status === 'paid' ? ' merchant-status--on' : (sub.status === 'pending' ? ' merchant-status--warn' : '')) + '">' + esc(subStatusText(sub.status)) + '</span>' +
          '</span>' +
          '<span class="merchant-sub-meta">' +
            '<span>￥' + esc(Merchant.fenToYuan(sub.amount)) + ' · ' + esc(sub.durationDays || 0) + ' 天</span>' +
            (sub.periodEnd ? '<span>到期 ' + esc(Merchant.fmtDate(sub.periodEnd)) + '</span>' : '') +
          '</span>' +
          (sub.status === 'pending' ? '<span class="merchant-status merchant-status--warn">待确认收款，开通后自动上公域</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  }

  function loadData() {
    state.loading = true;
    return Promise.all([
      HttpApi.merchant.planList(),
      HttpApi.merchant.subscriptionList()
    ]).then(function (out) {
      state.loading = false;
      var planRes = out[0];
      var subRes = out[1];
      if (Merchant.authExpired(planRes) || Merchant.authExpired(subRes)) return;

      state.plans = planRes && planRes.code === 0 && planRes.rows ? planRes.rows : [];
      if (subRes && subRes.code === 0 && subRes.data) {
        state.subs = Array.isArray(subRes.data.rows) ? subRes.data.rows : [];
        state.current = subRes.data.current || null;
      } else {
        state.subs = [];
        state.current = null;
      }

      var failed = [planRes, subRes].filter(function (r) { return r && r.code !== 0; })[0];
      if (failed) Merchant.toast(failed.msg || '加载失败');

      renderCurrent();
      renderPlans();
      renderSubs();
    }).catch(function () {
      state.loading = false;
      Merchant.toast('网络异常，请稍后重试');
      renderCurrent();
      renderPlans();
      renderSubs();
    });
  }

  function isWechatBrowser() {
    return WxH5.isWechatBrowser();
  }

  function goWechatOAuth() {
    state.oauthRetried = true;
    WxH5.startSilentAuth();
  }

  function showOrder(payData) {
    state.payInfo = {
      outTradeNo: payData.outTradeNo || '',
      payHint: payData.payHint || '请联系平台客服完成支付',
      amountText: payData.amountText || Merchant.fenToYuan(payData.amount)
    };
    $('mp-pay-amount').textContent = '￥' + state.payInfo.amountText;
    $('mp-pay-hint').textContent = state.payInfo.payHint;
    $('mp-pay-order').textContent = '订单号：' + state.payInfo.outTradeNo + '（点击复制）';
    $('mp-pay-modal').classList.add('is-open');
  }

  function pollPaid(subscriptionId, times) {
    var count = times || 0;
    if (!subscriptionId || count >= 6) {
      loadData();
      return;
    }
    HttpApi.merchant.payQuery(subscriptionId).then(function (res) {
      var status = res && res.code === 0 && res.data ? res.data.status : '';
      if (status === 'paid') {
        Merchant.toast('已开通，店铺进入公域展示');
        loadData();
        return;
      }
      setTimeout(function () { pollPaid(subscriptionId, count + 1); }, 2000);
    }).catch(function () {
      setTimeout(function () { pollPaid(subscriptionId, count + 1); }, 2000);
    });
  }

  function invokeWxJsapi(params, subscriptionId) {
    var payload = {
      appId: String(params.appId || ''),
      timeStamp: String(params.timeStamp || ''),
      nonceStr: String(params.nonceStr || ''),
      package: String(params.package || ''),
      signType: params.signType || 'RSA',
      paySign: String(params.paySign || '')
    };
    var run = function () {
      window.WeixinJSBridge.invoke('getBrandWCPayRequest', payload, function (res) {
        var msg = (res && res.err_msg) || '';
        if (msg === 'get_brand_wcpay_request:ok') {
          Merchant.toast('支付成功，开通中…');
          pollPaid(subscriptionId);
          return;
        }
        if (msg === 'get_brand_wcpay_request:cancel') {
          Merchant.toast('支付已取消，可重新发起');
        } else {
          Merchant.toast('支付未完成，可重新发起或联系客服代收');
        }
        loadData();
      });
    };
    if (!window.WeixinJSBridge || typeof window.WeixinJSBridge.invoke !== 'function') {
      document.addEventListener('WeixinJSBridgeReady', run, false);
    } else {
      run();
    }
  }

  function handlePrepay(payRes) {
    if (!payRes || payRes.code !== 0) {
      var msg = (payRes && payRes.msg) || '';
      if (/授权|openid/i.test(msg) && isWechatBrowser() && !state.oauthRetried) {
        goWechatOAuth();
        return;
      }
      loadData();
      Merchant.toast(msg || '发起支付失败，可联系平台客服代收');
      return;
    }

    var data = payRes.data || {};
    if (data.paid) {
      Merchant.toast('已开通，店铺进入公域展示');
      loadData();
      return;
    }
    if (data.payParams) {
      if (!isWechatBrowser()) {
        Merchant.toast('请在微信中打开本页面完成支付');
        loadData();
        return;
      }
      invokeWxJsapi(data.payParams, data.subscriptionId);
      return;
    }
    showOrder(data);
    loadData();
  }

  function buy(plan) {
    if (state.buying) return;
    Merchant.confirm('「' + (plan.name || '套餐') + '」￥' + Merchant.fenToYuan(plan.price) + '，有效期 ' + (plan.durationDays || 365) + ' 天', {
      title: '确认购买',
      okText: state.current ? '确认续费' : '确认购买'
    }).then(function (ok) {
      if (!ok) return;

      var prepayArg = {};
      var openid = WxH5.getOpenid();
      if (!openid && isWechatBrowser() && !state.oauthRetried) {
        state.buying = true;
        goWechatOAuth();
        return;
      }
      if (openid) prepayArg = { openid: openid };

      state.buying = true;
      renderPlans();
      HttpApi.merchant.subscriptionCreate(planId(plan)).then(function (res) {
        if (Merchant.authExpired(res)) return;
        if (!res || res.code !== 0 || !res.data || !res.data.subscription) {
          state.buying = false;
          renderPlans();
          Merchant.toast((res && res.msg) || '下单失败');
          return;
        }
        var sub = res.data.subscription;
        return HttpApi.merchant.payPrepay(sub.id, prepayArg).then(function (payRes) {
          state.buying = false;
          renderPlans();
          if (Merchant.authExpired(payRes)) return;
          handlePrepay(payRes);
        });
      }).catch(function () {
        state.buying = false;
        renderPlans();
        Merchant.toast('网络异常，请稍后重试');
      });
    });
  }

  function bindEvents() {
    $('mp-plans').addEventListener('click', function (e) {
      var btn = e.target.closest('[data-plan]');
      if (!btn) return;
      var id = btn.getAttribute('data-plan');
      var plan = state.plans.filter(function (p) { return String(planId(p)) === String(id); })[0];
      if (plan) buy(plan);
    });

    $('mp-pay-close').addEventListener('click', function () {
      $('mp-pay-modal').classList.remove('is-open');
    });
    $('mp-pay-modal').addEventListener('click', function (e) {
      if (e.target === this) this.classList.remove('is-open');
    });
    $('mp-pay-order').addEventListener('click', function () {
      if (!state.payInfo.outTradeNo) return;
      Utils.copyText(state.payInfo.outTradeNo);
      Merchant.toast('订单号已复制');
    });
  }

  function init() {
    if (!HttpApi || !WxH5) return;
    Utils.track('merchant_plans_visit', {});
    bindEvents();
    loadData();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
