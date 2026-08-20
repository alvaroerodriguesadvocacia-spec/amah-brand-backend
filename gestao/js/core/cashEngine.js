/* AMÁH Brand — CashEngine: abertura/fechamento de caixa e movimentações */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

  var DIRECTION_BY_TYPE = {
    venda: 1, suprimento: 1, entrada: 1,
    retirada: -1, sangria: -1, despesa: -1, estorno_venda: -1, devolucao: -1
  };

  function getOpenSession() {
    return App.db.getAll('cash_sessions').then(function (sessions) {
      return sessions.filter(function (s) { return s.status === 'aberto'; })[0] || null;
    });
  }

  function openSession(openingBalance, notes) {
    return getOpenSession().then(function (existing) {
      if (existing) throw new Error('Já existe um caixa aberto (desde ' + fmt.dateTimeBR(existing.openedAt) + '). Feche-o antes de abrir um novo.');
      var balance = App.core.validation.positiveNumber(openingBalance, 'Saldo inicial', true);
      var session = {
        id: App.core.uuid(), status: 'aberto', openingBalance: balance, openedAt: fmt.nowIso(),
        closedAt: null, closingBalanceExpected: null, closingBalanceInformed: null, difference: null, notes: notes || ''
      };
      return App.db.runAtomic(['cash_sessions', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('cash_sessions').put(session);
        App.core.audit.log(t, { operation: 'CREATE', entity: 'cash_sessions', entityId: session.id, newValue: session });
      }).then(function () { return session; });
    });
  }

  function computeBalance(sessionId) {
    return Promise.all([
      App.db.getById('cash_sessions', sessionId),
      App.db.getByIndex('cash_movements', 'cashSessionId', sessionId)
    ]).then(function (results) {
      var session = results[0], movements = results[1];
      if (!session) throw new Error('Caixa não encontrado.');
      var net = movements.reduce(function (sum, m) { return sum + m.direction * m.amount; }, 0);
      return { session: session, movements: movements, expectedBalance: round2(session.openingBalance + net) };
    });
  }

  function registerMovement(params) {
    var type = params.type;
    if (!DIRECTION_BY_TYPE.hasOwnProperty(type)) return Promise.reject(new Error('Tipo de movimentação de caixa inválido: ' + type));
    var amount = Number(params.amount);
    if (!isFinite(amount) || amount <= 0) return Promise.reject(new Error('O valor deve ser maior que zero.'));
    return getOpenSession().then(function (session) {
      if (!session) throw new Error('Não há caixa aberto. Abra o caixa antes de registrar movimentações.');
      var movement = {
        id: App.core.uuid(), cashSessionId: session.id, type: type, amount: round2(amount),
        direction: DIRECTION_BY_TYPE[type], description: params.description || '', relatedDocument: params.relatedDocument || null,
        createdAt: fmt.nowIso()
      };
      return App.db.runAtomic(['cash_movements', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('cash_movements').put(movement);
        App.core.audit.log(t, { operation: 'CREATE', entity: 'cash_movements', entityId: movement.id, newValue: movement });
      }).then(function () { return movement; });
    });
  }

  function closeSession(sessionId, closingBalanceInformed, notes) {
    return computeBalance(sessionId).then(function (result) {
      var session = result.session;
      if (session.status !== 'aberto') throw new Error('Este caixa já está fechado.');
      var informed = App.core.validation.positiveNumber(closingBalanceInformed, 'Saldo informado', true);
      var difference = round2(informed - result.expectedBalance);
      var updated = Object.assign({}, session, {
        status: 'fechado', closedAt: fmt.nowIso(), closingBalanceExpected: result.expectedBalance,
        closingBalanceInformed: informed, difference: difference, notes: (session.notes || '') + (notes ? ' | Fechamento: ' + notes : '')
      });
      return App.db.runAtomic(['cash_sessions', 'audit_logs'], 'readwrite', function (t) {
        t.objectStore('cash_sessions').put(updated);
        App.core.audit.log(t, { operation: 'UPDATE', entity: 'cash_sessions', entityId: session.id, oldValue: session, newValue: updated, reason: 'Fechamento de caixa' });
      }).then(function () { return updated; });
    });
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.cashEngine = {
    getOpenSession: getOpenSession, openSession: openSession, closeSession: closeSession,
    registerMovement: registerMovement, computeBalance: computeBalance, DIRECTION_BY_TYPE: DIRECTION_BY_TYPE
  };
})(window);
