/* AMÁH Brand — PurchaseEngine: pedidos de compra e recebimento de mercadoria
 * Regra (item 21): cadastrar uma compra NÃO altera o estoque. O estoque só é
 * atualizado no recebimento, via StockEngine (ENTRADA_COMPRA), preservando a
 * Regra de Ouro do Estoque.
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  function createPurchase(params) {
    if (App.api && App.api.enabled) return App.api.operations.purchasesCreate(params);
    var items = params.items || [];
    if (!params.supplierId) return Promise.reject(new Error('Selecione um fornecedor.'));
    if (items.length === 0) return Promise.reject(new Error('Adicione ao menos um item à compra.'));

    return Promise.all([
      App.db.getById('suppliers', params.supplierId),
      App.db.getById('settings', 'counters')
    ]).then(function (results) {
      var supplier = results[0], counterDoc = results[1];
      if (!supplier) throw new Error('Fornecedor não encontrado.');

      var itemsTotal = 0;
      var purchaseItems = items.map(function (it) {
        var qty = App.core.validation.positiveNumber(it.qty, 'Quantidade');
        var unitCost = App.core.validation.positiveNumber(it.unitCost, 'Custo unitário', true);
        itemsTotal += qty * unitCost;
        return {
          id: App.core.uuid(), purchaseId: null, productId: it.productId, productName: it.productName, sku: it.sku,
          qty: qty, unitCost: unitCost, receivedQty: 0
        };
      });

      var freight = Number(params.freight) || 0;
      var additionalCosts = Number(params.additionalCosts) || 0;
      var discount = Number(params.discount) || 0;
      var total = round2(itemsTotal + freight + additionalCosts - discount);
      if (total <= 0) throw new Error('O valor total da compra deve ser maior que zero.');

      var nextNum = ((counterDoc && counterDoc.purchaseNumber) || 0) + 1;
      var now = fmt.nowIso();
      var purchase = {
        id: App.core.uuid(), number: 'C' + String(nextNum).padStart(6, '0'),
        supplierId: supplier.id, documentNumber: params.documentNumber || '', date: params.date || now,
        freight: freight, additionalCosts: additionalCosts, discount: discount, total: total,
        itemsTotal: round2(itemsTotal), paymentMethodId: params.paymentMethodId || null,
        expectedDeliveryDate: params.expectedDeliveryDate || null, status: 'pedido',
        payableGenerated: false, notes: params.notes || '', createdAt: now, updatedAt: now
      };
      purchaseItems.forEach(function (pi) { pi.purchaseId = purchase.id; });

      return App.db.runAtomic(['purchases', 'purchase_items', 'settings', 'audit_logs'], 'readwrite', function (t) {
        var cDoc = counterDoc || { id: 'counters' };
        cDoc.purchaseNumber = nextNum;
        t.objectStore('settings').put(cDoc);
        t.objectStore('purchases').put(purchase);
        purchaseItems.forEach(function (pi) { t.objectStore('purchase_items').put(pi); });
        App.core.audit.log(t, { operation: 'CREATE', entity: 'purchases', entityId: purchase.id, newValue: purchase });
      }).then(function () { return purchase; });
    });
  }

  // receivedQtyByItemId: { purchaseItemId: qtyRecebidaAgora }
  function receivePurchase(purchaseId, receivedQtyByItemId, options) {
    options = options || {};
    if (App.api && App.api.enabled) return App.api.operations.purchasesReceive(purchaseId, { receivedQtyByItemId: receivedQtyByItemId, options: options });
    return Promise.all([
      App.db.getById('purchases', purchaseId),
      App.db.getByIndex('purchase_items', 'purchaseId', purchaseId),
      App.db.getAll('products')
    ]).then(function (results) {
      var purchase = results[0], purchaseItems = results[1], allProducts = results[2];
      if (!purchase) throw new Error('Compra não encontrada.');
      if (purchase.status === 'recebido') throw new Error('Esta compra já foi totalmente recebida.');
      if (purchase.status === 'cancelado') throw new Error('Esta compra está cancelada.');

      var productMap = {}; allProducts.forEach(function (p) { productMap[p.id] = p; });
      var now = fmt.nowIso();
      var stockMovements = [];
      var updatedItems = [];
      var updatedProducts = {};
      var anyReceived = false;

      purchaseItems.forEach(function (item) {
        var qtyToReceive = Number(receivedQtyByItemId[item.id]) || 0;
        if (qtyToReceive <= 0) { updatedItems.push(item); return; }
        var remaining = item.qty - item.receivedQty;
        if (qtyToReceive > remaining) {
          throw new Error('Quantidade a receber de "' + item.productName + '" (' + qtyToReceive + ') maior que o pendente (' + remaining + ').');
        }
        anyReceived = true;
        stockMovements.push(App.core.stockEngine.buildMovement({
          productId: item.productId, type: 'ENTRADA_COMPRA', quantity: qtyToReceive,
          relatedDocument: purchase.number, reason: 'Recebimento da compra ' + purchase.number
        }));
        var updatedItem = Object.assign({}, item, { receivedQty: item.receivedQty + qtyToReceive });
        updatedItems.push(updatedItem);

        var product = productMap[item.productId];
        if (product) {
          updatedProducts[product.id] = Object.assign({}, (updatedProducts[product.id] || product), {
            cost: item.unitCost, lastPurchaseAt: now, updatedAt: now
          });
        }
      });

      if (!anyReceived) throw new Error('Informe ao menos uma quantidade a receber.');

      var allFullyReceived = updatedItems.every(function (i) { return i.receivedQty >= i.qty; });
      var someReceived = updatedItems.some(function (i) { return i.receivedQty > 0; });
      var newStatus = allFullyReceived ? 'recebido' : (someReceived ? 'parcial' : purchase.status);

      var payable = null;
      var updatedPurchase = Object.assign({}, purchase, { status: newStatus, updatedAt: now });
      if (options.generatePayable && !purchase.payableGenerated) {
        payable = {
          id: App.core.uuid(), supplierId: purchase.supplierId, purchaseId: purchase.id,
          categoryId: null, description: 'Compra ' + purchase.number, dueDate: options.payableDueDate || now,
          amount: purchase.total, status: 'pendente', paidAt: null, paidAmount: 0, createdAt: now
        };
        updatedPurchase.payableGenerated = true;
      }

      var stores = ['purchases', 'purchase_items', 'inventory_movements', 'products', 'audit_logs'];
      if (payable) stores.push('accounts_payable');

      return App.db.runAtomic(stores, 'readwrite', function (t) {
        t.objectStore('purchases').put(updatedPurchase);
        updatedItems.forEach(function (i) { t.objectStore('purchase_items').put(i); });
        stockMovements.forEach(function (m) { t.objectStore('inventory_movements').put(m); });
        Object.keys(updatedProducts).forEach(function (id) { t.objectStore('products').put(updatedProducts[id]); });
        if (payable) t.objectStore('accounts_payable').put(payable);
        App.core.audit.log(t, {
          operation: 'UPDATE', entity: 'purchases', entityId: purchase.id, oldValue: purchase, newValue: updatedPurchase,
          reason: 'Recebimento de mercadoria'
        });
      }).then(function () { return updatedPurchase; });
    });
  }

  function cancelPurchase(purchaseId, reason) {
    if (App.api && App.api.enabled) return App.api.operations.purchasesCancel(purchaseId, reason);
    return App.db.getById('purchases', purchaseId).then(function (purchase) {
      if (!purchase) throw new Error('Compra não encontrada.');
      if (purchase.status === 'recebido') throw new Error('Não é possível cancelar uma compra já totalmente recebida.');
      var updated = Object.assign({}, purchase, { status: 'cancelado', cancelReason: reason || '', updatedAt: fmt.nowIso() });
      return App.db.runAtomic(['purchases', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('purchases').put(updated);
        App.core.audit.log(t, { operation: 'UPDATE', entity: 'purchases', entityId: purchase.id, oldValue: purchase, newValue: updated, reason: reason });
      }).then(function () { return updated; });
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.purchaseEngine = { createPurchase: createPurchase, receivePurchase: receivePurchase, cancelPurchase: cancelPurchase };
})(window);
