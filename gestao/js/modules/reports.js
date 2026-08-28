/* AMÁH Brand — módulo Inteligência / Relatórios (Fase 7)
 * Relatórios com filtro de período: produtos mais/menos vendidos, margens e
 * lucro, curva ABC, giro de estoque. Compartilha o motor js/core/analytics.js
 * com os alertas de estoque da Fase 2.
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var analytics = App.core.analytics;

  function periodPicker(onChange) {
    var select = App.ui.el('select', { id: 'rep-period' }, Object.keys(analytics.PERIOD_LABELS).filter(function (k) { return k !== 'personalizado'; }).map(function (k) {
      return App.ui.el('option', { value: k, selected: k === 'mes' ? 'selected' : undefined }, [analytics.PERIOD_LABELS[k]]);
    }));
    select.addEventListener('change', function () { onChange(select.value); });
    return select;
  }

  function pageHeader(title, subtitle, periodSelect) {
    return App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, [title]), App.ui.el('p', {}, [subtitle])]),
      App.ui.el('div', { class: 'page-actions' }, [App.ui.el('div', { class: 'form-field', style: 'min-width:200px;margin:0;' }, [periodSelect])])
    ]);
  }

  function kpi(label, value) {
    return App.ui.el('div', { class: 'kpi-card' }, [App.ui.el('div', { class: 'kpi-label' }, [label]), App.ui.el('div', { class: 'kpi-value' }, [value])]);
  }

  // ---------------- Relatórios gerais (visão consolidada) ----------------

  function renderRelatorios(container) {
    var periodKey = 'mes';
    var periodSelect = periodPicker(function (k) { periodKey = k; load(); });
    container.innerHTML = '';
    container.appendChild(pageHeader('Relatórios', 'Visão consolidada de vendas, produtos e financeiro no período.', periodSelect));
    var content = App.ui.el('div', { id: 'rep-content' });
    container.appendChild(content);
    load();

    function load() {
      var range = analytics.getPeriodRange(periodKey);
      analytics.getSalesInPeriod(range).then(function (data) {
        var agg = analytics.aggregateByProduct(data.items);
        var totalRevenue = agg.reduce(function (s, i) { return s + i.revenue; }, 0);
        var totalProfit = agg.reduce(function (s, i) { return s + i.profit; }, 0);
        var totalQty = agg.reduce(function (s, i) { return s + i.qty; }, 0);
        var ticketMedio = data.sales.length > 0 ? totalRevenue / data.sales.length : 0;

        content.innerHTML = '';
        content.appendChild(App.ui.el('div', { class: 'kpi-grid' }, [
          kpi('Vendas no período', String(data.sales.length)),
          kpi('Faturamento', fmt.money(totalRevenue)),
          kpi('Lucro estimado', fmt.money(totalProfit)),
          kpi('Peças vendidas', String(totalQty)),
          kpi('Ticket médio', fmt.money(ticketMedio))
        ]));

        var top = agg.slice().sort(function (a, b) { return b.qty - a.qty; }).slice(0, 10);
        var bottom = agg.slice().sort(function (a, b) { return a.qty - b.qty; }).slice(0, 10);

        content.appendChild(App.ui.el('div', { class: 'form-grid cols-2' }, [
          rankingCard('🏆 Mais vendidos', top, 'qty'),
          rankingCard('🐢 Menos vendidos', bottom, 'qty')
        ]));
      });
    }
  }

  function rankingCard(title, rows, sortKey) {
    var body;
    if (rows.length === 0) {
      body = App.ui.el('p', { class: 'text-muted mt-0' }, ['Sem dados no período.']);
    } else {
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, ['Faturamento'])
      ])]));
      var tbody = App.ui.el('tbody');
      rows.forEach(function (r) {
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('strong', {}, [r.productName]), App.ui.el('div', { class: 'text-faint mono' }, [r.sku])]),
          App.ui.el('td', { class: 'mono' }, [String(r.qty)]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(r.revenue)])
        ]));
      });
      table.appendChild(tbody);
      body = App.ui.el('div', { class: 'table-wrap' }, [table]);
    }
    return App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, [title])]), App.ui.el('div', { class: 'card-body' }, [body])]);
  }

  // ---------------- Margens e lucro ----------------

  function renderMargens(container) {
    var periodKey = 'mes';
    var periodSelect = periodPicker(function (k) { periodKey = k; load(); });
    container.innerHTML = '';
    container.appendChild(pageHeader('Margens e lucro', 'Lucro sempre calculado a partir do custo histórico registrado na venda (unitCostAtSale) — nunca do custo atual do produto.', periodSelect));
    var actions = App.ui.el('div', { class: 'card-body' }, [App.ui.el('button', { class: 'btn btn-secondary', onclick: exportCsv }, ['⬇ Exportar CSV'])]);
    var content = App.ui.el('div', { id: 'rep-margens-content' });
    container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [actions]));
    container.appendChild(content);

    var currentAgg = [];
    load();

    function load() {
      var range = analytics.getPeriodRange(periodKey);
      analytics.getSalesInPeriod(range).then(function (data) {
        currentAgg = analytics.aggregateByProduct(data.items).sort(function (a, b) { return b.profit - a.profit; });
        renderTable();
      });
    }

    function renderTable() {
      content.innerHTML = '';
      if (currentAgg.length === 0) {
        content.appendChild(App.ui.el('p', { class: 'text-muted' }, ['Sem vendas no período.']));
        return;
      }
      var totalRevenue = currentAgg.reduce(function (s, i) { return s + i.revenue; }, 0);
      var totalCost = currentAgg.reduce(function (s, i) { return s + i.cost; }, 0);
      var totalProfit = totalRevenue - totalCost;
      content.appendChild(App.ui.el('div', { class: 'kpi-grid' }, [
        kpi('Faturamento', fmt.money(totalRevenue)),
        kpi('Custo (histórico)', fmt.money(totalCost)),
        kpi('Lucro', fmt.money(totalProfit)),
        kpi('Margem média', (totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0.0') + '%')
      ]));
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, ['Faturamento']),
        App.ui.el('th', {}, ['Custo']), App.ui.el('th', {}, ['Lucro']), App.ui.el('th', {}, ['Margem'])
      ])]));
      var tbody = App.ui.el('tbody');
      currentAgg.forEach(function (r) {
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('strong', {}, [r.productName]), App.ui.el('div', { class: 'text-faint mono' }, [r.sku])]),
          App.ui.el('td', { class: 'mono' }, [String(r.qty)]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(r.revenue)]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(r.cost)]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(r.profit)]),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (r.margin >= 40 ? 'badge-success' : (r.margin >= 15 ? 'badge-warning' : 'badge-danger')) }, [r.margin.toFixed(1) + '%'])])
        ]));
      });
      table.appendChild(tbody);
      content.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'table-wrap' }, [table])])]));
    }

    function exportCsv() {
      App.core.csv.download('margens-lucro.csv', [
        { label: 'Produto', value: 'productName' }, { label: 'SKU', value: 'sku' }, { label: 'Qtd', value: 'qty' },
        { label: 'Faturamento', value: function (r) { return r.revenue.toFixed(2); } },
        { label: 'Custo', value: function (r) { return r.cost.toFixed(2); } },
        { label: 'Lucro', value: function (r) { return r.profit.toFixed(2); } },
        { label: 'Margem (%)', value: function (r) { return r.margin.toFixed(1); } }
      ], currentAgg);
    }
  }

  // ---------------- Curva ABC ----------------

  function renderAbc(container) {
    var periodKey = 'mes';
    var periodSelect = periodPicker(function (k) { periodKey = k; load(); });
    container.innerHTML = '';
    container.appendChild(pageHeader('Curva ABC', 'Classificação de produtos por participação no faturamento (Pareto 80/15/5).', periodSelect));
    var actions = App.ui.el('div', { class: 'card-body' }, [App.ui.el('button', { class: 'btn btn-secondary', onclick: exportCsv }, ['⬇ Exportar CSV'])]);
    var content = App.ui.el('div', { id: 'rep-abc-content' });
    container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [actions]));
    container.appendChild(content);

    var currentAbc = [];
    load();

    function load() {
      var range = analytics.getPeriodRange(periodKey);
      analytics.getSalesInPeriod(range).then(function (data) {
        var agg = analytics.aggregateByProduct(data.items);
        currentAbc = analytics.computeCurveABC(agg);
        renderTable();
      });
    }

    function renderTable() {
      content.innerHTML = '';
      if (currentAbc.length === 0) {
        content.appendChild(App.ui.el('p', { class: 'text-muted' }, ['Sem vendas no período.']));
        return;
      }
      var counts = { A: 0, B: 0, C: 0 };
      currentAbc.forEach(function (r) { counts[r.classe]++; });
      content.appendChild(App.ui.el('div', { class: 'kpi-grid' }, [
        kpi('Classe A (foco)', counts.A + ' produto(s)'),
        kpi('Classe B', counts.B + ' produto(s)'),
        kpi('Classe C', counts.C + ' produto(s)')
      ]));
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Classe']), App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Faturamento']),
        App.ui.el('th', {}, ['% participação']), App.ui.el('th', {}, ['% acumulado'])
      ])]));
      var tbody = App.ui.el('tbody');
      var classBadge = { A: 'badge-success', B: 'badge-warning', C: 'badge-neutral' };
      currentAbc.forEach(function (r) {
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + classBadge[r.classe] }, [r.classe])]),
          App.ui.el('td', {}, [App.ui.el('strong', {}, [r.productName]), App.ui.el('div', { class: 'text-faint mono' }, [r.sku])]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(r.revenue)]),
          App.ui.el('td', { class: 'mono' }, [r.participacao.toFixed(1) + '%']),
          App.ui.el('td', { class: 'mono' }, [r.cumPct.toFixed(1) + '%'])
        ]));
      });
      table.appendChild(tbody);
      content.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'table-wrap' }, [table])])]));
    }

    function exportCsv() {
      App.core.csv.download('curva-abc.csv', [
        { label: 'Classe', value: 'classe' }, { label: 'Produto', value: 'productName' }, { label: 'SKU', value: 'sku' },
        { label: 'Faturamento', value: function (r) { return r.revenue.toFixed(2); } },
        { label: 'Participação (%)', value: function (r) { return r.participacao.toFixed(1); } },
        { label: 'Acumulado (%)', value: function (r) { return r.cumPct.toFixed(1); } }
      ], currentAbc);
    }
  }

  // ---------------- Giro de estoque ----------------

  function renderGiro(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Giro de estoque']), App.ui.el('p', {}, ['Classificação de todos os produtos ativos por velocidade de venda: 🔥 Alto giro (≤7d), 🟢 Saudável (≤30d), 🟡 Baixo (≤60d), 🔴 Encalhado (>60d).'])]),
      App.ui.el('div', { class: 'page-actions' }, [App.ui.el('button', { class: 'btn btn-secondary', onclick: exportCsv }, ['⬇ Exportar CSV'])])
    ]));
    var content = App.ui.el('div', { id: 'rep-giro-content' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(content);

    var currentRows = [];
    Promise.all([App.db.getAll('products'), App.core.stockEngine.calcularSaldoTodos()]).then(function (results) {
      var products = results[0].filter(function (p) { return p.active; });
      var stockMap = results[1];
      currentRows = products.map(function (p) {
        var qty = stockMap[p.id] || 0;
        return { product: p, qty: qty, giro: analytics.classifyGiro(p, qty) };
      }).sort(function (a, b) { return (a.giro.days == null ? 9999 : a.giro.days) - (b.giro.days == null ? 9999 : b.giro.days); });
      renderTable();
    });

    function renderTable() {
      content.innerHTML = '';
      var counts = {};
      currentRows.forEach(function (r) { counts[r.giro.key] = (counts[r.giro.key] || 0) + 1; });
      content.appendChild(App.ui.el('div', { class: 'kpi-grid' }, [
        kpi('🔥 Alto giro', String(counts.alto || 0)),
        kpi('🟢 Saudável', String(counts.saudavel || 0)),
        kpi('🟡 Baixo giro', String(counts.baixo || 0)),
        kpi('🔴 Encalhados', String(counts.encalhado || 0))
      ]));
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Estoque']), App.ui.el('th', {}, ['Classificação']), App.ui.el('th', {}, ['Dias sem venda'])
      ])]));
      var tbody = App.ui.el('tbody');
      currentRows.forEach(function (r) {
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('strong', {}, [r.product.name]), App.ui.el('div', { class: 'text-faint mono' }, [r.product.sku])]),
          App.ui.el('td', { class: 'mono' }, [String(r.qty)]),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + r.giro.badgeClass }, [r.giro.label])]),
          App.ui.el('td', { class: 'mono' }, [r.giro.days != null ? String(r.giro.days) : '—'])
        ]));
      });
      table.appendChild(tbody);
      content.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'table-wrap' }, [table])])]));
    }

    function exportCsv() {
      App.core.csv.download('giro-estoque.csv', [
        { label: 'Produto', value: function (r) { return r.product.name; } }, { label: 'SKU', value: function (r) { return r.product.sku; } },
        { label: 'Estoque', value: 'qty' }, { label: 'Classificação', value: function (r) { return r.giro.label; } },
        { label: 'Dias sem venda', value: function (r) { return r.giro.days != null ? r.giro.days : ''; } }
      ], currentRows);
    }
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.reports = { renderRelatorios: renderRelatorios, renderMargens: renderMargens, renderAbc: renderAbc, renderGiro: renderGiro };
})(window);
