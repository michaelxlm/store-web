/* 商家中心公共能力：登录守卫 / 会话 / 格式化 */
(function (global) {
  'use strict';

  var HttpApi = global.HttpApi;
  var Utils = global.Utils;

  function isLogged() {
    return !!(HttpApi && HttpApi.session && HttpApi.session.isLogged());
  }

  /** 未登录跳商家登录页；返回是否已登录 */
  function requireLogin() {
    if (isLogged()) return true;
    global.location.replace('/merchant/login.html');
    return false;
  }

  /** 商家接口统一处理：登录过期回登录页，返回是否已处理 */
  function authExpired(res) {
    if (res && res.authExpired) {
      global.location.replace('/merchant/login.html');
      return true;
    }
    return false;
  }

  function toast(message) {
    if (Utils && Utils.toast) Utils.toast(message);
  }

  function statusText(status) {
    return {
      pending: '审核中',
      approved: '已入驻',
      rejected: '未通过',
      disabled: '已禁用'
    }[status] || '未知';
  }

  function fmtDate(ts, withTime) {
    if (!ts) return '-';
    var d = new Date(Number(ts));
    if (isNaN(d.getTime())) return '-';
    var p = function (n) { return String(n).padStart(2, '0'); };
    var day = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    if (!withTime) return day;
    return day + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function fenToYuan(fen) {
    return ((Number(fen) || 0) / 100).toFixed(2);
  }

  function query() {
    var out = {};
    try {
      new URLSearchParams(global.location.search).forEach(function (v, k) { out[k] = v; });
    } catch (e) { /* ignore */ }
    return out;
  }

  /** 保存商家会话并刷新本地资料（token/merchant 与旧 H5 同键） */
  function saveSession(data) {
    if (!data || !data.token) return false;
    HttpApi.session.set({ token: data.token, merchant: data.merchant });
    return true;
  }

  function profile() {
    return HttpApi.session.getProfile() || {};
  }

  /** 统一确认弹窗（替代旧 uni.showModal）：resolve(true/false) */
  function confirmDialog(message, options) {
    var opts = options || {};
    return new Promise(function (resolve) {
      var mask = document.createElement('div');
      mask.className = 'modal-mask is-open';
      mask.setAttribute('role', 'dialog');
      mask.setAttribute('aria-modal', 'true');

      var modal = document.createElement('div');
      modal.className = 'modal';

      var title = document.createElement('h3');
      title.textContent = opts.title || '确认操作';

      var body = document.createElement('div');
      body.className = 'merchant-modal-text';
      var p = document.createElement('p');
      p.textContent = String(message || '');
      body.appendChild(p);

      var actions = document.createElement('div');
      actions.className = 'modal-actions';
      var cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.className = 'btn btn-outline';
      cancel.textContent = opts.cancelText || '取消';
      var ok = document.createElement('button');
      ok.type = 'button';
      ok.className = 'btn ' + (opts.danger ? 'btn-danger' : 'btn-primary');
      ok.textContent = opts.okText || '确定';
      actions.appendChild(cancel);
      actions.appendChild(ok);

      modal.appendChild(title);
      modal.appendChild(body);
      modal.appendChild(actions);
      mask.appendChild(modal);

      function close(result) {
        mask.classList.remove('is-open');
        document.removeEventListener('keydown', onKey);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        resolve(result);
      }

      function onKey(e) {
        if (e.key === 'Escape') close(false);
      }

      cancel.addEventListener('click', function () { close(false); });
      ok.addEventListener('click', function () { close(true); });
      mask.addEventListener('click', function (e) {
        if (e.target === mask) close(false);
      });
      document.addEventListener('keydown', onKey);

      document.body.appendChild(mask);
      ok.focus();
    });
  }

  global.Merchant = {
    isLogged: isLogged,
    requireLogin: requireLogin,
    authExpired: authExpired,
    toast: toast,
    statusText: statusText,
    fmtDate: fmtDate,
    fenToYuan: fenToYuan,
    query: query,
    saveSession: saveSession,
    profile: profile,
    confirm: confirmDialog
  };
})(window);
