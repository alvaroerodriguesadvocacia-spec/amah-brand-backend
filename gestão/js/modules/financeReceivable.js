/* AMÁH Brand — módulo Contas a Receber (Fase 4)
 * Registros são gerados automaticamente pelo PDV para formas de pagamento
 * "a prazo"/"boleto" (ver SalesEngine); esta tela permite consultar e dar baixa.
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function isOverdue(r) { return r.status === 'pendente' && r.dueDate && new Date(r.dueDate) < new Date(); }
  function displayStatus(r) {
    if (r.status === 'pago') return { label: 'Pago', cls: 'badge-success' };
    if (r.status === 'cancelado') return { label: 'Cancelado', cls: 'badge-neutral' };
    if (isOverdue(r)) return { label: 'Vencido', cls: 'badge-danger' };
    return { label: 'Pendente', cls: 'badge-warning' };
  }

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Contas a receber']), App.ui.el('p', {}, ['Vendas a prazo/boleto geram estes lançamentos automaticamente.'])])
    ]));
    var body = App.ui.el('div', { class: 'card-body', id: 'ar-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Recebimentos'])]), body]));
    loadList();
  }

  function loadList() {
    Promise.all([App.db.getAll('accounts_receivable'), App.db.getAll('customers'), App.db.getAll('sales')]).then(function (results) {
      var receivables = results[0].sort(function (a, b) { return new Date(a.dueDate) - new Date(b.dueDate); });
      var custById = {}; results[1].forEach(function (c) { custById[c.id] = c.name; });
      var saleById = {}; results[2].forEach(function (s) { saleById[s.id] = s.number; });
      renderList(receivables, custById, saleById);
    });
  }

  function renderList(receivables, custById, saleById) {
    var body = document.getElementById('ar-body');
    if (!body) return;
    if (receivables.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhum lançamento de contas a receber.']));
      return;
    }
    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Cliente']), App.ui.el('th', {}, ['Venda']), App.ui.el('th', {}, ['Vencimento']),
      App.ui.el('th', {}, ['Valor']), App.ui.el('th', {}, ['Status']), App.ui.el('th', {}, [''])
    ])]));
    var tbody = App.ui.el('tbody');
    receivables.forEach(function (r) {
      var st = displayStatus(r);
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [r.customerId ? (custById[r.customerId] || '—') : 'Não identificado']),
        App.ui.el('td', { class: 'mono' }, [r.saleId ? (saleById[r.saleId] || '—') : '—']),
        App.ui.el('td', {}, [fmt.dateBR(r.dueDate)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(r.amount)]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + st.cls }, [st.label])]),
        App.ui.el('td', { class: 'row-actions' }, [
          r.status === 'pendente' ? App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { receive(r); } }, ['Dar baixa']) : null
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function receive(receivable) {
    App.core.cashEngine.getOpenSession().then(function (session) {
      var useCash = !!session;
      App.ui.confirmDialog({
        title: 'Confirmar recebimento',
        message: (useCash ? 'Isso registrará uma entrada de ' + fmt.money(receivable.amount) + ' no caixa aberto. ' : 'Não há caixa aberto — o recebimento será apenas registrado. ') + 'Confirmar?'
      }).then(function (confirmed) {
        if (!confirmed) return;
        var updated = Object.assign({}, receivable, { status: 'pago', paidAt: fmt.nowIso(), paidAmount: receivable.amount });
        var chain = App.db.put('accounts_receivable', updated);
        if (useCash) {
          chain = chain.then(function () { return App.core.cashEngine.registerMovement({ type: 'entrada', amount: receivable.amount, description: 'Recebimento de conta a receber', relatedDocument: receivable.id }); });
        }
        chain.then(function () { App.ui.toast('Recebimento registrado.', 'success'); loadList(); }).catch(function (err) { App.ui.toast(err.message, 'error'); });
      });
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.financeReceivable = { render: render, displayStatus: displayStatus };
})(window);
