/* AMÁH Brand — utilitários de interface (toast, modal, confirmação) */
(function (global) {
  'use strict';

  function toast(message, type) {
    var container = document.getElementById('toast-container');
    if (!container) return;
    var el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = message;
    container.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity 0.25s';
      setTimeout(function () { el.remove(); }, 260);
    }, 3400);
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    Object.keys(attrs).forEach(function (key) {
      if (key === 'class') node.className = attrs[key];
      else if (key === 'html') node.innerHTML = attrs[key];
      else if (key.indexOf('on') === 0 && typeof attrs[key] === 'function') node.addEventListener(key.slice(2), attrs[key]);
      else node.setAttribute(key, attrs[key]);
    });
    (children || []).forEach(function (child) {
      if (child == null) return;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    });
    return node;
  }

  // Impede clique duplo / duplo toque enquanto uma ação ainda está em
  // andamento (evita duplicar venda, compra, movimentação de estoque,
  // abertura de caixa etc. — muitos botões de salvar disparam uma promessa
  // e só voltam a reagir quando ela termina, sem travar o botão nesse meio
  // tempo). Retorna true se o clique deve prosseguir (e já trava o botão);
  // false se já havia um clique em andamento (ignora este). Reabilita
  // sozinho depois de `ms` — nunca trava o botão pra sempre, mesmo se quem
  // chamou esquecer de reabilitar no caminho de erro (2026-08-26).
  function guardClick(btn, ms) {
    if (!btn || btn.disabled) return false;
    btn.disabled = true;
    setTimeout(function () { btn.disabled = false; }, ms || 1500);
    return true;
  }

  var activeModalStack = [];

  function closeTopModal() {
    var top = activeModalStack.pop();
    if (top && top.parentNode) top.parentNode.removeChild(top);
  }

  // Renderiza um modal genérico. options: { title, bodyHtml | bodyNode, size, footerButtons: [{label, className, onClick, closesModal}] }
  function openModal(options) {
    var backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop';
    var modal = document.createElement('div');
    modal.className = 'modal' + (options.size === 'wide' ? ' modal-wide' : options.size === 'sm' ? ' modal-sm' : '');

    var header = el('div', { class: 'modal-header' }, [
      el('h3', {}, [options.title || '']),
      el('button', { class: 'modal-close', 'aria-label': 'Fechar', onclick: function () { closeModal(); } }, ['×'])
    ]);
    modal.appendChild(header);

    var body = el('div', { class: 'modal-body' });
    if (options.bodyNode) body.appendChild(options.bodyNode);
    else if (options.bodyHtml) body.innerHTML = options.bodyHtml;
    modal.appendChild(body);

    if (options.footerButtons && options.footerButtons.length) {
      var footer = el('div', { class: 'modal-footer' });
      options.footerButtons.forEach(function (btnDef) {
        var btn = el('button', {
          class: 'btn ' + (btnDef.className || 'btn-secondary'),
          onclick: function () {
            if (!guardClick(btn)) return; // evita clique duplo disparar o mesmo salvar/confirmar duas vezes
            if (btnDef.onClick) btnDef.onClick(closeModal);
            else closeModal();
          }
        }, [btnDef.label]);
        footer.appendChild(btn);
      });
      modal.appendChild(footer);
    }

    backdrop.appendChild(modal);
    backdrop.addEventListener('mousedown', function (e) {
      if (e.target === backdrop && options.closeOnBackdrop !== false) closeModal();
    });
    document.body.appendChild(backdrop);
    activeModalStack.push(backdrop);

    function closeModal() {
      if (options.onClose) options.onClose();
      var idx = activeModalStack.indexOf(backdrop);
      if (idx !== -1) activeModalStack.splice(idx, 1);
      if (backdrop.parentNode) backdrop.parentNode.removeChild(backdrop);
    }

    return { close: closeModal, body: body, backdrop: backdrop };
  }

  function confirmDialog(options) {
    return new Promise(function (resolve) {
      var body = el('div', {}, [
        el('p', { class: 'mt-0' }, [options.message || 'Confirma esta ação?'])
      ]);
      var modalRef = openModal({
        title: options.title || 'Confirmar ação',
        bodyNode: body,
        size: 'sm',
        closeOnBackdrop: false,
        footerButtons: [
          { label: options.cancelLabel || 'Cancelar', className: 'btn-secondary', onClick: function (close) { close(); resolve(false); } },
          { label: options.confirmLabel || 'Confirmar', className: options.danger ? 'btn-danger' : 'btn-primary', onClick: function (close) { close(); resolve(true); } }
        ]
      });
      void modalRef;
    });
  }

  global.App = global.App || {};
  global.App.ui = { toast: toast, el: el, openModal: openModal, confirmDialog: confirmDialog, guardClick: guardClick };
})(window);
