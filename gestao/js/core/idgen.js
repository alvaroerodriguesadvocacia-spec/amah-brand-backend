/* AMÁH Brand — geração de IDs estáveis (UUID v4) */
(function (global) {
  'use strict';

  function uuidv4() {
    if (global.crypto && typeof global.crypto.randomUUID === 'function') {
      return global.crypto.randomUUID();
    }
    // Fallback para ambientes sem crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.uuid = uuidv4;
})(window);
