/* AMÁH Brand — formatação de moeda, data e percentual */
(function (global) {
  'use strict';

  var currencyFormatter = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  var dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  var dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  });

  function money(value) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    return currencyFormatter.format(n);
  }

  function percent(value, decimals) {
    var n = Number(value);
    if (!isFinite(n)) n = 0;
    return n.toFixed(decimals == null ? 1 : decimals).replace('.', ',') + '%';
  }

  function dateBR(isoString) {
    if (!isoString) return '—';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return dateFormatter.format(d);
  }

  function dateTimeBR(isoString) {
    if (!isoString) return '—';
    var d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return dateTimeFormatter.format(d);
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.format = {
    money: money,
    percent: percent,
    dateBR: dateBR,
    dateTimeBR: dateTimeBR,
    nowIso: nowIso,
    escapeHtml: escapeHtml
  };
})(window);
