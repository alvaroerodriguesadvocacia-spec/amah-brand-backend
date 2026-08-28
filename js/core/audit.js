/* AMÁH Brand — auditoria centralizada
 * Toda alteração relevante em entidades passa por aqui. Preparado para,
 * futuramente, incluir o usuário responsável (item 47 da especificação).
 */
(function (global) {
  'use strict';

  function log(t, params) {
    // t = transaction do IndexedDB já aberta incluindo 'audit_logs'
    var record = {
      id: App.core.uuid(),
      timestamp: App.core.format.nowIso(),
      operation: params.operation, // CREATE | UPDATE | DELETE | ADJUST
      entity: params.entity,
      entityId: params.entityId,
      oldValue: params.oldValue != null ? JSON.parse(JSON.stringify(params.oldValue)) : null,
      newValue: params.newValue != null ? JSON.parse(JSON.stringify(params.newValue)) : null,
      reason: params.reason || null,
      userId: null // reservado para autenticação futura (Fase 10)
    };
    t.objectStore('audit_logs').put(record);
    return record;
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.audit = { log: log };
})(window);
