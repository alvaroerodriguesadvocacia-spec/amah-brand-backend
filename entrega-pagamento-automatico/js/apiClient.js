/* AMÁH Brand — cliente da API central (Fase 10)
 *
 * Ativado quando `window.AMAH_API_BASE` está definido (ver index.html). É a
 * ÚNICA parte do sistema que fala HTTP com o backend. js/db.js usa
 * `App.api.store.*` como implementação alternativa da mesma superfície que
 * antes só falava com IndexedDB (ver ARQUITETURA.md, seção 9); os módulos de
 * tela e a camada de domínio continuam sem saber se estão em modo local ou
 * remoto.
 */
(function (global) {
  'use strict';

  var BASE = global.AMAH_API_BASE || null;
  var TOKEN_KEY = 'amah_gestao_token';
  var USER_KEY = 'amah_gestao_user';

  function getToken() {
    try { return localStorage.getItem(TOKEN_KEY) || null; } catch (e) { return null; }
  }
  function getUser() {
    try {
      var raw = localStorage.getItem(USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }
  function setSession(token, user) {
    try {
      localStorage.setItem(TOKEN_KEY, token);
      localStorage.setItem(USER_KEY, JSON.stringify(user || null));
    } catch (e) { /* localStorage indisponível — sessão não sobrevive a reload, mas app segue funcionando */ }
  }
  function clearSession() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch (e) {}
  }

  // Slug da store no formato usado pelas rotas do backend (underscore -> hífen).
  function storeSlug(storeName) {
    return storeName.replace(/_/g, '-');
  }

  function request(method, path, body) {
    if (!BASE) return Promise.reject(new Error('API não configurada (AMAH_API_BASE ausente).'));
    var headers = { 'Content-Type': 'application/json' };
    var token = getToken();
    if (token) headers.Authorization = 'Bearer ' + token;
    return fetch(BASE + path, {
      method: method,
      headers: headers,
      cache: 'no-store', // dados mudam a qualquer momento (multiusuário) — nunca servir do cache HTTP
      body: body !== undefined ? JSON.stringify(body) : undefined
    }).then(function (res) {
      if (res.status === 204) return null;
      return res.json().catch(function () { return null; }).then(function (data) {
        if (!res.ok) {
          if (res.status === 401) {
            clearSession();
            if (global.App && App.auth && App.auth.handleUnauthorized) App.auth.handleUnauthorized();
          }
          var msg = (data && data.error) || ('Erro na comunicação com o servidor (HTTP ' + res.status + ').');
          throw new Error(msg);
        }
        return data;
      });
    }, function () {
      throw new Error('Não foi possível falar com o servidor. Verifique sua conexão com a internet e tente novamente.');
    });
  }

  function login(email, password) {
    return request('POST', '/api/v1/auth/login', { email: email, password: password }).then(function (data) {
      setSession(data.token, data.user);
      return data.user;
    });
  }

  function me() {
    return request('GET', '/api/v1/auth/me');
  }

  function qs(params) {
    var parts = [];
    Object.keys(params || {}).forEach(function (k) {
      if (params[k] === undefined || params[k] === null) return;
      parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(params[k]));
    });
    return parts.length ? '?' + parts.join('&') : '';
  }

  // ---- CRUD genérico por store — mesma superfície de js/db.js ----
  var store = {
    getAll: function (storeName) {
      return request('GET', '/api/v1/' + storeSlug(storeName));
    },
    getById: function (storeName, id) {
      return request('GET', '/api/v1/' + storeSlug(storeName) + '/' + encodeURIComponent(id)).catch(function (err) {
        // getById no modo local (IndexedDB) resolve com undefined quando não encontra;
        // mantemos o mesmo comportamento aqui em vez de propagar 404 como erro.
        if (/não encontrado/i.test(err.message)) return undefined;
        throw err;
      });
    },
    getByIndex: function (storeName, indexName, value) {
      return request('GET', '/api/v1/' + storeSlug(storeName) + qs({ index: indexName, value: value }));
    },
    put: function (storeName, record) {
      var id = record && record.id;
      if (id) return request('PUT', '/api/v1/' + storeSlug(storeName) + '/' + encodeURIComponent(id), record);
      return request('POST', '/api/v1/' + storeSlug(storeName), record);
    },
    putMany: function (storeName, records) {
      return request('POST', '/api/v1/' + storeSlug(storeName) + '/bulk', records).then(function () { return records; });
    },
    remove: function (storeName, id) {
      return request('DELETE', '/api/v1/' + storeSlug(storeName) + '/' + encodeURIComponent(id)).then(function () { return true; });
    },
    clearStore: function (storeName) {
      return request('DELETE', '/api/v1/' + storeSlug(storeName)).then(function () { return true; });
    }
  };

  // ---- Operações atômicas compostas — /api/v1/operations/* ----
  var operations = {
    salesFinalize: function (params) { return request('POST', '/api/v1/operations/sales/finalize', params); },
    salesCancel: function (saleId, reason) { return request('POST', '/api/v1/operations/sales/' + encodeURIComponent(saleId) + '/cancel', { reason: reason }); },
    salesItemReturn: function (saleItemId, params) { return request('POST', '/api/v1/operations/sales/items/' + encodeURIComponent(saleItemId) + '/return', params); },

    purchasesCreate: function (params) { return request('POST', '/api/v1/operations/purchases', params); },
    purchasesReceive: function (purchaseId, params) { return request('POST', '/api/v1/operations/purchases/' + encodeURIComponent(purchaseId) + '/receive', params); },
    purchasesCancel: function (purchaseId, reason) { return request('POST', '/api/v1/operations/purchases/' + encodeURIComponent(purchaseId) + '/cancel', { reason: reason }); },

    cashOpenSession: function () { return request('GET', '/api/v1/operations/cash/open-session'); },
    cashOpen: function (params) { return request('POST', '/api/v1/operations/cash/open', params); },
    cashMovement: function (params) { return request('POST', '/api/v1/operations/cash/movement', params); },
    cashClose: function (sessionId, params) { return request('POST', '/api/v1/operations/cash/' + encodeURIComponent(sessionId) + '/close', params); },

    inventoryCountStart: function (notes) { return request('POST', '/api/v1/operations/inventory/count/start', { notes: notes }); },
    inventoryCountReading: function (stockCountId, params) { return request('POST', '/api/v1/operations/inventory/count/' + encodeURIComponent(stockCountId) + '/reading', params); },
    inventoryCountDivergences: function (stockCountId) { return request('GET', '/api/v1/operations/inventory/count/' + encodeURIComponent(stockCountId) + '/divergences'); },
    inventoryCountConfirmAdjustments: function (stockCountId, itemIds) { return request('POST', '/api/v1/operations/inventory/count/' + encodeURIComponent(stockCountId) + '/confirm-adjustments', { itemIds: itemIds }); },
    inventoryCountFinish: function (stockCountId) { return request('POST', '/api/v1/operations/inventory/count/' + encodeURIComponent(stockCountId) + '/finish'); }
  };

  // ---- Pagamento automático (Mercado Pago) — /api/v1/payments/* ----
  // Vender/Modo Vendedor (presencial): cria uma cobrança PIX (QR Code
  // devolvido na hora) ou cartão (link/QR pro celular do cliente) e permite
  // consultar o status pra fazer polling enquanto espera o pagamento
  // (2026-08-28).
  var payments = {
    presencialCharge: function (params) { return request('POST', '/api/v1/payments/presencial/charge', params); },
    presencialChargeStatus: function (chargeId) { return request('GET', '/api/v1/payments/presencial/charge/' + encodeURIComponent(chargeId)); }
  };

  global.App = global.App || {};
  global.App.api = {
    enabled: !!BASE,
    base: BASE,
    request: request,
    login: login,
    me: me,
    getToken: getToken,
    getUser: getUser,
    setSession: setSession,
    clearSession: clearSession,
    store: store,
    operations: operations,
    payments: payments
  };
})(window);
