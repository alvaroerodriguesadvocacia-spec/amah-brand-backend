/* AMÁH Brand — roteador simples baseado em hash */
(function (global) {
  'use strict';

  var routes = {}; // path -> { render(container, params), title }
  var container = null;
  var currentPath = null;

  function register(path, def) {
    routes[path] = def;
  }

  function parseHash() {
    var hash = global.location.hash.replace(/^#/, '') || '/dashboard';
    hash = hash.split('?')[0];
    if (hash.length > 1 && hash.charAt(hash.length - 1) === '/') hash = hash.slice(0, -1);
    if (hash.charAt(0) !== '/') hash = '/' + hash;
    return { path: hash, params: [] };
  }

  function navigate(path) {
    global.location.hash = path;
  }

  function renderCurrent() {
    var parsed = parseHash();
    var def = routes[parsed.path];
    currentPath = parsed.path;
    if (!container) return;
    container.innerHTML = '';
    if (!def) {
      container.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><h3>Página não encontrada</h3><p>A seção solicitada não existe ou ainda não foi implementada.</p></div>';
      return;
    }
    // Guarda de papel (Modo Vendedor, Fase D): rotas registradas com `roles`
    // só renderizam para quem tem o papel permitido. Sem App.auth (ex.: testes
    // isolados) ou sem `roles` na rota, nada muda — comportamento atual preservado.
    if (def.roles && global.App && App.auth && App.auth.currentRole) {
      var role = App.auth.currentRole();
      if (def.roles.indexOf(role) === -1) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🔒</div><h3>Acesso restrito</h3><p>Esta área não está disponível para o seu perfil de usuário.</p></div>';
        if (global.App && App.updateActiveNav) App.updateActiveNav(parsed.path);
        return;
      }
    }
    try {
      def.render(container, parsed.params);
    } catch (err) {
      console.error(err);
      container.innerHTML = '<div class="empty-state"><div class="icon">⚠️</div><h3>Erro ao carregar a tela</h3><p>' + App.core.format.escapeHtml(err.message) + '</p></div>';
    }
    if (global.App && App.updateActiveNav) App.updateActiveNav(parsed.path);
    document.title = (def.title ? def.title + ' · ' : '') + 'AMÁH Brand';
    global.scrollTo(0, 0);
  }

  function init(containerEl) {
    container = containerEl;
    global.addEventListener('hashchange', renderCurrent);
    renderCurrent();
  }

  function getCurrentPath() { return currentPath; }

  function refresh() { renderCurrent(); }

  global.App = global.App || {};
  global.App.router = {
    register: register,
    navigate: navigate,
    init: init,
    getCurrentPath: getCurrentPath,
    refresh: refresh
  };
})(window);
