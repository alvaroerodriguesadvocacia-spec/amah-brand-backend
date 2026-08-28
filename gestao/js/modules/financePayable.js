/* AMÁH Brand — módulo Contas a Pagar (Fase 4)
 * Alimentado pelo recebimento de compras (Fase 5) e por lançamentos manuais
 * (fornecedor/credor avulso).
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
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Contas a pagar']), App.ui.el('p', {}, ['Compromissos com fornecedores e credores.'])]),
      App.ui.el('div', { class: 'page-actions' }, [App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(); } }, ['+ Novo lançamento'])])
    ]));
    var body = App.ui.el('div', { class: 'card-body', id: 'ap-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Pagamentos'])]), body]));
    loadList();
  }

  function loadList() {
    Promise.all([App.db.getAll('accounts_payable'), App.db.getAll('suppliers')]).then(function (results) {
      var payables = results[0].sort(function (a, b) { return new Date(a.dueDate) - new Date(b.dueDate); });
      var supById = {}; results[1].forEach(function (s) { supById[s.id] = s.name; });
      renderList(payables, supById);
    });
  }

  function renderList(payables, supById) {
    var body = document.getElementById('ap-body');
    if (!body) return;
    if (payables.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhum lançamento de contas a pagar.']));
      return;
    }
    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Fornecedor/Credor']), App.ui.el('th', {}, ['Descrição']), App.ui.el('th', {}, ['Vencimento']),
      App.ui.el('th', {}, ['Valor']), App.ui.el('th', {}, ['Status']), App.ui.el('th', {}, [''])
    ])]));
    var tbody = App.ui.el('tbody');
    payables.forEach(function (p) {
      var st = displayStatus(p);
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [p.supplierId ? (supById[p.supplierId] || '—') : (p.creditorName || '—')]),
        App.ui.el('td', {}, [p.description]),
        App.ui.el('td', {}, [fmt.dateBR(p.dueDate)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(p.amount)]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + st.cls }, [st.label])]),
        App.ui.el('td', { class: 'row-actions' }, [
          p.status === 'pendente' ? App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { pay(p); } }, ['Dar baixa']) : null
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function pay(payable) {
    App.core.cashEngine.getOpenSession().then(function (session) {
      var useCash = !!session;
      App.ui.confirmDialog({
        title: 'Confirmar pagamento',
        message: (useCash ? 'Isso registrará uma saída de ' + fmt.money(payable.amount) + ' no caixa aberto. ' : 'Não há caixa aberto — o pagamento será apenas registrado. ') + 'Confirmar?'
      }).then(function (confirmed) {
        if (!confirmed) return;
        var updated = Object.assign({}, payable, { status: 'pago', paidAt: fmt.nowIso(), paidAmount: payable.amount });
        var chain = App.db.put('accounts_payable', updated);
        if (useCash) {
          chain = chain.then(function () { return App.core.cashEngine.registerMovement({ type: 'despesa', amount: payable.amount, description: payable.description, relatedDocument: payable.id }); });
        }
        chain.then(function () { App.ui.toast('Pagamento registrado.', 'success'); loadList(); }).catch(function (err) { App.ui.toast(err.message, 'error'); });
      });
    });
  }

  function openForm() {
    App.db.getAll('suppliers').then(function (suppliers) {
      var supSelect = App.ui.el('select', { id: 'ap-supplier' }, [App.ui.el('option', { value: '' }, ['(nenhum — credor avulso)'])].concat(
        suppliers.filter(function (s) { return s.active; }).map(function (s) { return App.ui.el('option', { value: s.id }, [s.name]); })
      ));
      var creditorInput = App.ui.el('input', { id: 'ap-creditor', placeholder: 'Nome do credor (se não for fornecedor cadastrado)' });
      var descInput = App.ui.el('input', { id: 'ap-desc' });
      var dueInput = App.ui.el('input', { id: 'ap-due', type: 'date', value: new Date().toISOString().slice(0, 10) });
      var amountInput = App.ui.el('input', { id: 'ap-amount', type: 'number', step: '0.01', min: '0.01' });
      var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });

      App.ui.openModal({
        title: 'Novo lançamento — contas a pagar',
        bodyNode: App.ui.el('div', {}, [errorBox, App.ui.el('div', { class: 'form-grid' }, [
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Fornecedor']), supSelect]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Ou credor avulso']), creditorInput]),
          App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Descrição *']), descInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Vencimento']), dueInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Valor (R$) *']), amountInput])
        ])]),
        footerButtons: [
          { label: 'Cancelar', className: 'btn-secondary' },
          {
            label: 'Lançar', className: 'btn-primary', onClick: function (close) {
              var description = descInput.value.trim();
              var amount = Number(amountInput.value);
              if (!description) { errorBox.textContent = 'Descrição é obrigatória.'; errorBox.classList.remove('hidden'); return; }
              if (!isFinite(amount) || amount <= 0) { errorBox.textContent = 'Valor deve ser maior que zero.'; errorBox.classList.remove('hidden'); return; }
              var record = {
                id: App.core.uuid(), supplierId: supSelect.value || null, creditorName: creditorInput.value.trim(),
                purchaseId: null, categoryId: null, description: description, dueDate: dueInput.value, amount: amount,
                status: 'pendente', paidAt: null, paidAmount: 0, createdAt: fmt.nowIso()
              };
              App.db.put('accounts_payable', record).then(function () { App.ui.toast('Lançamento criado.', 'success'); close(); loadList(); });
            }
          }
        ]
      });
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.financePayable = { render: render, displayStatus: displayStatus };
})(window);
