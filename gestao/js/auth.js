/* AMÁH Brand — tela de login e controle de sessão (modo API, Fase 10)
 * Só entra em ação quando App.api.enabled (ver js/apiClient.js). No modo
 * local (IndexedDB / file://) nada aqui é chamado.
 */
(function (global) {
  'use strict';

  function renderLoginScreen(onSuccess) {
    var root = document.getElementById('root');
    root.innerHTML = '';

    var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });
    var emailField = App.ui.el('input', { type: 'email', id: 'login-email', autocomplete: 'username', placeholder: 'seu@email.com' });
    var passField = App.ui.el('input', { type: 'password', id: 'login-password', autocomplete: 'current-password', placeholder: '••••••••' });
    var submitBtn = App.ui.el('button', { class: 'btn btn-primary', type: 'submit', style: 'width:100%;margin-top:6px;' }, ['Entrar']);

    var form = App.ui.el('form', {
      class: 'form-grid',
      style: 'grid-template-columns:1fr;',
      onsubmit: function (e) {
        e.preventDefault();
        errorBox.classList.add('hidden');
        submitBtn.disabled = true;
        submitBtn.textContent = 'Entrando…';
        App.api.login(emailField.value.trim(), passField.value)
          .then(function () { onSuccess(); })
          .catch(function (err) {
            errorBox.textContent = err.message || 'Não foi possível entrar.';
            errorBox.classList.remove('hidden');
          })
          .then(function () {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Entrar';
          });
      }
    }, [
      App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['E-mail']), emailField]),
      App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Senha']), passField]),
      errorBox,
      submitBtn
    ]);

    var card = App.ui.el('div', { class: 'welcome-card', style: 'max-width:380px;' }, [
      App.ui.el('img', { class: 'logo-img', src: 'assets/logo-amah.png', alt: 'AMÁH Brand' }),
      App.ui.el('h1', {}, ['Entrar']),
      App.ui.el('p', { class: 'lead' }, ['Sistema de gestão da AMÁH Brand. Entre com a conta da sua equipe para continuar.']),
      form
    ]);

    root.appendChild(App.ui.el('div', { class: 'welcome-screen' }, [card]));
    setTimeout(function () { emailField.focus(); }, 30);
  }

  // Garante uma sessão válida antes do restante do boot continuar. Nunca
  // rejeita: mostra a tela de login e só resolve depois de autenticado.
  function ensureAuthenticated() {
    return new Promise(function (resolve) {
      var token = App.api.getToken();
      if (!token) { renderLoginScreen(resolve); return; }
      App.api.me().then(function () {
        resolve();
      }).catch(function () {
        App.api.clearSession();
        renderLoginScreen(resolve);
      });
    });
  }

  // Chamado pelo apiClient quando um 401 chega no meio do uso do app
  // (sessão expirou). Evita loop: só reage se ainda não estiver na tela de login.
  var reauthenticating = false;
  function handleUnauthorized() {
    if (reauthenticating) return;
    reauthenticating = true;
    App.ui.toast('Sua sessão expirou. Entre novamente.', 'error');
    ensureAuthenticated().then(function () {
      reauthenticating = false;
      if (global.App.boot) global.App.boot();
    });
  }

  function logout() {
    App.api.clearSession();
    if (global.App.boot) global.App.boot();
  }

  global.App = global.App || {};
  global.App.auth = {
    ensureAuthenticated: ensureAuthenticated,
    handleUnauthorized: handleUnauthorized,
    logout: logout
  };
})(window);
