/* AMÁH Brand — módulo Inventário / Contagem física (Fase 6)
 * Fluxo: iniciar contagem -> ler produtos (scanner ou manual) -> comparar
 * sistema × físico -> mostrar divergências -> confirmar ajustes seletivamente
 * (nunca ajusta automaticamente — item 19 da especificação).
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var inv = App.core.inventoryEngine;

  var state = null; // { count, productIndex, items: [] }

  function loadProductIndex() {
    return App.db.getAll('products').then(function (products) {
      var byId = {}, bySku = {}, byBarcode = {};
      products.forEach(function (p) {
        byId[p.id] = p;
        bySku[(p.sku || '').toUpperCase()] = p;
        if (p.barcode) byBarcode[p.barcode] = p;
      });
      return { products: products, byId: byId, bySku: bySku, byBarcode: byBarcode };
    });
  }

  function findProduct(index, code) {
    var c = (code || '').trim();
    return index.byBarcode[c] || index.bySku[c.toUpperCase()] || null;
  }

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [App.ui.el('h1', {}, ['Inventário / Contagem física']), App.ui.el('p', {}, ['Compare o estoque físico com o sistema e confirme ajustes apenas onde houver divergência real.'])])
    ]));

    var body = App.ui.el('div', { id: 'inv-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(body);

    App.db.getAll('stock_counts').then(function (all) {
      var open = all.filter(function (c) { return c.status === 'em_andamento'; })[0];
      if (open) {
        loadOpenCount(open);
      } else {
        renderStart(all);
      }
    });
  }

  function renderStart(previous) {
    var body = document.getElementById('inv-body');
    if (!body) return;
    body.innerHTML = '';

    var notesInput = App.ui.el('input', { id: 'inv-notes', placeholder: 'Ex.: Contagem mensal — loja física' });
    body.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Iniciar nova contagem'])]),
      App.ui.el('div', { class: 'card-body' }, [
        App.ui.el('div', { class: 'form-field', style: 'max-width:420px;' }, [App.ui.el('label', {}, ['Observações (opcional)']), notesInput]),
        App.ui.el('button', { class: 'btn btn-primary', style: 'margin-top:10px;', onclick: function () {
          inv.startCount(notesInput.value.trim()).then(function (count) { loadOpenCount(count); });
        } }, ['▶ Iniciar contagem'])
      ])
    ]));

    var finished = previous.filter(function (c) { return c.status === 'concluido'; })
      .sort(function (a, b) { return new Date(b.finishedAt) - new Date(a.finishedAt); });

    if (finished.length) {
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Iniciada em']), App.ui.el('th', {}, ['Concluída em']), App.ui.el('th', {}, ['Observações'])
      ])]));
      var tbody = App.ui.el('tbody');
      finished.slice(0, 20).forEach(function (c) {
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [fmt.dateTimeBR(c.startedAt)]),
          App.ui.el('td', {}, [fmt.dateTimeBR(c.finishedAt)]),
          App.ui.el('td', { class: 'text-muted' }, [c.notes || '—'])
        ]));
      });
      table.appendChild(tbody);
      body.appendChild(App.ui.el('div', { class: 'card' }, [
        App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Contagens anteriores'])]),
        App.ui.el('div', { class: 'card-body' }, [App.ui.el('div', { class: 'table-wrap' }, [table])])
      ]));
    }
  }

  function loadOpenCount(count) {
    Promise.all([loadProductIndex(), inv.getDivergences(count.id)]).then(function (results) {
      state = { count: count, productIndex: results[0], items: results[1] };
      renderOpenCount();
    });
  }

  function renderOpenCount() {
    var body = document.getElementById('inv-body');
    if (!body) return;
    body.innerHTML = '';

    var searchInput = App.ui.el('input', { id: 'inv-search', placeholder: 'Digite/bipe SKU ou código de barras e pressione Enter (soma +1 a cada leitura)…' });
    var scanBtn = App.ui.el('button', { class: 'btn btn-secondary', onclick: openScanner }, ['📷 Escanear']);

    body.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-header' }, [
        App.ui.el('h2', {}, ['Contagem em andamento']),
        App.ui.el('span', { class: 'text-faint' }, ['Iniciada em ' + fmt.dateTimeBR(state.count.startedAt)])
      ]),
      App.ui.el('div', { class: 'card-body' }, [
        App.ui.el('div', { class: 'form-grid cols-3' }, [
          App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Produto']), searchInput]),
          App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['​']), scanBtn])
        ])
      ])
    ]));

    var listBody = App.ui.el('div', { class: 'card-body', id: 'inv-list-body' });
    body.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-header' }, [
        App.ui.el('h2', {}, ['Itens lidos / divergências']),
        App.ui.el('div', { class: 'row-actions' }, [
          App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: addAllUncounted }, ['+ Adicionar todos os produtos (contagem zero)']),
          App.ui.el('button', { class: 'btn btn-primary btn-sm', onclick: openConfirmAdjustments }, ['✔ Confirmar ajustes selecionados'])
        ])
      ]),
      listBody
    ]));

    body.appendChild(App.ui.el('div', { class: 'card-body' }, [
      App.ui.el('button', { class: 'btn btn-ghost', onclick: finishCount }, ['🏁 Finalizar contagem'])
    ]));

    renderItemsTable();

    searchInput.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      addReading(searchInput.value);
      searchInput.value = '';
    });
  }

  function addReading(code) {
    var product = findProduct(state.productIndex, code);
    if (!product) { App.ui.toast('Produto não encontrado para "' + code + '".', 'error'); return; }
    inv.addReading(state.count.id, product.id, 1).then(function () { return inv.getDivergences(state.count.id); })
      .then(function (items) { state.items = items; renderItemsTable(); });
  }

  function openScanner() {
    App.core.scanner.openScannerModal({ title: 'Escanear produto — contagem', onDetect: function (code) { addReading(code); } });
  }

  function addAllUncounted() {
    var countedIds = {};
    state.items.forEach(function (i) { countedIds[i.productId] = true; });
    var missing = state.productIndex.products.filter(function (p) { return p.active && !countedIds[p.id]; });
    if (missing.length === 0) { App.ui.toast('Todos os produtos ativos já têm leitura.', 'info'); return; }
    var chain = missing.reduce(function (p, prod) {
      return p.then(function () { return inv.setReading(state.count.id, prod.id, 0); });
    }, Promise.resolve());
    chain.then(function () { return inv.getDivergences(state.count.id); })
      .then(function (items) { state.items = items; renderItemsTable(); App.ui.toast(missing.length + ' produto(s) adicionados com contagem zero.', 'success'); });
  }

  function renderItemsTable() {
    var listBody = document.getElementById('inv-list-body');
    if (!listBody) return;
    listBody.innerHTML = '';
    if (state.items.length === 0) {
      listBody.appendChild(App.ui.el('p', { class: 'text-muted mt-0' }, ['Nenhuma leitura ainda. Busque, escaneie ou use "Adicionar todos os produtos" acima.']));
      return;
    }
    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
      App.ui.el('th', {}, ['']), App.ui.el('th', {}, ['Produto']), App.ui.el('th', {}, ['Sistema']),
      App.ui.el('th', {}, ['Contado']), App.ui.el('th', {}, ['Diferença']), App.ui.el('th', {}, ['Status'])
    ])]));
    var tbody = App.ui.el('tbody');
    // Ordem alfabética por nome do produto — fixa, não muda conforme a
    // diferença de cada item é editada. Antes a lista era ordenada por
    // "maior diferença primeiro", o que fazia cada linha pular de posição
    // assim que a pessoa digitava uma quantidade contada: parecia que o
    // valor "voltava a zero", quando na verdade uma peça ainda não contada
    // (diferença zero) tinha acabado de ocupar aquela posição da tela.
    state.items.slice().sort(function (a, b) {
      var pa = state.productIndex.byId[a.productId];
      var pb = state.productIndex.byId[b.productId];
      return (pa ? pa.name : '').localeCompare(pb ? pb.name : '', 'pt-BR');
    }).forEach(function (i) {
      var p = state.productIndex.byId[i.productId];
      var checkbox = App.ui.el('input', { type: 'checkbox', 'data-item-id': i.id, disabled: i.difference === 0 ? 'disabled' : undefined });
      var countedInput = App.ui.el('input', { type: 'number', min: '0', value: String(i.countedQty), style: 'width:80px;' });
      countedInput.addEventListener('change', function () {
        inv.setReading(state.count.id, i.productId, Number(countedInput.value) || 0)
          .then(function () { return inv.getDivergences(state.count.id); })
          .then(function (items) { state.items = items; renderItemsTable(); });
      });
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [i.difference !== 0 ? checkbox : '']),
        App.ui.el('td', {}, [p ? App.ui.el('div', {}, [App.ui.el('strong', {}, [p.name]), App.ui.el('div', { class: 'text-faint mono' }, [p.sku])]) : '(produto removido)']),
        App.ui.el('td', { class: 'mono' }, [String(i.systemQty)]),
        App.ui.el('td', {}, [countedInput]),
        App.ui.el('td', { class: 'mono' }, [(i.difference > 0 ? '+' : '') + String(i.difference)]),
        App.ui.el('td', {}, [i.adjusted
          ? App.ui.el('span', { class: 'badge badge-success' }, ['Ajustado'])
          : (i.difference === 0 ? App.ui.el('span', { class: 'badge badge-neutral' }, ['OK']) : App.ui.el('span', { class: 'badge badge-warning' }, ['Divergente']))])
      ]));
    });
    table.appendChild(tbody);
    listBody.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  function openConfirmAdjustments() {
    var checked = Array.prototype.slice.call(document.querySelectorAll('#inv-list-body input[type=checkbox]:checked'));
    var itemIds = checked.map(function (c) { return c.getAttribute('data-item-id'); });
    if (itemIds.length === 0) { App.ui.toast('Selecione ao menos um item divergente para ajustar.', 'error'); return; }
    App.ui.confirmDialog({
      title: 'Confirmar ajustes de estoque',
      message: 'Isso gerará movimentações de ajuste (ENTRADA_AJUSTE/SAIDA_AJUSTE) para ' + itemIds.length + ' produto(s), alterando o saldo do sistema para bater com a contagem física. Confirmar?'
    }).then(function (confirmed) {
      if (!confirmed) return;
      inv.confirmAdjustments(state.count.id, itemIds).then(function () { return inv.getDivergences(state.count.id); })
        .then(function (items) { state.items = items; renderItemsTable(); App.ui.toast('Ajustes confirmados.', 'success'); })
        .catch(function (err) { App.ui.toast(err.message, 'error'); });
    });
  }

  function finishCount() {
    var pendingDivergences = state.items.filter(function (i) { return i.difference !== 0 && !i.adjusted; });
    var message = pendingDivergences.length
      ? 'Ainda há ' + pendingDivergences.length + ' item(ns) com divergência não ajustada. Eles permanecerão divergentes no histórico. Deseja finalizar mesmo assim?'
      : 'Finalizar esta contagem de inventário?';
    App.ui.confirmDialog({ title: 'Finalizar contagem', message: message }).then(function (confirmed) {
      if (!confirmed) return;
      inv.finishCount(state.count.id).then(function () {
        App.ui.toast('Contagem finalizada.', 'success');
        state = null;
        App.db.getAll('stock_counts').then(function (all) { renderStart(all); });
      });
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.inventoryCount = { render: render };
})(window);
