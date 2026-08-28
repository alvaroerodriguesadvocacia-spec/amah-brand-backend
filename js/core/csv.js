/* AMÁH Brand — exportação CSV (item 41 da especificação: pelo menos CSV na primeira versão) */
(function (global) {
  'use strict';

  function escapeCsvValue(value) {
    if (value == null) return '';
    var s = String(value);
    if (/[",;\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function download(filename, columns, rows) {
    var header = columns.map(function (c) { return escapeCsvValue(c.label); }).join(';');
    var lines = rows.map(function (row) {
      return columns.map(function (c) { return escapeCsvValue(typeof c.value === 'function' ? c.value(row) : row[c.value]); }).join(';');
    });
    var csv = '﻿' + [header].concat(lines).join('\r\n'); // BOM para acentuação correta no Excel
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.csv = { download: download };
})(window);
