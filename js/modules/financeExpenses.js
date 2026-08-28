/* AMÁH Brand — módulo Despesas (Fase 4) */
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
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Despesas']), App.ui.el('p', {}, ['Lançamentos de despesas operacionais por categoria.'])]),
      App.ui.el('div', { class: 'page-actions' }, [App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Nova despesa'])])
    ]));

    var body = App.ui.el('div', { class: 'card-body', id: 'exp-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Todas as despesas'])]), body]));
    loadList();
  }

  function loadList() {
    Promise.all([App.db.getAll('expenses'), App.db.getById('settings', 'expense_categories')]).then(function (results) {
      var expenses = results[0].sort(function (a, b) { return new Date(b.dueDate) - new Date(a.dueDate); });
      var categories = (results[1] && results[1].items) || [];
      renderList(expenses, categories);
    });
  }

  function renderList(expenses, categories) {
    var body = document.getElementById('exp-body');
    if (!body) return;
    var catById = {}; categories.forEach(function (c) { catById[c.id] = c.name; });
    if (expenses.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'empty-state' }, [App.ui.el('div', { class: 'icon' }, ['💸']), App.ui.el('h3', {}, ['Nenhuma despesa lançada'])]));
      return;
    }
    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Descrição']), App.ui.el('th', {}, ['Categoria']), App.ui.el('th', {}, ['Vencimento']),
      App.ui.el('th', {}, ['Valor']), App.ui.el('th', {}, ['Status']), App.ui.el('th', {}, [''])
    ])]));
    var tbody = App.ui.el('tbody');
    expenses.forEach(function (e) {
      var st = displayStatus(e);
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [e.description]),
        App.ui.el('td', {}, [catById[e.categoryId] || '—']),
        App.ui.el('td', {}, [fmt.dateBR(e.dueDate)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(e.amount)]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + st.cls }, [st.label])]),
        App.ui.el('td', { class: 'row-actions' }, [
          e.status === 'pendente' ? App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { markPaid(e); } }, ['Marcar pago']) : null
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function markPaid(expense) {
    App.core.cashEngine.getOpenSession().then(function (session) {
      var useCash = !!session;
      App.ui.confirmDialog({
        title: 'Marcar despesa como paga',
        message: useCash ? 'Isso também registrará uma saída no caixa aberto. Confirmar?' : 'Não há caixa aberto — a despesa será marcada como paga sem afetar o caixa. Confirmar?'
      }).then(function (confirmed) {
        if (!confirmed) return;
        var updated = Object.assign({}, expense, { status: 'pago', paidAt: fmt.nowIso() });
        var chain = App.db.put('expenses', updated);
        if (useCash) {
          chain = chain.then(function () { return App.core.cashEngine.registerMovement({ type: 'despesa', amount: expense.amount, description: expense.description, relatedDocument: expense.id }); });
        }
        chain.then(function () { App.ui.toast('Despesa paga.', 'success'); loadList(); }).catch(function (err) { App.ui.toast(err.message, 'error'); });
      });
    });
  }

  function openForm(existing) {
    App.db.getById('settings', 'expense_categories').then(function (doc) {
      var categories = (doc && doc.items.filter(function (c) { return c.active; })) || [];
      var descInput = App.ui.el('input', { id: 'exp-desc', value: (existing && existing.description) || '' });
      var catSelect = App.ui.el('select', { id: 'exp-cat' }, categories.map(function (c) {
        return App.ui.el('option', { value: c.id, selected: existing && existing.categoryId === c.id ? 'selected' : undefined }, [c.name]);
      }));
      var dueInput = App.ui.el('input', { id: 'exp-due', type: 'date', value: (existing && existing.dueDate) ? existing.dueDate.slice(0, 10) : new Date().toISOString().slice(0, 10) });
      var amountInput = App.ui.el('input', { id: 'exp-amount', type: 'number', step: '0.01', min: '0.01', value: (existing && existing.amount) || '' });
      var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });

      App.ui.openModal({
        title: existing ? 'Editar despesa' : 'Nova despesa',
        bodyNode: App.ui.el('div', {}, [errorBox, App.ui.el('div', { class: 'form-grid' }, [
          App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Descrição *']), descInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Categoria']), catSelect]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Vencimento']), dueInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Valor (R$) *']), amountInput])
        ])]),
        footerButtons: [
          { label: 'Cancelar', className: 'btn-secondary' },
          {
            label: existing ? 'Salvar' : 'Lançar despesa', className: 'btn-primary', onClick: function (close) {
              var description = descInput.value.trim();
              var amount = Number(amountInput.value);
              if (!description) { errorBox.textContent = 'Descrição é obrigatória.'; errorBox.classList.remove('hidden'); return; }
              if (!isFinite(amount) || amount <= 0) { errorBox.textContent = 'Valor deve ser maior que zero.'; errorBox.classList.remove('hidden'); return; }
              var record = existing ? Object.assign({}, existing) : { id: App.core.uuid(), status: 'pendente', paidAt: null, createdAt: fmt.nowIso() };
              record.description = description; record.categoryId = catSelect.value; record.dueDate = dueInput.value; record.amount = amount;
              App.db.put('expenses', record).then(function () { App.ui.toast('Despesa salva.', 'success'); close(); loadList(); });
            }
          }
        ]
      });
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.financeExpenses = { render: render, displayStatus: displayStatus };
})(window);
