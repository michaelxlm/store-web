/* 公共搜索联想（WO-192）：为 header / hero 搜索框提供输入即联想。
   词源：构建期注入的 window.SearchWords（实体快照词条）+ 本地搜索历史；
   不请求任何不存在的后端联想接口。搜索页已有 #search-suggest 的专属实现，本脚本自动跳过。 */
(function () {
  'use strict';

  var Utils = window.Utils;
  if (!Utils) return;

  // 搜索页有专属 suggest（含历史/热词/结果标题），避免重复绑定
  if (document.getElementById('search-suggest')) return;

  var words = [];
  function collectWords() {
    var injected = window.SearchWords || [];
    if (Array.isArray(injected)) injected.forEach(push);
    var history = (Utils.searchHistory && Utils.searchHistory.list) ? Utils.searchHistory.list() : [];
    history.forEach(push);
    return words;
  }
  function push(w) {
    w = String(w == null ? '' : w).trim();
    if (w && words.indexOf(w) === -1) words.push(w);
  }

  // 只处理跳转型搜索表单（header-search / hero-search），本地筛选页不接管
  var boxes = Utils.qsa('.header-search input[type="search"], .hero-search input[type="search"]');
  if (!boxes.length) return;
  collectWords();
  if (!words.length) return;

  boxes.forEach(function (input) {
    var form = input.form;
    if (!form) return;
    var panel = document.createElement('div');
    panel.className = 'search-suggest-panel';
    panel.setAttribute('role', 'listbox');
    panel.setAttribute('aria-label', '搜索联想');
    panel.hidden = true;
    panel.style.cssText = 'position:absolute;z-index:60;left:0;right:0;top:100%;margin-top:4px;background:var(--surface-1,#fff);border:1px solid var(--border-light,#e5e7eb);border-radius:10px;padding:6px;box-shadow:0 8px 24px rgba(0,0,0,.12)';
    var host = form;
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    host.appendChild(panel);

    function hide() {
      panel.hidden = true;
      panel.innerHTML = '';
      input.setAttribute('aria-expanded', 'false');
    }
    function render() {
      var kw = input.value.trim().toLowerCase();
      if (!kw) { hide(); return; }
      var matched = words.filter(function (w) {
        return w.toLowerCase().indexOf(kw) !== -1 && w.toLowerCase() !== kw;
      }).slice(0, 8);
      if (!matched.length) { hide(); return; }
      panel.innerHTML = '<div class="chips">' + matched.map(function (w) {
        return '<button type="button" class="chip" role="option" aria-selected="false" data-suggest="' +
          Utils.escapeHtml(w) + '">' + Utils.escapeHtml(w) + '</button>';
      }).join('') + '</div>';
      panel.hidden = false;
      input.setAttribute('aria-expanded', 'true');
    }

    input.addEventListener('input', render);
    input.addEventListener('focus', render);
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') hide();
    });
    form.addEventListener('submit', hide);
    Utils.delegate(panel, '[data-suggest]', 'click', function () {
      var word = this.getAttribute('data-suggest') || '';
      if (!word) return;
      Utils.track('search_suggest_click', { keyword: word });
      input.value = word;
      if (Utils.searchHistory && Utils.searchHistory.add) Utils.searchHistory.add(word);
      hide();
      // 跳转型表单：直接提交到搜索页
      if (form.requestSubmit) form.requestSubmit();
      else form.submit();
    });
    document.addEventListener('click', function (e) {
      if (panel.contains(e.target) || input.contains(e.target)) return;
      hide();
    });
  });
})();
