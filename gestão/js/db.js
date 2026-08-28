/* AMÁH Brand — camada de persistência (IndexedDB)
 *
 * Esta é a ÚNICA parte do sistema que fala diretamente com IndexedDB.
 * A camada de domínio (js/core/*) e os módulos de tela (js/modules/*) usam
 * apenas a API abaixo (App.db.*). Isso mantém a porta aberta para, no futuro,
 * substituir IndexedDB por chamadas a uma API central sem reescrever regra
 * de negócio (ver ARQUITETURA.md, seção 9).
 */
(function (global) {
  'use strict';

  var DB_NAME = 'bijou_gestao';
  var DB_VERSION = 2;

  var STORES = {
    settings: { keyPath: 'id' },
    categories: { keyPath: 'id', indexes: [{ name: 'name', keyPath: 'name', unique: false }] },
    suppliers: { keyPath: 'id', indexes: [{ name: 'name', keyPath: 'name', unique: false }] },
    products: {
      keyPath: 'id',
      indexes: [
        { name: 'sku', keyPath: 'sku', unique: true },
        { name: 'barcode', keyPath: 'barcode', unique: false },
        { name: 'categoryId', keyPath: 'categoryId', unique: false },
        { name: 'supplierId', keyPath: 'supplierId', unique: false },
        { name: 'active', keyPath: 'active', unique: false }
      ]
    },
    inventory_movements: {
      keyPath: 'id',
      indexes: [
        { name: 'productId', keyPath: 'productId', unique: false },
        { name: 'createdAt', keyPath: 'createdAt', unique: false },
        { name: 'type', keyPath: 'type', unique: false }
      ]
    },
    audit_logs: {
      keyPath: 'id',
      indexes: [
        { name: 'timestamp', keyPath: 'timestamp', unique: false },
        { name: 'entity', keyPath: 'entity', unique: false }
      ]
    },

    // ---- Fase 3: Clientes e Vendas ----
    customers: { keyPath: 'id', indexes: [{ name: 'name', keyPath: 'name', unique: false }] },
    sales: {
      keyPath: 'id',
      indexes: [
        { name: 'createdAt', keyPath: 'createdAt', unique: false },
        { name: 'customerId', keyPath: 'customerId', unique: false },
        { name: 'status', keyPath: 'status', unique: false },
        { name: 'number', keyPath: 'number', unique: true }
      ]
    },
    sale_items: {
      keyPath: 'id',
      indexes: [
        { name: 'saleId', keyPath: 'saleId', unique: false },
        { name: 'productId', keyPath: 'productId', unique: false }
      ]
    },
    payments: {
      keyPath: 'id',
      indexes: [
        { name: 'saleId', keyPath: 'saleId', unique: false },
        { name: 'createdAt', keyPath: 'createdAt', unique: false }
      ]
    },

    // ---- Fase 4: Financeiro ----
    accounts_receivable: {
      keyPath: 'id',
      indexes: [
        { name: 'customerId', keyPath: 'customerId', unique: false },
        { name: 'saleId', keyPath: 'saleId', unique: false },
        { name: 'status', keyPath: 'status', unique: false },
        { name: 'dueDate', keyPath: 'dueDate', unique: false }
      ]
    },
    accounts_payable: {
      keyPath: 'id',
      indexes: [
        { name: 'supplierId', keyPath: 'supplierId', unique: false },
        { name: 'purchaseId', keyPath: 'purchaseId', unique: false },
        { name: 'status', keyPath: 'status', unique: false },
        { name: 'dueDate', keyPath: 'dueDate', unique: false }
      ]
    },
    expenses: {
      keyPath: 'id',
      indexes: [
        { name: 'status', keyPath: 'status', unique: false },
        { name: 'dueDate', keyPath: 'dueDate', unique: false },
        { name: 'categoryId', keyPath: 'categoryId', unique: false }
      ]
    },
    cash_sessions: {
      keyPath: 'id',
      indexes: [
        { name: 'status', keyPath: 'status', unique: false },
        { name: 'openedAt', keyPath: 'openedAt', unique: false }
      ]
    },
    cash_movements: {
      keyPath: 'id',
      indexes: [
        { name: 'cashSessionId', keyPath: 'cashSessionId', unique: false },
        { name: 'createdAt', keyPath: 'createdAt', unique: false },
        { name: 'type', keyPath: 'type', unique: false }
      ]
    },

    // ---- Fase 5: Compras ----
    purchases: {
      keyPath: 'id',
      indexes: [
        { name: 'supplierId', keyPath: 'supplierId', unique: false },
        { name: 'status', keyPath: 'status', unique: false },
        { name: 'createdAt', keyPath: 'createdAt', unique: false }
      ]
    },
    purchase_items: {
      keyPath: 'id',
      indexes: [
        { name: 'purchaseId', keyPath: 'purchaseId', unique: false },
        { name: 'productId', keyPath: 'productId', unique: false }
      ]
    },

    // ---- Fase 6: Inventário ----
    stock_counts: {
      keyPath: 'id',
      indexes: [{ name: 'status', keyPath: 'status', unique: false }, { name: 'startedAt', keyPath: 'startedAt', unique: false }]
    },
    stock_count_items: {
      keyPath: 'id',
      indexes: [
        { name: 'stockCountId', keyPath: 'stockCountId', unique: false },
        { name: 'productId', keyPath: 'productId', unique: false }
      ]
    }
  };

  var dbPromise = null;

  function apiMode() {
    return !!(global.App && global.App.api && global.App.api.enabled);
  }

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      if (!global.indexedDB) {
        reject(new Error('Este navegador não suporta IndexedDB. O AMÁH Brand não pode funcionar sem armazenamento local robusto.'));
        return;
      }
      var request = global.indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        Object.keys(STORES).forEach(function (storeName) {
          var config = STORES[storeName];
          var store;
          if (!db.objectStoreNames.contains(storeName)) {
            store = db.createObjectStore(storeName, { keyPath: config.keyPath });
          } else {
            store = event.target.transaction.objectStore(storeName);
          }
          (config.indexes || []).forEach(function (idx) {
            if (!store.indexNames.contains(idx.name)) {
              store.createIndex(idx.name, idx.keyPath, { unique: !!idx.unique });
            }
          });
        });
      };

      request.onsuccess = function (event) {
        resolve(event.target.result);
      };

      request.onerror = function (event) {
        reject(event.target.error || new Error('Falha ao abrir o banco de dados local.'));
      };

      request.onblocked = function () {
        reject(new Error('Abertura do banco de dados bloqueada por outra aba. Feche outras abas do AMÁH Brand e recarregue.'));
      };
    });
    return dbPromise;
  }

  function tx(storeNames, mode) {
    return openDb().then(function (db) {
      return db.transaction(storeNames, mode || 'readonly');
    });
  }

  function reqToPromise(request) {
    return new Promise(function (resolve, reject) {
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
  }

  function getAllLocal(storeName) {
    return tx([storeName]).then(function (t) {
      return reqToPromise(t.objectStore(storeName).getAll());
    });
  }

  function getByIdLocal(storeName, id) {
    return tx([storeName]).then(function (t) {
      return reqToPromise(t.objectStore(storeName).get(id));
    });
  }

  function getByIndexLocal(storeName, indexName, value) {
    return tx([storeName]).then(function (t) {
      var idx = t.objectStore(storeName).index(indexName);
      return reqToPromise(idx.getAll(value));
    });
  }

  function putLocal(storeName, record) {
    return tx([storeName], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        var req = t.objectStore(storeName).put(record);
        req.onsuccess = function () { resolve(record); };
        req.onerror = function () { reject(req.error); };
        t.onabort = function () { reject(t.error || new Error('Transação abortada em ' + storeName)); };
      });
    });
  }

  function putManyLocal(storeName, records) {
    return tx([storeName], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        var store = t.objectStore(storeName);
        records.forEach(function (r) { store.put(r); });
        t.oncomplete = function () { resolve(records); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Transação abortada em ' + storeName)); };
      });
    });
  }

  function removeLocal(storeName, id) {
    return tx([storeName], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        var req = t.objectStore(storeName).delete(id);
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function clearStoreLocal(storeName) {
    return tx([storeName], 'readwrite').then(function (t) {
      return new Promise(function (resolve, reject) {
        var req = t.objectStore(storeName).clear();
        req.onsuccess = function () { resolve(true); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  // Executa uma operação multi-store como transação atômica única (modo local).
  // fn recebe o objeto transaction e deve usar t.objectStore(...) diretamente
  // para todas as escritas que precisam ser tudo-ou-nada.
  function runAtomicLocal(storeNames, mode, fn) {
    return tx(storeNames, mode).then(function (t) {
      return new Promise(function (resolve, reject) {
        var result;
        try {
          result = fn(t);
        } catch (err) {
          try { t.abort(); } catch (e) {}
          reject(err);
          return;
        }
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('Operação cancelada: nenhuma alteração foi salva.')); };
      });
    });
  }

  // Versão em modo API do runAtomic: usada apenas pelas operações "simples"
  // (produto+auditoria, categoria+auditoria etc.) que não têm rota dedicada em
  // /api/v1/operations/*. fn recebe um objeto com a mesma forma de
  // t.objectStore(nome).put(registro)/.delete(id), mas as escritas são
  // enfileiradas e enviadas sequencialmente por HTTP — não há rollback real
  // se uma falhar no meio (limitação aceita para essas operações de baixo
  // risco; as operações de negócio complexas — vendas, compras, caixa,
  // ajuste de inventário — usam as rotas atômicas reais do backend, ver
  // js/core/*Engine.js).
  function runAtomicApi(storeNames, mode, fn) {
    var ops = [];
    var shim = {
      objectStore: function (name) {
        return {
          put: function (record) { ops.push({ store: name, type: 'put', record: record }); },
          delete: function (id) { ops.push({ store: name, type: 'delete', id: id }); }
        };
      }
    };
    var result;
    try {
      result = fn(shim);
    } catch (err) {
      return Promise.reject(err);
    }
    var chain = Promise.resolve();
    ops.forEach(function (op) {
      chain = chain.then(function () {
        return op.type === 'put' ? App.api.store.put(op.store, op.record) : App.api.store.remove(op.store, op.id);
      });
    });
    return chain.then(function () { return result; });
  }

  function open() {
    if (apiMode()) return Promise.resolve(true);
    return openDb();
  }

  function getAll(storeName) { return apiMode() ? App.api.store.getAll(storeName) : getAllLocal(storeName); }
  function getById(storeName, id) { return apiMode() ? App.api.store.getById(storeName, id) : getByIdLocal(storeName, id); }
  function getByIndex(storeName, indexName, value) { return apiMode() ? App.api.store.getByIndex(storeName, indexName, value) : getByIndexLocal(storeName, indexName, value); }
  function put(storeName, record) { return apiMode() ? App.api.store.put(storeName, record) : putLocal(storeName, record); }
  function putMany(storeName, records) { return apiMode() ? App.api.store.putMany(storeName, records) : putManyLocal(storeName, records); }
  function remove(storeName, id) { return apiMode() ? App.api.store.remove(storeName, id) : removeLocal(storeName, id); }
  function clearStore(storeName) { return apiMode() ? App.api.store.clearStore(storeName) : clearStoreLocal(storeName); }
  function clearAll() { return Promise.all(Object.keys(STORES).map(function (s) { return clearStore(s); })); }
  function runAtomic(storeNames, mode, fn) { return apiMode() ? runAtomicApi(storeNames, mode, fn) : runAtomicLocal(storeNames, mode, fn); }

  global.App = global.App || {};
  global.App.db = {
    STORES: Object.keys(STORES),
    open: open,
    tx: tx,
    getAll: getAll,
    getById: getById,
    getByIndex: getByIndex,
    put: put,
    putMany: putMany,
    remove: remove,
    clearStore: clearStore,
    clearAll: clearAll,
    runAtomic: runAtomic
  };
})(window);
