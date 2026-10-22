/* 车型对比：本地清单（最多 3 款）→ 实时拉详情 → 差异高亮 + 更优标色 */
(function () {
  'use strict';

  var Utils = window.Utils;
  var HttpApi = window.HttpApi;

  var SPEC_ROWS = [
    { key: 'battery_specifications', label: '电池规格', better: 'max' },
    { key: 'controller_specifications', label: '控制器规格', better: 'max' },
    { key: 'vacuum_tire_specification', label: '真空胎规格' },
    { key: 'overall_specifications_motor', label: '电机规格', better: 'max' },
    { key: 'security_device_specifications', label: '防盗器/套锁' },
    { key: 'locking_mechanism_specification', label: '套锁规格' }
  ];

  var columns = [];
  var onlyDiff = false;

  function specOf(goods) {
    var cfg = (Array.isArray(goods.shop_array) && goods.shop_array[0]) || {};
    var specs = {};
    SPEC_ROWS.forEach(function (row) {
      specs[row.key] = String((cfg && cfg[row.key]) || goods[row.key] || '').trim();
    });
    return specs;
  }

  function specNumber(text) {
    var match = String(text || '').match(/-?\d+(\.\d+)?/);
    return match ? Number(match[0]) : NaN;
  }

  function cellValue(col, key) {
    if (key === 'price') return Utils.num(col.goods_price);
    return (col.specs && col.specs[key]) || '';
  }

  function isSame(values) {
    var first = String(values[0] || '').trim();
    return values.every(function (v) { return String(v || '').trim() === first; });
  }

  function bestIndex(values, mode) {
    if (mode !== 'max') return -1;
    var best = -1;
    var bestNum = -Infinity;
    values.forEach(function (v, i) {
      var n = specNumber(v);
      if (isFinite(n) && n > bestNum) {
        bestNum = n;
        best = i;
      }
    });
    // 全部无数字或并列时不标色
    var count = values.filter(function (v) { return isFinite(specNumber(v)); }).length;
    if (count < 2) return -1;
    var top = values.filter(function (v) { return specNumber(v) === bestNum; }).length;
    return top > 1 ? -1 : best;
  }

  function render() {
    var box = document.getElementById('compare-body');
    if (!columns.length) {
      box.innerHTML = '<div class="compare-empty">' +
        '<strong>对比清单还是空的</strong>' +
        '<p class="text-muted">从车型列表或详情页点击「比」加入，最多 3 款。</p>' +
        '<a class="btn btn-primary btn-sm" href="/shop/shop.html">去挑选车型</a>' +
        '</div>';
      return;
    }

    var head = ['<tr><th scope="col">对比项</th>'];
    columns.forEach(function (col, i) {
      head.push('<th scope="col">' +
        '<div style="display:flex;flex-direction:column;gap:8px">' +
        (col.goods_thumb ? '<img src="' + Utils.escapeHtml(Utils.ossImg(col.goods_thumb, { w: 240, h: 180 })) +
          '" alt="' + Utils.escapeHtml(col.name || '') + '" style="width:120px;border-radius:8px">' : '') +
        '<a href="/shop/detail.html?id=' + encodeURIComponent(col._id) + '">' + Utils.escapeHtml(col.name || '未命名车型') + '</a>' +
        '<button type="button" class="btn btn-xs btn-outline" data-remove="' + Utils.escapeHtml(col._id) + '">移除</button>' +
        '</div></th>');
    });
    head.push('</tr>');

    var bodyRows = [];
    var priceValues = columns.map(function (c) { return c.goods_price; });
    if (!onlyDiff || !isSame(priceValues)) {
      bodyRows.push('<tr class="' + (onlyDiff && !isSame(priceValues) ? 'is-diff' : '') + '"><td>参考价格</td>' +
        columns.map(function (col) {
          return '<td>' + (Utils.num(col.goods_price) > 0 ? '¥' + Utils.num(col.goods_price) : '面议') + '</td>';
        }).join('') + '</tr>');
    }

    SPEC_ROWS.forEach(function (row) {
      var values = columns.map(function (col) { return cellValue(col, row.key); });
      var same = isSame(values);
      if (onlyDiff && same) return;
      var best = bestIndex(values, row.better);
      bodyRows.push('<tr class="' + (same ? '' : 'is-diff') + '"><td>' + row.label + '</td>' +
        values.map(function (v, i) {
          return '<td class="' + (i === best ? 'is-better' : '') + '">' + (v ? Utils.escapeHtml(v) : '—') + '</td>';
        }).join('') + '</tr>');
    });

    box.innerHTML = '<div class="compare-wrap"><table class="compare-table"><thead>' + head.join('') +
      '</thead><tbody>' + bodyRows.join('') + '</tbody></table></div>' +
      '<p class="text-muted mt-16">共 ' + columns.length + ' 款车型参与对比' +
      (columns.length < Utils.compare.MAX ? '，还可加入 ' + (Utils.compare.MAX - columns.length) + ' 款' : '') + '。</p>';
  }

  function load() {
    var ids = Utils.compare.ids();
    var queryIds = Utils.query('ids');
    if (queryIds) {
      var imported = Utils.compare.importIds(queryIds);
      if (imported.added) {
        Utils.toast(imported.limited ? '仅展示前 3 款车型' : '已导入 ' + imported.added + ' 款车型');
        ids = Utils.compare.ids();
      }
    }
    if (!ids.length) {
      columns = [];
      render();
      return;
    }
    Promise.all(ids.map(function (id) {
      return HttpApi.goods.getDetail({ id: id }).then(function (res) {
        if (res && res.code === 0 && res.data) {
          var goods = res.data.goods || res.data;
          if (goods && goods._id) {
            return {
              _id: String(goods._id),
              name: goods.name || '未命名车型',
              goods_thumb: goods.goods_thumb || '',
              goods_price: Utils.num(goods.goods_price),
              specs: specOf(goods)
            };
          }
        }
        return null;
      });
    })).then(function (list) {
      columns = list.filter(Boolean);
      render();
    });
  }

  function init() {
    var box = document.getElementById('compare-body');
    if (!box) return;

    document.getElementById('compare-only-diff').addEventListener('change', function () {
      onlyDiff = this.checked;
      render();
    });

    document.getElementById('compare-clear').addEventListener('click', function () {
      if (!Utils.compare.count()) {
        Utils.toast('对比清单已经是空的');
        return;
      }
      Utils.compare.clear();
      columns = [];
      render();
      Utils.toast('已清空对比清单');
      Utils.track('compare_clear', { from: 'web' });
    });

    document.getElementById('compare-share').addEventListener('click', function () {
      var ids = Utils.compare.ids();
      if (!ids.length) {
        Utils.toast('请先加入车型再分享');
        return;
      }
      Utils.share({
        title: '我选了 ' + ids.length + ' 款车型做对比',
        url: location.origin + '/shop/compare.html?ids=' + ids.join(',')
      });
    });

    box.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-remove]');
      if (!btn) return;
      var id = btn.getAttribute('data-remove');
      Utils.compare.remove(id);
      load();
      Utils.toast('已移出对比');
    });

    load();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
