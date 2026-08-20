/* AMÁH Brand — PDV (Ponto de Venda), Fase 3
 * Regra fundamental (item 10): escanear/adicionar ao carrinho NUNCA baixa
 * estoque. A baixa só ocorre em FINALIZAR VENDA, através do SalesEngine,
 * como transação lógica única (item 11).
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var round2 = App.core.salesEngine.round2;

  var state = null;

  function freshState() {
    return {
      cart: [], // { productId, name, sku, unitPrice, qty, discount, active, stock }
      customerId: null, customerName: null,
      payments: [], // { id, methodId, amount }
      productIndex: null, customers: [], paymentMethods: [], openSession: null
    };
  }

  function render(container) {
    state = freshState();
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Nova Venda / PDV']), App.ui.el('p', {}, ['Adicione produtos ao carrinho e finalize a venda. Nada é baixado do estoque até a finalização.'])])
    ]));

    var banner = App.ui.el('div', { id: 'pdv-cash-banner' });
    container.appendChild(banner);

    var layout = App.ui.el('div', { class: 'pdv-layout' });
    container.appendChild(layout);

    var cartCol = App.ui.el('div', { id: 'pdv-cart-col' });
    var paymentCol = App.ui.el('div', { class: 'pdv-payment-panel', id: 'pdv-payment-col' });
    layout.appendChild(cartCol);
    layout.appendChild(paymentCol);

    Promise.all([
      App.db.getAll('products'),
      App.db.getAll('customers'),
      App.db.getById('settings', 'payment_methods'),
      App.core.cashEngine.getOpenSession(),
      App.core.stockEngine.calcularSaldoTodos()
    ]).then(function (results) {
      var products = results[0], customers = results[1], paymentMethodsDoc = results[2], openSession = results[3], stockMap = results[4];
      state.customers = customers.filter(function (c) { return c.active !== false; });
      state.paymentMethods = ((paymentMethodsDoc && paymentMethodsDoc.items) || []).filter(function (m) { return m.active; });
      state.openSession = openSession;

      var byId = {}, bySku = {}, byBarcode = {};
      products.forEach(function (p) {
        byId[p.id] = p; bySku[(p.sku || '').toUpperCase()] = p; if (p.barcode) byBarcode[p.barcode] = p;
      });
      state.productIndex = { byId: byId, bySku: bySku, byBarcode: byBarcode, stockMap: stockMap };

      renderCashBanner(banner);
      renderCartColumn(cartCol);
      renderPaymentColumn(paymentCol);
    });
  }

  function renderCashBanner(banner) {
    banner.innerHTML = '';
    if (!state.openSession) {
      banner.appendChild(App.ui.el('div', { class: 'pdv-cash-banner' }, [
        App.ui.el('span', {}, ['⚠️ Nenhum caixa aberto — vendas em dinheiro/PIX não serão refletidas no caixa até você abrir um caixa.']),
        App.ui.el('a', { href: '#/financeiro/caixa' }, ['Abrir caixa →'])
      ]));
    }
  }

  // ---------------- Coluna do carrinho ----------------

  function renderCartColumn(col) {
    col.innerHTML = '';

    var customerSelect = App.ui.el('select', { id: 'pdv-customer' }, [App.ui.el('option', { value: '' }, ['Cliente não identificado'])].concat(
      state.customers.map(function (c) { return App.ui.el('option', { value: c.id }, [c.name]); })
    ));
    customerSelect.addEventListener('change', function () { state.customerId = customerSelect.value || null; });
    var newCustomerBtn = App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () {
      App.modules.customers.openForm(null, function (created) {
        state.customers.push(created);
        renderCartColumn(col);
        setTimeout(function () { document.getElementById('pdv-customer').value = created.id; state.customerId = created.id; }, 0);
      });
    } }, ['+ Novo']);

    var searchInput = App.ui.el('input', { id: 'pdv-search', placeholder: 'Buscar por nome, SKU ou código de barras…' });
    var scanBtn = App.ui.el('button', { class: 'btn btn-primary', onclick: openScanner }, ['📷 Iniciar Scanner']);
    var consultBtn = App.ui.el('button', { class: 'btn btn-secondary', onclick: openConsult }, ['🔍 Consultar produto']);

    var topCard = App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-body' }, [
        App.ui.el('div', { class: 'form-grid cols-3' }, [
          App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Cliente (opcional)']), App.ui.el('div', { class: 'flex gap-8' }, [customerSelect, newCustomerBtn])]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['​']), scanBtn])
        ]),
        App.ui.el('div', { class: 'form-grid cols-3', style: 'margin-top:4px;' }, [
          App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Buscar / código']), searchInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['​']), consultBtn])
        ])
      ])
    ]);
    col.appendChild(topCard);

    searchInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addByCode(searchInput.value);
      searchInput.value = '';
    });

    var cartBody = App.ui.el('div', { class: 'card-body', id: 'pdv-cart-body' });
    col.appendChild(App.ui.el('div', { class: 'card' }, [App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Carrinho'])]), cartBody]));

    renderCart();
    setTimeout(function () { searchInput.focus(); }, 100);
  }

  function findProduct(code) {
    var c = (code || '').trim();
    if (!c) return null;
    return state.productIndex.byBarcode[c] || state.productIndex.bySku[c.toUpperCase()] || null;
  }

  function addByCode(code) {
    var product = findProduct(code);
    if (!product) {
      App.ui.openModal({
        title: 'Produto não cadastrado',
        bodyNode: App.ui.el('p', {}, ['Nenhum produto encontrado para o código "' + App.core.format.escapeHtml(code) + '".']),
        size: 'sm',
        footerButtons: [
          { label: 'Ignorar leitura', className: 'btn-secondary' },
          {
            label: 'Cadastrar produto', className: 'btn-primary', onClick: function (close) {
              close();
              App.modules.products.openForm(null, function (created) {
                state.productIndex.byId[created.id] = created;
                state.productIndex.bySku[(created.sku || '').toUpperCase()] = created;
                if (created.barcode) state.productIndex.byBarcode[created.barcode] = created;
                state.productIndex.stockMap[created.id] = 0;
                addProductToCart(created);
              }, { sku: /^\d+$/.test(code) ? '' : code.toUpperCase(), barcode: /^\d+$/.test(code) ? code : '' });
            }
          }
        ]
      });
      return;
    }
    addProductToCart(product);
  }

  function addProductToCart(product) {
    if (!product.active) { App.ui.toast('Produto "' + product.name + '" está inativo.', 'error'); return; }
    var existing = state.cart.filter(function (i) { return i.productId === product.id; })[0];
    var available = state.productIndex.stockMap[product.id] || 0;
    if (existing) existing.qty += 1;
    else state.cart.push({ productId: product.id, name: product.name, sku: product.sku, unitPrice: product.retailPrice, qty: 1, discount: 0 });

    var totalInCart = state.cart.filter(function (i) { return i.productId === product.id; })[0].qty;
    if (totalInCart > available) {
      App.ui.toast('Atenção: "' + product.name + '" tem apenas ' + available + ' em estoque (carrinho: ' + totalInCart + '). A validação final ocorre ao finalizar a venda.', 'error');
    }
    renderCart();
    renderPaymentColumn(document.getElementById('pdv-payment-col'));
  }

  function openScanner() {
    App.core.scanner.openScannerModal({ title: 'Escanear produto para venda', onDetect: function (code) { addByCode(code); } });
  }

  function openConsult() {
    App.core.scanner.openScannerModal({
      title: 'Consultar produto (não adiciona ao carrinho)',
      onDetect: function (code) {
        var product = findProduct(code);
        if (!product) { App.ui.toast('Produto não encontrado para "' + code + '".', 'error'); return; }
        App.modules.products.openDetail(product);
      }
    });
  }

  function renderCart() {
    var body = document.getElementById('pdv-cart-body');
    if (!body) return;
    body.innerHTML = '';
    if (state.cart.length === 0) {
      body.appendChild(App.ui.el('div', { class: 'table-empty' }, ['Carrinho vazio. Busque, escaneie ou digite um código.']));
      return;
    }
    var table = App.ui.el('table', { class: 'data-table pdv-cart-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, ['Unitário']),
      App.ui.el('th', {}, ['Desconto']), App.ui.el('th', {}, ['Total']), App.ui.el('th', {}, [''])
    ])]));
    var tbody = App.ui.el('tbody');
    state.cart.forEach(function (item, idx) {
      var qtyInput = App.ui.el('input', { class: 'pdv-qty-input', type: 'number', min: '1', value: String(item.qty) });
      qtyInput.addEventListener('change', function () { item.qty = Math.max(1, Number(qtyInput.value) || 1); renderCart(); renderPaymentColumn(document.getElementById('pdv-payment-col')); });
      var priceInput = App.ui.el('input', { class: 'pdv-price-input mono', type: 'number', step: '0.01', min: '0', value: String(item.unitPrice) });
      priceInput.addEventListener('change', function () { item.unitPrice = Math.max(0, Number(priceInput.value) || 0); renderCart(); renderPaymentColumn(document.getElementById('pdv-payment-col')); });
      var discInput = App.ui.el('input', { class: 'pdv-price-input mono', type: 'number', step: '0.01', min: '0', value: String(item.discount) });
      discInput.addEventListener('change', function () { item.discount = Math.max(0, Number(discInput.value) || 0); renderCart(); renderPaymentColumn(document.getElementById('pdv-payment-col')); });
      var lineTotal = round2(item.qty * item.unitPrice - item.discount);
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [App.ui.el('strong', {}, [item.name]), App.ui.el('div', { class: 'text-faint mono' }, [item.sku])]),
        App.ui.el('td', {}, [qtyInput]),
        App.ui.el('td', {}, [priceInput]),
        App.ui.el('td', {}, [discInput]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(lineTotal)]),
        App.ui.el('td', {}, [App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { state.cart.splice(idx, 1); renderCart(); renderPaymentColumn(document.getElementById('pdv-payment-col')); } }, ['✕'])])
      ]));
    });
    table.appendChild(tbody);
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  // ---------------- Coluna de pagamento ----------------

  function cartTotals() {
    var subtotal = state.cart.reduce(function (s, i) { return s + i.qty * i.unitPrice; }, 0);
    var discount = state.cart.reduce(function (s, i) { return s + (Number(i.discount) || 0); }, 0);
    var total = round2(subtotal - discount);
    return { subtotal: round2(subtotal), discount: round2(discount), total: total };
  }

  function renderPaymentColumn(col) {
    if (!col) return;
    col.innerHTML = '';
    var totals = cartTotals();
    var paidSum = round2(state.payments.reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0));
    var remaining = round2(totals.total - paidSum);

    var totalsBlock = App.ui.el('div', {}, [
      App.ui.el('div', { class: 'pdv-total-row' }, [App.ui.el('span', {}, ['Subtotal']), App.ui.el('span', { class: 'mono' }, [fmt.money(totals.subtotal)])]),
      App.ui.el('div', { class: 'pdv-total-row' }, [App.ui.el('span', {}, ['Desconto']), App.ui.el('span', { class: 'mono' }, ['− ' + fmt.money(totals.discount)])]),
      App.ui.el('div', { class: 'pdv-total-row grand' }, [App.ui.el('span', {}, ['Total']), App.ui.el('span', { class: 'mono' }, [fmt.money(totals.total)])])
    ]);

    var methodSelect = App.ui.el('select', { id: 'pdv-method' }, state.paymentMethods.map(function (m) {
      return App.ui.el('option', { value: m.id }, [m.name + (m.feePercent ? ' (taxa ' + fmt.percent(m.feePercent) + ')' : '')]);
    }));
    var amountInput = App.ui.el('input', { id: 'pdv-payment-amount', type: 'number', step: '0.01', min: '0.01', value: remaining > 0 ? String(remaining) : '' });
    var addPaymentBtn = App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: addPayment }, ['+ Adicionar']);

    var paymentRows = App.ui.el('div', { id: 'pdv-payment-rows' });
    renderPaymentRows(paymentRows, totals);

    var finalizeBtn = App.ui.el('button', { class: 'btn btn-primary btn-lg', onclick: finalizeSale }, ['✔ Finalizar Venda']);
    finalizeBtn.disabled = state.cart.length === 0;

    col.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-body' }, [
        totalsBlock,
        App.ui.el('div', { class: 'form-section-title', style: 'margin-top:14px;' }, ['Pagamento']),
        App.ui.el('div', { class: 'pdv-payment-row', style: 'margin-top:10px;' }, [methodSelect, amountInput, addPaymentBtn]),
        paymentRows,
        App.ui.el('div', { class: 'pdv-total-row', style: 'font-weight:700; color: ' + (Math.abs(remaining) < 0.005 ? 'var(--color-success)' : 'var(--color-danger)') + ';' }, [
          App.ui.el('span', {}, ['Restante a pagar']), App.ui.el('span', { class: 'mono' }, [fmt.money(remaining)])
        ]),
        App.ui.el('div', { style: 'margin-top:14px;' }, [finalizeBtn])
      ])
    ]));

    function addPayment() {
      var methodId = methodSelect.value;
      var amount = Number(amountInput.value);
      if (!methodId) { App.ui.toast('Selecione uma forma de pagamento.', 'error'); return; }
      if (!isFinite(amount) || amount <= 0) { App.ui.toast('Informe um valor válido.', 'error'); return; }
      state.payments.push({ id: App.core.uuid(), methodId: methodId, amount: round2(amount) });
      renderPaymentColumn(col);
    }
  }

  function renderPaymentRows(container, totals) {
    container.innerHTML = '';
    if (state.payments.length === 0) return;
    state.payments.forEach(function (p, idx) {
      var method = state.paymentMethods.filter(function (m) { return m.id === p.methodId; })[0];
      var fee = method ? round2(p.amount * (method.feePercent || 0) / 100) : 0;
      container.appendChild(App.ui.el('div', { class: 'pdv-payment-row' }, [
        App.ui.el('span', { style: 'flex:1;' }, [method ? method.name : '?']),
        App.ui.el('span', { class: 'mono' }, [fmt.money(p.amount)]),
        fee > 0 ? App.ui.el('span', { class: 'text-faint', style: 'font-size:11px;' }, ['(líquido ' + fmt.money(p.amount - fee) + ')']) : null,
        App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { state.payments.splice(idx, 1); renderPaymentColumn(document.getElementById('pdv-payment-col')); } }, ['✕'])
      ]));
    });
  }

  function finalizeSale() {
    var totals = cartTotals();
    if (state.cart.length === 0) { App.ui.toast('Carrinho vazio.', 'error'); return; }
    var paidSum = round2(state.payments.reduce(function (s, p) { return s + p.amount; }, 0));
    if (Math.abs(paidSum - totals.total) > 0.01) {
      App.ui.toast('A soma dos pagamentos (' + fmt.money(paidSum) + ') precisa ser igual ao total (' + fmt.money(totals.total) + ').', 'error');
      return;
    }

    var params = {
      customerId: state.customerId,
      items: state.cart.map(function (i) { return { productId: i.productId, qty: i.qty, unitPrice: i.unitPrice, discount: i.discount }; }),
      payments: state.payments.map(function (p) { return { methodId: p.methodId, amount: p.amount }; }),
      cashSessionId: state.openSession ? state.openSession.id : null
    };

    App.core.salesEngine.finalizeSale(params).then(function (sale) {
      showReceipt(sale);
      App.ui.toast('Venda ' + sale.number + ' finalizada com sucesso.', 'success');
      render(document.getElementById('view-container'));
    }).catch(function (err) {
      App.ui.toast(err.message, 'error');
    });
  }

  function showReceipt(sale) {
    App.ui.openModal({
      title: 'Venda ' + sale.number + ' concluída',
      size: 'sm',
      bodyNode: App.ui.el('div', {}, [
        App.ui.el('p', {}, ['Total: ' + fmt.money(sale.total)]),
        App.ui.el('p', { class: 'text-muted' }, ['Data: ' + fmt.dateTimeBR(sale.createdAt)]),
        App.ui.el('p', {}, [App.ui.el('a', { href: '#/vendas/historico' }, ['Ver no histórico de vendas →'])])
      ]),
      footerButtons: [{ label: 'Nova venda', className: 'btn-primary' }]
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.pdv = { render: render };
})(window);
