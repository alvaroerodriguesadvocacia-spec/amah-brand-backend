/* AMÁH Brand — módulo Usuários e vendedores (Modo Vendedor, Fase A)
 * Só existe no modo API (produção) — usuários/login não existem no modo
 * local (IndexedDB/file://), então esta tela não tem sentido nesse modo.
 */
(function (global) {
  'use strict';

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Usuários e vendedores']),
        App.ui.el('p', {}, ['Contas da equipe. Administrador tem acesso total; vendedor só acessa o Modo Vendedor (vender, consultar preço/estoque, cadastrar cliente) — sem ver custo, fornecedores, compras ou financeiro.'])
      ]),
      App.ui.el('div', { class: 'page-actions' }, [
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Novo usuário'])
      ])
    ]));

    if (!(App.api && App.api.enabled)) {
      container.appendChild(App.ui.el('div', { class: 'empty-state' }, [
        App.ui.el('div', { class: 'icon' }, ['🔑']),
        App.ui.el('h3', {}, ['Disponível apenas no modo com backend']),
        App.ui.el('p', {}, ['Contas de usuário exigem o sistema conectado ao servidor central (produção). No modo local, todos os dados ficam só neste dispositivo, sem login.'])
      ]));
      return;
    }

    var body = App.ui.el('div', { class: 'card-body', id: 'users-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Contas cadastradas'])]),
      body
    ]));
    load();
  }

  function load() {
    App.api.request('GET', '/api/v1/admin/users').then(renderList).catch(function (err) {
      var body = document.getElementById('users-body');
      if (body) body.innerHTML = '<div class="table-empty">' + App.core.format.escapeHtml(err.message) + '</div>';
    });
  }

  function roleLabel(role) { return role === 'vendedor' ? 'Vendedor' : 'Administrador'; }

  function renderList(users) {
    var body = document.getElementById('users-body');
    if (!body) return;
    if (!users.length) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'empty-state' }, [
        App.ui.el('div', { class: 'icon' }, ['🔑']),
        App.ui.el('h3', {}, ['Nenhum usuário cadastrado'])
      ]));
      return;
    }
    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['Nome']), App.ui.el('th', {}, ['E-mail']), App.ui.el('th', {}, ['Perfil']),
      App.ui.el('th', {}, ['Status']), App.ui.el('th', {}, [''])
    ])]));
    var tbody = App.ui.el('tbody');
    users.forEach(function (u) {
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [App.ui.el('strong', {}, [u.name || '—'])]),
        App.ui.el('td', {}, [u.email]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (u.role === 'vendedor' ? 'badge-info' : 'badge-neutral') }, [roleLabel(u.role)])]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (u.active ? 'badge-success' : 'badge-neutral') }, [u.active ? 'Ativo' : 'Inativo'])]),
        App.ui.el('td', { class: 'row-actions' }, [
          App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openForm(u); } }, ['Editar'])
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function openForm(existing) {
    var isEdit = !!existing;
    var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });
    var nameInput = App.ui.el('input', { value: (existing && existing.name) || '' });
    var emailInput = App.ui.el('input', Object.assign({ type: 'email', value: (existing && existing.email) || '' }, isEdit ? { disabled: 'disabled' } : {}));
    var passInput = App.ui.el('input', { type: 'password', placeholder: isEdit ? 'Deixe em branco para manter a atual' : 'Mínimo 6 caracteres' });
    var roleSelect = App.ui.el('select', {}, [
      App.ui.el('option', { value: 'vendedor' }, ['Vendedor']),
      App.ui.el('option', { value: 'admin' }, ['Administrador'])
    ]);
    roleSelect.value = (existing && existing.role) || 'vendedor';
    var activeCheckbox = App.ui.el('input', Object.assign({ type: 'checkbox' }, (!existing || existing.active) ? { checked: 'checked' } : {}));

    var fields = [
      App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Nome']), nameInput]),
      App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['E-mail *']), emailInput]),
      App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Perfil']), roleSelect]),
      App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, [isEdit ? 'Nova senha' : 'Senha *']), passInput])
    ];
    if (isEdit) {
      fields.push(App.ui.el('div', { class: 'form-field' }, [
        App.ui.el('div', { class: 'checkbox-row' }, [activeCheckbox, App.ui.el('label', {}, ['Conta ativa'])])
      ]));
    }

    var form = App.ui.el('div', { class: 'form-grid' }, fields);
    var wrapper = App.ui.el('div', {}, [errorBox, form]);

    App.ui.openModal({
      title: isEdit ? 'Editar usuário' : 'Novo usuário',
      bodyNode: wrapper,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: isEdit ? 'Salvar alterações' : 'Criar usuário', className: 'btn-primary', onClick: function (close) {
            errorBox.classList.add('hidden');
            if (isEdit) {
              var patch = { name: nameInput.value.trim(), role: roleSelect.value, active: activeCheckbox.checked };
              if (passInput.value) patch.password = passInput.value;
              App.api.request('PATCH', '/api/v1/admin/users/' + encodeURIComponent(existing.id), patch).then(function () {
                App.ui.toast('Usuário atualizado.', 'success'); close(); load();
              }).catch(function (err) { errorBox.textContent = err.message; errorBox.classList.remove('hidden'); });
            } else {
              var email = emailInput.value.trim();
              var password = passInput.value;
              if (!email) { errorBox.textContent = 'Informe o e-mail.'; errorBox.classList.remove('hidden'); return; }
              if (!password || password.length < 6) { errorBox.textContent = 'A senha precisa ter ao menos 6 caracteres.'; errorBox.classList.remove('hidden'); return; }
              App.api.request('POST', '/api/v1/admin/users', { email: email, password: password, name: nameInput.value.trim(), role: roleSelect.value }).then(function () {
                App.ui.toast('Usuário criado.', 'success'); close(); load();
              }).catch(function (err) { errorBox.textContent = err.message; errorBox.classList.remove('hidden'); });
            }
          }
        }
      ]
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.users = { render: render };
})(window);
