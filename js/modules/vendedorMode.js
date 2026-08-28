/* AMÁH Brand — Modo Vendedor (mobile-first)
 *
 * NÃO é um novo PDV: esta tela só monta uma interface diferente por cima do
 * MESMO motor de vendas que o PDV de mesa usa — App.core.salesEngine,
 * App.core.stockEngine, App.core.cashEngine, App.modules.customers e
 * App.core.scanner. Uma venda feita aqui usa exatamente o mesmo
 * App.core.salesEngine.finalizeSale(...) do PDV, então cai no mesmo estoque,
 * histórico, caixa e indicadores — sem nenhuma sincronização manual.
 *
 * Diferenças propositais de UX em relação ao PDV de mesa (ver diagnóstico,
 * seção 05/06): busca tolera termo parcial (nome, código, categoria — o PDV
 * de mesa continua com busca exata, sem alteração), botões grandes, poucos
 * passos, carrinho e pagamento pensados pra tela de celular.
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var round2 = App.core.salesEngine.round2;

  var state = null;

  function freshState() {
    return {
      cart: [], // { productId, name, sku, unitPrice, qty, discount, image }
      customerId: null, customerName: null,
      payments: [], // { id, methodId, methodName, amount }
      products: [], categories: [], stockMap: {}, paymentMethods: [],
      openSession: null,
      searchTerm: '', activeCategoryId: null
    };
  }

  function render(container) {
    state = freshState();
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'vendor-screen', id: 'vendor-screen' }, [
      App.ui.el('div', { class: 'vendor-loading' }, ['Carregando…'])
    ]));

    Promise.all([
      App.db.getAll('products'),
      App.db.getAll('categories'),
      App.db.getById('settings', 'payment_methods'),
      App.core.cashEngine.getOpenSession(),
      App.core.stockEngine.calcularSaldoTodos()
    ]).then(function (results) {
      state.products = results[0].filter(function (p) { return p.active !== false; });
      state.categories = results[1].filter(function (c) { return c.active !== false; });
      state.paymentMethods = ((results[2] && results[2].items) || []).filter(function (m) { return m.active; });
      state.openSession = results[3];
      state.stockMap = results[4];
      renderShell(container);
    }).catch(function (err) {
      container.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Não foi possível carregar</h3><p>' + fmt.escapeHtml(err.message) + '</p></div>';
    });
  }

  // ---------------- Estrutura da tela ----------------

  function renderShell(container) {
    container.innerHTML = '';

    var customerChip = App.ui.el('button', { class: 'vendor-customer-chip', id: 'vendor-customer-chip', type: 'button', onclick: openCustomerPicker });
    var cashChip = App.ui.el('div', { id: 'vendor-cash-chip' });

    var header = App.ui.el('div', { class: 'vendor-header' }, [
      App.ui.el('div', { class: 'vendor-header-top' }, [
        App.ui.el('div', { class: 'vendor-title' }, ['Vender']),
        cashChip
      ]),
      customerChip
    ]);

    var searchInput = App.ui.el('input', {
      id: 'vendor-search-input', class: 'vendor-search-input', placeholder: 'Buscar por nome, código ou categoria…',
      oninput: function (e) { state.searchTerm = e.target.value; renderResults(); }
    });
    var scanBtn = App.ui.el('button', { class: 'vendor-scan-btn', type: 'button', onclick: openScanner }, ['📷', App.ui.el('span', {}, ['Escanear'])]);
    var searchRow = App.ui.el('div', { class: 'vendor-search-row' }, [searchInput, scanBtn]);

    var chipsRow = App.ui.el('div', { class: 'vendor-chips-row', id: 'vendor-chips-row' });

    var resultsWrap = App.ui.el('div', { class: 'vendor-results', id: 'vendor-results' });
    var cartWrap = App.ui.el('div', { class: 'vendor-cart', id: 'vendor-cart' });

    var bottomBar = App.ui.el('div', { class: 'vendor-bottom-bar', id: 'vendor-bottom-bar' });

    container.appendChild(App.ui.el('div', { class: 'vendor-screen' }, [
      header, searchRow, chipsRow, resultsWrap, cartWrap
    ]));
    container.appendChild(bottomBar);

    renderCashChip();
    renderCategoryChips();
    renderCustomerChip();
    renderResults();
    renderCart();
    renderBottomBar();
  }

  function renderCashChip() {
    var slot = document.getElementById('vendor-cash-chip');
    if (!slot) return;
    slot.innerHTML = '';
    if (state.openSession) {
      slot.appendChild(App.ui.el('span', { class: 'vendor-cash-ok' }, ['🗄️ Caixa aberto']));
      return;
    }
    slot.appendChild(App.ui.el('button', { class: 'vendor-cash-warn', type: 'button', onclick: openCashPrompt }, ['🗄️ Abrir caixa']));
  }

  function openCashPrompt() {
    var input = App.ui.el('input', { type: 'number', step: '0.01', min: '0', value: '0', id: 'vendor-cash-opening' });
    App.ui.openModal({
      title: 'Abrir caixa',
      bodyNode: App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Saldo inicial (R$)']), input]),
        App.ui.el('div', { class: 'hint' }, ['Vendas em dinheiro/PIX só entram no caixa depois que ele é aberto.'])
      ]),
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: 'Abrir caixa', className: 'btn-primary', onClick: function (close) {
            var value = Number(input.value) || 0;
            App.core.cashEngine.openSession(value, 'Aberto pelo Modo Vendedor').then(function (session) {
              state.openSession = session;
              renderCashChip();
              App.ui.toast('Caixa aberto.', 'success');
              close();
            }).catch(function (err) { App.ui.toast(err.message, 'error'); });
          }
        }
      ]
    });
  }

  // ---------------- Cliente ----------------

  function renderCustomerChip() {
    var chip = document.getElementById('vendor-customer-chip');
    if (!chip) return;
    chip.innerHTML = '';
    chip.appendChild(App.ui.el('span', { class: 'vendor-customer-icon' }, ['👤']));
    chip.appendChild(App.ui.el('span', {}, [state.customerName || 'Cliente não identificado']));
    chip.appendChild(App.ui.el('span', { class: 'vendor-customer-caret' }, ['›']));
  }

  function openCustomerPicker() {
    var searchInput = App.ui.el('input', { placeholder: 'Buscar cliente por nome ou telefone…', id: 'vendor-customer-search' });
    var listWrap = App.ui.el('div', { class: 'vendor-customer-list', id: 'vendor-customer-list' });
    var noneBtn = App.ui.el('button', {
      class: 'btn btn-secondary', type: 'button', style: 'width:100%;margin-bottom:10px;',
      onclick: function () { state.customerId = null; state.customerName = null; renderCustomerChip(); modalRef.close(); }
    }, ['Cliente não identificado']);
    var newBtn = App.ui.el('button', {
      class: 'btn btn-primary', type: 'button', style: 'width:100%;margin-bottom:10px;',
      onclick: function () {
        App.modules.customers.openForm(null, function (customer) {
          state.customerId = customer.id; state.customerName = customer.name;
          renderCustomerChip();
          modalRef.close();
        });
      }
    }, ['+ Novo cliente']);

    App.db.getAll('customers').then(function (customers) {
      var active = customers.filter(function (c) { return c.active !== false; }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'pt-BR'); });
      function renderList(term) {
        listWrap.innerHTML = '';
        var t = (term || '').toLowerCase();
        var filtered = !t ? active : active.filter(function (c) {
          return (c.name || '').toLowerCase().indexOf(t) !== -1 || (c.phone || '').indexOf(t) !== -1 || (c.whatsapp || '').indexOf(t) !== -1;
        });
        if (!filtered.length) { listWrap.appendChild(App.ui.el('p', { class: 'text-muted' }, ['Nenhum cliente encontrado.'])); return; }
        filtered.slice(0, 40).forEach(function (c) {
          listWrap.appendChild(App.ui.el('div', {
            class: 'vendor-customer-row', onclick: function () {
              state.customerId = c.id; state.customerName = c.name;
              renderCustomerChip();
              modalRef.close();
            }
          }, [
            App.ui.el('strong', {}, [c.name]),
            App.ui.el('span', { class: 'text-faint' }, [c.phone || c.whatsapp || ''])
          ]));
        });
      }
      searchInput.addEventListener('input', function (e) { renderList(e.target.value); });
      renderList('');
    });

    var modalRef = App.ui.openModal({
      title: 'Selecionar cliente',
      bodyNode: App.ui.el('div', {}, [noneBtn, newBtn, searchInput, listWrap]),
      footerButtons: [{ label: 'Fechar', className: 'btn-secondary' }]
    });
  }

  // ---------------- Busca de produtos (tolera termo parcial) ----------------

  function categoryName(id) {
    var c = state.categories.filter(function (c) { return c.id === id; })[0];
    return c ? c.name : '';
  }

  function renderCategoryChips() {
    var row = document.getElementById('vendor-chips-row');
    if (!row) return;
    row.innerHTML = '';
    if (!state.categories.length) return;
    state.categories.forEach(function (c) {
      var active = state.activeCategoryId === c.id;
      row.appendChild(App.ui.el('button', {
        class: 'vendor-chip' + (active ? ' active' : ''), type: 'button',
        onclick: function () { state.activeCategoryId = active ? null : c.id; renderCategoryChips(); renderResults(); }
      }, [c.name]));
    });
  }

  function matchesSearch(product, term) {
    if (!term) return true;
    var haystack = [product.name, product.sku, product.barcode, categoryName(product.categoryId), product.color, product.material]
      .filter(Boolean).join(' ').toLowerCase();
    return term.split(/\s+/).every(function (t) { return haystack.indexOf(t) !== -1; });
  }

  function renderResults() {
    var wrap = document.getElementById('vendor-results');
    if (!wrap) return;
    wrap.innerHTML = '';
    var term = (state.searchTerm || '').trim().toLowerCase();
    if (!term && !state.activeCategoryId) { wrap.classList.remove('open'); return; }
    wrap.classList.add('open');

    var results = state.products.filter(function (p) {
      if (state.activeCategoryId && p.categoryId !== state.activeCategoryId) return false;
      return matchesSearch(p, term);
    }).slice(0, 40);

    if (!results.length) {
      wrap.appendChild(App.ui.el('div', { class: 'vendor-empty-hint' }, ['Nenhum produto encontrado.']));
      return;
    }
    results.forEach(function (p) {
      var stock = state.stockMap[p.id] || 0;
      var row = App.ui.el('div', { class: 'vendor-result-row' + (stock <= 0 ? ' disabled' : ''), onclick: function () { if (stock > 0) addToCart(p); } }, [
        p.image ? App.ui.el('img', { class: 'vendor-result-photo', src: p.image }) : App.ui.el('div', { class: 'vendor-result-photo placeholder' }, ['💍']),
        App.ui.el('div', { class: 'vendor-result-info' }, [
          App.ui.el('div', { class: 'vendor-result-name' }, [p.name]),
          App.ui.el('div', { class: 'vendor-result-meta' }, [p.sku + ' · ' + (stock > 0 ? stock + ' em estoque' : 'sem estoque')])
        ]),
        App.ui.el('div', { class: 'vendor-result-price' }, [fmt.money(p.retailPrice)])
      ]);
      wrap.appendChild(row);
    });
  }

  // ---------------- Scanner (contínuo — item 8/9 do diagnóstico) ----------------

  function openScanner() {
    var index = {};
    state.products.forEach(function (p) { if (p.sku) index[p.sku.toUpperCase()] = p; if (p.barcode) index[p.barcode] = p; });
    App.core.scanner.openScannerModal({
      title: 'Escanear peça',
      onDetect: function (code) {
        var product = index[code] || index[String(code).toUpperCase()];
        if (!product) { App.ui.toast('Código "' + code + '" não encontrado.', 'error'); return; }
        var stock = state.stockMap[product.id] || 0;
        if (stock <= 0) { App.ui.toast(product.name + ' está sem estoque.', 'error'); return; }
        if (addToCart(product)) App.ui.toast('✔ ' + product.name + ' — ' + fmt.money(product.retailPrice), 'success');
      }
    });
  }

  // ---------------- Carrinho ----------------

  // Retorna true se a peça entrou de fato no carrinho — o chamador (scanner)
  // usa isso pra só mostrar o toast de sucesso quando realmente adicionou,
  // em vez de mostrar "✔ sucesso" logo depois de um toast de erro (bug que
  // já existia pro caso de estoque insuficiente e agora vale também pro
  // caso de preço não definido) (2026-08-26).
  function addToCart(product) {
    // Peça sem preço definido (fica em R$ 0,00 até alguém preencher em
    // Produtos) não pode ser vendida — avisa aqui, na hora de adicionar, em
    // vez de só travar depois no "Finalizar Venda" (2026-08-26).
    if (!(Number(product.retailPrice) > 0)) {
      App.ui.toast('"' + product.name + '" ainda não tem preço definido — peça pra alguém preencher em Produtos antes de vender.', 'error');
      return false;
    }
    var stock = state.stockMap[product.id] || 0;
    var existing = state.cart.filter(function (i) { return i.productId === product.id; })[0];
    if (existing) {
      if (existing.qty + 1 > stock) { App.ui.toast('Estoque insuficiente para mais uma unidade de "' + product.name + '".', 'error'); return false; }
      existing.qty += 1;
    } else {
      state.cart.push({ productId: product.id, name: product.name, sku: product.sku, unitPrice: product.retailPrice, qty: 1, discount: 0, image: product.image, maxStock: stock });
    }
    renderCart();
    renderBottomBar();
    return true;
  }

  function changeQty(item, delta) {
    var next = item.qty + delta;
    if (next <= 0) {
      state.cart = state.cart.filter(function (i) { return i !== item; });
    } else if (next > item.maxStock) {
      App.ui.toast('Estoque disponível: ' + item.maxStock + '.', 'error');
      return;
    } else {
      item.qty = next;
    }
    renderCart();
    renderBottomBar();
  }

  function cartTotal() {
    return round2(state.cart.reduce(function (sum, i) { return sum + i.qty * i.unitPrice - (i.discount || 0); }, 0));
  }

  function renderCart() {
    var wrap = document.getElementById('vendor-cart');
    if (!wrap) return;
    wrap.innerHTML = '';
    if (!state.cart.length) {
      wrap.appendChild(App.ui.el('div', { class: 'vendor-empty-hint' }, ['Carrinho vazio — busque ou escaneie uma peça.']));
      return;
    }
    wrap.appendChild(App.ui.el('div', { class: 'vendor-cart-title' }, ['Carrinho (' + state.cart.length + ')']));
    state.cart.forEach(function (item) {
      wrap.appendChild(App.ui.el('div', { class: 'vendor-cart-row' }, [
        item.image ? App.ui.el('img', { class: 'vendor-cart-photo', src: item.image }) : App.ui.el('div', { class: 'vendor-cart-photo placeholder' }, ['💍']),
        App.ui.el('div', { class: 'vendor-cart-info' }, [
          App.ui.el('div', { class: 'vendor-cart-name' }, [item.name]),
          App.ui.el('div', { class: 'vendor-cart-price' }, [fmt.money(item.unitPrice) + ' cada'])
        ]),
        App.ui.el('div', { class: 'vendor-qty-stepper' }, [
          App.ui.el('button', { type: 'button', onclick: function () { changeQty(item, -1); } }, ['−']),
          App.ui.el('span', {}, [String(item.qty)]),
          App.ui.el('button', { type: 'button', onclick: function () { changeQty(item, 1); } }, ['+'])
        ])
      ]));
    });
  }

  function renderBottomBar() {
    var bar = document.getElementById('vendor-bottom-bar');
    if (!bar) return;
    bar.innerHTML = '';
    var total = cartTotal();
    var finalizeBtn = App.ui.el('button', Object.assign(
      { class: 'btn btn-primary vendor-finalize-btn', type: 'button', onclick: openPaymentSheet },
      state.cart.length === 0 ? { disabled: 'disabled' } : {}
    ), ['Finalizar venda']);
    bar.appendChild(App.ui.el('div', { class: 'vendor-total-label' }, ['Total']));
    bar.appendChild(App.ui.el('div', { class: 'vendor-total-value' }, [fmt.money(total)]));
    bar.appendChild(finalizeBtn);
  }

  // ---------------- Pagamento (reaproveita exatamente a lógica do SalesEngine —
  // só a apresentação é diferente do PDV de mesa) ----------------

  function openPaymentSheet() {
    if (!state.cart.length) return;
    var total = cartTotal();
    var payments = []; // { methodId, methodName, amount }

    var methodSelect = App.ui.el('select', { id: 'vendor-pay-method' },
      state.paymentMethods.map(function (m) { return App.ui.el('option', { value: m.id }, [m.name]); }));
    var amountInput = App.ui.el('input', { type: 'number', step: '0.01', min: '0.01' });
    var addBtn = App.ui.el('button', { class: 'btn btn-secondary', type: 'button' }, ['+ Adicionar']);
    var listWrap = App.ui.el('div', { class: 'vendor-payment-list' });
    var remainingLabel = App.ui.el('div', { class: 'vendor-remaining' });
    var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });

    function remaining() { return round2(total - payments.reduce(function (s, p) { return s + p.amount; }, 0)); }

    function refresh() {
      var rem = remaining();
      remainingLabel.textContent = rem > 0.005 ? 'Falta ' + fmt.money(rem) : (rem < -0.005 ? 'Excedente ' + fmt.money(-rem) : 'Pagamento completo ✔');
      remainingLabel.className = 'vendor-remaining' + (Math.abs(rem) < 0.005 ? ' ok' : '');
      listWrap.innerHTML = '';
      payments.forEach(function (p, idx) {
        listWrap.appendChild(App.ui.el('div', { class: 'vendor-payment-row' }, [
          App.ui.el('span', {}, [p.methodName]),
          App.ui.el('span', { class: 'mono' }, [fmt.money(p.amount)]),
          App.ui.el('button', { type: 'button', class: 'btn btn-ghost btn-sm', onclick: function () { payments.splice(idx, 1); refresh(); } }, ['remover'])
        ]));
      });
      amountInput.value = rem > 0.005 ? rem.toFixed(2) : '';
    }

    addBtn.addEventListener('click', function () {
      var method = state.paymentMethods.filter(function (m) { return m.id === methodSelect.value; })[0];
      var amount = Number(amountInput.value);
      if (!method) { errorBox.textContent = 'Selecione uma forma de pagamento.'; errorBox.classList.remove('hidden'); return; }
      if (!isFinite(amount) || amount <= 0) { errorBox.textContent = 'Informe um valor válido.'; errorBox.classList.remove('hidden'); return; }
      errorBox.classList.add('hidden');
      payments.push({ methodId: method.id, methodName: method.name, amount: round2(amount) });
      refresh();
    });

    var confirmBtn = { label: 'Confirmar venda', className: 'btn-primary', onClick: function (close) { doFinalize(payments, close); } };

    var body = App.ui.el('div', {}, [
      App.ui.el('div', { class: 'vendor-pay-total' }, ['Total da venda: ', App.ui.el('strong', {}, [fmt.money(total)])]),
      errorBox,
      App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Forma de pagamento']), methodSelect]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Valor (R$)']), amountInput])
      ]),
      addBtn,
      listWrap,
      remainingLabel
    ]);

    var modalRef = App.ui.openModal({
      title: 'Pagamento',
      bodyNode: body,
      closeOnBackdrop: false,
      footerButtons: [{ label: 'Cancelar', className: 'btn-secondary' }, confirmBtn]
    });
    refresh();

    function doFinalize(paymentList, close) {
      var params = {
        customerId: state.customerId,
        items: state.cart.map(function (i) { return { productId: i.productId, qty: i.qty, unitPrice: i.unitPrice, discount: i.discount }; }),
        payments: paymentList.map(function (p) { return { methodId: p.methodId, amount: p.amount }; }),
        cashSessionId: state.openSession ? state.openSession.id : null
      };
      App.core.salesEngine.finalizeSale(params).then(function (sale) {
        close();
        App.ui.toast('Venda ' + sale.number + ' finalizada — ' + fmt.money(sale.total) + '.', 'success');
        state.cart = [];
        state.customerId = null; state.customerName = null;
        state.searchTerm = ''; state.activeCategoryId = null;
        var input = document.getElementById('vendor-search-input');
        if (input) input.value = '';
        renderCustomerChip();
        renderCategoryChips();
        renderResults();
        renderCart();
        renderBottomBar();
        // Recarrega estoque (a venda acabou de baixar) pra próxima peça vendida
        // já refletir o saldo certo.
        App.core.stockEngine.calcularSaldoTodos().then(function (map) { state.stockMap = map; });
      }).catch(function (err) {
        App.ui.toast(err.message, 'error');
      });
    }
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.vendedorMode = { render: render };
})(window);
