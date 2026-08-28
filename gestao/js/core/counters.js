/* AMÁH Brand — contadores sequenciais (número de venda, compra, inventário) */
(function (global) {
  'use strict';

  // Lê e incrementa um contador dentro da MESMA transação atômica do chamador.
  // t precisa incluir a store 'settings'. Retorna o número obtido (via callback,
  // pois a leitura dentro de uma transação IndexedDB é assíncrona).
  function nextNumberInTx(t, counterKey, cb) {
    var store = t.objectStore('settings');
    var req = store.get('counters');
    req.onsuccess = function () {
      var doc = req.result || { id: 'counters' };
      var next = (doc[counterKey] || 0) + 1;
      doc[counterKey] = next;
      store.put(doc);
      cb(next);
    };
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.counters = { nextNumberInTx: nextNumberInTx };
})(window);
