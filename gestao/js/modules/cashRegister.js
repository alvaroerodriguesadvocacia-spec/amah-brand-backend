/* AMÁH Brand — módulo Caixa (Fase 4) */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var cashEngine = App.core.cashEngine;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Caixa']), App.ui.el('p', {}, ['Controle de abertura, movimentações e fechamento do caixa.'])])
    ]));

    var content = App.ui.el('div', { id: 'cash-content' });
    container.appendChild(content);
    load();

    function load() {
      cashEngine.getOpenSession().then(function (session) {
        if (session) renderOpenSession(content, session);
        else renderClosedState(content);
      });
    }

    function renderClosedState(content) {
      content.innerHTML = '';
      var openingInput = App.ui.el('input', { id: 'cash-opening', type: 'number', step: '0.01', min: '0', value: '0' });
      content.appendChild(App.ui.el('div', { class: 'card' }, [
        App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Nenhum caixa aberto'])]),
        App.ui.el('div', { class: 'card-body' }, [
          App.ui.el('div', { class: 'form-grid' }, [
            App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Saldo inicial (R$)']), openingInput])
          ]),
          App.ui.el('div', { style: 'margin-top:14px;' }, [
            App.ui.el('button', {
              class: 'btn btn-primary', onclick: function () {
                cashEngine.openSession(Number(openingInput.value) || 0, '').then(function () {
                  App.ui.toast('Caixa aberto.', 'success');
                  load();
                }).catch(function (err) { App.ui.toast(err.message, 'error'); });
              }
            }, ['Abrir caixa'])
          ])
        ])
      ]));

      loadPastSessions(content);
    }

    function renderOpenSession(content, session) {
      content.innerHTML = '';
      cashEngine.computeBalance(session.id).then(function (result) {
        var kpis = App.ui.el('div', { class: 'kpi-grid' }, [
          kpiCard('Saldo inicial', fmt.money(session.openingBalance)),
          kpiCard('Saldo esperado agora', fmt.money(result.expectedBalance)),
          kpiCard('Aberto desde', fmt.dateTimeBR(session.openedAt))
        ]);
        content.appendChild(kpis);

        var actionsCard = App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
          App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Movimentação manual'])]),
          App.ui.el('div', { class: 'card-body' }, [
            App.ui.el('div', { class: 'form-grid cols-3' }, [
              App.ui.el('div', { class: 'form-field' }, [
                App.ui.el('label', {}, ['Tipo']),
                App.ui.el('select', { id: 'cm-type' }, [
                  App.ui.el('option', { value: 'suprimento' }, ['Suprimento (entrada)']),
                  App.ui.el('option', { value: 'entrada' }, ['Outra entrada']),
                  App.ui.el('option', { value: 'sangria' }, ['Sangria (retirada)']),
                  App.ui.el('option', { value: 'retirada' }, ['Outra retirada'])
                ])
              ]),
              App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Valor (R$)']), App.ui.el('input', { id: 'cm-amount', type: 'number', step: '0.01', min: '0.01' })]),
              App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Descrição']), App.ui.el('input', { id: 'cm-desc' })])
            ]),
            App.ui.el('div', { style: 'margin-top:10px;' }, [
              App.ui.el('button', {
                class: 'btn btn-secondary', onclick: function () {
                  var type = document.getElementById('cm-type').value;
                  var amount = Number(document.getElementById('cm-amount').value);
                  var desc = document.getElementById('cm-desc').value.trim();
                  cashEngine.registerMovement({ type: type, amount: amount, description: desc }).then(function () {
                    App.ui.toast('Movimentação registrada.', 'success');
                    load();
                  }).catch(function (err) { App.ui.toast(err.message, 'error'); });
                }
              }, ['Registrar movimentação'])
            ])
          ])
        ]);
        content.appendChild(actionsCard);

        var movBody = App.ui.el('div', { class: 'card-body' });
        var movTable = buildMovementsTable(result.movements);
        movBody.appendChild(movTable);
        content.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
          App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Movimentações deste caixa'])]), movBody
        ]));

        var closingInput = App.ui.el('input', { id: 'cash-closing', type: 'number', step: '0.01', min: '0', placeholder: 'Ex.: ' + result.expectedBalance.toFixed(2) });
        content.appendChild(App.ui.el('div', { class: 'card' }, [
          App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Fechar caixa'])]),
          App.ui.el('div', { class: 'card-body' }, [
            App.ui.el('div', { class: 'form-grid' }, [
              App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Saldo contado no caixa físico (R$)']), closingInput])
            ]),
            App.ui.el('div', { style: 'margin-top:10px;' }, [
              App.ui.el('button', {
                class: 'btn btn-danger', onclick: function () {
                  var informed = Number(closingInput.value);
                  if (!isFinite(informed)) { App.ui.toast('Informe o saldo contado.', 'error'); return; }
                  cashEngine.closeSession(session.id, informed, '').then(function (closed) {
                    var diffMsg = Math.abs(closed.difference) < 0.005 ? 'Sem diferença.' : ('Diferença: ' + fmt.money(closed.difference) + (closed.difference < 0 ? ' (faltou)' : ' (sobrou)') + '.');
                    App.ui.toast('Caixa fechado. ' + diffMsg, closed.difference === 0 ? 'success' : 'info');
                    load();
                  }).catch(function (err) { App.ui.toast(err.message, 'error'); });
                }
              }, ['Fechar caixa'])
            ])
          ])
        ]));
      });
    }

    function buildMovementsTable(movements) {
      if (movements.length === 0) return App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhuma movimentação ainda.']);
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Data']), App.ui.el('th', {}, ['Tipo']), App.ui.el('th', {}, ['Descrição']), App.ui.el('th', {}, ['Valor'])
      ])]));
      var tbody = App.ui.el('tbody');
      movements.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); }).forEach(function (m) {
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [fmt.dateTimeBR(m.createdAt)]),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (m.direction > 0 ? 'badge-success' : 'badge-danger') }, [m.type])]),
          App.ui.el('td', { class: 'text-muted' }, [m.description || m.relatedDocument || '—']),
          App.ui.el('td', { class: 'mono' }, [(m.direction > 0 ? '+ ' : '− ') + fmt.money(m.amount)])
        ]));
      });
      table.appendChild(tbody);
      return App.ui.el('div', { class: 'table-wrap' }, [table]);
    }

    function loadPastSessions(content) {
      App.db.getAll('cash_sessions').then(function (sessions) {
        var closed = sessions.filter(function (s) { return s.status === 'fechado'; }).sort(function (a, b) { return new Date(b.closedAt) - new Date(a.closedAt); });
        if (closed.length === 0) return;
        var table = App.ui.el('table', { class: 'data-table' });
        table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
          App.ui.el('th', {}, ['Aberto em']), App.ui.el('th', {}, ['Fechado em']), App.ui.el('th', {}, ['Inicial']),
          App.ui.el('th', {}, ['Esperado']), App.ui.el('th', {}, ['Informado']), App.ui.el('th', {}, ['Diferença'])
        ])]));
        var tbody = App.ui.el('tbody');
        closed.slice(0, 30).forEach(function (s) {
          tbody.appendChild(App.ui.el('tr', {}, [
            App.ui.el('td', {}, [fmt.dateTimeBR(s.openedAt)]), App.ui.el('td', {}, [fmt.dateTimeBR(s.closedAt)]),
            App.ui.el('td', { class: 'mono' }, [fmt.money(s.openingBalance)]), App.ui.el('td', { class: 'mono' }, [fmt.money(s.closingBalanceExpected)]),
            App.ui.el('td', { class: 'mono' }, [fmt.money(s.closingBalanceInformed)]),
            App.ui.el('td', { class: 'mono ' + (Math.abs(s.difference) < 0.005 ? '' : 'text-danger') }, [fmt.money(s.difference)])
          ]));
        });
        table.appendChild(tbody);
        content.appendChild(App.ui.el('div', { class: 'card', style: 'margin-top:14px;' }, [
          App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Histórico de caixas fechados'])]),
          App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'table-wrap' }, [table])])
        ]));
      });
    }
  }

  function kpiCard(label, value) {
    return App.ui.el('div', { class: 'kpi-card' }, [App.ui.el('div', { class: 'kpi-label' }, [label]), App.ui.el('div', { class: 'kpi-value' }, [value])]);
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.cashRegister = { render: render };
})(window);
