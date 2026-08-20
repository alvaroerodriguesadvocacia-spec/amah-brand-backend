/* AMÁH Brand — geração e impressão de etiquetas (Code128 + QR Code)
 * Usa JsBarcode (js/lib/jsbarcode.min.js) e qrcode-generator (js/lib/qrcode-generator.js),
 * ambos vendorizados localmente — funcionam offline, sem depender de CDN.
 */
(function (global) {
  'use strict';

  function svgBarcode(value) {
    var svgNs = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(svgNs, 'svg');
    try {
      global.JsBarcode(svg, value, { format: 'CODE128', width: 1.6, height: 42, displayValue: true, fontSize: 12, margin: 4 });
    } catch (err) {
      return '<div style="font-size:11px;color:#b3261e;">Código inválido para Code128</div>';
    }
    return svg.outerHTML;
  }

  function qrDataUrl(value) {
    try {
      var qr = global.qrcode(0, 'M');
      qr.addData(value);
      qr.make();
      return qr.createDataURL(5, 4);
    } catch (err) {
      return null;
    }
  }

  // Gera o HTML de uma folha de etiquetas para impressão (uma etiqueta por produto/quantidade)
  function buildLabelSheetHtml(items) {
    // items: [{ product, qty }]
    var labelsHtml = '';
    items.forEach(function (item) {
      var code = item.product.barcode || item.product.sku;
      var barcodeSvg = svgBarcode(code);
      for (var i = 0; i < item.qty; i++) {
        labelsHtml +=
          '<div class="label">' +
          '  <div class="label-name">' + App.core.format.escapeHtml(item.product.name) + '</div>' +
          '  <div class="label-price">' + App.core.format.money(item.product.retailPrice) + '</div>' +
          '  <div class="label-barcode">' + barcodeSvg + '</div>' +
          '  <div class="label-sku">' + App.core.format.escapeHtml(item.product.sku) + '</div>' +
          '</div>';
      }
    });

    return (
      '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiquetas — AMÁH Brand</title>' +
      '<style>' +
      '  @page { size: auto; margin: 6mm; }' +
      '  body { font-family: -apple-system, Arial, sans-serif; margin:0; }' +
      '  .sheet { display:flex; flex-wrap:wrap; gap:4mm; }' +
      '  .label { width:45mm; padding:2mm 2mm 3mm; border:1px dashed #ccc; text-align:center; page-break-inside: avoid; }' +
      '  .label-name { font-size:9.5px; font-weight:700; line-height:1.2; height:22px; overflow:hidden; }' +
      '  .label-price { font-size:12.5px; font-weight:700; margin:2px 0; }' +
      '  .label-barcode svg { width:100%; height:auto; }' +
      '  .label-sku { font-size:8.5px; color:#666; }' +
      '  @media print { .label { border:none; } }' +
      '</style></head><body><div class="sheet">' + labelsHtml + '</div></body></html>'
    );
  }

  function printLabels(items) {
    var html = buildLabelSheetHtml(items);
    var win = global.open('', '_blank', 'width=800,height=600');
    if (!win) {
      App.ui.toast('Não foi possível abrir a janela de impressão. Verifique o bloqueador de pop-ups.', 'error');
      return;
    }
    win.document.open();
    win.document.write(html);
    win.document.close();
    win.onload = function () { win.focus(); win.print(); };
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.labels = { svgBarcode: svgBarcode, qrDataUrl: qrDataUrl, printLabels: printLabels, buildLabelSheetHtml: buildLabelSheetHtml };
})(window);
