/* AMÁH Brand — módulo Backup (exportação e importação de dados)
 * Formato JSON estruturado e versionado. A importação sempre valida o
 * arquivo e pede confirmação explícita antes de sobrescrever dados (item 52).
 */
(function (global) {
  'use strict';

  var BACKUP_VERSION = 1;
  var fmt = App.core.format;

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Backup']),
        App.ui.el('p', {}, ['Exporte todos os dados para um arquivo JSON ou restaure a partir de um backup anterior.'])
      ])
    ]));

    var summaryBody = App.ui.el('div', { class: 'kpi-grid', id: 'backup-summary' });
    container.appendChild(summaryBody);

    container.appendChild(App.ui.el('div', { class: 'card', style: 'margin-bottom:16px;' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Exportar backup'])]),
      App.ui.el('div', { class: 'card-body' }, [
        App.ui.el('p', { class: 'text-muted mt-0' }, ['Gera um arquivo .json com todas as categorias, fornecedores, produtos, movimentações de estoque e configurações.']),
        App.ui.el('button', { class: 'btn btn-primary', onclick: exportBackup }, ['⬇ Exportar backup (.json)'])
      ])
    ]));

    container.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Importar backup'])]),
      App.ui.el('div', { class: 'card-body' }, [
        App.ui.el('p', { class: 'text-muted mt-0' }, ['Atenção: a importação substitui os dados atuais pelos dados do arquivo, após sua confirmação explícita.']),
        App.ui.el('input', { type: 'file', id: 'backup-file-input', accept: 'application/json' }),
        App.ui.el('div', { style: 'margin-top:10px;' }, [
          App.ui.el('button', { class: 'btn btn-secondary', onclick: handleImportClick }, ['⬆ Importar backup selecionado'])
        ])
      ])
    ]));

    loadSummary();
  }

  function loadSummary() {
    Promise.all(App.db.STORES.map(function (s) { return App.db.getAll(s); })).then(function (results) {
      var el = document.getElementById('backup-summary');
      if (!el) return;
      el.innerHTML = '';
      App.db.STORES.forEach(function (storeName, i) {
        el.appendChild(App.ui.el('div', { class: 'kpi-card' }, [
          App.ui.el('div', { class: 'kpi-label' }, [labelForStore(storeName)]),
          App.ui.el('div', { class: 'kpi-value' }, [String(results[i].length)])
        ]));
      });
    });
  }

  function labelForStore(name) {
    var labels = {
      settings: 'Configurações', categories: 'Categorias', suppliers: 'Fornecedores',
      products: 'Produtos', inventory_movements: 'Movimentações', audit_logs: 'Registros de auditoria'
    };
    return labels[name] || name;
  }

  function exportBackup() {
    Promise.all(App.db.STORES.map(function (s) { return App.db.getAll(s); })).then(function (results) {
      var payload = { version: BACKUP_VERSION, exportedAt: fmt.nowIso(), system: 'AMÁH Brand', data: {} };
      App.db.STORES.forEach(function (storeName, i) { payload.data[storeName] = results[i]; });
      var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
      a.href = url;
      a.download = 'bijou-gestao-backup-' + stamp + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
      App.ui.toast('Backup exportado.', 'success');
    });
  }

  function validateBackupPayload(payload) {
    if (!payload || typeof payload !== 'object') throw new Error('Arquivo inválido: não é um JSON de backup reconhecível.');
    if (!payload.data || typeof payload.data !== 'object') throw new Error('Arquivo inválido: seção "data" ausente.');
    if (payload.system && payload.system !== 'AMÁH Brand') throw new Error('Este arquivo não parece ser um backup do AMÁH Brand.');
    var missing = App.db.STORES.filter(function (s) { return !(s in payload.data); });
    if (missing.length > 0 && missing.length === App.db.STORES.length) {
      throw new Error('Arquivo inválido: nenhuma das tabelas esperadas foi encontrada.');
    }
    return true;
  }

  function handleImportClick() {
    var input = document.getElementById('backup-file-input');
    var file = input.files && input.files[0];
    if (!file) { App.ui.toast('Selecione um arquivo .json primeiro.', 'error'); return; }

    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try {
        payload = JSON.parse(reader.result);
        validateBackupPayload(payload);
      } catch (err) {
        App.ui.toast('Falha ao ler backup: ' + err.message, 'error');
        return;
      }

      var counts = App.db.STORES.map(function (s) { return (payload.data[s] || []).length; }).reduce(function (a, b) { return a + b; }, 0);

      App.ui.confirmDialog({
        title: 'Confirmar importação de backup',
        message: 'Este arquivo contém ' + counts + ' registro(s) no total, exportado em ' + fmt.dateTimeBR(payload.exportedAt) +
          '. A importação SUBSTITUIRÁ todos os dados atuais do sistema. Esta ação não pode ser desfeita. Deseja continuar?',
        danger: true,
        confirmLabel: 'Substituir dados e importar'
      }).then(function (confirmed) {
        if (!confirmed) { input.value = ''; return; }
        performImport(payload).then(function () {
          App.ui.toast('Backup importado com sucesso.', 'success');
          input.value = '';
          loadSummary();
          App.refreshShell();
        }).catch(function (err) {
          App.ui.toast('Erro ao importar: ' + err.message, 'error');
        });
      });
    };
    reader.onerror = function () { App.ui.toast('Não foi possível ler o arquivo selecionado.', 'error'); };
    reader.readAsText(file);
  }

  function performImport(payload) {
    return App.db.clearAll().then(function () {
      return Promise.all(App.db.STORES.map(function (storeName) {
        var records = payload.data[storeName] || [];
        return records.length ? App.db.putMany(storeName, records) : Promise.resolve();
      }));
    }).then(function () {
      return App.db.getById('settings', 'app_meta');
    }).then(function (meta) {
      if (!meta) {
        return App.db.put('settings', { id: 'app_meta', initialized: true, initializedAt: fmt.nowIso(), demoData: false });
      }
    });
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.backup = { render: render };
})(window);
