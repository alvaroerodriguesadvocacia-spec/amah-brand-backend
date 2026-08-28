/* AMÁH Brand — SalesEngine: motor único de vendas (PDV)
 *
 * Regra de Ouro Financeira (item 55): Venda ≠ Faturamento ≠ Recebimento ≠ Caixa ≠ Lucro.
 * - sale.total = faturamento bruto da venda.
 * - payments[].netAmount = recebimento líquido (já descontada a taxa da forma de pagamento).
 * - cash_movements = o que efetivamente entra/sai do caixa físico (só formas marcadas affectsCash).
 * - Lucro é sempre calculado em relatório a partir de sale_items.unitCostAtSale (custo VIGENTE
 *   no momento da venda, nunca o custo atual do produto — para não distorcer histórico).
 *
 * "Escanear não é baixar estoque" (item 10): o carrinho do PDV vive só em memória do módulo de
 * tela; esta engine só é chamada em FINALIZAR VENDA, e faz a baixa real via movimentações,
 * como transação lógica única (item 11).
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function addDays(iso, days) { var d = new Date(iso); d.setDate(d.getDate() + days); return d.toISOString(); }
  function isDeferredMethod(name) {
    var n = (name || '').toLowerCase();
    return n.indexOf('prazo') !== -1 || n.indexOf('boleto') !== -1;
  }

  function finalizeSale(params) {
    if (App.api && App.api.enabled) return App.api.operations.salesFinalize(params);
    var items = params.items || [];
    var payments = params.payments || [];
    if (items.length === 0) return Promise.reject(new Error('A venda precisa ter ao menos um item no carrinho.'));
    if (payments.length === 0) return Promise.reject(new Error('Selecione ao menos uma forma de pagamento.'));

    var productIds = items.map(function (i) { return i.productId; });

    return Promise.all([
      Promise.all(productIds.map(function (id) { return App.db.getById('products', id); })),
      App.core.stockEngine.calcularSaldoTodos(),
      App.db.getById('settings', 'payment_methods'),
      params.customerId ? App.db.getById('customers', params.customerId) : Promise.resolve(null),
      App.db.getById('settings', 'counters')
    ]).then(function (results) {
      var products = results[0], stockMap = results[1], paymentMethodsDoc = results[2], customer = results[3], counterDoc = results[4];
      var productMap = {};
      products.forEach(function (p, idx) {
        if (!p) throw new Error('Um dos produtos do carrinho não foi encontrado (pode ter sido excluído).');
        productMap[p.id] = p;
      });

      var subtotal = 0, itemDiscountTotal = 0;
      var saleItems = items.map(function (it) {
        var product = productMap[it.productId];
        if (!product.active) throw new Error('Produto "' + product.name + '" está inativo e não pode ser vendido.');
        var qty = App.core.validation.positiveNumber(it.qty, 'Quantidade de "' + product.name + '"');
        // allowZero=false: uma peça sem preço definido (fica 0 até alguém
        // preencher, ver products.js) não pode ser vendida de graça por
        // engano — pra desconto total de propósito, usa-se o campo
        // "desconto" do item (2026-08-26).
        var unitPrice = App.core.validation.positiveNumber(it.unitPrice, 'Preço de "' + product.name + '"', false);
        var discount = Number(it.discount) || 0;
        var lineTotal = round2(qty * unitPrice - discount);
        if (lineTotal < 0) throw new Error('Desconto maior que o valor do item "' + product.name + '".');
        var available = stockMap[product.id] || 0;
        if (available - qty < 0) {
          throw new Error('Estoque insuficiente para "' + product.name + '". Disponível: ' + available + ', solicitado: ' + qty + '.');
        }
        subtotal += qty * unitPrice;
        itemDiscountTotal += discount;
        var unitCostAtSale = (Number(product.cost) || 0) + (Number(product.additionalCosts) || 0);
        return {
          id: App.core.uuid(), saleId: null, productId: product.id, productName: product.name, sku: product.sku,
          qty: qty, unitPrice: unitPrice, discount: discount, total: lineTotal,
          unitCostAtSale: unitCostAtSale, returnedQty: 0
        };
      });

      var discountTotal = round2(itemDiscountTotal + (Number(params.discountTotal) || 0));
      var total = round2(subtotal - discountTotal);
      if (total <= 0) throw new Error('O total da venda deve ser maior que zero.');

      var methods = (paymentMethodsDoc && paymentMethodsDoc.items) || [];
      var methodMap = {}; methods.forEach(function (m) { methodMap[m.id] = m; });
      var paymentsSum = 0;
      var paymentRecords = payments.map(function (p) {
        var method = methodMap[p.methodId];
        if (!method) throw new Error('Forma de pagamento inválida.');
        var amount = App.core.validation.positiveNumber(p.amount, 'Valor em ' + method.name, true);
        paymentsSum += amount;
        var feePercent = Number(method.feePercent) || 0;
        var feeAmount = round2(amount * feePercent / 100);
        var netAmount = round2(amount - feeAmount);
        return {
          id: App.core.uuid(), saleId: null, methodId: method.id, methodName: method.name, feePercent: feePercent,
          grossAmount: round2(amount), feeAmount: feeAmount, netAmount: netAmount,
          deferred: isDeferredMethod(method.name), dueDate: p.dueDate || null,
          affectsCash: method.affectsCash !== false && (method.name === 'Dinheiro' || method.name === 'PIX' || !!method.affectsCash),
          createdAt: fmt.nowIso()
        };
      });
      if (Math.abs(round2(paymentsSum) - total) > 0.01) {
        throw new Error('A soma dos pagamentos (' + fmt.money(paymentsSum) + ') não corresponde ao total da venda (' + fmt.money(total) + ').');
      }

      var nextNum = ((counterDoc && counterDoc.saleNumber) || 0) + 1;
      var saleNumberStr = 'V' + String(nextNum).padStart(6, '0');
      var now = fmt.nowIso();
      var sale = {
        id: App.core.uuid(), number: saleNumberStr, customerId: params.customerId || null,
        subtotal: round2(subtotal), discountTotal: discountTotal, total: total,
        status: 'concluida', cancelReason: null, cancelledAt: null, cashSessionId: params.cashSessionId || null,
        // Modo local (IndexedDB) não tem login/papéis — mantém o campo por
        // consistência de formato com o modo API (ver operations.js), sempre nulo aqui.
        sellerId: null, sellerName: null,
        createdAt: now, updatedAt: now
      };
      saleItems.forEach(function (si) { si.saleId = sale.id; });
      paymentRecords.forEach(function (pr) { pr.saleId = sale.id; });

      var stockMovements = saleItems.map(function (si) {
        return App.core.stockEngine.buildMovement({
          productId: si.productId, type: 'SAIDA_VENDA', quantity: si.qty,
          relatedDocument: sale.number, reason: 'Venda ' + sale.number
        });
      });

      var receivables = [];
      paymentRecords.forEach(function (pr) {
        if (pr.deferred) {
          receivables.push({
            id: App.core.uuid(), customerId: sale.customerId, saleId: sale.id, paymentId: pr.id,
            parcelNumber: 1, dueDate: pr.dueDate || addDays(now, 30), amount: pr.netAmount,
            status: 'pendente', paidAt: null, paidAmount: 0, createdAt: now
          });
        }
      });

      var cashMovements = [];
      if (params.cashSessionId) {
        paymentRecords.forEach(function (pr) {
          if (pr.affectsCash && !pr.deferred) {
            cashMovements.push({
              id: App.core.uuid(), cashSessionId: params.cashSessionId, type: 'venda', amount: pr.netAmount,
              direction: 1, description: 'Venda ' + sale.number + ' — ' + pr.methodName,
              relatedDocument: sale.number, createdAt: now
            });
          }
        });
      }

      return App.db.runAtomic(
        ['sales', 'sale_items', 'payments', 'accounts_receivable', 'cash_movements', 'inventory_movements', 'products', 'customers', 'settings', 'audit_logs'],
        'readwrite',
        function (t) {
          var cDoc = counterDoc || { id: 'counters' };
          cDoc.saleNumber = nextNum;
          t.objectStore('settings').put(cDoc);

          t.objectStore('sales').put(sale);
          saleItems.forEach(function (si) { t.objectStore('sale_items').put(si); });
          paymentRecords.forEach(function (pr) { t.objectStore('payments').put(pr); });
          stockMovements.forEach(function (m) { t.objectStore('inventory_movements').put(m); });
          receivables.forEach(function (r) { t.objectStore('accounts_receivable').put(r); });
          cashMovements.forEach(function (cm) { t.objectStore('cash_movements').put(cm); });

          saleItems.forEach(function (si) {
            var p = productMap[si.productId];
            var updated = Object.assign({}, p, { totalSold: (p.totalSold || 0) + si.qty, lastSaleAt: now, updatedAt: now });
            productMap[si.productId] = updated;
            t.objectStore('products').put(updated);
          });

          if (customer) {
            var updatedCustomer = Object.assign({}, customer, {
              totalPurchased: round2((customer.totalPurchased || 0) + sale.total),
              purchaseCount: (customer.purchaseCount || 0) + 1,
              firstPurchaseAt: customer.firstPurchaseAt || now,
              lastPurchaseAt: now, updatedAt: now
            });
            t.objectStore('customers').put(updatedCustomer);
          }

          App.core.audit.log(t, { operation: 'CREATE', entity: 'sales', entityId: sale.id, newValue: sale, reason: 'Finalização de venda' });
        }
      ).then(function () { return sale; });
    });
  }

  function cancelSale(saleId, reason) {
    if (App.api && App.api.enabled) return App.api.operations.salesCancel(saleId, reason);
    if (!reason || !reason.trim()) return Promise.reject(new Error('Informe o motivo do cancelamento.'));
    return Promise.all([
      App.db.getById('sales', saleId),
      App.db.getByIndex('sale_items', 'saleId', saleId),
      App.db.getByIndex('accounts_receivable', 'saleId', saleId),
      App.db.getAll('cash_movements'),
      App.db.getAll('cash_sessions')
    ]).then(function (results) {
      var sale = results[0], saleItems = results[1], receivables = results[2], allCashMovements = results[3], allSessions = results[4];
      if (!sale) throw new Error('Venda não encontrada.');
      if (sale.status !== 'concluida') throw new Error('Esta venda já está cancelada.');

      var sessionsById = {}; allSessions.forEach(function (s) { sessionsById[s.id] = s; });
      var now = fmt.nowIso();

      var stockMovements = saleItems
        .filter(function (si) { return (si.qty - (si.returnedQty || 0)) > 0; })
        .map(function (si) {
          return App.core.stockEngine.buildMovement({
            productId: si.productId, type: 'ESTORNO_VENDA', quantity: si.qty - (si.returnedQty || 0),
            relatedDocument: sale.number, reason: 'Cancelamento de venda ' + sale.number + ': ' + reason
          });
        });

      var updatedReceivables = receivables
        .filter(function (r) { return r.status === 'pendente' || r.status === 'vencido'; })
        .map(function (r) { return Object.assign({}, r, { status: 'cancelado', updatedAt: now }); });

      var relatedCashMovements = allCashMovements.filter(function (cm) { return cm.relatedDocument === sale.number && cm.type === 'venda'; });
      var reversalCashMovements = relatedCashMovements
        .filter(function (cm) { var session = sessionsById[cm.cashSessionId]; return session && session.status === 'aberto'; })
        .map(function (cm) {
          return {
            id: App.core.uuid(), cashSessionId: cm.cashSessionId, type: 'estorno_venda', amount: cm.amount, direction: -1,
            description: 'Estorno da venda ' + sale.number + ' (cancelamento)', relatedDocument: sale.number, createdAt: now
          };
        });

      var updatedSale = Object.assign({}, sale, { status: 'cancelada', cancelReason: reason, cancelledAt: now, updatedAt: now });

      return App.db.runAtomic(
        ['sales', 'accounts_receivable', 'cash_movements', 'inventory_movements', 'audit_logs'],
        'readwrite',
        function (t) {
          t.objectStore('sales').put(updatedSale);
          stockMovements.forEach(function (m) { t.objectStore('inventory_movements').put(m); });
          updatedReceivables.forEach(function (r) { t.objectStore('accounts_receivable').put(r); });
          reversalCashMovements.forEach(function (cm) { t.objectStore('cash_movements').put(cm); });
          App.core.audit.log(t, {
            operation: 'UPDATE', entity: 'sales', entityId: sale.id, oldValue: sale, newValue: updatedSale, reason: reason
          });
        }
      ).then(function () { return updatedSale; });
    });
  }

  // Devolução total ou parcial de um item de venda. Reverte estoque sempre;
  // reverte proporcionalmente o caixa apenas se houver sessão de caixa aberta
  // vinculada à venda original (simplificação documentada no LEIAME).
  function returnSaleItem(params) {
    var saleItemId = params.saleItemId, qty = Number(params.qty), reason = params.reason;
    if (App.api && App.api.enabled) return App.api.operations.salesItemReturn(saleItemId, { qty: qty, reason: reason });
    if (!reason || !reason.trim()) return Promise.reject(new Error('Informe o motivo da devolução.'));
    return Promise.all([
      App.db.getById('sale_items', saleItemId),
      App.db.getAll('cash_sessions')
    ]).then(function (results) {
      var saleItem = results[0], allSessions = results[1];
      if (!saleItem) throw new Error('Item de venda não encontrado.');
      var remaining = saleItem.qty - (saleItem.returnedQty || 0);
      App.core.validation.positiveNumber(qty, 'Quantidade a devolver');
      if (qty > remaining) throw new Error('Quantidade a devolver (' + qty + ') maior que a quantidade disponível para devolução (' + remaining + ').');

      return App.db.getById('sales', saleItem.saleId).then(function (sale) {
        if (!sale) throw new Error('Venda original não encontrada.');
        if (sale.status !== 'concluida') throw new Error('Não é possível devolver itens de uma venda cancelada.');

        var now = fmt.nowIso();
        var movement = App.core.stockEngine.buildMovement({
          productId: saleItem.productId, type: 'ESTORNO_VENDA', quantity: qty,
          relatedDocument: sale.number, reason: 'Devolução parcial (' + qty + ' un.) — ' + reason
        });
        var updatedItem = Object.assign({}, saleItem, { returnedQty: (saleItem.returnedQty || 0) + qty, updatedAt: now });

        var cashMovements = [];
        if (sale.cashSessionId) {
          var session = allSessions.filter(function (s) { return s.id === sale.cashSessionId; })[0];
          if (session && session.status === 'aberto') {
            var proportionalValue = Math.round((qty / saleItem.qty) * saleItem.total * 100) / 100;
            cashMovements.push({
              id: App.core.uuid(), cashSessionId: session.id, type: 'devolucao', amount: proportionalValue, direction: -1,
              description: 'Devolução — Venda ' + sale.number + ' (' + saleItem.productName + ')',
              relatedDocument: sale.number, createdAt: now
            });
          }
        }

        return App.db.runAtomic(['sale_items', 'cash_movements', 'inventory_movements', 'audit_logs'], 'readwrite', function (t) {
          t.objectStore('sale_items').put(updatedItem);
          t.objectStore('inventory_movements').put(movement);
          cashMovements.forEach(function (cm) { t.objectStore('cash_movements').put(cm); });
          App.core.audit.log(t, {
            operation: 'UPDATE', entity: 'sale_items', entityId: saleItem.id, oldValue: saleItem, newValue: updatedItem, reason: reason
          });
        }).then(function () { return updatedItem; });
      });
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.salesEngine = {
    finalizeSale: finalizeSale, cancelSale: cancelSale, returnSaleItem: returnSaleItem,
    isDeferredMethod: isDeferredMethod, round2: round2
  };
})(window);
