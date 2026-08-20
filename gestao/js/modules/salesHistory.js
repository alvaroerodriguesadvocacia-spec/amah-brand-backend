/* AMÁH Brand — Histórico de vendas, cancelamento e devolução (Fase 3) */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Histórico de vendas']), App.ui.el('p', {}, ['Todas as vendas registradas, incluindo canceladas.'])]),
      App.ui.el('div', { class: 'page-actions' }, [App.ui.el('button', { class: 'btn btn-secondary', onclick: exportCsv }, ['⬇ Exportar CSV'])])
    ]));

    var statusFilter = App.ui.el('select', { id: 'sh-status' }, [
      App.ui.el('option', { value: '' }, ['Todos os status']),
      App.ui.el('option', { value: 'concluida' }, ['Concluídas']),
      App.ui.el('option', { value: 'cancelada' }, ['Canceladas'])
    ]);
    var searchInput = App.ui.el('input', { id: 'sh-search', placeholder: 'Buscar por número da venda ou cliente…' });
    container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Status']), statusFilter]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Busca']), searchInput])
      ])])
    ]));

    var body = App.ui.el('div', { class: 'card-body', id: 'sh-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Vendas'])]), body]));

    var allSales = [], customersById = {};

    Promise.all([App.db.getAll('sales'), App.db.getAll('customers')]).then(function (results) {
      allSales = results[0].sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      results[1].forEach(function (c) { customersById[c.id] = c; });
      renderTable();
    });

    statusFilter.addEventListener('change', renderTable);
    searchInput.addEventListener('input', renderTable);

    function filtered() {
      var status = statusFilter.value, term = searchInput.value.toLowerCase();
      return allSales.filter(function (s) {
        if (status && s.status !== status) return false;
        if (term) {
          var custName = s.customerId && customersById[s.customerId] ? customersById[s.customerId].name.toLowerCase() : '';
          if (s.number.toLowerCase().indexOf(term) === -1 && custName.indexOf(term) === -1) return false;
        }
        return true;
      });
    }

    function renderTable() {
      var body = document.getElementById('sh-body');
      if (!body) return;
      var rows = filtered();
      if (rows.length === 0) {
        body.innerHTML = '';
        body.appendChild(App.ui.el('div', { class: 'table-empty' }, ['Nenhuma venda encontrada.']));
        return;
      }
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Número']), App.ui.el('th', {}, ['Data']), App.ui.el('th', {}, ['Cliente']),
        App.ui.el('th', {}, ['Total']), App.ui.el('th', {}, ['Status']), App.ui.el('th', {}, [''])
      ])]));
      var tbody = App.ui.el('tbody');
      rows.forEach(function (s) {
        var cust = s.customerId && customersById[s.customerId] ? customersById[s.customerId].name : '—';
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', { class: 'mono' }, [s.number]),
          App.ui.el('td', {}, [fmt.dateTimeBR(s.createdAt)]),
          App.ui.el('td', {}, [cust]),
          App.ui.el('td', { class: 'mono' }, [fmt.money(s.total)]),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (s.status === 'concluida' ? 'badge-success' : 'badge-danger') }, [s.status === 'concluida' ? 'Concluída' : 'Cancelada'])]),
          App.ui.el('td', { class: 'row-actions' }, [App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { openDetail(s.id); } }, ['Ver detalhes'])])
        ]));
      });
      table.appendChild(tbody);
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    }

    function exportCsv() {
      App.core.csv.download('vendas.csv', [
        { label: 'Número', value: 'number' }, { label: 'Data', value: function (s) { return fmt.dateTimeBR(s.createdAt); } },
        { label: 'Cliente', value: function (s) { return s.customerId && customersById[s.customerId] ? customersById[s.customerId].name : ''; } },
        { label: 'Subtotal', value: function (s) { return s.subtotal; } }, { label: 'Desconto', value: function (s) { return s.discountTotal; } },
        { label: 'Total', value: function (s) { return s.total; } }, { label: 'Status', value: 'status' }
      ], filtered());
    }
  }

  function openDetail(saleId) {
    Promise.all([
      App.db.getById('sales', saleId),
      App.db.getByIndex('sale_items', 'saleId', saleId),
      App.db.getByIndex('payments', 'saleId', saleId)
    ]).then(function (results) {
      var sale = results[0], items = results[1], payments = results[2];
      if (!sale) { App.ui.toast('Venda não encontrada.', 'error'); return; }
      var custName = null;
      var bodyContainer = App.ui.el('div');
      renderDetailBody(bodyContainer, sale, items, payments);

      var modalRef = App.ui.openModal({
        title: 'Venda ' + sale.number,
        size: 'wide',
        bodyNode: bodyContainer,
        footerButtons: sale.status === 'concluida'
          ? [
              { label: 'Fechar', className: 'btn-secondary' },
              { label: 'Cancelar venda', className: 'btn-danger', onClick: function (close) { openCancelDialog(sale, function () { close(); render(document.getElementById('view-container')); }); } }
            ]
          : [{ label: 'Fechar', className: 'btn-secondary' }]
      });
      void modalRef; void custName;
    });
  }

  function renderDetailBody(container, sale, items, payments) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'form-grid cols-3', style: 'margin-bottom:16px;' }, [
      infoBlock('Status', sale.status === 'concluida' ? 'Concluída' : ('Cancelada — ' + (sale.cancelReason || ''))),
      infoBlock('Data', fmt.dateTimeBR(sale.createdAt)),
      infoBlock('Total', fmt.money(sale.total))
    ]));

    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, ['Devolvido']),
      App.ui.el('th', {}, ['Unitário']), App.ui.el('th', {}, ['Total']), App.ui.el('th', {}, [''])
    ])]));
    var tbody = App.ui.el('tbody');
    items.forEach(function (it) {
      var canReturn = sale.status === 'concluida' && (it.qty - (it.returnedQty || 0)) > 0;
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [App.ui.el('strong', {}, [it.productName]), App.ui.el('div', { class: 'text-faint mono' }, [it.sku])]),
        App.ui.el('td', { class: 'mono' }, [String(it.qty)]),
        App.ui.el('td', { class: 'mono' }, [String(it.returnedQty || 0)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(it.unitPrice)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(it.total)]),
        App.ui.el('td', {}, [canReturn ? App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openReturnDialog(sale, it, container); } }, ['Devolver']) : null])
      ]));
    });
    table.appendChild(tbody);
    container.appendChild(App.ui.el('div', { class: 'table-wrap', style: 'margin-bottom:16px;' }, [table]));

    container.appendChild(App.ui.el('h4', {}, ['Pagamentos']));
    var payTable = App.ui.el('table', { class: 'data-table' });
    payTable.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Forma']), App.ui.el('th', {}, ['Bruto']), App.ui.el('th', {}, ['Taxa']), App.ui.el('th', {}, ['Líquido'])
    ])]));
    var payBody = App.ui.el('tbody');
    payments.forEach(function (p) {
      payBody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [p.methodName]), App.ui.el('td', { class: 'mono' }, [fmt.money(p.grossAmount)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(p.feeAmount)]), App.ui.el('td', { class: 'mono' }, [fmt.money(p.netAmount)])
      ]));
    });
    payTable.appendChild(payBody);
    container.appendChild(App.ui.el('div', { class: 'table-wrap' }, [payTable]));
  }

  function infoBlock(label, value) {
    return App.ui.el('div', {}, [
      App.ui.el('div', { class: 'text-faint', style: 'font-size:11.5px; text-transform:uppercase; font-weight:700; margin-bottom:3px;' }, [label]),
      App.ui.el('div', { style: 'font-weight:600;' }, [value])
    ]);
  }

  function openCancelDialog(sale, onDone) {
    var reasonInput = App.ui.el('input', { id: 'cancel-reason', placeholder: 'Ex.: Erro de digitação, cliente desistiu...' });
    App.ui.openModal({
      title: 'Cancelar venda ' + sale.number,
      size: 'sm',
      bodyNode: App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('p', { class: 'mt-0' }, ['O estoque será estornado automaticamente. A venda original é preservada para auditoria.']),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Motivo *']), reasonInput])
      ]),
      footerButtons: [
        { label: 'Voltar', className: 'btn-secondary' },
        {
          label: 'Confirmar cancelamento', className: 'btn-danger', onClick: function (close) {
            App.core.salesEngine.cancelSale(sale.id, reasonInput.value.trim()).then(function () {
              App.ui.toast('Venda cancelada.', 'success');
              close();
              onDone();
            }).catch(function (err) { App.ui.toast(err.message, 'error'); });
          }
        }
      ]
    });
  }

  function openReturnDialog(sale, item, refreshContainer) {
    var qtyInput = App.ui.el('input', { id: 'return-qty', type: 'number', min: '1', max: String(item.qty - (item.returnedQty || 0)), value: '1' });
    var reasonInput = App.ui.el('input', { id: 'return-reason', placeholder: 'Ex.: Peça com defeito, cliente não gostou...' });
    App.ui.openModal({
      title: 'Devolver "' + item.productName + '"',
      size: 'sm',
      bodyNode: App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Quantidade a devolver (disponível: ' + (item.qty - (item.returnedQty || 0)) + ')']), qtyInput]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Motivo *']), reasonInput])
      ]),
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: 'Confirmar devolução', className: 'btn-primary', onClick: function (close) {
            App.core.salesEngine.returnSaleItem({ saleItemId: item.id, qty: Number(qtyInput.value), reason: reasonInput.value.trim() }).then(function () {
              App.ui.toast('Devolução registrada. Estoque atualizado.', 'success');
              close();
              openDetail(sale.id);
            }).catch(function (err) { App.ui.toast(err.message, 'error'); });
          }
        }
      ]
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.salesHistory = { render: render, openDetail: openDetail };
})(window);
