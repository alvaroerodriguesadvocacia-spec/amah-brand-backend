/* AMÁH Brand — módulo Fluxo de Caixa (Fase 4) — relatório por período */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var analytics = App.core.analytics;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Fluxo de caixa']), App.ui.el('p', {}, ['Entradas e saídas de caixa consolidadas por período.'])])
    ]));

    var periodSelect = App.ui.el('select', { id: 'ff-period' }, Object.keys(analytics.PERIOD_LABELS).map(function (k) {
      return App.ui.el('option', { value: k, selected: k === 'mes' ? 'selected' : undefined }, [analytics.PERIOD_LABELS[k]]);
    }));
    container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'form-field', style: 'max-width:260px;' }, [App.ui.el('label', {}, ['Período']), periodSelect])])
    ]));

    var content = App.ui.el('div', { id: 'ff-content' });
    container.appendChild(content);

    periodSelect.addEventListener('change', load);
    load();

    function load() {
      var range = analytics.getPeriodRange(periodSelect.value);
      App.db.getAll('cash_movements').then(function (movements) {
        var inRange = movements.filter(function (m) { return analytics.inRange(m.createdAt, range); });
        var entradas = inRange.filter(function (m) { return m.direction > 0; }).reduce(function (s, m) { return s + m.amount; }, 0);
        var saidas = inRange.filter(function (m) { return m.direction < 0; }).reduce(function (s, m) { return s + m.amount; }, 0);

        content.innerHTML = '';
        content.appendChild(App.ui.el('div', { class: 'kpi-grid' }, [
          kpi('Entradas no período', fmt.money(entradas)),
          kpi('Saídas no período', fmt.money(saidas)),
          kpi('Resultado do período', fmt.money(entradas - saidas))
        ]));

        var byType = {};
        inRange.forEach(function (m) { byType[m.type] = (byType[m.type] || 0) + m.direction * m.amount; });
        var typeTable = App.ui.el('table', { class: 'data-table' });
        typeTable.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [App.ui.el('th', {}, ['Tipo']), App.ui.el('th', {}, ['Total'])])]));
        var typeBody = App.ui.el('tbody');
        Object.keys(byType).forEach(function (t) {
          typeBody.appendChild(App.ui.el('tr', {}, [App.ui.el('td', {}, [t]), App.ui.el('td', { class: 'mono' }, [fmt.money(byType[t])])]));
        });
        typeTable.appendChild(typeBody);
        content.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
          App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Por tipo de movimentação'])]),
          App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'table-wrap' }, [typeTable])])
        ]));

        var logTable = App.ui.el('table', { class: 'data-table' });
        logTable.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
          App.ui.el('th', {}, ['Data']), App.ui.el('th', {}, ['Tipo']), App.ui.el('th', {}, ['Descrição']), App.ui.el('th', {}, ['Valor'])
        ])]));
        var logBody = App.ui.el('tbody');
        inRange.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).forEach(function (m) {
          logBody.appendChild(App.ui.el('tr', {}, [
            App.ui.el('td', {}, [fmt.dateTimeBR(m.createdAt)]),
            App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (m.direction > 0 ? 'badge-success' : 'badge-danger') }, [m.type])]),
            App.ui.el('td', { class: 'text-muted' }, [m.description || '—']),
            App.ui.el('td', { class: 'mono' }, [(m.direction > 0 ? '+ ' : '− ') + fmt.money(m.amount)])
          ]));
        });
        logTable.appendChild(logBody);
        content.appendChild(App.ui.el('div', { class: 'card' }, [
          App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Movimentações do período'])]),
          App.ui.el('div', { class: 'card-body' }, [inRange.length ? App.ui.el('div', { class: 'table-wrap' }, [logTable]) : App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhuma movimentação neste período.'])])
        ]));
      });
    }
  }

  function kpi(label, value) {
    return App.ui.el('div', { class: 'kpi-card' }, [App.ui.el('div', { class: 'kpi-label' }, [label]), App.ui.el('div', { class: 'kpi-value' }, [value])]);
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.financeFlow = { render: render };
})(window);
