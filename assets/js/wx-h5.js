/* ==========================================================================
   wx-h5.js · 微信公众号 H5 网页授权 / JS-SDK（W-07，零依赖，挂 window.WxH5）
   --------------------------------------------------------------------------
   对齐旧 common/utils/wechatH5.js 的三段式链路：
     1. startSilentAuth() → 跳中台 /api/v1/public/wechat/oauth/start（302 微信授权页）
     2. 回跳带 ?wx_ticket= → exchangeTicket() 换 { openid, scope, unionid } 落本地
     3. 业务页 getOpenid() / ensureIdentity() 取身份
   约定：
     - 身份存 localStorage.wx_h5_identity（与旧 H5 同键，升级不丢）
     - 商家登录置位 merchant_wx_oauth_pending，回跳 ticket 留给 /auth/wxLogin 换 openid
     - openid 不进 URL；ticket 一次性，换完即从地址栏清除
   ========================================================================== */
(function (global) {
  'use strict';

  var IDENTITY_KEY = 'wx_h5_identity';
  var MERCHANT_PENDING_KEY = 'merchant_wx_oauth_pending';
  var JSSDK_SRC = 'https://res.wx.qq.com/open/js/jweixin-1.6.0.js';

  var config = {
    enabled: true,
    /** 进入 H5 是否自动静默授权（旧 H5 为 false，由页面按需触发） */
    autoSilentAuth: false,
    /** 授权范围：snsapi_base 静默（默认）/ snsapi_userinfo 弹确认页 */
    scope: 'snsapi_base',
    /** JS-SDK 默认注入接口列表（旧 H5 为空数组） */
    jsApiList: []
  };

  if (global.WxH5Config && typeof global.WxH5Config === 'object') {
    Object.keys(global.WxH5Config).forEach(function (k) {
      config[k] = global.WxH5Config[k];
    });
  }

  function isEnabled() {
    return config.enabled === true;
  }

  function isWechatBrowser() {
    try {
      return /micromessenger/i.test((global.navigator && global.navigator.userAgent) || '');
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------ 身份存取 ------------------------------ */
  function decodeLocal(raw) {
    if (!raw) return null;
    try {
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type && 'data' in parsed) return parsed.data;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function getIdentity() {
    try {
      var data = decodeLocal(global.localStorage.getItem(IDENTITY_KEY));
      return data && typeof data === 'object' ? data : {};
    } catch (e) {
      return {};
    }
  }

  function saveIdentity(identity) {
    try {
      global.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    } catch (e) { /* ignore */ }
  }

  function getOpenid() {
    return getIdentity().openid || '';
  }

  /* ------------------------------ 商家待授权态 ------------------------------ */
  function setMerchantAuthPending(on) {
    try {
      if (on) global.localStorage.setItem(MERCHANT_PENDING_KEY, '1');
      else global.localStorage.removeItem(MERCHANT_PENDING_KEY);
    } catch (e) { /* ignore */ }
  }

  function isMerchantAuthPending() {
    try {
      return !!global.localStorage.getItem(MERCHANT_PENDING_KEY);
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------ URL 工具 ------------------------------ */
  function currentTicket() {
    try {
      return new URLSearchParams(global.location.search).get('wx_ticket') || '';
    } catch (e) {
      return '';
    }
  }

  function cleanTicketFromUrl() {
    try {
      var url = new URL(global.location.href);
      if (!url.searchParams.has('wx_ticket')) return;
      url.searchParams.delete('wx_ticket');
      global.history.replaceState({}, document.title, url.toString());
    } catch (e) { /* ignore */ }
  }

  function redirectTarget() {
    try {
      var url = new URL(global.location.href);
      url.searchParams.delete('wx_ticket');
      url.hash = '';
      return url.toString();
    } catch (e) {
      return String(global.location.href).split('#')[0];
    }
  }

  function signUrl() {
    return String(global.location.href).split('#')[0];
  }

  /* ------------------------------ 授权链路 ------------------------------ */
  /**
   * 用一次性 ticket 换取身份（不落盘，由调用方决定）
   * @param {String} ticket
   * @return {Promise<Object|null>} { openid, scope, unionid, at }
   */
  function exchangeTicket(ticket) {
    if (!ticket || !global.HttpApi) return Promise.resolve(null);
    return global.HttpApi.wechat.oauthTicket(ticket).then(function (res) {
      if (res && res.code === 0 && res.data && res.data.openid) {
        return {
          openid: res.data.openid,
          scope: res.data.scope || '',
          unionid: res.data.unionid || '',
          at: Date.now()
        };
      }
      return null;
    }).catch(function () {
      return null;
    });
  }

  /**
   * 发起静默网页授权：仅在微信内置浏览器可用
   * @param {String} [scope] snsapi_base / snsapi_userinfo
   * @return {Boolean} 是否已发起跳转
   */
  function startSilentAuth(scope) {
    if (!isEnabled() || !global.HttpApi) return false;
    if (!isWechatBrowser()) return false;
    var finalScope = scope || config.scope || 'snsapi_base';
    var url = global.HttpApi.getApiUrl(global.HttpApi.paths.wechat.oauthStart, {
      redirect: redirectTarget(),
      scope: finalScope
    });
    global.location.replace(url);
    return true;
  }

  /**
   * 应用启动钩子（每页加载自动执行一次）
   * 顺序：商家待授权 → 跳过；URL 有 ticket → 换身份并清理；已有身份 → 返回；否则按 autoSilentAuth 决定
   * @return {Promise<Object|null>}
   */
  function bootstrap() {
    if (!isEnabled()) return Promise.resolve(null);
    if (isMerchantAuthPending()) return Promise.resolve(null);
    var ticket = currentTicket();
    if (ticket) {
      return exchangeTicket(ticket).then(function (identity) {
        if (identity) saveIdentity(identity);
        cleanTicketFromUrl();
        return identity;
      });
    }
    var stored = getIdentity();
    if (stored.openid) return Promise.resolve(stored);
    if (config.autoSilentAuth) startSilentAuth();
    return Promise.resolve(null);
  }

  /**
   * 业务页按需取身份：无 openid 时发起静默授权（整页跳走，故本次返回空串）
   * @return {Promise<String>}
   */
  function ensureIdentity() {
    if (!isEnabled()) return Promise.resolve('');
    var openid = getOpenid();
    if (openid) return Promise.resolve(openid);
    startSilentAuth();
    return Promise.resolve('');
  }

  /**
   * 商家登录专用：取走回跳 ticket 并清理地址栏与待授权标志
   * （ticket 交给后端 /merchant/auth/wxLogin 换 openid，前端不落地）
   * @return {String} ticket（无则空串）
   */
  function consumeMerchantTicket() {
    var ticket = currentTicket();
    if (!ticket) return '';
    setMerchantAuthPending(false);
    cleanTicketFromUrl();
    return ticket;
  }

  /* ------------------------------ JS-SDK ------------------------------ */
  /**
   * 获取 JS-SDK 鉴权参数
   * @param {String} [url] 签名基准 URL（默认当前页去 hash）
   * @return {Promise<Object|null>} { appId, timestamp, nonceStr, signature, jsApiList }
   */
  function getJsSdkConfig(url) {
    if (!global.HttpApi) return Promise.resolve(null);
    return global.HttpApi.wechat.jsdkConfig(url || signUrl()).then(function (res) {
      if (res && res.code === 0 && res.data) return res.data;
      return null;
    }).catch(function () {
      return null;
    });
  }

  /** 按需加载 jweixin（已存在则直接复用） */
  function ensureJssdk() {
    if (global.wx && typeof global.wx.config === 'function') return Promise.resolve(true);
    return new Promise(function (resolve) {
      var existed = document.querySelector('script[data-jweixin]');
      if (existed) {
        existed.addEventListener('load', function () { resolve(true); });
        existed.addEventListener('error', function () { resolve(false); });
        return;
      }
      var script = document.createElement('script');
      script.src = JSSDK_SRC;
      script.async = true;
      script.setAttribute('data-jweixin', '1');
      script.onload = function () { resolve(!!(global.wx && global.wx.config)); };
      script.onerror = function () { resolve(false); };
      document.head.appendChild(script);
    });
  }

  /**
   * 注入 wx.config
   * @param {String[]} [jsApiList] 覆盖默认接口列表
   * @return {Promise<Boolean>} wx.ready 成功 true
   */
  function setupJsSdk(jsApiList) {
    if (!isWechatBrowser()) return Promise.resolve(false);
    return ensureJssdk().then(function (loaded) {
      if (!loaded) return null;
      return getJsSdkConfig();
    }).then(function (cfg) {
      var wx = global.wx;
      if (!cfg || !wx || typeof wx.config !== 'function') return false;
      var list = (jsApiList && jsApiList.length) ? jsApiList : (config.jsApiList || []);
      return new Promise(function (resolve) {
        wx.config({
          debug: false,
          appId: cfg.appId,
          timestamp: cfg.timestamp,
          nonceStr: cfg.nonceStr,
          signature: cfg.signature,
          jsApiList: list
        });
        wx.ready(function () { resolve(true); });
        wx.error(function () { resolve(false); });
      });
    }).catch(function () {
      return false;
    });
  }

  /* ------------------------------ 自动启动 ------------------------------ */
  function autoBootstrap() {
    try {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () { bootstrap(); });
      } else {
        bootstrap();
      }
    } catch (e) { /* ignore */ }
  }

  var WxH5 = {
    IDENTITY_KEY: IDENTITY_KEY,
    MERCHANT_PENDING_KEY: MERCHANT_PENDING_KEY,
    config: config,
    isEnabled: isEnabled,
    isWechatBrowser: isWechatBrowser,
    getIdentity: getIdentity,
    getOpenid: getOpenid,
    setMerchantAuthPending: setMerchantAuthPending,
    isMerchantAuthPending: isMerchantAuthPending,
    consumeMerchantTicket: consumeMerchantTicket,
    exchangeTicket: exchangeTicket,
    startSilentAuth: startSilentAuth,
    bootstrap: bootstrap,
    ensureIdentity: ensureIdentity,
    getJsSdkConfig: getJsSdkConfig,
    ensureJssdk: ensureJssdk,
    setupJsSdk: setupJsSdk
  };

  global.WxH5 = WxH5;
  autoBootstrap();
})(window);
