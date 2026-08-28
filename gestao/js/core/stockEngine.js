/* AMÁH Brand — StockEngine: única porta de entrada para alterar estoque.
 *
 * Regra de Ouro do Estoque (item 54 da especificação): nenhum módulo grava
 * estoque diretamente no produto. O saldo é sempre a soma das movimentações
 * registradas aqui. Vendas, compras, devoluções, cancelamentos e inventário
 * (fases futuras) devem usar exclusivamente esta API.
 */
(function (global) {
  'use strict';

  var TIPOS = {
    ENTRADA_COMPRA: 1,
    ENTRADA_DEVOLUCAO: 1,
    ENTRADA_AJUSTE: 1,
    ENTRADA_INICIAL: 1,
    SAIDA_VENDA: -1,
    SAIDA_PERDA: -1,
    SAIDA_AVARIA: -1,
    SAIDA_AJUSTE: -1,
    ESTORNO_VENDA: 1,
    ESTORNO_COMPRA: -1
  };

  var TIPOS_ENTRADA = ['ENTRADA_COMPRA', 'ENTRADA_DEVOLUCAO', 'ENTRADA_AJUSTE', 'ENTRADA_INICIAL', 'ESTORNO_VENDA'];
  var TIPOS_SAIDA = ['SAIDA_VENDA', 'SAIDA_PERDA', 'SAIDA_AVARIA', 'SAIDA_AJUSTE', 'ESTORNO_COMPRA'];

  function validarTipo(type) {
    if (!TIPOS.hasOwnProperty(type)) {
      throw new Error('Tipo de movimentação de estoque inválido: ' + type);
    }
  }

  // Constrói (sem persistir) um registro de movimentação válido, para uso por
  // outras rotinas transacionais (vendas, compras, inventário) que precisam
  // gravar a movimentação DENTRO da própria transação atômica delas — mantendo
  // a mesma forma/vocabulário de tipos usados pelo StockEngine.
  function buildMovement(params) {
    validarTipo(params.type);
    var quantity = Number(params.quantity);
    if (!isFinite(quantity) || quantity <= 0) throw new Error('A quantidade movimentada deve ser maior que zero.');
    if (!params.productId) throw new Error('Movimentação de estoque sem produto associado.');
    return {
      id: App.core.uuid(),
      productId: params.productId,
      type: params.type,
      quantity: quantity,
      relatedDocument: params.relatedDocument || null,
      reason: params.reason || null,
      notes: params.notes || null,
      createdAt: App.core.format.nowIso()
    };
  }

  function sinal(type) { return TIPOS[type] || 0; }

  function calcularSaldo(productId) {
    return App.db.getByIndex('inventory_movements', 'productId', productId).then(function (movements) {
      return movements.reduce(function (sum, m) {
        return sum + (TIPOS[m.type] || 0) * m.quantity;
      }, 0);
    });
  }

  // Calcula o saldo de TODOS os produtos de uma vez (performance para listas/dashboard).
  function calcularSaldoTodos() {
    return App.db.getAll('inventory_movements').then(function (movements) {
      var map = {};
      movements.forEach(function (m) {
        map[m.productId] = (map[m.productId] || 0) + (TIPOS[m.type] || 0) * m.quantity;
      });
      return map;
    });
  }

  // Registra uma movimentação de estoque.
  // params: { productId, type, quantity, relatedDocument, reason, notes, allowNegative }
  // A validação de saldo é feita antes da escrita; em uso local single-user isso é
  // suficiente. Em cenário multiusuário centralizado (Fase 10), essa checagem passa
  // a ser feita no backend dentro de uma transação de banco real.
  function registrarMovimentacao(params) {
    try {
      validarTipo(params.type);
    } catch (err) {
      return Promise.reject(err);
    }
    var quantity = Number(params.quantity);
    if (!isFinite(quantity) || quantity <= 0) {
      return Promise.reject(new Error('A quantidade movimentada deve ser maior que zero.'));
    }
    if (!params.productId) {
      return Promise.reject(new Error('Movimentação de estoque sem produto associado.'));
    }

    var isSaida = TIPOS_SAIDA.indexOf(params.type) !== -1;

    return App.db.getById('products', params.productId).then(function (product) {
      if (!product) {
        throw new Error('Produto não encontrado para movimentação de estoque.');
      }
      var checkBalance = isSaida && !params.allowNegative ? calcularSaldo(params.productId) : Promise.resolve(null);
      return checkBalance.then(function (saldoAtual) {
        if (isSaida && !params.allowNegative && (saldoAtual - quantity) < 0) {
          throw new Error(
            'Estoque insuficiente para "' + product.name + '". Saldo atual: ' + saldoAtual + ', solicitado: ' + quantity + '.'
          );
        }
        var movement = {
          id: App.core.uuid(),
          productId: params.productId,
          type: params.type,
          quantity: quantity,
          relatedDocument: params.relatedDocument || null,
          reason: params.reason || null,
          notes: params.notes || null,
          createdAt: App.core.format.nowIso()
        };
        return App.db.runAtomic(['inventory_movements', 'audit_logs'], 'readwrite', function (t) {
          t.objectStore('inventory_movements').put(movement);
          App.core.audit.log(t, {
            operation: 'ADJUST', entity: 'products', entityId: product.id,
            newValue: movement, reason: params.reason
          });
          return movement;
        });
      });
    });
  }

  function historico(productId) {
    return App.db.getByIndex('inventory_movements', 'productId', productId).then(function (movements) {
      return movements.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.stockEngine = {
    TIPOS: TIPOS,
    TIPOS_ENTRADA: TIPOS_ENTRADA,
    TIPOS_SAIDA: TIPOS_SAIDA,
    registrarMovimentacao: registrarMovimentacao,
    buildMovement: buildMovement,
    sinal: sinal,
    calcularSaldo: calcularSaldo,
    calcularSaldoTodos: calcularSaldoTodos,
    historico: historico
  };
})(window);
