/* AMÁH Brand — validações centralizadas */
(function (global) {
  'use strict';

  function required(value, fieldLabel) {
    if (value === undefined || value === null || String(value).trim() === '') {
      throw new Error(fieldLabel + ' é obrigatório.');
    }
  }

  function positiveNumber(value, fieldLabel, allowZero) {
    var n = Number(value);
    if (!isFinite(n) || (allowZero ? n < 0 : n <= 0)) {
      throw new Error(fieldLabel + ' deve ser um número ' + (allowZero ? 'maior ou igual a zero' : 'maior que zero') + '.');
    }
    return n;
  }

  // Verifica unicidade de SKU entre os produtos existentes (ignorando o próprio id em edição).
  function skuUnico(sku, excludeId) {
    return App.db.getByIndex('products', 'sku', sku).then(function (matches) {
      var conflict = matches.filter(function (p) { return p.id !== excludeId; });
      if (conflict.length > 0) {
        throw new Error('Já existe um produto cadastrado com o código/SKU "' + sku + '".');
      }
      return true;
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.validation = {
    required: required,
    positiveNumber: positiveNumber,
    skuUnico: skuUnico
  };
})(window);
