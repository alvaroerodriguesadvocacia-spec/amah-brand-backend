/* AMÁH Brand — sugestão de código/SKU por categoria (Modo Vendedor, Fase B)
 *
 * Não substitui nem migra nenhum código existente — só sugere o PRÓXIMO
 * código pra produtos NOVOS, olhando a numeração já em uso. A unicidade de
 * verdade continua garantida pelo banco (índice único em store_products.sku,
 * ver backend/src/migrate.js) — isto aqui é só uma sugestão de digitação
 * mais rápida, o cadastro sempre permite editar o código antes de salvar.
 */
(function (global) {
  'use strict';

  // Prefixos observados no catálogo real da AMÁH Brand (BR, CL, PU, AN, KT).
  // Categorias sem prefixo conhecido caem no fallback (2 primeiras letras).
  var DEFAULT_PREFIXES = {
    'Brincos': 'BR',
    'Colares': 'CL',
    'Pulseiras': 'PU',
    'Anéis': 'AN',
    'Anel': 'AN',
    'Kits': 'KT',
    'Kit': 'KT',
    'Conjuntos': 'KT',
    'Correntes': 'CO',
    'Pingentes': 'PG',
    'Piercings': 'PI',
    'Tornozeleiras': 'TZ',
    'Broches': 'BC'
  };

  var ACCENT_MAP = {
    'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n'
  };
  function stripAccents(s) {
    return String(s || '').split('').map(function (ch) {
      var lower = ch.toLowerCase();
      return ACCENT_MAP[lower] || ch;
    }).join('');
  }

  function fallbackPrefix(categoryName) {
    var letters = stripAccents(categoryName).toUpperCase().replace(/[^A-Z]/g, '');
    return letters.slice(0, 2) || 'PR';
  }

  // customPrefixes: mapa opcional { categoryName: 'XX' } vindo de
  // settings/product_code_prefixes, pra quando a loja quiser um prefixo
  // diferente do padrão sugerido aqui (ex.: categoria nova, sigla própria).
  function getPrefixFor(categoryName, customPrefixes) {
    if (customPrefixes && customPrefixes[categoryName]) return String(customPrefixes[categoryName]).toUpperCase();
    if (DEFAULT_PREFIXES[categoryName]) return DEFAULT_PREFIXES[categoryName];
    return fallbackPrefix(categoryName);
  }

  // Olha os produtos já cadastrados com esse prefixo (ex.: BR001, BR002...)
  // e sugere o próximo número sequencial de 3 dígitos.
  function suggestNext(prefix, allProducts) {
    var max = 0;
    var re = new RegExp('^' + prefix + '(\\d{3,})$', 'i');
    (allProducts || []).forEach(function (p) {
      var m = re.exec(String((p && p.sku) || '').trim());
      if (m) {
        var n = parseInt(m[1], 10);
        if (n > max) max = n;
      }
    });
    return prefix + String(max + 1).padStart(3, '0');
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.productCodes = {
    DEFAULT_PREFIXES: DEFAULT_PREFIXES,
    getPrefixFor: getPrefixFor,
    suggestNext: suggestNext
  };
})(window);
