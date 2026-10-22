/* 外链浏览：域名白名单 + iframe 承载（对齐旧 webview 页面） */
(function () {
  'use strict';

  var Utils = window.Utils;

  var ALLOWED_HOSTS = [
    'mp.weixin.qq.com',
    'fangkelianmeng.com',
    'xuyiheng.com',
    'antucao.oss-cn-beijing.aliyuncs.com',
    'antucao.oss-accelerate.aliyuncs.com'
  ];

  function parseHost(raw) {
    var match = /^https?:\/\/([^/:?#]+)/i.exec(String(raw || '').trim());
    return match ? match[1].toLowerCase() : '';
  }

  function isAllowedUrl(raw) {
    var text = String(raw || '').trim();
    if (!/^https:\/\//i.test(text)) return false;
    var host = parseHost(text);
    if (!host) return false;
    return ALLOWED_HOSTS.some(function (allowed) {
      return host === allowed || host.endsWith('.' + allowed);
    });
  }

  function decode(raw) {
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (e) {
      return raw;
    }
  }

  function showBlocked(reason) {
    document.getElementById('webview-blocked').hidden = false;
    document.getElementById('webview-frame').hidden = true;
    document.getElementById('webview-tip').hidden = true;
    document.getElementById('webview-blocked-reason').textContent = reason;
  }

  function trackPv(url) {
    var path = '/webview/webview.html';
    try { Utils.track('webview_open', { url: url, path: path }); } catch (e) { /* 埋点失败不影响浏览 */ }
  }

  function init() {
    var query = Utils.queryAll();
    var url = decode(query.url || '');
    var title = decode(query.title || '');
    if (url.indexOf('*') !== -1) url = url.replace(/\*/g, '?');

    if (!url) {
      showBlocked('没有收到要打开的页面地址。');
      return;
    }
    if (!isAllowedUrl(url)) {
      showBlocked('该网页来源不在允许范围内，已为你拦截。');
      return;
    }

    if (title) document.getElementById('webview-title').textContent = title;
    if (url.indexOf('mp.weixin.qq.com') !== -1) {
      document.getElementById('webview-desc').textContent = '微信文章或视频页面，如显示不全请在微信中打开。';
    } else {
      document.getElementById('webview-desc').textContent = '外部页面由第三方提供，内容仅供参考。';
    }

    document.title = (title || '浏览页面') + ' - 东北电动车汇';

    var frame = document.getElementById('webview-frame');
    var iframe = document.getElementById('webview-iframe');
    var openLink = document.getElementById('webview-open');
    var tip = document.getElementById('webview-tip');

    iframe.addEventListener('load', function () {
      tip.hidden = false;
    });
    iframe.src = url;
    openLink.href = url;
    frame.hidden = false;
    tip.hidden = false;
    trackPv(url);

    Utils.setMeta('name', 'robots', 'noindex, nofollow');
    Utils.setSeo({
      title: (title || '浏览页面') + ' - 东北电动车汇',
      description: '站内浏览页面。',
      canonical: window.location.origin + '/webview/webview.html'
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
