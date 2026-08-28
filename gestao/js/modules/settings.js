/* AMÁH Brand — módulo Configurações
 * Dados da empresa, categorias de despesa e formas de pagamento (cadastro
 * configurável, sem lançamentos ainda — isso chega na Fase 4).
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  var DEFAULT_EXPENSE_CATEGORIES = [
    'Mercadorias', 'Embalagens', 'Frete', 'Aluguel', 'Funcionários', 'Marketing',
    'Energia', 'Água', 'Internet', 'Impostos', 'Taxas bancárias', 'Taxas de cartão', 'Manutenção', 'Outras'
  ];

  var DEFAULT_PAYMENT_METHODS = [
    { name: 'Dinheiro', feePercent: 0 },
    { name: 'PIX', feePercent: 0 },
    { name: 'Débito', feePercent: 1.5 },
    { name: 'Crédito à vista', feePercent: 3.49 },
    { name: 'Crédito parcelado', feePercent: 4.99 },
    { name: 'Boleto', feePercent: 0 },
    { name: 'Venda a prazo', feePercent: 0 },
    { name: 'Outros', feePercent: 0 }
  ];

  function ensureDefaults() {
    return Promise.all([
      App.db.getById('settings', 'company'),
      App.db.getById('settings', 'expense_categories'),
      App.db.getById('settings', 'payment_methods')
    ]).then(function (results) {
      var ops = [];
      if (!results[0]) ops.push(App.db.put('settings', { id: 'company', name: 'AMÁH Brand', cnpjCpf: '', phone: '', email: '', address: '' }));
      if (!results[1]) ops.push(App.db.put('settings', { id: 'expense_categories', items: DEFAULT_EXPENSE_CATEGORIES.map(function (n) { return { id: App.core.uuid(), name: n, active: true }; }) }));
      if (!results[2]) ops.push(App.db.put('settings', { id: 'payment_methods', items: DEFAULT_PAYMENT_METHODS.map(function (m) { return { id: App.core.uuid(), name: m.name, feePercent: m.feePercent, active: true }; }) }));
      return Promise.all(ops);
    });
  }

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Configurações']),
        App.ui.el('p', {}, ['Dados da empresa e listas configuráveis usadas em módulos futuros (despesas e formas de pagamento).'])
      ])
    ]));

    var tabs = App.ui.el('div', { class: 'pill-tabs' }, [
      App.ui.el('div', { class: 'pill-tab active', 'data-tab': 'company' }, ['Empresa']),
      App.ui.el('div', { class: 'pill-tab', 'data-tab': 'expenses' }, ['Categorias de despesa']),
      App.ui.el('div', { class: 'pill-tab', 'data-tab': 'payments' }, ['Formas de pagamento']),
      App.ui.el('div', { class: 'pill-tab', 'data-tab': 'demo' }, ['Dados de demonstração'])
    ]);
    container.appendChild(tabs);

    var panel = App.ui.el('div', { id: 'settings-panel' });
    container.appendChild(panel);

    ensureDefaults().then(function () {
      tabs.querySelectorAll('.pill-tab').forEach(function (tab) {
        tab.addEventListener('click', function () {
          tabs.querySelectorAll('.pill-tab').forEach(function (t) { t.classList.remove('active'); });
          tab.classList.add('active');
          renderPanel(tab.getAttribute('data-tab'));
        });
      });
      renderPanel('company');
    });

    function renderPanel(tab) {
      panel.innerHTML = '';
      if (tab === 'company') renderCompanyPanel(panel);
      else if (tab === 'expenses') renderListPanel(panel, 'expense_categories', 'Categoria de despesa', false);
      else if (tab === 'payments') renderListPanel(panel, 'payment_methods', 'Forma de pagamento', true);
      else if (tab === 'demo') renderDemoPanel(panel);
    }
  }

  function renderCompanyPanel(panel) {
    App.db.getById('settings', 'company').then(function (company) {
      company = company || { id: 'company' };
      var form = App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Nome da empresa']), App.ui.el('input', { id: 'set-company-name', value: company.name || '' })]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['CNPJ/CPF']), App.ui.el('input', { id: 'set-company-doc', value: company.cnpjCpf || '' })]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Telefone']), App.ui.el('input', { id: 'set-company-phone', value: company.phone || '' })]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['E-mail']), App.ui.el('input', { id: 'set-company-email', value: company.email || '' })]),
        App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Endereço']), App.ui.el('input', { id: 'set-company-address', value: company.address || '' })])
      ]);
      panel.appendChild(App.ui.el('div', { class: 'card' }, [
        App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Dados da empresa'])]),
        App.ui.el('div', { class: 'card-body' }, [
          form,
          App.ui.el('div', { style: 'margin-top:16px;' }, [
            App.ui.el('button', {
              class: 'btn btn-primary', onclick: function () {
                var record = {
                  id: 'company',
                  name: document.getElementById('set-company-name').value.trim(),
                  cnpjCpf: document.getElementById('set-company-doc').value.trim(),
                  phone: document.getElementById('set-company-phone').value.trim(),
                  email: document.getElementById('set-company-email').value.trim(),
                  address: document.getElementById('set-company-address').value.trim()
                };
                App.db.put('settings', record).then(function () { App.ui.toast('Dados da empresa salvos.', 'success'); });
              }
            }, ['Salvar dados da empresa'])
          ])
        ])
      ]));
    });
  }

  function renderListPanel(panel, storeId, itemLabel, withFee) {
    App.db.getById('settings', storeId).then(function (doc) {
      doc = doc || { id: storeId, items: [] };
      var body = App.ui.el('div', { class: 'card-body' });
      var card = App.ui.el('div', { class: 'card' }, [
        App.ui.el('div', { class: 'card-header' }, [
          App.ui.el('h2', {}, [itemLabel + 's']),
          App.ui.el('button', { class: 'btn btn-primary btn-sm', onclick: function () { addItem(); } }, ['+ Adicionar'])
        ]),
        body
      ]);
      panel.appendChild(card);
      renderRows();

      function renderRows() {
        body.innerHTML = '';
        if (doc.items.length === 0) {
          body.appendChild(App.ui.el('p', { class: 'text-muted' }, ['Nenhum item cadastrado.']));
          return;
        }
        var table = App.ui.el('table', { class: 'data-table' });
        var headRow = [App.ui.el('th', {}, ['Nome'])];
        if (withFee) headRow.push(App.ui.el('th', {}, ['Taxa (%)']));
        headRow.push(App.ui.el('th', {}, ['Status']), App.ui.el('th', {}, ['']));
        table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, headRow)]));
        var tbody = App.ui.el('tbody');
        doc.items.forEach(function (item) {
          var cells = [App.ui.el('td', {}, [item.name])];
          if (withFee) cells.push(App.ui.el('td', { class: 'mono' }, [fmt.percent(item.feePercent || 0)]));
          cells.push(
            App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (item.active ? 'badge-success' : 'badge-neutral') }, [item.active ? 'Ativo' : 'Inativo'])]),
            App.ui.el('td', { class: 'row-actions' }, [
              App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { toggleActive(item); } }, [item.active ? 'Desativar' : 'Ativar']),
              App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { removeItem(item); } }, ['Excluir'])
            ])
          );
          tbody.appendChild(App.ui.el('tr', {}, cells));
        });
        table.appendChild(tbody);
        body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
      }

      function persist() { return App.db.put('settings', doc).then(renderRows); }

      function addItem() {
        var nameField = App.ui.el('input', { id: 'new-item-name', placeholder: itemLabel });
        var feeField = withFee ? App.ui.el('input', { id: 'new-item-fee', type: 'number', step: '0.01', value: '0' }) : null;
        var formNodes = [App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Nome']), nameField])];
        if (withFee) formNodes.push(App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Taxa (%)']), feeField]));
        App.ui.openModal({
          title: 'Adicionar ' + itemLabel.toLowerCase(),
          bodyNode: App.ui.el('div', { class: 'form-grid' }, formNodes),
          footerButtons: [
            { label: 'Cancelar', className: 'btn-secondary' },
            {
              label: 'Adicionar', className: 'btn-primary', onClick: function (close) {
                var name = nameField.value.trim();
                if (!name) { App.ui.toast('Informe um nome.', 'error'); return; }
                doc.items.push({ id: App.core.uuid(), name: name, feePercent: withFee ? Number(feeField.value) || 0 : undefined, active: true });
                persist();
                close();
              }
            }
          ]
        });
      }

      function toggleActive(item) { item.active = !item.active; persist(); }
      function removeItem(item) {
        doc.items = doc.items.filter(function (i) { return i.id !== item.id; });
        persist();
      }
    });
  }

  function renderDemoPanel(panel) {
    App.db.getById('settings', 'app_meta').then(function (meta) {
      var isDemo = meta && meta.demoData;
      panel.appendChild(App.ui.el('div', { class: 'card' }, [
        App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Dados de demonstração'])]),
        App.ui.el('div', { class: 'card-body' }, [
          App.ui.el('p', {}, [isDemo
            ? 'Este sistema está usando dados fictícios de demonstração. Antes de usar em produção, limpe-os abaixo.'
            : 'Este sistema não está usando dados de demonstração.']),
          App.ui.el('div', { class: 'flex gap-8' }, [
            isDemo ? App.ui.el('button', { class: 'btn btn-danger', onclick: clearDemo }, ['🗑️ Limpar dados de demonstração']) : null,
            !isDemo ? App.ui.el('button', { class: 'btn btn-secondary', onclick: loadDemo }, ['Carregar dados de demonstração']) : null
          ])
        ])
      ]));
    });

    function clearDemo() {
      App.ui.confirmDialog({
        title: 'Limpar dados de demonstração',
        message: 'Isso apagará TODOS os produtos, categorias, fornecedores e movimentações atuais (dados de demonstração). Esta ação não pode ser desfeita. Deseja continuar?',
        danger: true, confirmLabel: 'Apagar tudo'
      }).then(function (confirmed) {
        if (!confirmed) return;
        Promise.all(['products', 'categories', 'suppliers', 'inventory_movements', 'audit_logs'].map(function (s) { return App.db.clearStore(s); }))
          .then(function () { return App.db.put('settings', { id: 'app_meta', initialized: true, initializedAt: fmt.nowIso(), demoData: false }); })
          .then(function () {
            App.ui.toast('Dados de demonstração removidos.', 'success');
            App.refreshShell();
          });
      });
    }

    function loadDemo() {
      App.ui.confirmDialog({
        title: 'Carregar dados de demonstração',
        message: 'Isso adicionará produtos, categorias e fornecedores fictícios ao sistema atual. Deseja continuar?'
      }).then(function (confirmed) {
        if (!confirmed) return;
        App.demoData.seed().then(function () {
          return App.db.put('settings', { id: 'app_meta', initialized: true, initializedAt: fmt.nowIso(), demoData: true });
        }).then(function () {
          App.ui.toast('Dados de demonstração carregados.', 'success');
          App.refreshShell();
        });
      });
    }
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.settings = { render: render, ensureDefaults: ensureDefaults, DEFAULT_EXPENSE_CATEGORIES: DEFAULT_EXPENSE_CATEGORIES, DEFAULT_PAYMENT_METHODS: DEFAULT_PAYMENT_METHODS };
})(window);
