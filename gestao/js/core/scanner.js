/* AMÁH Brand — Scanner de código de barras / QR Code via câmera
 *
 * Usa ZXing (js/lib/zxing-browser.min.js) para leitura em tempo real via
 * getUserMedia. Nunca depende só da BarcodeDetector nativa do navegador
 * (item 7 da especificação): sempre oferece um campo de digitação manual
 * como alternativa, visível o tempo todo, mesmo quando a câmera funciona.
 *
 * Uso:
 *   App.core.scanner.openScannerModal({
 *     title: 'Escanear produto',
 *     onDetect: function (code) { ... },   // chamado a cada leitura válida (com debounce)
 *     onManualSubmit: function (code) { ... } // opcional; se ausente, usa onDetect
 *   });
 */
(function (global) {
  'use strict';

  var DEBOUNCE_MS = 800; // evita ler o mesmo código várias vezes no mesmo instante (item 9.8)

  function cameraAvailable() {
    return !!(global.ZXingBrowser && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  function openScannerModal(options) {
    var lastCode = null;
    var lastAt = 0;
    var reader = null;
    var controls = null;
    var stopped = false;

    var statusEl = App.ui.el('div', { class: 'scanner-status text-muted', style: 'font-size:12.5px; margin-top:8px;' }, ['Iniciando câmera…']);
    var video = App.ui.el('video', { id: 'scanner-video', style: 'width:100%; border-radius:10px; background:#111; max-height:320px; object-fit:cover;', muted: 'muted', playsinline: 'playsinline' });
    var videoWrap = App.ui.el('div', { style: 'position:relative;' }, [video]);

    var manualInput = App.ui.el('input', { id: 'scanner-manual-input', placeholder: 'Ou digite o código manualmente e pressione Enter' });
    var manualBtn = App.ui.el('button', { class: 'btn btn-secondary btn-sm' }, ['Confirmar']);
    var manualRow = App.ui.el('div', { class: 'flex gap-8', style: 'margin-top:12px;' }, [manualInput, manualBtn]);

    var lastReadRow = App.ui.el('div', { id: 'scanner-last-read', style: 'margin-top:10px;' });

    var body = App.ui.el('div', {}, [videoWrap, statusEl, manualRow, lastReadRow]);

    var modalRef = App.ui.openModal({
      title: options.title || 'Escanear código',
      bodyNode: body,
      closeOnBackdrop: false,
      footerButtons: [{ label: 'Fechar câmera', className: 'btn-secondary', onClick: function (close) { stop(); close(); } }],
      onClose: function () { stop(); if (options.onClose) options.onClose(); }
    });

    function handleCode(code, sourceLabel) {
      var now = Date.now();
      if (code === lastCode && (now - lastAt) < DEBOUNCE_MS) return; // debounce de leituras repetidas
      lastCode = code;
      lastAt = now;
      lastReadRow.innerHTML = '';
      lastReadRow.appendChild(App.ui.el('span', { class: 'badge badge-success' }, ['Lido (' + sourceLabel + '): ' + code]));
      if (options.onDetect) options.onDetect(code);
    }

    manualBtn.addEventListener('click', submitManual);
    manualInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); submitManual(); } });
    function submitManual() {
      var val = manualInput.value.trim();
      if (!val) return;
      manualInput.value = '';
      handleCode(val, 'manual');
    }

    function stop() {
      if (stopped) return;
      stopped = true;
      try { if (controls && controls.stop) controls.stop(); } catch (e) {}
      try {
        if (video.srcObject) {
          video.srcObject.getTracks().forEach(function (track) { track.stop(); });
          video.srcObject = null;
        }
      } catch (e) {}
    }

    if (!cameraAvailable()) {
      statusEl.textContent = 'Câmera não disponível neste dispositivo/navegador. Use a digitação manual abaixo.';
      videoWrap.style.display = 'none';
      manualInput.focus();
      return { close: modalRef.close, stop: stop };
    }

    try {
      reader = new global.ZXingBrowser.BrowserMultiFormatReader();
      reader.decodeFromVideoDevice(undefined, video, function (result, err, ctrl) {
        if (!controls) controls = ctrl;
        if (result) {
          statusEl.textContent = 'Câmera ativa — aponte para o código de barras ou QR Code.';
          handleCode(result.getText(), 'câmera');
        }
        // err de "não encontrado neste frame" é esperado continuamente; ignorar.
      }).catch(function (err) {
        statusEl.textContent = 'Não foi possível acessar a câmera (' + (err && err.name ? err.name : 'erro') + '). Use a digitação manual abaixo.';
        videoWrap.style.display = 'none';
        manualInput.focus();
      });
      statusEl.textContent = 'Solicitando permissão de câmera…';
    } catch (err) {
      statusEl.textContent = 'Câmera indisponível. Use a digitação manual abaixo.';
      videoWrap.style.display = 'none';
    }

    setTimeout(function () { manualInput.focus(); }, 200);

    return { close: modalRef.close, stop: stop };
  }

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.scanner = { openScannerModal: openScannerModal, cameraAvailable: cameraAvailable };
})(window);
