/* AMÁH Brand — InventoryEngine: contagem de inventário (sistema × físico)
 * Nunca ajusta o estoque automaticamente (item 19): sempre mostra as
 * divergências e só grava movimentações após confirmação explícita.
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;

  function startCount(notes) {
    return App.db.getAll('stock_counts').then(function (all) {
      var open = all.filter(function (c) { return c.status === 'em_andamento'; })[0];
      if (open) return open; // reaproveita contagem em andamento
      var count = { id: App.core.uuid(), status: 'em_andamento', startedAt: fmt.nowIso(), finishedAt: null, notes: notes || '' };
      return App.db.put('stock_counts', count).then(function () { return count; });
    });
  }

  // Acrescenta (soma) uma leitura ao item de contagem do produto, criando-o se necessário.
  function addReading(stockCountId, productId, qty) {
    qty = Number(qty) || 1;
    return App.db.getByIndex('stock_count_items', 'stockCountId', stockCountId).then(function (items) {
      var existing = items.filter(function (i) { return i.productId === productId; })[0];
      if (existing) {
        existing.countedQty = (existing.countedQty || 0) + qty;
        return App.db.put('stock_count_items', existing);
      }
      return App.core.stockEngine.calcularSaldo(productId).then(function (systemQty) {
        var item = {
          id: App.core.uuid(), stockCountId: stockCountId, productId: productId,
          systemQty: systemQty, countedQty: qty
        };
        return App.db.put('stock_count_items', item);
      });
    });
  }

  function setReading(stockCountId, productId, countedQty) {
    return App.db.getByIndex('stock_count_items', 'stockCountId', stockCountId).then(function (items) {
      var existing = items.filter(function (i) { return i.productId === productId; })[0];
      if (existing) {
        existing.countedQty = Number(countedQty) || 0;
        return App.db.put('stock_count_items', existing);
      }
      return App.core.stockEngine.calcularSaldo(productId).then(function (systemQty) {
        var item = { id: App.core.uuid(), stockCountId: stockCountId, productId: productId, systemQty: systemQty, countedQty: Number(countedQty) || 0 };
        return App.db.put('stock_count_items', item);
      });
    });
  }

  function getDivergences(stockCountId) {
    return App.db.getByIndex('stock_count_items', 'stockCountId', stockCountId).then(function (items) {
      return items.map(function (i) { return Object.assign({}, i, { difference: i.countedQty - i.systemQty }); });
    });
  }

  // Confirma ajustes apenas para os itens informados em itemIds (permite ajustar
  // seletivamente). Gera ENTRADA_AJUSTE ou SAIDA_AJUSTE conforme a diferença.
  function confirmAdjustments(stockCountId, itemIds) {
    if (App.api && App.api.enabled) return App.api.operations.inventoryCountConfirmAdjustments(stockCountId, itemIds);
    return getDivergences(stockCountId).then(function (allItems) {
      var toAdjust = allItems.filter(function (i) { return itemIds.indexOf(i.id) !== -1 && i.difference !== 0; });
      if (toAdjust.length === 0) return Promise.resolve([]);

      var movements = toAdjust.map(function (i) {
        var type = i.difference > 0 ? 'ENTRADA_AJUSTE' : 'SAIDA_AJUSTE';
        return App.core.stockEngine.buildMovement({
          productId: i.productId, type: type, quantity: Math.abs(i.difference),
          relatedDocument: 'Inventário', reason: 'Ajuste de inventário — contagem física'
        });
      });
      var updatedItems = toAdjust.map(function (i) { return Object.assign({}, i, { adjusted: true }); });

      return App.db.runAtomic(['stock_count_items', 'inventory_movements', 'audit_logs'], 'readwrite', function (t) {
        updatedItems.forEach(function (i) { t.objectStore('stock_count_items').put(i); });
        movements.forEach(function (m) { t.objectStore('inventory_movements').put(m); });
        App.core.audit.log(t, { operation: 'ADJUST', entity: 'stock_counts', entityId: stockCountId, reason: 'Confirmação de divergências de inventário' });
      }).then(function () { return updatedItems; });
    });
  }

  function finishCount(stockCountId) {
    return App.db.getById('stock_counts', stockCountId).then(function (count) {
      if (!count) throw new Error('Inventário não encontrado.');
      var updated = Object.assign({}, count, { status: 'concluido', finishedAt: fmt.nowIso() });
      return App.db.put('stock_counts', updated).then(function () { return updated; });
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.inventoryEngine = {
    startCount: startCount, addReading: addReading, setReading: setReading,
    getDivergences: getDivergences, confirmAdjustments: confirmAdjustments, finishCount: finishCount
  };
})(window);
