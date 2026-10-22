/* 视频播放：接收 url/poster/title/desc 参数（对齐旧 video-play） */
(function () {
  'use strict';

  var Utils = window.Utils;

  var player;
  var errorEl;

  function decode(raw) {
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (e) {
      return raw;
    }
  }

  function showError(message) {
    if (errorEl) {
      errorEl.querySelector('strong').textContent = message || '视频加载失败';
      errorEl.hidden = false;
    }
  }

  function init() {
    player = document.getElementById('video-player');
    errorEl = document.getElementById('video-error');
    if (!player) return;

    var query = Utils.queryAll();
    var url = Utils.safeUrl(decode(query.url || ''));
    var poster = Utils.safeUrl(Utils.firstImage(decode(query.poster || '')));
    var title = decode(query.title || '');
    var desc = decode(query.desc || '');

    var titleEl = document.getElementById('video-title');
    var descEl = document.getElementById('video-desc');
    var infoEl = document.getElementById('video-info');
    var sourceEl = document.getElementById('video-source');

    if (title && titleEl) titleEl.textContent = title;
    if (desc && descEl) descEl.textContent = desc;
    if ((title || desc) && infoEl) infoEl.hidden = false;
    if (title) {
      document.title = title + ' - 东北电动车汇';
      Utils.setSeo({ title: title + ' - 东北电动车汇', description: desc || '平台视频播放' });
    }

    if (!url) {
      showError('视频链接无效');
      player.hidden = true;
      return;
    }

    if (poster) player.setAttribute('poster', poster);
    player.src = url;
    if (sourceEl) {
      sourceEl.href = url;
      sourceEl.hidden = false;
    }

    player.addEventListener('error', function () {
      showError('视频加载失败');
    });

    document.getElementById('video-retry').addEventListener('click', function () {
      errorEl.hidden = true;
      player.load();
      var playPromise = player.play();
      if (playPromise && typeof playPromise.catch === 'function') {
        playPromise.catch(function () { /* 浏览器可能拦截自动播放，由用户手动点击 */ });
      }
    });

    document.getElementById('video-copy').addEventListener('click', function () {
      Utils.copyText(Utils.pageUrl());
      Utils.track('video_share_copy', { url: url });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
