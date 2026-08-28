/* AMÁH Brand — Dashboard
 * Fase 1: todos os números vêm de dados reais (produtos, categorias,
 * fornecedores e estoque calculado). Indicadores financeiros/vendas
 * (faturamento, lucro, caixa, contas a receber/pagar) chegam nas Fases 3-4
 * e aparecem aqui como cards sinalizados "Em breve" — nunca com valor fixo.
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Dashboard']),
        App.ui.el('p', {}, ['Visão geral com dados reais do seu estoque. Indicadores de vendas e financeiro chegam nas próximas fases.'])
      ])
    ]));

    var kpiGrid = App.ui.el('div', { class: 'kpi-grid', id: 'dash-kpis' }, [
      App.ui.el('div', { class: 'kpi-card' }, [App.ui.el('div', { class: 'kpi-label' }, ['Carregando…'])])
    ]);
    container.appendChild(kpiGrid);

    var futureRow = App.ui.el('div', { class: 'kpi-grid', style: 'margin-bottom:22px;' }, [
      futureCard('Faturamento hoje', 'Fase 3'),
      futureCard('Lucro bruto do mês', 'Fase 3'),
      futureCard('Saldo de caixa', 'Fase 4'),
      futureCard('Contas a receber', 'Fase 4'),
      futureCard('Contas a pagar', 'Fase 4')
    ]);
    container.appendChild(futureRow);

    var marginCard = App.ui.el('div', { class: 'card', id: 'margin-card', style: 'margin-bottom:22px;' });
    container.appendChild(marginCard);

    var lowStockCard = App.ui.el('div', { class: 'card', id: 'low-stock-card' });
    container.appendChild(lowStockCard);

    loadData(kpiGrid, lowStockCard, marginCard);
  }

  function futureCard(label, phase) {
    return App.ui.el('div', { class: 'kpi-card', style: 'opacity:0.6;' }, [
      App.ui.el('div', { class: 'kpi-label' }, [label]),
      App.ui.el('div', { class: 'kpi-value', style: 'font-size:15px;' }, ['— ']),
      App.ui.el('div', { class: 'kpi-sub' }, ['Disponível na ' + phase])
    ]);
  }

  function loadData(kpiGrid, lowStockCard, marginCard) {
    Promise.all([
      App.db.getAll('products'),
      App.db.getAll('categories'),
      App.db.getAll('suppliers'),
      App.core.stockEngine.calcularSaldoTodos(),
      App.db.getById('settings', 'company')
    ]).then(function (results) {
      var products = results[0];
      var categories = results[1];
      var suppliers = results[2];
      var stockMap = results[3];
      var company = results[4];
      var idealMargin = company && company.idealMarginPercent != null ? Number(company.idealMarginPercent) || 0 : 65;

      var activeProducts = products.filter(function (p) { return p.active; });
      var costValue = 0, retailValue = 0, belowMin = [], outOfStock = 0, belowMargin = [];

      products.forEach(function (p) {
        var qty = stockMap[p.id] || 0;
        var totalCost = (Number(p.cost) || 0) + (Number(p.additionalCosts) || 0);
        costValue += qty * totalCost;
        retailValue += qty * (Number(p.retailPrice) || 0);
        if (qty <= 0) outOfStock++;
        else if (p.minStock != null && qty <= p.minStock) belowMin.push({ product: p, qty: qty });

        if (p.active && Number(p.retailPrice) > 0 && totalCost > 0) {
          var margin = ((Number(p.retailPrice) - totalCost) / Number(p.retailPrice)) * 100;
          if (margin < idealMargin) {
            var suggestedPrice = idealMargin < 100 ? totalCost / (1 - idealMargin / 100) : null;
            belowMargin.push({ product: p, totalCost: totalCost, margin: margin, suggestedPrice: suggestedPrice });
          }
        }
      });

      var overallMargin = retailValue > 0 ? ((retailValue - costValue) / retailValue) * 100 : 0;

      kpiGrid.innerHTML = '';
      [
        { label: '📦 Produtos cadastrados', value: String(products.length), sub: activeProducts.length + ' ativos' },
        { label: '🏷️ Categorias', value: String(categories.length) },
        { label: '🚚 Fornecedores', value: String(suppliers.length) },
        { label: '💰 Valor do estoque a custo', value: fmt.money(costValue) },
        { label: '💎 Valor potencial de venda', value: fmt.money(retailValue), sub: retailValue > 0 ? 'Margem potencial: ' + fmt.percent(overallMargin) : '' },
        { label: '🚫 Produtos sem estoque', value: String(outOfStock) },
      ].forEach(function (kpi) {
        kpiGrid.appendChild(App.ui.el('div', { class: 'kpi-card' }, [
          App.ui.el('div', { class: 'kpi-label' }, [kpi.label]),
          App.ui.el('div', { class: 'kpi-value' }, [kpi.value]),
          kpi.sub ? App.ui.el('div', { class: 'kpi-sub' }, [kpi.sub]) : null
        ]));
      });
      kpiGrid.appendChild(App.ui.el('div', { class: 'kpi-card' + (belowMin.length > 0 ? ' alert' : '') }, [
        App.ui.el('div', { class: 'kpi-label' }, ['⚠️ Abaixo do estoque mínimo']),
        App.ui.el('div', { class: 'kpi-value' }, [String(belowMin.length)])
      ]));

      renderLowStock(lowStockCard, belowMin);
      renderMargin(marginCard, idealMargin, overallMargin, belowMargin);
    });
  }

  function renderMargin(card, idealMargin, overallMargin, belowMargin) {
    card.innerHTML = '';
    card.appendChild(App.ui.el('div', { class: 'card-header' }, [
      App.ui.el('h2', {}, ['💹 Custos e margem de lucro']),
      App.ui.el('a', { href: '#/configuracoes' }, ['Ajustar margem ideal →'])
    ]));
    var body = App.ui.el('div', { class: 'card-body' });

    var summary = App.ui.el('div', { class: 'kpi-grid', style: 'margin-bottom:16px;' }, [
      App.ui.el('div', { class: 'kpi-card' }, [
        App.ui.el('div', { class: 'kpi-label' }, ['Margem média atual do estoque']),
        App.ui.el('div', { class: 'kpi-value' }, [fmt.percent(overallMargin)])
      ]),
      App.ui.el('div', { class: 'kpi-card' }, [
        App.ui.el('div', { class: 'kpi-label' }, ['Margem ideal configurada']),
        App.ui.el('div', { class: 'kpi-value' }, [fmt.percent(idealMargin)]),
        App.ui.el('div', { class: 'kpi-sub' }, ['Em Configurações → Empresa'])
      ]),
      App.ui.el('div', { class: 'kpi-card' + (belowMargin.length > 0 ? ' alert' : '') }, [
        App.ui.el('div', { class: 'kpi-label' }, ['⚠️ Peças abaixo da margem ideal']),
        App.ui.el('div', { class: 'kpi-value' }, [String(belowMargin.length)])
      ])
    ]);
    body.appendChild(summary);

    if (belowMargin.length === 0) {
      body.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhum produto ativo com preço abaixo da margem ideal. 🎉']));
    } else {
      body.appendChild(App.ui.el('p', { class: 'text-muted' }, [
        'O custo total de cada peça considera o campo "Custos adicionais" do cadastro do produto — inclua ali o valor de embalagem/caixinha para que a margem já saia correta.'
      ]));
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Custo total']), App.ui.el('th', {}, ['Preço atual']),
        App.ui.el('th', {}, ['Margem atual']), App.ui.el('th', {}, ['Preço sugerido'])
      ])]));
      var tbody = App.ui.el('tbody');
      belowMargin.sort(function (a, b) { return a.margin - b.margin; }).forEach(function (item) {
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('strong', {}, [item.product.name]), App.ui.el('div', { class: 'text-faint mono' }, [item.product.sku])]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(item.totalCost)]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(Number(item.product.retailPrice) || 0)]),
          App.ui.el('td', { class: 'mono' }, [fmt.percent(item.margin)]),
          App.ui.el('td', { class: 'mono' }, [item.suggestedPrice != null ? fmt.money(item.suggestedPrice) : '—'])
        ]));
      });
      table.appendChild(tbody);
      body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    }
    card.appendChild(body);
  }

  function renderLowStock(card, belowMin) {
    card.innerHTML = '';
    card.appendChild(App.ui.el('div', { class: 'card-header' }, [
      App.ui.el('h2', {}, ['Produtos abaixo do estoque mínimo']),
      App.ui.el('a', { href: '#/produtos' }, ['Ver todos os produtos →'])
    ]));
    var body = App.ui.el('div', { class: 'card-body' });
    if (belowMin.length === 0) {
      body.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhum produto abaixo do estoque mínimo. 🎉']));
    } else {
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Estoque atual']), App.ui.el('th', {}, ['Mínimo']),
        App.ui.el('th', {}, ['Ideal']), App.ui.el('th', {}, ['Sugestão de compra'])
      ])]));
      var tbody = App.ui.el('tbody');
      belowMin.sort(function (a, b) { return a.qty - b.qty; }).forEach(function (item) {
        var suggestion = item.product.idealStock != null ? Math.max(0, item.product.idealStock - item.qty) : null;
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('strong', {}, [item.product.name]), App.ui.el('div', { class: 'text-faint mono' }, [item.product.sku])]),
          App.ui.el('td', { class: 'mono' }, [String(item.qty)]),
          App.ui.el('td', { class: 'mono' }, [String(item.product.minStock)]),
          App.ui.el('td', { class: 'mono' }, [item.product.idealStock != null ? String(item.product.idealStock) : '—']),
          App.ui.el('td', { class: 'mono' }, [suggestion != null ? String(suggestion) + ' un.' : '—'])
        ]));
      });
      table.appendChild(tbody);
      body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    }
    card.appendChild(body);
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.dashboard = { render: render };
})(window);
