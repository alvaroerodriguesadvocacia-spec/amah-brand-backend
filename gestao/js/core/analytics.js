/* AMÁH Brand — motor de indicadores/inteligência compartilhado
 * (giro de estoque, curva ABC, períodos de relatório, estatísticas de vendas)
 * Critérios de giro são fixos nesta versão; item 35 da especificação já prevê
 * que sejam configuráveis futuramente — mantidos como constantes isoladas
 * abaixo para facilitar essa evolução.
 */
(function (global) {
  'use strict';

  var GIRO_THRESHOLDS = { alto: 7, saudavel: 30, baixo: 60 }; // dias desde a última venda

  function daysSince(iso) {
    if (!iso) return null;
    var diff = Date.now() - new Date(iso).getTime();
    return Math.floor(diff / 86400000);
  }

  function classifyGiro(product, stockQty) {
    if (stockQty <= 0) return { key: 'sem_estoque', label: 'Sem estoque', badgeClass: 'badge-neutral', days: null };
    var referenceDate = product.lastSaleAt || product.createdAt;
    var days = daysSince(referenceDate);
    if (days == null) return { key: 'sem_dados', label: 'Sem dados', badgeClass: 'badge-neutral', days: null };
    if (!product.lastSaleAt && days <= GIRO_THRESHOLDS.saudavel) {
      return { key: 'novo', label: 'Produto novo', badgeClass: 'badge-info', days: days };
    }
    if (days <= GIRO_THRESHOLDS.alto) return { key: 'alto', label: '🔥 Alto giro', badgeClass: 'badge-success', days: days };
    if (days <= GIRO_THRESHOLDS.saudavel) return { key: 'saudavel', label: '🟢 Giro saudável', badgeClass: 'badge-success', days: days };
    if (days <= GIRO_THRESHOLDS.baixo) return { key: 'baixo', label: '🟡 Baixo giro', badgeClass: 'badge-warning', days: days };
    return { key: 'encalhado', label: '🔴 Encalhado', badgeClass: 'badge-danger', days: days };
  }

  var PERIOD_LABELS = {
    hoje: 'Hoje', ontem: 'Ontem', ultimos7: 'Últimos 7 dias', mes: 'Este mês',
    mesAnterior: 'Mês anterior', ano: 'Este ano', personalizado: 'Período personalizado'
  };

  function getPeriodRange(key, customStart, customEnd) {
    var now = new Date();
    var start, end;
    switch (key) {
      case 'hoje':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      case 'ontem':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
        break;
      case 'ultimos7':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
        end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        break;
      case 'mes':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
        break;
      case 'mesAnterior':
        start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        break;
      case 'ano':
        start = new Date(now.getFullYear(), 0, 1);
        end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999);
        break;
      case 'personalizado':
        start = customStart ? new Date(customStart) : new Date(now.getFullYear(), now.getMonth(), 1);
        end = customEnd ? new Date(customEnd + 'T23:59:59.999') : now;
        break;
      default:
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        end = now;
    }
    return { start: start, end: end, label: PERIOD_LABELS[key] || key };
  }

  function inRange(iso, range) {
    var t = new Date(iso).getTime();
    return t >= range.start.getTime() && t <= range.end.getTime();
  }

  // Retorna vendas concluídas dentro do período + seus itens, já líquidos de devolução.
  function getSalesInPeriod(range) {
    return Promise.all([App.db.getAll('sales'), App.db.getAll('sale_items')]).then(function (results) {
      var sales = results[0].filter(function (s) { return s.status === 'concluida' && inRange(s.createdAt, range); });
      var saleIds = {}; sales.forEach(function (s) { saleIds[s.id] = s; });
      var items = results[1].filter(function (i) { return saleIds[i.saleId]; });
      return { sales: sales, items: items };
    });
  }

  // Agrega por produto: quantidade líquida vendida, faturamento líquido, custo, lucro.
  function aggregateByProduct(items) {
    var map = {};
    items.forEach(function (it) {
      var netQty = it.qty - (it.returnedQty || 0);
      if (netQty <= 0) return;
      var revenue = (it.total / it.qty) * netQty; // rateio proporcional do desconto do item
      var cost = it.unitCostAtSale * netQty;
      if (!map[it.productId]) map[it.productId] = { productId: it.productId, productName: it.productName, sku: it.sku, qty: 0, revenue: 0, cost: 0 };
      map[it.productId].qty += netQty;
      map[it.productId].revenue += revenue;
      map[it.productId].cost += cost;
    });
    return Object.keys(map).map(function (id) {
      var m = map[id];
      m.profit = m.revenue - m.cost;
      m.margin = m.revenue > 0 ? (m.profit / m.revenue) * 100 : 0;
      return m;
    });
  }

  // Curva ABC clássica por faturamento (Pareto 80/15/5).
  function computeCurveABC(aggregated) {
    var sorted = aggregated.slice().sort(function (a, b) { return b.revenue - a.revenue; });
    var totalRevenue = sorted.reduce(function (s, i) { return s + i.revenue; }, 0);
    var cum = 0;
    return sorted.map(function (item) {
      cum += item.revenue;
      var cumPct = totalRevenue > 0 ? (cum / totalRevenue) * 100 : 0;
      var classe = cumPct <= 80 ? 'A' : (cumPct <= 95 ? 'B' : 'C');
      return Object.assign({}, item, { cumPct: cumPct, classe: classe, participacao: totalRevenue > 0 ? (item.revenue / totalRevenue) * 100 : 0 });
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.analytics = {
    classifyGiro: classifyGiro, daysSince: daysSince, getPeriodRange: getPeriodRange, PERIOD_LABELS: PERIOD_LABELS,
    inRange: inRange, getSalesInPeriod: getSalesInPeriod, aggregateByProduct: aggregateByProduct, computeCurveABC: computeCurveABC
  };
})(window);
