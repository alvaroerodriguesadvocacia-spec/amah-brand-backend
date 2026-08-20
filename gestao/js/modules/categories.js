/* AMÁH Brand — módulo Categorias */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Categorias']),
        App.ui.el('p', {}, ['Organize os produtos por categoria e subcategoria.'])
      ]),
      App.ui.el('div', { class: 'page-actions' }, [
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Nova categoria'])
      ])
    ]));

    var cardBody = App.ui.el('div', { class: 'card-body', id: 'categories-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Todas as categorias'])]),
      cardBody
    ]));

    loadList();
  }

  function loadList() {
    Promise.all([App.db.getAll('categories'), App.db.getAll('products')]).then(function (results) {
      var categories = results[0].sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      var products = results[1];
      renderList(categories, products);
    });
  }

  function renderList(categories, products) {
    var body = document.getElementById('categories-body');
    if (!body) return;
    if (categories.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'empty-state' }, [
        App.ui.el('div', { class: 'icon' }, ['🏷️']),
        App.ui.el('h3', {}, ['Nenhuma categoria cadastrada']),
        App.ui.el('p', {}, ['Crie categorias para organizar seus produtos (ex.: Brincos, Colares, Anéis, Pulseiras).']),
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Nova categoria'])
      ]));
      return;
    }

    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [
      App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Nome']),
        App.ui.el('th', {}, ['Descrição']),
        App.ui.el('th', {}, ['Produtos']),
        App.ui.el('th', {}, ['Status']),
        App.ui.el('th', {}, [''])
      ])
    ]));
    var tbody = App.ui.el('tbody');
    categories.forEach(function (cat) {
      var count = products.filter(function (p) { return p.categoryId === cat.id; }).length;
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [App.ui.el('strong', {}, [cat.name])]),
        App.ui.el('td', { class: 'text-muted' }, [cat.description || '—']),
        App.ui.el('td', {}, [String(count)]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (cat.active ? 'badge-success' : 'badge-neutral') }, [cat.active ? 'Ativa' : 'Inativa'])]),
        App.ui.el('td', { class: 'row-actions' }, [
          App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { openForm(cat); } }, ['Editar']),
          App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { removeCategory(cat, count); } }, ['Excluir'])
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function removeCategory(cat, productCount) {
    if (productCount > 0) {
      App.ui.toast('Não é possível excluir: há ' + productCount + ' produto(s) usando esta categoria.', 'error');
      return;
    }
    App.ui.confirmDialog({
      title: 'Excluir categoria',
      message: 'Deseja realmente excluir a categoria "' + cat.name + '"? Esta ação não pode ser desfeita.',
      danger: true,
      confirmLabel: 'Excluir'
    }).then(function (confirmed) {
      if (!confirmed) return;
      App.db.runAtomic(['categories', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('categories').delete(cat.id);
        App.core.audit.log(t, { operation: 'DELETE', entity: 'categories', entityId: cat.id, oldValue: cat });
      }).then(function () {
        App.ui.toast('Categoria excluída.', 'success');
        loadList();
      }).catch(function (err) { App.ui.toast(err.message, 'error'); });
    });
  }

  function openForm(existing) {
    var isEdit = !!existing;
    var form = App.ui.el('form', { class: 'form-grid' }, [
      App.ui.el('div', { class: 'form-field span-2' }, [
        App.ui.el('label', {}, ['Nome *']),
        App.ui.el('input', { id: 'cat-name', value: existing ? existing.name : '', placeholder: 'Ex.: Brincos' })
      ]),
      App.ui.el('div', { class: 'form-field span-2' }, [
        App.ui.el('label', {}, ['Descrição']),
        App.ui.el('textarea', { id: 'cat-desc' }, [existing ? (existing.description || '') : ''])
      ]),
      App.ui.el('div', { class: 'form-field' }, [
        App.ui.el('div', { class: 'checkbox-row' }, [
          App.ui.el('input', Object.assign({ type: 'checkbox', id: 'cat-active' }, (!existing || existing.active) ? { checked: 'checked' } : {})),
          App.ui.el('label', { for: 'cat-active' }, ['Categoria ativa'])
        ])
      ])
    ]);

    var errorBox = App.ui.el('div', { class: 'modal-alert hidden', id: 'cat-error' });
    var wrapper = App.ui.el('div', {}, [errorBox, form]);

    var modalRef = App.ui.openModal({
      title: isEdit ? 'Editar categoria' : 'Nova categoria',
      bodyNode: wrapper,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: isEdit ? 'Salvar alterações' : 'Criar categoria',
          className: 'btn-primary',
          onClick: function (close) { save(close); }
        }
      ]
    });

    function save(close) {
      var name = document.getElementById('cat-name').value.trim();
      var desc = document.getElementById('cat-desc').value.trim();
      var active = document.getElementById('cat-active').checked;
      var errBox = document.getElementById('cat-error');
      errBox.classList.add('hidden');
      try {
        App.core.validation.required(name, 'Nome da categoria');
      } catch (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
        return;
      }

      var record = existing ? Object.assign({}, existing) : {
        id: App.core.uuid(),
        createdAt: fmt.nowIso()
      };
      var oldValue = existing ? Object.assign({}, existing) : null;
      record.name = name;
      record.description = desc;
      record.active = active;
      record.updatedAt = fmt.nowIso();

      App.db.runAtomic(['categories', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('categories').put(record);
        App.core.audit.log(t, {
          operation: isEdit ? 'UPDATE' : 'CREATE', entity: 'categories', entityId: record.id,
          oldValue: oldValue, newValue: record
        });
      }).then(function () {
        App.ui.toast(isEdit ? 'Categoria atualizada.' : 'Categoria criada.', 'success');
        close();
        loadList();
      }).catch(function (err) {
        errBox.textContent = err.message;
        errBox.classList.remove('hidden');
      });
    }
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.categories = { render: render };
})(window);
