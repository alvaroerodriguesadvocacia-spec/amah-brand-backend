/* AMÁH Brand — módulo Clientes */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Clientes']),
        App.ui.el('p', {}, ['Cadastro de clientes e histórico de compras.'])
      ]),
      App.ui.el('div', { class: 'page-actions' }, [
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Novo cliente'])
      ])
    ]));

    var body = App.ui.el('div', { class: 'card-body', id: 'customers-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Todos os clientes'])]),
      body
    ]));
    loadList();
  }

  function loadList() {
    App.db.getAll('customers').then(function (customers) {
      renderList(customers.sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'pt-BR'); }));
    });
  }

  function renderList(customers) {
    var body = document.getElementById('customers-body');
    if (!body) return;
    if (customers.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'empty-state' }, [
        App.ui.el('div', { class: 'icon' }, ['👥']),
        App.ui.el('h3', {}, ['Nenhum cliente cadastrado']),
        App.ui.el('p', {}, ['Clientes podem ser cadastrados aqui ou diretamente durante uma venda no PDV.']),
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Novo cliente'])
      ]));
      return;
    }
    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Nome']), App.ui.el('th', {}, ['Contato']), App.ui.el('th', {}, ['Tipo']),
      App.ui.el('th', {}, ['Total comprado']), App.ui.el('th', {}, ['Ticket médio']), App.ui.el('th', {}, ['Última compra']), App.ui.el('th', {}, [''])
    ])]));
    var tbody = App.ui.el('tbody');
    customers.forEach(function (c) {
      var ticket = c.purchaseCount > 0 ? (c.totalPurchased || 0) / c.purchaseCount : 0;
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [App.ui.el('strong', {}, [c.name]), c.type ? App.ui.el('div', { class: 'text-faint' }, [c.type === 'atacado' ? 'Atacado' : 'Varejo']) : null]),
        App.ui.el('td', {}, [c.phone || c.whatsapp || c.email || '—']),
        App.ui.el('td', {}, [c.city || '—']),
        App.ui.el('td', { class: 'mono' }, [fmt.money(c.totalPurchased || 0)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(ticket)]),
        App.ui.el('td', {}, [fmt.dateBR(c.lastPurchaseAt)]),
        App.ui.el('td', { class: 'row-actions' }, [
          App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { openForm(c); } }, ['Editar'])
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function openForm(existing, onCreated) {
    var isEdit = !!existing;
    function field(id, label, value, type) {
      return App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, [label]), App.ui.el('input', { id: id, value: value || '', type: type || 'text' })]);
    }
    var form = App.ui.el('div', { class: 'form-grid' }, [
      field('cu-name', 'Nome *', existing && existing.name),
      field('cu-doc', 'CPF/CNPJ', existing && existing.cnpjCpf),
      field('cu-phone', 'Telefone', existing && existing.phone),
      field('cu-whatsapp', 'WhatsApp', existing && existing.whatsapp),
      field('cu-email', 'E-mail', existing && existing.email, 'email'),
      field('cu-city', 'Cidade', existing && existing.city),
      App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Endereço']), App.ui.el('input', { id: 'cu-address', value: (existing && existing.address) || '' })]),
      App.ui.el('div', { class: 'form-field' }, [
        App.ui.el('label', {}, ['Tipo']),
        App.ui.el('select', { id: 'cu-type' }, [
          App.ui.el('option', { value: 'varejo', selected: (!existing || existing.type !== 'atacado') ? 'selected' : undefined }, ['Varejo']),
          App.ui.el('option', { value: 'atacado', selected: existing && existing.type === 'atacado' ? 'selected' : undefined }, ['Atacado'])
        ])
      ]),
      App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Observações']), App.ui.el('textarea', { id: 'cu-notes' }, [(existing && existing.notes) || ''])])
    ]);
    var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });
    var wrapper = App.ui.el('div', {}, [errorBox, form]);

    App.ui.openModal({
      title: isEdit ? 'Editar cliente' : 'Novo cliente',
      size: 'wide',
      bodyNode: wrapper,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: isEdit ? 'Salvar alterações' : 'Criar cliente', className: 'btn-primary', onClick: function (close) {
            var name = document.getElementById('cu-name').value.trim();
            if (!name) { errorBox.textContent = 'Nome é obrigatório.'; errorBox.classList.remove('hidden'); return; }
            var record = existing ? Object.assign({}, existing) : {
              id: App.core.uuid(), createdAt: fmt.nowIso(), totalPurchased: 0, purchaseCount: 0, firstPurchaseAt: null, lastPurchaseAt: null, active: true
            };
            var oldValue = existing ? Object.assign({}, existing) : null;
            record.name = name;
            record.cnpjCpf = document.getElementById('cu-doc').value.trim();
            record.phone = document.getElementById('cu-phone').value.trim();
            record.whatsapp = document.getElementById('cu-whatsapp').value.trim();
            record.email = document.getElementById('cu-email').value.trim();
            record.city = document.getElementById('cu-city').value.trim();
            record.address = document.getElementById('cu-address').value.trim();
            record.type = document.getElementById('cu-type').value;
            record.notes = document.getElementById('cu-notes').value.trim();
            record.updatedAt = fmt.nowIso();

            App.db.runAtomic(['customers', 'audit_logs'], 'readwrite', function (t) {
              t.objectStore('customers').put(record);
              App.core.audit.log(t, { operation: isEdit ? 'UPDATE' : 'CREATE', entity: 'customers', entityId: record.id, oldValue: oldValue, newValue: record });
            }).then(function () {
              App.ui.toast(isEdit ? 'Cliente atualizado.' : 'Cliente criado.', 'success');
              close();
              if (onCreated) onCreated(record);
              if (document.getElementById('customers-body')) loadList();
            }).catch(function (err) { errorBox.textContent = err.message; errorBox.classList.remove('hidden'); });
          }
        }
      ]
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.customers = { render: render, openForm: openForm };
})(window);
