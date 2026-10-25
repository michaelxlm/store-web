/* ==========================================================================
   http-api.js · 中台接口封装（零依赖，挂 window.HttpApi）
   --------------------------------------------------------------------------
   对齐旧 H5 的 common/utils/httpApiConfig.js + httpApiRequest.js：
     - 接口前缀 /api/v1/front/shop，商家接口 /api/v1/merchant/*
     - 每个请求自动注入 mainUrl（中台 sourceGuard 识别站点来源）与 platform=h5
     - 响应适配：列表 → res.rows / res.total / res.hasMore；详情 → res.data
     - GET 并发去重 + 传输错误重试；POST 不重试
     - 商家请求自动带 Authorization: Bearer <merchant_token>，401/403 清会话
   ========================================================================== */
(function (global) {
  'use strict';

  var BASE_URL = 'https://api.xuyiheng.com';
  var P = '/api/v1/front/shop';
  var DEFAULT_TIMEOUT = 15000;
  var DEFAULT_RETRY_INTERVAL = 400;
  var MERCHANT_TOKEN_KEY = 'merchant_token';
  var MERCHANT_PROFILE_KEY = 'merchant_profile';

  var PATHS = {
    goods: {
      list: P + '/goods/list',
      hot: P + '/goods/hot',
      detail: P + '/goods/detail',
      search: P + '/goods/search',
      hotKeywords: P + '/goods/hot-keywords'
    },
    store: {
      list: P + '/store/list',
      detail: P + '/store/detail',
      filters: P + '/store/filters',
      nearby: P + '/store/nearby'
    },
    merchantPlan: {
      publicList: P + '/merchant-plan/list'
    },
    user: {
      login: P + '/user/login',
      info: P + '/user/info'
    },
    subscribe: {
      config: P + '/subscribe/config',
      report: P + '/subscribe/report',
      status: P + '/subscribe/status'
    },
    activity: {
      list: P + '/activity/list',
      detail: P + '/activity/detail'
    },
    video: {
      latest: P + '/video/latest'
    },
    article: {
      list: P + '/article/list',
      detail: P + '/article/detail',
      faqList: P + '/faq/list'
    },
    weixinOfficial: {
      hub: P + '/weixin-official/hub'
    },
    wechat: {
      oauthStart: '/api/v1/public/wechat/oauth/start',
      oauthTicket: '/api/v1/public/wechat/oauth/ticket',
      jsdkConfig: '/api/v1/public/wechat/jsdk/config',
      qrLoginCreate: '/api/v1/public/wechat/qrLogin/create',
      qrLoginStatus: '/api/v1/public/wechat/qrLogin/status'
    },
    init: '/api/v1/front/antucao/init',
    merchant: {
      register: '/api/v1/merchant/auth/register',
      login: '/api/v1/merchant/auth/login',
      wxLogin: '/api/v1/merchant/auth/wxLogin',
      mpLogin: '/api/v1/merchant/auth/mpLogin',
      bindSelfWx: '/api/v1/merchant/auth/bindSelfWx',
      bindSelfMp: '/api/v1/merchant/auth/bindSelfMp',
      unbindSelf: '/api/v1/merchant/auth/unbindSelf',
      info: '/api/v1/merchant/auth/info',
      completeProfile: '/api/v1/merchant/auth/completeProfile',
      storeList: '/api/v1/merchant/store/list',
      storeSave: '/api/v1/merchant/store/save',
      storeDelete: '/api/v1/merchant/store/delete',
      planList: '/api/v1/merchant/plan/list',
      subscriptionList: '/api/v1/merchant/subscription/list',
      subscriptionCreate: '/api/v1/merchant/subscription/create',
      payPrepay: '/api/v1/merchant/pay/prepay',
      payQuery: '/api/v1/merchant/pay/query',
      contentList: '/api/v1/merchant/content/list',
      contentSave: '/api/v1/merchant/content/save',
      contentDelete: '/api/v1/merchant/content/delete',
      contentDetail: '/api/v1/merchant/content/detail',
      uploadSign: '/api/v1/merchant/oss/signature'
    }
  };

  /* ------------------------------ URL ------------------------------ */
  function ensureHttps(url) {
    var raw = String(url || '');
    if (!/^http:\/\//i.test(raw)) return raw;
    var host = raw.slice(7).split(/[/?#]/)[0].replace(/:\d+$/, '').toLowerCase();
    if (host === '127.0.0.1' || host === 'localhost' || host === '[::1]') return raw;
    return 'https://' + raw.slice(7);
  }

  function isAbsolute(url) {
    return /^https?:\/\//i.test(String(url || ''));
  }

  function getApiUrl(apiPath, params) {
    var path = String(apiPath || '');
    var url = ensureHttps(isAbsolute(path) ? path : BASE_URL + path);
    if (!params) return url;
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var v = params[key];
      if (v === undefined || v === null || v === '') return;
      var encoded = typeof v === 'object' ? JSON.stringify(v) : v;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(encoded));
    });
    if (!parts.length) return url;
    return url + (url.indexOf('?') === -1 ? '?' : '&') + parts.join('&');
  }

  /* ------------------------------ 存储 ------------------------------ */
  function readToken() {
    try { return global.localStorage.getItem(MERCHANT_TOKEN_KEY) || ''; } catch (e) { return ''; }
  }

  function readProfile() {
    try {
      var raw = global.localStorage.getItem(MERCHANT_PROFILE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object' && parsed.type && 'data' in parsed) return parsed.data;
      return parsed;
    } catch (e) {
      return null;
    }
  }

  function setMerchantSession(payload) {
    payload = payload || {};
    try {
      if (payload.token) global.localStorage.setItem(MERCHANT_TOKEN_KEY, payload.token);
      if (payload.merchant) global.localStorage.setItem(MERCHANT_PROFILE_KEY, JSON.stringify(payload.merchant));
    } catch (e) { /* ignore */ }
  }

  function updateMerchantProfile(merchant) {
    try {
      if (merchant) global.localStorage.setItem(MERCHANT_PROFILE_KEY, JSON.stringify(merchant));
    } catch (e) { /* ignore */ }
  }

  function clearMerchantSession() {
    try {
      global.localStorage.removeItem(MERCHANT_TOKEN_KEY);
      global.localStorage.removeItem(MERCHANT_PROFILE_KEY);
    } catch (e) { /* ignore */ }
  }

  function isMerchantLogged() {
    return !!readToken();
  }

  /* ------------------------------ 参数注入 ------------------------------ */
  function mainUrl() {
    var host = '';
    try { host = (global.location && global.location.hostname) || ''; } catch (e) { host = ''; }
    var isLocal = !host || host === 'localhost' || host === '127.0.0.1' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
    return isLocal ? 'store.fangkelianmeng.com' : host;
  }

  function mergeParams(data) {
    var platform = {
      platform: 'h5',
      mainUrl: mainUrl()
    };
    if (data === undefined || data === null) return platform;
    if (typeof data !== 'object' || Array.isArray(data)) return data;
    var merged = {};
    Object.keys(data).forEach(function (k) { merged[k] = data[k]; });
    Object.keys(platform).forEach(function (k) {
      var v = merged[k];
      if (v === undefined || v === null || v === '') merged[k] = platform[k];
    });
    return merged;
  }

  /* ------------------------------ 响应适配 ------------------------------ */
  function firstNum() {
    for (var i = 0; i < arguments.length; i++) {
      var n = Number(arguments[i]);
      if (isFinite(n)) return n;
    }
    return undefined;
  }

  /**
   * 把中台 { code, data, msg } 还原为旧前端消费格式
   * @param {Object} mainRes
   * @return {Object}
   */
  function adapt(mainRes) {
    if (!mainRes || typeof mainRes !== 'object') return { code: -1, msg: '响应格式错误' };
    var bizCode = Number(mainRes.code);
    var msg = mainRes.msg || (bizCode === 0 ? '请求成功' : '请求失败');
    if (bizCode !== 0) return { code: -1, msg: msg };

    var d = mainRes.data;
    if (Array.isArray(d)) {
      return { code: 0, msg: msg, rows: d, total: d.length, count: d.length, data: d };
    }
    if (d && typeof d === 'object' && (Array.isArray(d.rows) || Array.isArray(d.list))) {
      var rows = Array.isArray(d.rows) ? d.rows : d.list;
      var total = firstNum(d.total, d.count, rows.length);
      var result = {
        code: 0,
        msg: msg,
        rows: rows,
        total: total,
        count: total,
        hasMore: !!d.hasMore,
        pageIndex: firstNum(d.pageIndex, d.page, 1),
        pageSize: firstNum(d.pageSize, rows.length),
        data: d
      };
      Object.keys(d).forEach(function (k) {
        if (!(k in result)) result[k] = d[k];
      });
      return result;
    }
    return { code: 0, msg: msg, data: d };
  }

  /* ------------------------------ 传输层 ------------------------------ */
  function sleep(ms) {
    return new Promise(function (resolve) { setTimeout(resolve, Math.max(0, ms)); });
  }

  function jitter(ms) {
    var n = Math.max(0, Number(ms) || 0);
    return n + Math.floor(Math.random() * (Math.floor(n * 0.2) + 1));
  }

  function transport(fullUrl, method, body, headers, timeout) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var controller = typeof global.AbortController === 'function' ? new global.AbortController() : null;

      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        if (controller) { try { controller.abort(); } catch (e) { /* ignore */ } }
        reject({ code: 'client-timeout', msg: '请求超时', retryable: true });
      }, Number(timeout) || DEFAULT_TIMEOUT);

      function done(fn, payload) {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(payload);
      }

      var init = {
        method: method,
        headers: headers,
        credentials: 'omit',
        cache: 'no-store'
      };
      if (body !== undefined) init.body = JSON.stringify(body);
      if (controller) init.signal = controller.signal;

      global.fetch(fullUrl, init).then(function (resp) {
        return resp.text().then(function (text) {
          var json = null;
          try { json = text ? JSON.parse(text) : null; } catch (e) { json = null; }
          if (resp.status >= 200 && resp.status < 300) {
            done(resolve, json || { code: 0, data: null });
          } else {
            done(reject, {
              code: resp.status,
              msg: (json && json.msg) || 'HTTP ' + resp.status,
              retryable: resp.status >= 500 || resp.status === 429
            });
          }
        });
      }).catch(function (err) {
        var aborted = err && (err.name === 'AbortError' || err.code === 20);
        done(reject, {
          code: aborted ? 'client-timeout' : -1,
          msg: aborted ? '请求超时' : '网络请求失败',
          retryable: true,
          err: err
        });
      });
    });
  }

  var inFlight = {};

  function keyOf(path, method, data) {
    try {
      var keys = data && typeof data === 'object' ? Object.keys(data).sort() : [];
      var sorted = {};
      keys.forEach(function (k) { sorted[k] = data[k]; });
      return path + '::' + method + '::' + JSON.stringify(sorted);
    } catch (e) {
      return path + '::' + method;
    }
  }

  /**
   * 统一请求（始终 resolve 适配后的响应，不抛错）
   * @param {String} apiPath
   * @param {Object} [options] { method, data, headers, timeout, retryCount, retryInterval, dedupe, success, fail, complete }
   * @return {Promise<Object>}
   */
  function request(apiPath, options) {
    options = options || {};
    var path = String(apiPath || '');
    if (!path) {
      var emptyErr = { code: -1, msg: '请求url不能为空' };
      if (typeof options.fail === 'function') options.fail(emptyErr);
      return Promise.resolve(emptyErr);
    }

    var method = String(options.method || 'GET').toUpperCase();
    var isGet = method === 'GET';
    var data = mergeParams(options.data);
    var headers = { 'content-type': 'application/json' };
    if (options.headers) {
      Object.keys(options.headers).forEach(function (k) { headers[k] = options.headers[k]; });
    }
    if (options.auth) {
      var token = readToken();
      if (token) headers.Authorization = 'Bearer ' + token;
    }

    var fullUrl = isGet
      ? getApiUrl(path, data)
      : ensureHttps(isAbsolute(path) ? path : BASE_URL + path);
    var body = isGet ? undefined : data;
    var retryCount = typeof options.retryCount === 'number' ? options.retryCount : (isGet ? 1 : 0);
    var retryInterval = typeof options.retryInterval === 'number' ? options.retryInterval : DEFAULT_RETRY_INTERVAL;
    var timeout = typeof options.timeout === 'number' ? options.timeout : DEFAULT_TIMEOUT;
    var dedupe = options.dedupe === undefined ? isGet : !!options.dedupe;
    var key = keyOf(path, method, data);

    function finish(res) {
      if (options.auth && res && res.code !== 0) {
        // transport 层把非 2xx 状态码写入 res.status（重试包装后 code 会归一为 -1）
        var status = Number(res.status || res.code);
        var expired = status === 401 || status === 403 || /HTTP 401|HTTP 403/.test(String(res.msg || ''));
        if (expired) {
          clearMerchantSession();
          res = Object.assign({}, res, { authExpired: true, msg: '登录已过期，请重新登录' });
        }
      }
      if (res && res.code === 0) {
        if (typeof options.success === 'function') { try { options.success(res); } catch (e) { /* ignore */ } }
      } else if (typeof options.fail === 'function') {
        try { options.fail(res); } catch (e) { /* ignore */ }
      }
      if (typeof options.complete === 'function') {
        try { options.complete(res); } catch (e) { /* ignore */ }
      }
      return res;
    }

    if (dedupe && inFlight[key]) {
      return inFlight[key].then(function (res) { return finish(res); });
    }

    var maxAttempts = Math.max(1, retryCount + 1);
    var run = (function attemptLoop(attempt) {
      return transport(fullUrl, method, body, headers, timeout).then(function (json) {
        return adapt(json);
      }).catch(function (err) {
        if (attempt < maxAttempts - 1 && err && err.retryable) {
          return sleep(jitter(retryInterval * Math.pow(2, attempt))).then(function () {
            return attemptLoop(attempt + 1);
          });
        }
        return { code: -1, status: err && err.code, msg: (err && err.msg) || '网络请求失败', retryable: !!(err && err.retryable) };
      });
    })(0).then(function (res) {
      if (dedupe) delete inFlight[key];
      return finish(res);
    });

    if (dedupe) inFlight[key] = run;
    return run;
  }

  function get(apiPath, data, options) {
    return request(apiPath, Object.assign({}, options, { method: 'GET', data: data || {} }));
  }

  function post(apiPath, data, options) {
    return request(apiPath, Object.assign({}, options, { method: 'POST', data: data || {}, dedupe: false, retryCount: 0 }));
  }

  function ns(apiPath) {
    return function (data, options) {
      var opts = Object.assign({}, options, { data: data || {} });
      if (opts.retryCount === undefined) opts.retryCount = 1;
      if (opts.timeout === undefined) opts.timeout = DEFAULT_TIMEOUT;
      return request(apiPath, opts);
    };
  }

  /* ------------------------------ 业务接口 ------------------------------ */
  var api = {
    baseURL: BASE_URL,
    paths: PATHS,
    getApiUrl: getApiUrl,
    adapt: adapt,
    request: request,
    get: get,
    post: post,

    goods: {
      list: ns(PATHS.goods.list),
      getHotProducts: ns(PATHS.goods.hot),
      hot: ns(PATHS.goods.hot),
      getDetail: ns(PATHS.goods.detail),
      detail: ns(PATHS.goods.detail),
      search: ns(PATHS.goods.search),
      getHotKeywords: ns(PATHS.goods.hotKeywords),
      hotKeywords: ns(PATHS.goods.hotKeywords)
    },

    store: {
      getList: ns(PATHS.store.list),
      list: ns(PATHS.store.list),
      getDetail: ns(PATHS.store.detail),
      detail: ns(PATHS.store.detail),
      getFilters: ns(PATHS.store.filters),
      filters: ns(PATHS.store.filters),
      getNearby: ns(PATHS.store.nearby),
      nearby: ns(PATHS.store.nearby)
    },

    activity: {
      getList: ns(PATHS.activity.list),
      list: ns(PATHS.activity.list),
      getDetail: ns(PATHS.activity.detail),
      detail: ns(PATHS.activity.detail)
    },

    video: {
      getLatestVideos: ns(PATHS.video.latest),
      latest: ns(PATHS.video.latest)
    },

    article: {
      getList: ns(PATHS.article.list),
      list: ns(PATHS.article.list),
      getDetail: ns(PATHS.article.detail),
      detail: ns(PATHS.article.detail),
      getFaqList: ns(PATHS.article.faqList),
      faqList: ns(PATHS.article.faqList)
    },

    weixinOfficial: {
      getHubContent: ns(PATHS.weixinOfficial.hub),
      hub: ns(PATHS.weixinOfficial.hub)
    },

    // 商家套餐对客展示（WO-31）：免鉴权只读，返回在售套餐分层
    merchantPlan: {
      publicList: ns(PATHS.merchantPlan.publicList),
      list: ns(PATHS.merchantPlan.publicList)
    },

    getInitInfo: ns(PATHS.init),

    wechat: {
      oauthTicket: function (ticket) {
        return get(PATHS.wechat.oauthTicket, { ticket: ticket });
      },
      jsdkConfig: function (url) {
        return get(PATHS.wechat.jsdkConfig, { url: url });
      },
      /** 创建 PC 扫码登录会话：返回 { ticket, qrcodeUrl, expireSeconds } */
      qrLoginCreate: function (data) {
        return post(PATHS.wechat.qrLoginCreate, data || {});
      },
      /** 轮询扫码状态：返回 { status: pending|confirmed|expired, wxTicket? } */
      qrLoginStatus: function (ticket) {
        return get(PATHS.wechat.qrLoginStatus, { ticket: ticket });
      }
    },

    session: {
      getToken: readToken,
      getProfile: readProfile,
      set: setMerchantSession,
      updateProfile: updateMerchantProfile,
      clear: clearMerchantSession,
      isLogged: isMerchantLogged
    }
  };

  /* ------------------------------ 商家接口 ------------------------------ */
  function merchantRequest(path, data, method, options) {
    return request(path, Object.assign({}, options, {
      method: method || 'GET',
      data: data || {},
      auth: true,
      dedupe: false,
      retryCount: 0
    }));
  }

  var M = PATHS.merchant;
  api.merchant = {
    register: function (data, options) { return merchantRequest(M.register, data, 'POST', options); },
    login: function (data, options) { return merchantRequest(M.login, data, 'POST', options); },
    wxLogin: function (data, options) { return merchantRequest(M.wxLogin, data, 'POST', options); },
    mpLogin: function (data, options) { return merchantRequest(M.mpLogin, data, 'POST', options); },
    info: function (options) { return merchantRequest(M.info, {}, 'GET', options); },
    completeProfile: function (data, options) { return merchantRequest(M.completeProfile, data, 'POST', options); },
    bindSelfWx: function (data, options) { return merchantRequest(M.bindSelfWx, data, 'POST', options); },
    bindSelfMp: function (data, options) { return merchantRequest(M.bindSelfMp, data, 'POST', options); },
    unbindSelf: function (data, options) { return merchantRequest(M.unbindSelf, data, 'POST', options); },
    storeList: function (data, options) { return merchantRequest(M.storeList, data || {}, 'GET', options); },
    storeSave: function (data, options) { return merchantRequest(M.storeSave, data, 'POST', options); },
    storeDelete: function (id, options) { return merchantRequest(M.storeDelete, { id: id }, 'POST', options); },
    planList: function (options) { return merchantRequest(M.planList, {}, 'GET', options); },
    subscriptionList: function (options) { return merchantRequest(M.subscriptionList, {}, 'GET', options); },
    subscriptionCreate: function (planId, options) { return merchantRequest(M.subscriptionCreate, { planId: planId }, 'POST', options); },
    payPrepay: function (subscriptionId, extra, options) {
      return merchantRequest(M.payPrepay, Object.assign({ subscriptionId: subscriptionId }, extra || {}), 'POST', options);
    },
    payQuery: function (subscriptionId, options) {
      return merchantRequest(M.payQuery, { subscriptionId: subscriptionId }, 'GET', options);
    },
    contentList: function (data, options) { return merchantRequest(M.contentList, data || {}, 'GET', options); },
    contentDetail: function (data, options) { return merchantRequest(M.contentDetail, data || {}, 'GET', options); },
    contentSave: function (data, options) { return merchantRequest(M.contentSave, data, 'POST', options); },
    contentDelete: function (data, options) { return merchantRequest(M.contentDelete, data, 'POST', options); },
    uploadSign: function (data, options) { return merchantRequest(M.uploadSign, data || {}, 'GET', options); }
  };

  global.HttpApi = api;
})(window);
