/* AMÁH Brand — módulo Compras (Fase 5): pedido, histórico e recebimento */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  var STATUS_LABELS = {
    pedido: { label: 'Pedido', cls: 'badge-info' }, aguardando: { label: 'Aguardando', cls: 'badge-warning' },
    parcial: { label: 'Parcialmente recebido', cls: 'badge-warning' }, recebido: { label: 'Recebido', cls: 'badge-success' },
    cancelado: { label: 'Cancelado', cls: 'badge-neutral' }
  };

  // ---------------- Nova compra ----------------

  function renderNew(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Nova compra']), App.ui.el('p', {}, ['Cadastrar uma compra NÃO altera o estoque — a entrada só ocorre no recebimento.'])])
    ]));

    var items = [];
    var productIndex = { bySku: {}, byBarcode: {}, byId: {} };

    Promise.all([App.db.getAll('suppliers'), App.db.getAll('products'), App.db.getById('settings', 'payment_methods')]).then(function (results) {
      var suppliers = results[0].filter(function (s) { return s.active; });
      results[1].forEach(function (p) { productIndex.byId[p.id] = p; productIndex.bySku[(p.sku || '').toUpperCase()] = p; if (p.barcode) productIndex.byBarcode[p.barcode] = p; });
      var paymentMethods = ((results[2] && results[2].items) || []).filter(function (m) { return m.active; });

      var supSelect = App.ui.el('select', { id: 'pur-supplier' }, suppliers.map(function (s) { return App.ui.el('option', { value: s.id }, [s.name]); }));
      var docInput = App.ui.el('input', { id: 'pur-doc', placeholder: 'Número da nota/pedido' });
      var freightInput = App.ui.el('input', { id: 'pur-freight', type: 'number', step: '0.01', min: '0', value: '0' });
      var addCostInput = App.ui.el('input', { id: 'pur-addcost', type: 'number', step: '0.01', min: '0', value: '0' });
      var discountInput = App.ui.el('input', { id: 'pur-discount', type: 'number', step: '0.01', min: '0', value: '0' });
      var paySelect = App.ui.el('select', { id: 'pur-pay' }, [App.ui.el('option', { value: '' }, ['—'])].concat(paymentMethods.map(function (m) { return App.ui.el('option', { value: m.id }, [m.name]); })));
      var deliveryInput = App.ui.el('input', { id: 'pur-delivery', type: 'date' });
      var notesInput = App.ui.el('textarea', { id: 'pur-notes' });

      container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
        App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Dados da compra'])]),
        App.ui.el('div', { class: 'card-body' }, [
          App.ui.el('div', { class: 'form-grid cols-3' }, [
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Fornecedor *']), supSelect]),
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Documento']), docInput]),
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Previsão de entrega']), deliveryInput]),
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Frete (R$)']), freightInput]),
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Custos adicionais (R$)']), addCostInput]),
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Desconto (R$)']), discountInput]),
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Forma de pagamento']), paySelect]),
            App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Observações']), notesInput])
          ])
        ])
      ]));

      var searchInput = App.ui.el('input', { id: 'pur-search', placeholder: 'Buscar produto por nome, SKU ou código de barras…' });
      container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
        App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Adicionar item']), searchInput])])
      ]));

      var itemsBody = App.ui.el('div', { class: 'card-body', id: 'pur-items-body' });
      var totalRow = App.ui.el('div', { id: 'pur-total-row', style: 'margin-top:14px; font-weight:700; font-size:16px;' });
      var submitBtn = App.ui.el('button', { class: 'btn btn-primary', style: 'margin-top:10px;', onclick: submit }, ['Criar compra']);
      container.appendChild(App.ui.el('div', { class: 'card' }, [
        App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Itens'])]), itemsBody,
        App.ui.el('div', { class: 'card-body', style: 'padding-top:0;' }, [totalRow, submitBtn])
      ]));

      searchInput.addEventListener('keydown', function (e) {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        var code = searchInput.value.trim();
        var product = productIndex.byBarcode[code] || productIndex.bySku[code.toUpperCase()] ||
          Object.values(productIndex.byId).filter(function (p) { return p.name.toLowerCase().indexOf(code.toLowerCase()) !== -1; })[0];
        if (!product) { App.ui.toast('Produto não encontrado.', 'error'); return; }
        var existing = items.filter(function (i) { return i.productId === product.id; })[0];
        if (existing) existing.qty += 1;
        else items.push({ productId: product.id, productName: product.name, sku: product.sku, qty: 1, unitCost: product.cost || 0 });
        searchInput.value = '';
        renderItems();
      });

      function renderItems() {
        itemsBody.innerHTML = '';
        if (items.length === 0) {
          itemsBody.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhum item adicionado.']));
        } else {
          var table = App.ui.el('table', { class: 'data-table' });
          table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
            App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, ['Custo unitário']), App.ui.el('th', {}, ['Total']), App.ui.el('th', {}, [''])
          ])]));
          var tbody = App.ui.el('tbody');
          items.forEach(function (it, idx) {
            var qtyInput = App.ui.el('input', { type: 'number', min: '1', value: String(it.qty), style: 'width:80px;' });
            qtyInput.addEventListener('change', function () { it.qty = Math.max(1, Number(qtyInput.value) || 1); renderItems(); });
            var costInput = App.ui.el('input', { type: 'number', min: '0', step: '0.01', value: String(it.unitCost), style: 'width:100px;' });
            costInput.addEventListener('change', function () { it.unitCost = Math.max(0, Number(costInput.value) || 0); renderItems(); });
            tbody.appendChild(App.ui.el('tr', {}, [
              App.ui.el('td', {}, [it.productName, App.ui.el('div', { class: 'text-faint mono' }, [it.sku])]),
              App.ui.el('td', {}, [qtyInput]), App.ui.el('td', {}, [costInput]),
              App.ui.el('td', { class: 'mono' }, [fmt.money(it.qty * it.unitCost)]),
              App.ui.el('td', {}, [App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { items.splice(idx, 1); renderItems(); } }, ['✕'])])
            ]));
          });
          table.appendChild(tbody);
          itemsBody.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
        }
        var itemsTotal = items.reduce(function (s, i) { return s + i.qty * i.unitCost; }, 0);
        var total = itemsTotal + (Number(freightInput.value) || 0) + (Number(addCostInput.value) || 0) - (Number(discountInput.value) || 0);
        totalRow.textContent = 'Total da compra: ' + fmt.money(total);
      }
      [freightInput, addCostInput, discountInput].forEach(function (el) { el.addEventListener('input', renderItems); });
      renderItems();

      function submit() {
        if (!supSelect.value) { App.ui.toast('Selecione um fornecedor.', 'error'); return; }
        if (items.length === 0) { App.ui.toast('Adicione ao menos um item.', 'error'); return; }
        App.core.purchaseEngine.createPurchase({
          supplierId: supSelect.value, documentNumber: docInput.value.trim(),
          items: items.map(function (i) { return { productId: i.productId, productName: i.productName, sku: i.sku, qty: i.qty, unitCost: i.unitCost }; }),
          freight: Number(freightInput.value) || 0, additionalCosts: Number(addCostInput.value) || 0, discount: Number(discountInput.value) || 0,
          paymentMethodId: paySelect.value || null, expectedDeliveryDate: deliveryInput.value || null, notes: notesInput.value.trim()
        }).then(function (purchase) {
          App.ui.toast('Compra ' + purchase.number + ' criada.', 'success');
          App.router.navigate('/compras/historico');
        }).catch(function (err) { App.ui.toast(err.message, 'error'); });
      }
    });
  }

  // ---------------- Histórico ----------------

  function renderHistory(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Compras']), App.ui.el('p', {}, ['Histórico de pedidos de compra.'])]),
      App.ui.el('div', { class: 'page-actions' }, [App.ui.el('button', { class: 'btn btn-primary', onclick: function () { App.router.navigate('/compras/nova'); } }, ['+ Nova compra'])])
    ]));
    var body = App.ui.el('div', { class: 'card-body', id: 'pur-hist-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Todas as compras'])]), body]));
    loadList();
  }

  function loadList() {
    Promise.all([App.db.getAll('purchases'), App.db.getAll('suppliers')]).then(function (results) {
      var purchases = results[0].sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      var supById = {}; results[1].forEach(function (s) { supById[s.id] = s.name; });
      var body = document.getElementById('pur-hist-body');
      if (!body) return;
      if (purchases.length === 0) {
        body.innerHTML = '';
        body.appendChild(App.ui.el('div', { class: 'empty-state' }, [App.ui.el('div', { class: 'icon' }, ['🧮']), App.ui.el('h3', {}, ['Nenhuma compra registrada'])]));
        return;
      }
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Número']), App.ui.el('th', {}, ['Fornecedor']), App.ui.el('th', {}, ['Data']),
        App.ui.el('th', {}, ['Total']), App.ui.el('th', {}, ['Status']), App.ui.el('th', {}, [''])
      ])]));
      var tbody = App.ui.el('tbody');
      purchases.forEach(function (p) {
        var st = STATUS_LABELS[p.status] || { label: p.status, cls: 'badge-neutral' };
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', { class: 'mono' }, [p.number]), App.ui.el('td', {}, [supById[p.supplierId] || '—']),
          App.ui.el('td', {}, [fmt.dateBR(p.createdAt)]), App.ui.el('td', { class: 'mono' }, [fmt.money(p.total)]),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + st.cls }, [st.label])]),
          App.ui.el('td', { class: 'row-actions' }, [App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { openDetail(p.id); } }, ['Ver / Receber'])])
        ]));
      });
      table.appendChild(tbody);
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    });
  }

  function openDetail(purchaseId) {
    Promise.all([App.db.getById('purchases', purchaseId), App.db.getByIndex('purchase_items', 'purchaseId', purchaseId), App.db.getAll('suppliers')]).then(function (results) {
      var purchase = results[0], items = results[1], suppliers = results[2];
      var supplier = suppliers.filter(function (s) { return s.id === purchase.supplierId; })[0];
      var canReceive = purchase.status !== 'recebido' && purchase.status !== 'cancelado';

      var body = App.ui.el('div', {}, []);
      buildDetailBody(body, purchase, items, supplier);

      App.ui.openModal({
        title: 'Compra ' + purchase.number,
        size: 'wide',
        bodyNode: body,
        footerButtons: canReceive
          ? [
              { label: 'Fechar', className: 'btn-secondary' },
              { label: 'Cancelar compra', className: 'btn-danger', onClick: function (close) { cancelPurchase(purchase, close); } },
              { label: 'Receber mercadoria', className: 'btn-primary', onClick: function (close) { close(); openReceiveModal(purchase, items); } }
            ]
          : [{ label: 'Fechar', className: 'btn-secondary' }]
      });
    });
  }

  function buildDetailBody(container, purchase, items, supplier) {
    container.appendChild(App.ui.el('div', { class: 'form-grid cols-3', style: 'margin-bottom:16px;' }, [
      infoBlock('Fornecedor', supplier ? supplier.name : '—'), infoBlock('Status', (STATUS_LABELS[purchase.status] || {}).label || purchase.status),
      infoBlock('Total', fmt.money(purchase.total))
    ]));
    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Pedido']), App.ui.el('th', {}, ['Recebido']), App.ui.el('th', {}, ['Custo unitário'])
    ])]));
    var tbody = App.ui.el('tbody');
    items.forEach(function (i) {
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [i.productName]), App.ui.el('td', { class: 'mono' }, [String(i.qty)]),
        App.ui.el('td', { class: 'mono' }, [String(i.receivedQty)]), App.ui.el('td', { class: 'mono' }, [fmt.money(i.unitCost)])
      ]));
    });
    table.appendChild(tbody);
    container.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function infoBlock(label, value) {
    return App.ui.el('div', {}, [
      App.ui.el('div', { class: 'text-faint', style: 'font-size:11.5px; text-transform:uppercase; font-weight:700; margin-bottom:3px;' }, [label]),
      App.ui.el('div', { style: 'font-weight:600;' }, [value])
    ]);
  }

  function cancelPurchase(purchase, close) {
    App.ui.confirmDialog({ title: 'Cancelar compra', message: 'Deseja cancelar a compra ' + purchase.number + '?', danger: true }).then(function (confirmed) {
      if (!confirmed) return;
      App.core.purchaseEngine.cancelPurchase(purchase.id, 'Cancelado pelo usuário').then(function () {
        App.ui.toast('Compra cancelada.', 'success'); close(); loadList();
      }).catch(function (err) { App.ui.toast(err.message, 'error'); });
    });
  }

  function openReceiveModal(purchase, items) {
    var qtyInputs = {};
    var generatePayableCheck = App.ui.el('input', { type: 'checkbox', id: 'recv-payable', checked: 'checked' });

    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Pendente']), App.ui.el('th', {}, ['Receber agora'])
    ])]));
    var tbody = App.ui.el('tbody');
    items.forEach(function (item) {
      var remaining = item.qty - item.receivedQty;
      var input = App.ui.el('input', { type: 'number', min: '0', max: String(remaining), value: String(remaining), style: 'width:90px;', disabled: remaining <= 0 ? 'disabled' : undefined });
      qtyInputs[item.id] = input;
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [item.productName]), App.ui.el('td', { class: 'mono' }, [String(remaining)]), App.ui.el('td', {}, [input])
      ]));
    });
    table.appendChild(tbody);

    var scanBtn = App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () {
      App.core.scanner.openScannerModal({
        title: 'Escanear recebimento', onDetect: function (code) {
          var item = items.filter(function (i) { return i.sku === code || i.sku.toUpperCase() === code.toUpperCase(); })[0];
          if (!item) { App.ui.toast('Item não encontrado nesta compra para o código "' + code + '".', 'error'); return; }
          var input = qtyInputs[item.id];
          var remaining = item.qty - item.receivedQty;
          var current = Math.min(remaining, (Number(input.value) || 0) + 1);
          input.value = String(current);
          App.ui.toast('+1 ' + item.productName, 'success');
        }
      });
    } }, ['📷 Escanear para conferir']);

    var body = App.ui.el('div', {}, [
      App.ui.el('div', { style: 'margin-bottom:10px;' }, [scanBtn]),
      App.ui.el('div', { class: 'table-wrap' }, [table]),
      App.ui.el('div', { class: 'checkbox-row', style: 'margin-top:14px;' }, [generatePayableCheck, App.ui.el('label', { for: 'recv-payable' }, ['Gerar conta a pagar para esta compra (se ainda não gerada)'])])
    ]);

    App.ui.openModal({
      title: 'Receber mercadoria — ' + purchase.number,
      size: 'wide', bodyNode: body,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: 'Confirmar entrada', className: 'btn-primary', onClick: function (close) {
            var received = {};
            items.forEach(function (item) { received[item.id] = Number(qtyInputs[item.id].value) || 0; });
            App.core.purchaseEngine.receivePurchase(purchase.id, received, { generatePayable: generatePayableCheck.checked }).then(function () {
              App.ui.toast('Recebimento confirmado. Estoque atualizado.', 'success');
              close();
              loadList();
            }).catch(function (err) { App.ui.toast(err.message, 'error'); });
          }
        }
      ]
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.purchases = { renderNew: renderNew, renderHistory: renderHistory };
})(window);
