/* 关于我们：中台项目信息 + 产品特色 + 联系入口 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var DEFAULT_FEATURES = [
    { label: '车型浏览', value: '按品牌、价格与续航筛选车型' },
    { label: '车型对比', value: '最多 3 款横向对比，差异自动高亮' },
    { label: '同城找店', value: '按城市与距离找到附近门店' },
    { label: '活动优惠', value: '门店活动与优惠信息集中查看' }
  ];

  function renderFeatures(list) {
    var wrap = document.getElementById('about-features');
    var grid = document.getElementById('about-feature-list');
    if (!wrap || !grid) return;
    var rows = (list || []).filter(function (item) {
      return item && (item.status === undefined || item.status);
    });
    if (!rows.length) rows = DEFAULT_FEATURES;
    grid.innerHTML = rows.map(function (item) {
      return '<div class="about-feature">' +
        '<strong>' + Utils.escapeHtml(item.label || '') + '</strong>' +
        '<p class="text-muted">' + Utils.escapeHtml(item.value || '') + '</p>' +
        '</div>';
    }).join('');
    wrap.hidden = false;
  }

  function applyProject(project) {
    if (!project) return;
    var nameEl = document.getElementById('about-name');
    var sloganEl = document.getElementById('about-slogan');
    var logoEl = document.getElementById('about-logo');
    if (project.name) nameEl.textContent = project.name;
    if (project.desc) sloganEl.textContent = project.desc;
    if (project.logo) logoEl.src = project.logo;
    if (Array.isArray(project.about_us) && project.about_us.length) {
      renderFeatures(project.about_us);
    }
  }

  function bindContacts() {
    var yearEl = document.getElementById('about-year');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
    Utils.delegate(document.body, '[data-copy]', 'click', function () {
      Utils.copyText(this.getAttribute('data-copy') || '');
      Utils.track('contact_copy', { from: 'about' });
    });
  }

  function init() {
    bindContacts();
    renderFeatures(DEFAULT_FEATURES);
    HttpApi.getInitInfo({ scene: 'about' }).then(function (res) {
      var data = (res && res.data) || {};
      applyProject(data.project);
    }).catch(function () {
      /* 中台不可用时保留默认文案 */
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
