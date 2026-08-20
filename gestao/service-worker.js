/* AMÁH Brand — Service Worker (Fase 8: Mobile/PWA)
 * Estratégia: cache-first para os arquivos estáticos do app (todo o código e
 * assets vêm da instalação), permitindo uso 100% offline após a primeira
 * visita — coerente com a arquitetura "tudo local" (IndexedDB) do sistema.
 * Só é registrado quando servido via http(s); em file:// (uso direto do
 * index.html) o navegador não permite Service Worker e o app funciona igual,
 * só sem o cache de PWA — ver checagem em js/app.js.
 */
'use strict';

var CACHE_VERSION = 'amah-brand-v1';

var APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './css/styles.css',
  './assets/favicon.png',
  './assets/icon-192.png',
  './assets/icon-512.png',
  './assets/logo-amah.png',
  './js/lib/zxing-browser.min.js',
  './js/lib/jsbarcode.min.js',
  './js/lib/qrcode-generator.js',
  './js/core/idgen.js',
  './js/core/format.js',
  './js/db.js',
  './js/core/audit.js',
  './js/core/counters.js',
  './js/core/stockEngine.js',
  './js/core/validation.js',
  './js/core/analytics.js',
  './js/core/csv.js',
  './js/core/scanner.js',
  './js/core/labels.js',
  './js/core/salesEngine.js',
  './js/core/purchaseEngine.js',
  './js/core/cashEngine.js',
  './js/core/inventoryEngine.js',
  './js/ui.js',
  './js/router.js',
  './js/modules/categories.js',
  './js/modules/suppliers.js',
  './js/modules/products.js',
  './js/modules/settings.js',
  './js/modules/backup.js',
  './js/modules/dashboard.js',
  './js/modules/stock.js',
  './js/modules/customers.js',
  './js/modules/pdv.js',
  './js/modules/salesHistory.js',
  './js/modules/cashRegister.js',
  './js/modules/financeExpenses.js',
  './js/modules/financeReceivable.js',
  './js/modules/financePayable.js',
  './js/modules/financeFlow.js',
  './js/modules/purchases.js',
  './js/modules/inventoryCount.js',
  './js/modules/reports.js',
  './js/demoData.js',
  './js/app.js'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function (err) {
        // Não bloqueia a instalação se algum arquivo opcional falhar
        console.warn('[SW] Falha ao pré-cachear alguns arquivos:', err);
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_VERSION; }).map(function (k) { return caches.delete(k); }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then(function (cached) {
      var networkFetch = fetch(event.request).then(function (response) {
        if (response && response.ok) {
          var clone = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(event.request, clone); });
        }
        return response;
      }).catch(function () { return cached; });
      // Cache-first: responde do cache imediatamente se existir, atualiza em segundo plano.
      return cached || networkFetch;
    })
  );
});
