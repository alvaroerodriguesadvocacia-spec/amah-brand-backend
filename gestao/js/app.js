/* AMÁH Brand — bootstrap da aplicação, navegação e primeira execução */
(function (global) {
  'use strict';

  var NAV = [
    {
      group: 'Principal',
      items: [
        { path: '/dashboard', icon: '📊', label: 'Dashboard', enabled: true }
      ]
    },
    {
      group: 'Vendas',
      items: [
        { path: '/vendas/pdv', icon: '🛒', label: 'Nova Venda / PDV', enabled: true },
        { path: '/vendas/historico', icon: '🧾', label: 'Histórico de vendas', enabled: true }
      ]
    },
    {
      group: 'Estoque',
      items: [
        { path: '/produtos', icon: '💍', label: 'Produtos', enabled: true },
        { path: '/estoque/entrada', icon: '⬇️', label: 'Entrada de mercadoria', enabled: true },
        { path: '/estoque/saida', icon: '⬆️', label: 'Saída manual', enabled: true },
        { path: '/estoque/movimentacoes', icon: '🔄', label: 'Movimentações', enabled: true },
        { path: '/estoque/inventario', icon: '📋', label: 'Inventário', enabled: true },
        { path: '/estoque/minimo', icon: '⚠️', label: 'Estoque mínimo', enabled: true },
        { path: '/estoque/sememestoque', icon: '🚫', label: 'Sem estoque', enabled: true },
        { path: '/estoque/encalhados', icon: '🐌', label: 'Produtos encalhados', enabled: true }
      ]
    },
    {
      group: 'Compras',
      items: [
        { path: '/compras/nova', icon: '🧮', label: 'Nova compra', enabled: true },
        { path: '/compras/historico', icon: '📜', label: 'Histórico', enabled: true },
        { path: '/fornecedores', icon: '🚚', label: 'Fornecedores', enabled: true }
      ]
    },
    {
      group: 'Clientes',
      items: [
        { path: '/clientes', icon: '👥', label: 'Cadastro e histórico', enabled: true }
      ]
    },
    {
      group: 'Financeiro',
      items: [
        { path: '/financeiro/caixa', icon: '🗄️', label: 'Caixa', enabled: true },
        { path: '/financeiro/receber', icon: '📥', label: 'Contas a receber', enabled: true },
        { path: '/financeiro/pagar', icon: '📤', label: 'Contas a pagar', enabled: true },
        { path: '/financeiro/despesas', icon: '💸', label: 'Despesas', enabled: true },
        { path: '/financeiro/fluxo', icon: '📈', label: 'Fluxo de caixa', enabled: true }
      ]
    },
    {
      group: 'Inteligência',
      items: [
        { path: '/inteligencia/relatorios', icon: '📑', label: 'Relatórios', enabled: true },
        { path: '/inteligencia/margens', icon: '🎯', label: 'Margens e lucro', enabled: true },
        { path: '/inteligencia/abc', icon: '🔤', label: 'Curva ABC', enabled: true },
        { path: '/inteligencia/giro', icon: '🔁', label: 'Giro de estoque', enabled: true }
      ]
    },
    {
      group: 'Administração',
      items: [
        { path: '/configuracoes', icon: '⚙️', label: 'Configurações', enabled: true },
        { path: '/categorias', icon: '🏷️', label: 'Categorias', enabled: true },
        { path: '/backup', icon: '💾', label: 'Backup', enabled: true }
      ]
    }
  ];

  function buildSidebar() {
    var nav = document.getElementById('sidebar-nav');
    nav.innerHTML = '';
    NAV.forEach(function (group) {
      var groupEl = App.ui.el('div', { class: 'nav-group' });
      groupEl.appendChild(App.ui.el('div', { class: 'nav-group-title' }, [group.group]));
      group.items.forEach(function (item) {
        var node;
        if (item.enabled) {
          node = App.ui.el('div', {
            class: 'nav-item',
            'data-path': item.path,
            onclick: function () {
              App.router.navigate(item.path);
              closeSidebarMobile();
            }
          }, [
            App.ui.el('span', { class: 'nav-icon' }, [item.icon]),
            App.ui.el('span', {}, [item.label])
          ]);
        } else {
          node = App.ui.el('div', {
            class: 'nav-item nav-item-disabled',
            title: 'Disponível na Fase ' + item.phase,
            onclick: function () {
              App.ui.toast(item.label + ' chega na Fase ' + item.phase + ' do projeto.', 'info');
            }
          }, [
            App.ui.el('span', { class: 'flex items-center gap-8' }, [
              App.ui.el('span', { class: 'nav-icon' }, [item.icon]),
              App.ui.el('span', {}, [item.label])
            ]),
            App.ui.el('span', { class: 'soon-badge' }, ['Fase ' + item.phase])
          ]);
        }
        groupEl.appendChild(node);
      });
      nav.appendChild(groupEl);
    });
  }

  function updateActiveNav(path) {
    document.querySelectorAll('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-path') === path);
    });
  }

  function closeSidebarMobile() {
    var sidebar = document.getElementById('sidebar');
    var backdrop = document.getElementById('sidebar-backdrop');
    sidebar.classList.remove('open');
    if (backdrop) backdrop.remove();
  }

  function openSidebarMobile() {
    var sidebar = document.getElementById('sidebar');
    sidebar.classList.add('open');
    if (!document.getElementById('sidebar-backdrop')) {
      var backdrop = App.ui.el('div', { id: 'sidebar-backdrop', class: 'sidebar-backdrop', onclick: closeSidebarMobile });
      document.body.appendChild(backdrop);
    }
  }

  function registerRoutes() {
    App.router.register('/dashboard', { title: 'Dashboard', render: App.modules.dashboard.render });
    App.router.register('/produtos', { title: 'Produtos', render: App.modules.products.render });
    App.router.register('/categorias', { title: 'Categorias', render: App.modules.categories.render });
    App.router.register('/fornecedores', { title: 'Fornecedores', render: App.modules.suppliers.render });
    App.router.register('/configuracoes', { title: 'Configurações', render: App.modules.settings.render });
    App.router.register('/backup', { title: 'Backup', render: App.modules.backup.render });

    // Fase 3 — Vendas
    App.router.register('/vendas/pdv', { title: 'PDV', render: App.modules.pdv.render });
    App.router.register('/vendas/historico', { title: 'Histórico de vendas', render: App.modules.salesHistory.render });

    // Fase 2 — Estoque
    App.router.register('/estoque/entrada', { title: 'Entrada de mercadoria', render: App.modules.stock.renderEntrada });
    App.router.register('/estoque/saida', { title: 'Saída manual', render: App.modules.stock.renderSaida });
    App.router.register('/estoque/movimentacoes', { title: 'Movimentações', render: App.modules.stock.renderMovimentacoes });
    App.router.register('/estoque/minimo', { title: 'Estoque mínimo', render: App.modules.stock.renderMinimo });
    App.router.register('/estoque/sememestoque', { title: 'Sem estoque', render: App.modules.stock.renderSemEstoque });
    App.router.register('/estoque/encalhados', { title: 'Produtos encalhados', render: App.modules.stock.renderEncalhados });

    // Fase 6 — Inventário
    App.router.register('/estoque/inventario', { title: 'Inventário', render: App.modules.inventoryCount.render });

    // Fase 3 — Clientes
    App.router.register('/clientes', { title: 'Clientes', render: App.modules.customers.render });

    // Fase 4 — Financeiro
    App.router.register('/financeiro/caixa', { title: 'Caixa', render: App.modules.cashRegister.render });
    App.router.register('/financeiro/receber', { title: 'Contas a receber', render: App.modules.financeReceivable.render });
    App.router.register('/financeiro/pagar', { title: 'Contas a pagar', render: App.modules.financePayable.render });
    App.router.register('/financeiro/despesas', { title: 'Despesas', render: App.modules.financeExpenses.render });
    App.router.register('/financeiro/fluxo', { title: 'Fluxo de caixa', render: App.modules.financeFlow.render });

    // Fase 5 — Compras
    App.router.register('/compras/nova', { title: 'Nova compra', render: App.modules.purchases.renderNew });
    App.router.register('/compras/historico', { title: 'Histórico de compras', render: App.modules.purchases.renderHistory });

    // Fase 7 — Inteligência
    App.router.register('/inteligencia/relatorios', { title: 'Relatórios', render: App.modules.reports.renderRelatorios });
    App.router.register('/inteligencia/margens', { title: 'Margens e lucro', render: App.modules.reports.renderMargens });
    App.router.register('/inteligencia/abc', { title: 'Curva ABC', render: App.modules.reports.renderAbc });
    App.router.register('/inteligencia/giro', { title: 'Giro de estoque', render: App.modules.reports.renderGiro });
  }

  function setupGlobalSearch() {
    var input = document.getElementById('global-search-input');
    if (!input) return;
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        var term = input.value.trim();
        if (!term) return;
        // Fase 1: a busca global direciona para Produtos filtrando por SKU/código/nome.
        // Fases futuras expandirão a busca para clientes, fornecedores e vendas (item 42).
        App.router.navigate('/produtos');
        setTimeout(function () {
          var filterInput = document.getElementById('product-filter-input');
          if (filterInput) { filterInput.value = term; filterInput.dispatchEvent(new Event('input')); }
        }, 30);
      }
    });
  }

  function registerServiceWorker() {
    // Service Worker exige http(s) — em uso via file:// (abrir index.html direto)
    // o navegador não permite registrar, e o app funciona normalmente sem PWA offline.
    if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
      navigator.serviceWorker.register('service-worker.js').catch(function (err) {
        console.warn('Não foi possível registrar o Service Worker (PWA offline):', err);
      });
    }
  }

  function boot() {
    registerServiceWorker();
    App.db.open().then(function () {
      return App.db.getById('settings', 'app_meta');
    }).then(function (meta) {
      if (meta && meta.initialized) {
        startApp();
      } else {
        showWelcome();
      }
    }).catch(function (err) {
      console.error(err);
      document.getElementById('root').innerHTML =
        '<div class="welcome-screen"><div class="welcome-card"><h1>Não foi possível iniciar</h1><p class="lead">' +
        App.core.format.escapeHtml(err.message) + '</p></div></div>';
    });
  }

  function showWelcome() {
    var root = document.getElementById('root');
    root.innerHTML = '';
    var card = App.ui.el('div', { class: 'welcome-card' }, [
      App.ui.el('img', { class: 'logo-img', src: 'assets/logo-amah.png', alt: 'AMÁH Brand' }),
      App.ui.el('h1', {}, ['Bem-vindo à AMÁH Brand']),
      App.ui.el('p', { class: 'lead' }, ['Sistema de gestão da AMÁH Brand — acessórios que elevam a sua essência. Escolha como deseja começar.']),
      App.ui.el('div', { class: 'welcome-choices' }, [
        App.ui.el('div', {
          class: 'welcome-choice', onclick: function () { startWithDemo(); }
        }, [
          App.ui.el('div', { class: 'icon' }, ['🧪']),
          App.ui.el('h4', {}, ['Começar com dados de demonstração']),
          App.ui.el('p', {}, ['Produtos, categorias, fornecedores e movimentações fictícias para você explorar o sistema. Pode ser limpo depois em Configurações.'])
        ]),
        App.ui.el('div', {
          class: 'welcome-choice', onclick: function () { startEmpty(); }
        }, [
          App.ui.el('div', { class: 'icon' }, ['📄']),
          App.ui.el('h4', {}, ['Começar sistema vazio']),
          App.ui.el('p', {}, ['Cadastre do zero os dados reais da sua empresa.'])
        ])
      ])
    ]);
    root.appendChild(App.ui.el('div', { class: 'welcome-screen' }, [card]));
  }

  function markInitialized() {
    return App.db.put('settings', { id: 'app_meta', initialized: true, initializedAt: App.core.format.nowIso(), demoData: false });
  }

  function startWithDemo() {
    App.demoData.seed().then(function () {
      return App.db.put('settings', { id: 'app_meta', initialized: true, initializedAt: App.core.format.nowIso(), demoData: true });
    }).then(startApp).catch(function (err) {
      console.error(err);
      alert('Erro ao carregar dados de demonstração: ' + err.message);
    });
  }

  function startEmpty() {
    App.demoData.ensureDefaultSettings().then(markInitialized).then(startApp).catch(function (err) {
      console.error(err);
      alert('Erro ao iniciar sistema: ' + err.message);
    });
  }

  function renderShell() {
    var root = document.getElementById('root');
    root.innerHTML =
      '<div id="app-shell">' +
      '  <aside class="sidebar" id="sidebar">' +
      '    <div class="sidebar-brand">' +
      '      <div class="logo-mark">♡</div>' +
      '      <div><div class="brand-name">AMÁH <span style="font-weight:400;opacity:.85;">Brand</span></div><div class="brand-sub">Gestão completa</div></div>' +
      '    </div>' +
      '    <nav class="sidebar-nav" id="sidebar-nav"></nav>' +
      '    <div class="sidebar-footer">v0.1.0 · dados salvos neste dispositivo</div>' +
      '  </aside>' +
      '  <div class="main-area">' +
      '    <header class="topbar">' +
      '      <button class="topbar-menu-btn" id="menu-toggle-btn">☰</button>' +
      '      <div class="global-search"><span class="icon">🔍</span><input id="global-search-input" placeholder="Buscar produto por nome, SKU ou código de barras…" /></div>' +
      '      <div class="topbar-spacer"></div>' +
      '      <div class="topbar-actions"><span class="env-badge" id="demo-badge" style="display:none;">DEMONSTRAÇÃO</span></div>' +
      '    </header>' +
      '    <main class="view-container" id="view-container"></main>' +
      '  </div>' +
      '</div>' +
      '<div id="toast-container"></div>';

    document.getElementById('menu-toggle-btn').addEventListener('click', openSidebarMobile);
    buildSidebar();
    setupGlobalSearch();
  }

  function refreshDemoBadge() {
    App.db.getById('settings', 'app_meta').then(function (meta) {
      var badge = document.getElementById('demo-badge');
      if (badge) badge.style.display = meta && meta.demoData ? 'inline-block' : 'none';
    });
  }

  function startApp() {
    renderShell();
    registerRoutes();
    App.router.init(document.getElementById('view-container'));
    refreshDemoBadge();
  }

  global.App = global.App || {};
  global.App.updateActiveNav = updateActiveNav;
  global.App.refreshShell = function () { refreshDemoBadge(); App.router.refresh(); };
  global.App.boot = boot;

  document.addEventListener('DOMContentLoaded', boot);
})(window);
