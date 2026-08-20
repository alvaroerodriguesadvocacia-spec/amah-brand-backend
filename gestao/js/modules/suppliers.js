/* AMÁH Brand — módulo Fornecedores */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Fornecedores']),
        App.ui.el('p', {}, ['Cadastro de fornecedores de mercadorias. O histórico de compras será alimentado a partir da Fase 5.'])
      ]),
      App.ui.el('div', { class: 'page-actions' }, [
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Novo fornecedor'])
      ])
    ]));

    var body = App.ui.el('div', { class: 'card-body', id: 'suppliers-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Todos os fornecedores'])]),
      body
    ]));

    loadList();
  }

  function loadList() {
    Promise.all([App.db.getAll('suppliers'), App.db.getAll('products')]).then(function (results) {
      var suppliers = results[0].sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      renderList(suppliers, results[1]);
    });
  }

  function renderList(suppliers, products) {
    var body = document.getElementById('suppliers-body');
    if (!body) return;
    if (suppliers.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'empty-state' }, [
        App.ui.el('div', { class: 'icon' }, ['🚚']),
        App.ui.el('h3', {}, ['Nenhum fornecedor cadastrado']),
        App.ui.el('p', {}, ['Cadastre seus fornecedores de bijuterias, insumos e embalagens.']),
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Novo fornecedor'])
      ]));
      return;
    }

    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [
      App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Nome']),
        App.ui.el('th', {}, ['CPF/CNPJ']),
        App.ui.el('th', {}, ['Contato']),
        App.ui.el('th', {}, ['Produtos vinculados']),
        App.ui.el('th', {}, ['Status']),
        App.ui.el('th', {}, [''])
      ])
    ]));
    var tbody = App.ui.el('tbody');
    suppliers.forEach(function (sup) {
      var linked = products.filter(function (p) { return p.supplierId === sup.id; }).length;
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [
          App.ui.el('strong', {}, [sup.name]),
          sup.razaoSocial ? App.ui.el('div', { class: 'text-faint' }, [sup.razaoSocial]) : null
        ]),
        App.ui.el('td', {}, [sup.cnpjCpf || '—']),
        App.ui.el('td', {}, [
          App.ui.el('div', {}, [sup.phone || sup.whatsapp || '—']),
          sup.email ? App.ui.el('div', { class: 'text-faint' }, [sup.email]) : null
        ]),
        App.ui.el('td', {}, [String(linked)]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (sup.active ? 'badge-success' : 'badge-neutral') }, [sup.active ? 'Ativo' : 'Inativo'])]),
        App.ui.el('td', { class: 'row-actions' }, [
          App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { openForm(sup); } }, ['Editar']),
          App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { removeSupplier(sup, linked); } }, ['Excluir'])
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function removeSupplier(sup, linkedCount) {
    if (linkedCount > 0) {
      App.ui.toast('Não é possível excluir: há ' + linkedCount + ' produto(s) vinculado(s) a este fornecedor.', 'error');
      return;
    }
    App.ui.confirmDialog({
      title: 'Excluir fornecedor',
      message: 'Deseja realmente excluir o fornecedor "' + sup.name + '"?',
      danger: true,
      confirmLabel: 'Excluir'
    }).then(function (confirmed) {
      if (!confirmed) return;
      App.db.runAtomic(['suppliers', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('suppliers').delete(sup.id);
        App.core.audit.log(t, { operation: 'DELETE', entity: 'suppliers', entityId: sup.id, oldValue: sup });
      }).then(function () {
        App.ui.toast('Fornecedor excluído.', 'success');
        loadList();
      }).catch(function (err) { App.ui.toast(err.message, 'error'); });
    });
  }

  function field(id, label, value, placeholder, type) {
    return App.ui.el('div', { class: 'form-field' }, [
      App.ui.el('label', {}, [label]),
      App.ui.el('input', { id: id, value: value || '', placeholder: placeholder || '', type: type || 'text' })
    ]);
  }

  function openForm(existing) {
    var isEdit = !!existing;
    var form = App.ui.el('div', { class: 'form-grid' }, [
      field('sup-name', 'Nome / Nome fantasia *', existing && existing.name, 'Ex.: Bijoux Import LTDA'),
      field('sup-razao', 'Razão social', existing && existing.razaoSocial),
      field('sup-doc', 'CPF/CNPJ', existing && existing.cnpjCpf),
      field('sup-phone', 'Telefone', existing && existing.phone),
      field('sup-whatsapp', 'WhatsApp', existing && existing.whatsapp),
      field('sup-email', 'E-mail', existing && existing.email, '', 'email'),
      App.ui.el('div', { class: 'form-field span-2' }, [
        App.ui.el('label', {}, ['Endereço']),
        App.ui.el('input', { id: 'sup-address', value: (existing && existing.address) || '' })
      ]),
      field('sup-contact', 'Contato (pessoa)', existing && existing.contact),
      field('sup-leadtime', 'Prazo médio de entrega (dias)', existing && existing.avgLeadTimeDays, '', 'number'),
      App.ui.el('div', { class: 'form-field span-2' }, [
        App.ui.el('label', {}, ['Condições comerciais']),
        App.ui.el('input', { id: 'sup-conditions', value: (existing && existing.conditions) || '', placeholder: 'Ex.: 30/60 dias, pedido mínimo R$ 500' })
      ]),
      App.ui.el('div', { class: 'form-field span-2' }, [
        App.ui.el('label', {}, ['Observações']),
        App.ui.el('textarea', { id: 'sup-notes' }, [(existing && existing.notes) || ''])
      ]),
      App.ui.el('div', { class: 'form-field' }, [
        App.ui.el('div', { class: 'checkbox-row' }, [
          App.ui.el('input', Object.assign({ type: 'checkbox', id: 'sup-active' }, (!existing || existing.active) ? { checked: 'checked' } : {})),
          App.ui.el('label', { for: 'sup-active' }, ['Fornecedor ativo'])
        ])
      ])
    ]);

    var errorBox = App.ui.el('div', { class: 'modal-alert hidden', id: 'sup-error' });
    var wrapper = App.ui.el('div', {}, [errorBox, form]);

    App.ui.openModal({
      title: isEdit ? 'Editar fornecedor' : 'Novo fornecedor',
      size: 'wide',
      bodyNode: wrapper,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        { label: isEdit ? 'Salvar alterações' : 'Criar fornecedor', className: 'btn-primary', onClick: function (close) { save(close); } }
      ]
    });

    function save(close) {
      var errBox = document.getElementById('sup-error');
      errBox.classList.add('hidden');
      var name = document.getElementById('sup-name').value.trim();
      try {
        App.core.validation.required(name, 'Nome do fornecedor');
      } catch (err) {
        errBox.textContent = err.message; errBox.classList.remove('hidden'); return;
      }

      var record = existing ? Object.assign({}, existing) : { id: App.core.uuid(), createdAt: fmt.nowIso() };
      var oldValue = existing ? Object.assign({}, existing) : null;
      record.name = name;
      record.razaoSocial = document.getElementById('sup-razao').value.trim();
      record.cnpjCpf = document.getElementById('sup-doc').value.trim();
      record.phone = document.getElementById('sup-phone').value.trim();
      record.whatsapp = document.getElementById('sup-whatsapp').value.trim();
      record.email = document.getElementById('sup-email').value.trim();
      record.address = document.getElementById('sup-address').value.trim();
      record.contact = document.getElementById('sup-contact').value.trim();
      record.avgLeadTimeDays = document.getElementById('sup-leadtime').value ? Number(document.getElementById('sup-leadtime').value) : null;
      record.conditions = document.getElementById('sup-conditions').value.trim();
      record.notes = document.getElementById('sup-notes').value.trim();
      record.active = document.getElementById('sup-active').checked;
      record.updatedAt = fmt.nowIso();

      App.db.runAtomic(['suppliers', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('suppliers').put(record);
        App.core.audit.log(t, {
          operation: isEdit ? 'UPDATE' : 'CREATE', entity: 'suppliers', entityId: record.id,
          oldValue: oldValue, newValue: record
        });
      }).then(function () {
        App.ui.toast(isEdit ? 'Fornecedor atualizado.' : 'Fornecedor criado.', 'success');
        close();
        loadList();
      }).catch(function (err) {
        errBox.textContent = err.message; errBox.classList.remove('hidden');
      });
    }
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.suppliers = { render: render };
})(window);
