/* AMÁH Brand — módulo Estoque (Fase 2): entradas, saídas, movimentações e alertas */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var stockEngine = App.core.stockEngine;

  function loadProductIndex() {
    return App.db.getAll('products').then(function (products) {
      var byId = {}, bySku = {}, byBarcode = {};
      products.forEach(function (p) {
        byId[p.id] = p;
        bySku[(p.sku || '').toUpperCase()] = p;
        if (p.barcode) byBarcode[p.barcode] = p;
      });
      return { products: products, byId: byId, bySku: bySku, byBarcode: byBarcode };
    });
  }

  function findProduct(index, code) {
    var c = (code || '').trim();
    return index.byBarcode[c] || index.bySku[c.toUpperCase()] || null;
  }

  // ---------------- Entrada / Saída manual (telas semelhantes, tipos diferentes) ----------------

  function renderMovementForm(container, config) {
    // config: { title, subtitle, typeOptions: [{value,label}], defaultReasonPlaceholder, isEntrada }
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, [config.title]), App.ui.el('p', {}, [config.subtitle])])
    ]));

    var pending = []; // { product, qty }

    var searchInput = App.ui.el('input', { id: 'mv-search', placeholder: 'Digite nome, SKU ou código de barras e pressione Enter…' });
    var scanBtn = App.ui.el('button', { class: 'btn btn-secondary', onclick: openScanner }, ['📷 Escanear']);
    var typeSelect = App.ui.el('select', { id: 'mv-type' }, config.typeOptions.map(function (o) {
      return App.ui.el('option', { value: o.value }, [o.label]);
    }));
    var docInput = App.ui.el('input', { id: 'mv-doc', placeholder: 'Documento (opcional): nota fiscal, referência…' });
    var reasonInput = App.ui.el('input', { id: 'mv-reason', placeholder: config.defaultReasonPlaceholder });

    var searchCard = App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-body' }, [
        App.ui.el('div', { class: 'form-grid cols-3' }, [
          App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Produto']), searchInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['​']), scanBtn]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Tipo de movimentação']), typeSelect]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Documento relacionado']), docInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Motivo *']), reasonInput])
        ])
      ])
    ]);
    container.appendChild(searchCard);

    var listBody = App.ui.el('div', { class: 'card-body', id: 'mv-list-body' });
    // guardClick evita clique duplo/duplo toque duplicando a movimentação de
    // estoque (2026-08-26).
    var confirmBtn = App.ui.el('button', { class: 'btn btn-primary', onclick: function () { if (App.ui.guardClick(confirmBtn)) confirm(); } }, ['✔ Confirmar movimentação']);
    container.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Itens a movimentar']), confirmBtn]),
      listBody
    ]));

    renderPendingList();

    var productIndex = null;
    loadProductIndex().then(function (idx) { productIndex = idx; });

    searchInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addByCode(searchInput.value);
      searchInput.value = '';
    });

    function addByCode(code) {
      if (!productIndex) return;
      var product = findProduct(productIndex, code);
      if (!product) {
        App.ui.toast('Produto não encontrado para "' + code + '".', 'error');
        return;
      }
      addProduct(product);
    }

    function addProduct(product) {
      var existing = pending.filter(function (p) { return p.product.id === product.id; })[0];
      if (existing) existing.qty += 1;
      else pending.push({ product: product, qty: 1 });
      renderPendingList();
    }

    function openScanner() {
      App.core.scanner.openScannerModal({
        title: 'Escanear produto',
        onDetect: function (code) { addByCode(code); }
      });
    }

    function renderPendingList() {
      listBody.innerHTML = '';
      if (pending.length === 0) {
        listBody.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhum item adicionado ainda. Busque ou escaneie um produto acima.']));
        return;
      }
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, [''])
      ])]));
      var tbody = App.ui.el('tbody');
      pending.forEach(function (row, idx) {
        var qtyInput = App.ui.el('input', { type: 'number', min: '1', value: String(row.qty), style: 'width:80px;' });
        qtyInput.addEventListener('change', function () { row.qty = Math.max(1, Number(qtyInput.value) || 1); });
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('strong', {}, [row.product.name]), App.ui.el('div', { class: 'text-faint mono' }, [row.product.sku])]),
          App.ui.el('td', {}, [qtyInput]),
          App.ui.el('td', { class: 'row-actions' }, [
            App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { pending.splice(idx, 1); renderPendingList(); } }, ['Remover'])
          ])
        ]));
      });
      table.appendChild(tbody);
      listBody.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    }

    function confirm() {
      var reason = reasonInput.value.trim();
      if (pending.length === 0) { App.ui.toast('Adicione ao menos um item.', 'error'); return; }
      if (!reason) { App.ui.toast('Informe o motivo da movimentação.', 'error'); return; }
      var type = typeSelect.value;
      var doc = docInput.value.trim();

      var chain = pending.reduce(function (p, row) {
        return p.then(function () {
          return stockEngine.registrarMovimentacao({ productId: row.product.id, type: type, quantity: row.qty, reason: reason, relatedDocument: doc || null });
        });
      }, Promise.resolve());

      chain.then(function () {
        App.ui.toast('Movimentação registrada com sucesso (' + pending.length + ' item(ns)).', 'success');
        pending.length = 0;
        renderPendingList();
        reasonInput.value = ''; docInput.value = '';
        loadProductIndex().then(function (idx) { productIndex = idx; });
      }).catch(function (err) {
        App.ui.toast(err.message, 'error');
      });
    }
  }

  function renderEntrada(container) {
    renderMovementForm(container, {
      title: 'Entrada de mercadoria',
      subtitle: 'Registro manual de entrada em estoque (compra avulsa, devolução de cliente ou ajuste). Para compras formais com fornecedor, use o módulo Compras.',
      typeOptions: [
        { value: 'ENTRADA_COMPRA', label: 'Entrada de compra' },
        { value: 'ENTRADA_DEVOLUCAO', label: 'Entrada por devolução' },
        { value: 'ENTRADA_AJUSTE', label: 'Ajuste positivo' }
      ],
      defaultReasonPlaceholder: 'Ex.: Nota fiscal 1234, devolução do cliente...'
    });
  }

  function renderSaida(container) {
    renderMovementForm(container, {
      title: 'Saída manual',
      subtitle: 'Registro manual de saída de estoque por perda, avaria ou ajuste (não use esta tela para vendas — vendas baixam estoque automaticamente pelo PDV).',
      typeOptions: [
        { value: 'SAIDA_PERDA', label: 'Perda' },
        { value: 'SAIDA_AVARIA', label: 'Avaria' },
        { value: 'SAIDA_AJUSTE', label: 'Ajuste negativo' }
      ],
      defaultReasonPlaceholder: 'Ex.: Peça quebrada, extraviada...'
    });
  }

  // ---------------- Movimentações (log global) ----------------

  function renderMovimentacoes(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Movimentações de estoque']), App.ui.el('p', {}, ['Histórico completo de todas as entradas e saídas do sistema.'])]),
      App.ui.el('div', { class: 'page-actions' }, [App.ui.el('button', { class: 'btn btn-secondary', onclick: exportCsv }, ['⬇ Exportar CSV'])])
    ]));

    var typeFilter = App.ui.el('select', { id: 'mvlog-type' }, [App.ui.el('option', { value: '' }, ['Todos os tipos'])].concat(
      Object.keys(stockEngine.TIPOS).map(function (t) { return App.ui.el('option', { value: t }, [t]); })
    ));
    var searchFilter = App.ui.el('input', { id: 'mvlog-search', placeholder: 'Filtrar por produto ou SKU…' });
    container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-body' }, [
        App.ui.el('div', { class: 'form-grid' }, [
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Tipo']), typeFilter]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Produto']), searchFilter])
        ])
      ])
    ]));

    var body = App.ui.el('div', { class: 'card-body', id: 'mvlog-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Todas as movimentações'])]), body]));

    var all = [], productIndex = null;

    Promise.all([App.db.getAll('inventory_movements'), loadProductIndex()]).then(function (results) {
      all = results[0].sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      productIndex = results[1];
      renderTable();
    });

    typeFilter.addEventListener('change', renderTable);
    searchFilter.addEventListener('input', renderTable);

    function currentFiltered() {
      var type = typeFilter.value;
      var term = searchFilter.value.toLowerCase();
      return all.filter(function (m) {
        if (type && m.type !== type) return false;
        if (term) {
          var p = productIndex.byId[m.productId];
          var text = (p ? (p.name + ' ' + p.sku) : '').toLowerCase();
          if (text.indexOf(term) === -1) return false;
        }
        return true;
      });
    }

    function renderTable() {
      var body = document.getElementById('mvlog-body');
      if (!body) return;
      var filtered = currentFiltered();
      if (filtered.length === 0) {
        body.innerHTML = '';
        body.appendChild(App.ui.el('div', { class: 'table-empty' }, ['Nenhuma movimentação encontrada.']));
        return;
      }
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Data']), App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Tipo']),
        App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, ['Documento']), App.ui.el('th', {}, ['Motivo'])
      ])]));
      var tbody = App.ui.el('tbody');
      filtered.slice(0, 500).forEach(function (m) {
        var p = productIndex.byId[m.productId];
        var isEntrada = stockEngine.TIPOS_ENTRADA.indexOf(m.type) !== -1;
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [fmt.dateTimeBR(m.createdAt)]),
          App.ui.el('td', {}, [p ? p.name : '(produto removido)', App.ui.el('div', { class: 'text-faint mono' }, [p ? p.sku : m.productId])]),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (isEntrada ? 'badge-success' : 'badge-danger') }, [m.type])]),
          App.ui.el('td', { class: 'mono' }, [(isEntrada ? '+' : '−') + m.quantity]),
          App.ui.el('td', { class: 'text-muted' }, [m.relatedDocument || '—']),
          App.ui.el('td', { class: 'text-muted' }, [m.reason || '—'])
        ]));
      });
      table.appendChild(tbody);
      body.innerHTML = '';
      if (filtered.length > 500) body.appendChild(App.ui.el('p', { class: 'text-faint' }, ['Mostrando as 500 movimentações mais recentes de ' + filtered.length + '. Use os filtros para refinar.']));
      body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    }

    function exportCsv() {
      var filtered = currentFiltered();
      App.core.csv.download('movimentacoes-estoque.csv', [
        { label: 'Data', value: function (m) { return fmt.dateTimeBR(m.createdAt); } },
        { label: 'Produto', value: function (m) { var p = productIndex.byId[m.productId]; return p ? p.name : ''; } },
        { label: 'SKU', value: function (m) { var p = productIndex.byId[m.productId]; return p ? p.sku : ''; } },
        { label: 'Tipo', value: 'type' }, { label: 'Quantidade', value: 'quantity' },
        { label: 'Documento', value: 'relatedDocument' }, { label: 'Motivo', value: 'reason' }
      ], filtered);
    }
  }

  // ---------------- Alertas: estoque mínimo / sem estoque / encalhados ----------------

  function renderProductAlertList(container, config) {
    // config: { title, subtitle, filterFn(product, qty, giro) }
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, [config.title]), App.ui.el('p', {}, [config.subtitle])])
    ]));
    var body = App.ui.el('div', { class: 'card-body', id: 'alert-list-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Produtos'])]), body]));

    Promise.all([App.db.getAll('products'), stockEngine.calcularSaldoTodos()]).then(function (results) {
      var products = results[0].filter(function (p) { return p.active; });
      var stockMap = results[1];
      var rows = products.map(function (p) {
        var qty = stockMap[p.id] || 0;
        var giro = App.core.analytics.classifyGiro(p, qty);
        return { product: p, qty: qty, giro: giro };
      }).filter(function (r) { return config.filterFn(r.product, r.qty, r.giro); });

      body.innerHTML = '';
      if (rows.length === 0) {
        body.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhum produto nesta condição. 🎉']));
        return;
      }
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Estoque']), App.ui.el('th', {}, ['Mínimo']),
        App.ui.el('th', {}, ['Giro']), App.ui.el('th', {}, ['Dias sem venda']), App.ui.el('th', {}, ['Sugestão de compra'])
      ])]));
      var tbody = App.ui.el('tbody');
      rows.sort(function (a, b) { return a.qty - b.qty; }).forEach(function (r) {
        var suggestion = r.product.idealStock != null ? Math.max(0, r.product.idealStock - r.qty) : null;
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [App.ui.el('strong', {}, [r.product.name]), App.ui.el('div', { class: 'text-faint mono' }, [r.product.sku])]),
          App.ui.el('td', { class: 'mono' }, [String(r.qty)]),
          App.ui.el('td', { class: 'mono' }, [r.product.minStock != null ? String(r.product.minStock) : '—']),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + r.giro.badgeClass }, [r.giro.label])]),
          App.ui.el('td', { class: 'mono' }, [r.giro.days != null ? String(r.giro.days) : '—']),
          App.ui.el('td', { class: 'mono' }, [suggestion != null ? suggestion + ' un.' : '—'])
        ]));
      });
      table.appendChild(tbody);
      body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    });
  }

  function renderMinimo(container) {
    renderProductAlertList(container, {
      title: 'Estoque mínimo', subtitle: 'Produtos com estoque atual igual ou abaixo do mínimo definido.',
      filterFn: function (p, qty) { return p.minStock != null && qty <= p.minStock && qty > 0; }
    });
  }
  function renderSemEstoque(container) {
    renderProductAlertList(container, {
      title: 'Produtos sem estoque', subtitle: 'Produtos ativos com saldo zerado.',
      filterFn: function (p, qty) { return qty <= 0; }
    });
  }
  function renderEncalhados(container) {
    renderProductAlertList(container, {
      title: 'Produtos encalhados', subtitle: 'Produtos com estoque disponível e sem vendas há mais de 60 dias (ou nunca vendidos e cadastrados há mais de 60 dias).',
      filterFn: function (p, qty, giro) { return giro.key === 'encalhado'; }
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.stock = {
    renderEntrada: renderEntrada, renderSaida: renderSaida, renderMovimentacoes: renderMovimentacoes,
    renderMinimo: renderMinimo, renderSemEstoque: renderSemEstoque, renderEncalhados: renderEncalhados
  };
})(window);
