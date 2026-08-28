/* AMÁH Brand — módulo Produtos
 * Regra central: o campo de estoque NUNCA é gravado diretamente aqui.
 * Toda alteração de saldo passa por App.core.stockEngine (ver stockEngine.js).
 */
(function (global) {
  'use strict';

  var fmt = App.core.format;
  var stockEngine = App.core.stockEngine;
  var currentFilter = '';
  var cache = { products: [], categories: [], suppliers: [], stockMap: {} };

  function render(container) {
    container.innerHTML = '';
    container.appendChild(App.ui.el('div', { class: 'page-header' }, [
      App.ui.el('div', {}, [
        App.ui.el('h1', {}, ['Produtos']),
        App.ui.el('p', {}, ['Cadastro central de produtos. O estoque exibido é sempre calculado a partir do histórico de movimentações.'])
      ]),
      App.ui.el('div', { class: 'page-actions' }, [
        App.ui.el('button', { class: 'btn btn-secondary', onclick: function () { openBatchGenerate(); } }, ['✨ Gerar descrições Amáhr']),
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Novo produto'])
      ])
    ]));

    var filterRow = App.ui.el('div', { class: 'card', style: 'margin-bottom:14px;' }, [
      App.ui.el('div', { class: 'card-body', style: 'padding:14px 18px;' }, [
        App.ui.el('input', {
          id: 'product-filter-input',
          placeholder: 'Filtrar por nome, SKU ou código de barras…',
          style: 'max-width:360px;',
          oninput: function (e) { currentFilter = e.target.value.toLowerCase(); renderTable(); }
        })
      ])
    ]);
    container.appendChild(filterRow);

    var body = App.ui.el('div', { class: 'card-body', id: 'products-body' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando…'])]);
    container.appendChild(App.ui.el('div', { class: 'card' }, [
      App.ui.el('div', { class: 'card-header' }, [App.ui.el('h2', {}, ['Todos os produtos'])]),
      body
    ]));

    loadAll();
  }

  function loadAll() {
    return Promise.all([
      App.db.getAll('products'),
      App.db.getAll('categories'),
      App.db.getAll('suppliers'),
      stockEngine.calcularSaldoTodos()
    ]).then(function (results) {
      cache.products = results[0];
      cache.categories = results[1];
      cache.suppliers = results[2];
      cache.stockMap = results[3];
      renderTable();
    });
  }

  function categoryName(id) {
    var c = cache.categories.filter(function (c) { return c.id === id; })[0];
    return c ? c.name : '—';
  }
  function supplierName(id) {
    var s = cache.suppliers.filter(function (s) { return s.id === id; })[0];
    return s ? s.name : '—';
  }

  function stockBadge(qty, min) {
    if (qty <= 0) return App.ui.el('span', { class: 'badge badge-danger' }, ['Sem estoque']);
    if (min != null && qty <= min) return App.ui.el('span', { class: 'badge badge-warning' }, ['Abaixo do mínimo']);
    return App.ui.el('span', { class: 'badge badge-success' }, ['OK']);
  }

  function renderTable() {
    var body = document.getElementById('products-body');
    if (!body) return;

    var filtered = cache.products.filter(function (p) {
      if (!currentFilter) return true;
      return (p.name || '').toLowerCase().indexOf(currentFilter) !== -1 ||
        (p.sku || '').toLowerCase().indexOf(currentFilter) !== -1 ||
        (p.barcode || '').toLowerCase().indexOf(currentFilter) !== -1;
    }).sort(function (a, b) { return (a.name || '').localeCompare(b.name || '', 'pt-BR'); });

    if (cache.products.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'empty-state' }, [
        App.ui.el('div', { class: 'icon' }, ['💍']),
        App.ui.el('h3', {}, ['Nenhum produto cadastrado']),
        App.ui.el('p', {}, ['Cadastre seu primeiro produto para começar a controlar estoque, preços e margens.']),
        App.ui.el('button', { class: 'btn btn-primary', onclick: function () { openForm(null); } }, ['+ Novo produto'])
      ]));
      return;
    }
    if (filtered.length === 0) {
      body.innerHTML = '';
      body.appendChild(App.ui.el('div', { class: 'table-empty' }, ['Nenhum produto encontrado para "' + currentFilter + '".']));
      return;
    }

    var table = App.ui.el('table', { class: 'data-table' });
    table.appendChild(App.ui.el('thead', {}, [
      App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Produto']),
        App.ui.el('th', {}, ['Categoria']),
        App.ui.el('th', {}, ['Fornecedor']),
        App.ui.el('th', {}, ['Custo']),
        App.ui.el('th', {}, ['Varejo']),
        App.ui.el('th', {}, ['Margem']),
        App.ui.el('th', {}, ['Estoque']),
        App.ui.el('th', {}, ['Status']),
        App.ui.el('th', {}, [''])
      ])
    ]));
    var tbody = App.ui.el('tbody');
    filtered.forEach(function (p) {
      var totalCost = (Number(p.cost) || 0) + (Number(p.additionalCosts) || 0);
      var margin = p.retailPrice > 0 ? ((p.retailPrice - totalCost) / p.retailPrice) * 100 : 0;
      var qty = cache.stockMap[p.id] || 0;
      tbody.appendChild(App.ui.el('tr', {}, [
        App.ui.el('td', {}, [
          App.ui.el('div', { class: 'flex items-center gap-8' }, [
            p.image
              ? App.ui.el('img', { src: p.image, style: 'width:34px;height:34px;border-radius:8px;object-fit:cover;flex:none;' })
              : App.ui.el('div', { style: 'width:34px;height:34px;border-radius:8px;background:var(--color-primary-bg);flex:none;' }),
            App.ui.el('div', {}, [
              App.ui.el('strong', {}, [p.name]),
              App.ui.el('div', { class: 'text-faint mono' }, [p.sku + (p.barcode ? ' · ' + p.barcode : '')])
            ])
          ])
        ]),
        App.ui.el('td', {}, [categoryName(p.categoryId)]),
        App.ui.el('td', {}, [supplierName(p.supplierId)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(totalCost)]),
        App.ui.el('td', { class: 'mono' }, [fmt.money(p.retailPrice)]),
        App.ui.el('td', { class: 'mono' }, [fmt.percent(margin)]),
        App.ui.el('td', {}, [
          App.ui.el('div', { class: 'flex items-center gap-8' }, [
            App.ui.el('span', { class: 'mono' }, [String(qty)]),
            stockBadge(qty, p.minStock)
          ])
        ]),
        App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (p.active ? 'badge-success' : 'badge-neutral') }, [p.active ? 'Ativo' : 'Inativo'])]),
        App.ui.el('td', { class: 'row-actions' }, [
          App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { openDetail(p); } }, ['Ver']),
          App.ui.el('button', { class: 'btn btn-ghost btn-sm', onclick: function () { openForm(p); } }, ['Editar'])
        ])
      ]));
    });
    table.appendChild(tbody);
    body.innerHTML = '';
    body.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
  }

  // ---------- Detalhe do produto (consulta + histórico + ajuste de estoque) ----------

  function openDetail(product) {
    var qty = cache.stockMap[product.id] || 0;
    var totalCost = (Number(product.cost) || 0) + (Number(product.additionalCosts) || 0);
    var margin = product.retailPrice > 0 ? ((product.retailPrice - totalCost) / product.retailPrice) * 100 : 0;
    var location = [product.location && product.location.shelf, product.location && product.location.drawer, product.location && product.location.box]
      .filter(Boolean).join(' → ') || '—';

    var summary = App.ui.el('div', { class: 'form-grid cols-3', style: 'margin-bottom:18px;' }, [
      infoBlock('Estoque atual', String(qty)),
      infoBlock('Estoque mínimo / ideal', (product.minStock != null ? product.minStock : '—') + ' / ' + (product.idealStock != null ? product.idealStock : '—')),
      infoBlock('Localização física', location),
      infoBlock('Custo total', fmt.money(totalCost)),
      infoBlock('Preço varejo', fmt.money(product.retailPrice)),
      infoBlock('Margem', fmt.percent(margin)),
      infoBlock('Preço atacado', fmt.money(product.wholesalePrice)),
      infoBlock('Fornecedor', supplierName(product.supplierId)),
      infoBlock('Categoria', categoryName(product.categoryId)),
      infoBlock('Total vendido (histórico)', String(product.totalSold || 0)),
      infoBlock('Última compra', fmt.dateBR(product.lastPurchaseAt)),
      infoBlock('Última venda', fmt.dateBR(product.lastSaleAt))
    ]);

    var historyContainer = App.ui.el('div', { id: 'stock-history' }, [App.ui.el('p', { class: 'text-muted' }, ['Carregando histórico…'])]);

    var wrapper = App.ui.el('div', {}, [
      product.image ? App.ui.el('img', { src: product.image, style: 'width:100%;max-width:220px;border-radius:12px;object-fit:cover;margin-bottom:16px;' }) : null,
      summary,
      App.ui.el('div', { class: 'flex items-center gap-8', style: 'justify-content:space-between; margin-bottom:10px; flex-wrap:wrap;' }, [
        App.ui.el('h4', { style: 'margin:0;' }, ['Histórico de movimentações']),
        App.ui.el('div', { class: 'flex gap-8' }, [
          App.ui.el('button', { class: 'btn btn-secondary btn-sm', onclick: function () { openPrintLabels(product); } }, ['🏷️ Imprimir etiqueta']),
          App.ui.el('button', {
            class: 'btn btn-secondary btn-sm',
            onclick: function () {
              openAdjustStock(product, function () {
                // Após ajustar, fecha o detalhe e reabre com os dados atualizados
                // (evita mostrar saldo/histórico desatualizados no mesmo modal).
                detailModalRef.close();
                loadAll().then(function () {
                  var updated = cache.products.filter(function (p) { return p.id === product.id; })[0];
                  openDetail(updated || product);
                });
              });
            }
          }, ['Ajustar estoque'])
        ])
      ]),
      historyContainer
    ]);

    var detailModalRef = App.ui.openModal({
      title: product.name,
      size: 'wide',
      bodyNode: wrapper,
      footerButtons: [{ label: 'Fechar', className: 'btn-secondary' }]
    });

    stockEngine.historico(product.id).then(function (movements) {
      historyContainer.innerHTML = '';
      if (movements.length === 0) {
        historyContainer.appendChild(App.ui.el('p', { class: 'text-muted' }, ['Nenhuma movimentação registrada ainda.']));
        return;
      }
      var table = App.ui.el('table', { class: 'data-table' });
      table.appendChild(App.ui.el('thead', {}, [App.ui.el('tr', {}, [
        App.ui.el('th', {}, ['Data']), App.ui.el('th', {}, ['Tipo']), App.ui.el('th', {}, ['Qtd']), App.ui.el('th', {}, ['Motivo/Documento'])
      ])]));
      var tbody = App.ui.el('tbody');
      movements.forEach(function (m) {
        var isEntrada = stockEngine.TIPOS_ENTRADA.indexOf(m.type) !== -1;
        tbody.appendChild(App.ui.el('tr', {}, [
          App.ui.el('td', {}, [fmt.dateTimeBR(m.createdAt)]),
          App.ui.el('td', {}, [App.ui.el('span', { class: 'badge ' + (isEntrada ? 'badge-success' : 'badge-danger') }, [movementLabel(m.type)])]),
          App.ui.el('td', { class: 'mono' }, [(isEntrada ? '+' : '−') + m.quantity]),
          App.ui.el('td', { class: 'text-muted' }, [m.reason || m.relatedDocument || '—'])
        ]));
      });
      table.appendChild(tbody);
      historyContainer.appendChild(App.ui.el('div', { class: 'table-wrap' }, [table]));
    });
  }

  function movementLabel(type) {
    var labels = {
      ENTRADA_COMPRA: 'Entrada (compra)', ENTRADA_DEVOLUCAO: 'Entrada (devolução)',
      ENTRADA_AJUSTE: 'Ajuste (entrada)', ENTRADA_INICIAL: 'Estoque inicial',
      SAIDA_VENDA: 'Saída (venda)', SAIDA_PERDA: 'Saída (perda)', SAIDA_AVARIA: 'Saída (avaria)',
      SAIDA_AJUSTE: 'Ajuste (saída)', ESTORNO_VENDA: 'Estorno de venda', ESTORNO_COMPRA: 'Estorno de compra'
    };
    return labels[type] || type;
  }

  function infoBlock(label, value) {
    return App.ui.el('div', {}, [
      App.ui.el('div', { class: 'text-faint', style: 'font-size:11.5px; text-transform:uppercase; font-weight:700; margin-bottom:3px;' }, [label]),
      App.ui.el('div', { style: 'font-weight:600;' }, [value])
    ]);
  }

  function openPrintLabels(product) {
    var code = product.barcode || product.sku;
    var qtyInput = App.ui.el('input', { id: 'label-qty', type: 'number', min: '1', value: '10' });
    var typeSelect = App.ui.el('select', { id: 'label-codetype' }, [
      App.ui.el('option', { value: 'qr', selected: 'selected' }, ['QR Code (recomendado)']),
      App.ui.el('option', { value: 'barcode' }, ['Código de barras']),
      App.ui.el('option', { value: 'both' }, ['Os dois'])
    ]);
    var preview = App.ui.el('div', { style: 'margin-top:10px; padding:10px; border:1px dashed var(--color-border); border-radius:8px; text-align:center;' });
    function refreshPreview() {
      preview.innerHTML = '';
      try {
        if (typeSelect.value === 'barcode') {
          preview.innerHTML = App.core.labels.svgBarcode(code);
        } else {
          var qr = App.core.labels.qrDataUrl(code);
          if (qr) preview.appendChild(App.ui.el('img', { src: qr, style: 'width:120px;height:120px;' }));
          if (typeSelect.value === 'both') preview.innerHTML += App.core.labels.svgBarcode(code);
        }
      } catch (e) {}
    }
    typeSelect.addEventListener('change', refreshPreview);
    refreshPreview();
    var body = App.ui.el('div', {}, [
      App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Quantidade de etiquetas']), qtyInput]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Código utilizado']), App.ui.el('input', { value: code, disabled: 'disabled' })]),
        App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Tipo de código na etiqueta']), typeSelect])
      ]),
      App.ui.el('div', { class: 'hint' }, ['Prévia — a impressão abrirá em uma nova janela. O scanner do sistema lê os dois formatos normalmente.']),
      preview
    ]);
    App.ui.openModal({
      title: 'Imprimir etiqueta — ' + product.name,
      bodyNode: body,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: 'Gerar e imprimir', className: 'btn-primary', onClick: function (close) {
            var qty = Math.max(1, Number(qtyInput.value) || 1);
            App.core.labels.printLabels([{ product: product, qty: qty }], { codeType: typeSelect.value });
            close();
          }
        }
      ]
    });
  }

  function openAdjustStock(product, onSuccess) {
    var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });
    var direction = App.ui.el('select', { id: 'adj-direction' }, [
      App.ui.el('option', { value: 'ENTRADA_AJUSTE' }, ['Entrada (ajuste positivo)']),
      App.ui.el('option', { value: 'SAIDA_AJUSTE' }, ['Saída (ajuste negativo)']),
      App.ui.el('option', { value: 'SAIDA_PERDA' }, ['Saída (perda)']),
      App.ui.el('option', { value: 'SAIDA_AVARIA' }, ['Saída (avaria)'])
    ]);
    var form = App.ui.el('div', { class: 'form-grid' }, [
      App.ui.el('div', { class: 'form-field span-2' }, [App.ui.el('label', {}, ['Tipo de movimentação']), direction]),
      App.ui.el('div', { class: 'form-field' }, [
        App.ui.el('label', {}, ['Quantidade *']),
        App.ui.el('input', { id: 'adj-qty', type: 'number', min: '1', step: '1' })
      ]),
      App.ui.el('div', { class: 'form-field span-2' }, [
        App.ui.el('label', {}, ['Motivo *']),
        App.ui.el('input', { id: 'adj-reason', placeholder: 'Ex.: Contagem física, quebra, correção de cadastro' })
      ])
    ]);
    var wrapper = App.ui.el('div', {}, [errorBox, form]);

    App.ui.openModal({
      title: 'Ajustar estoque — ' + product.name,
      bodyNode: wrapper,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        {
          label: 'Confirmar ajuste', className: 'btn-primary',
          onClick: function (close) {
            var qty = Number(document.getElementById('adj-qty').value);
            var reason = document.getElementById('adj-reason').value.trim();
            var type = direction.value;
            try {
              App.core.validation.positiveNumber(qty, 'Quantidade');
              App.core.validation.required(reason, 'Motivo do ajuste');
            } catch (err) {
              errorBox.textContent = err.message; errorBox.classList.remove('hidden'); return;
            }
            stockEngine.registrarMovimentacao({ productId: product.id, type: type, quantity: qty, reason: reason }).then(function () {
              App.ui.toast('Estoque ajustado.', 'success');
              close();
              if (onSuccess) onSuccess();
              else loadAll();
            }).catch(function (err) {
              errorBox.textContent = err.message; errorBox.classList.remove('hidden');
            });
          }
        }
      ]
    });
  }

  // ---------- Formulário de cadastro/edição ----------

  function selectField(id, label, options, selectedValue, required) {
    var select = App.ui.el('select', { id: id });
    if (!required) select.appendChild(App.ui.el('option', { value: '' }, ['—']));
    options.forEach(function (opt) {
      var attrs = { value: opt.id };
      if (opt.id === selectedValue) attrs.selected = 'selected';
      select.appendChild(App.ui.el('option', attrs, [opt.name]));
    });
    return App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, [label]), select]);
  }

  // Lê um arquivo de imagem, redimensiona (maior lado <= maxDim) e comprime
  // em JPEG antes de virar data URL — evita gravar fotos de câmera de vários
  // MB direto no registro do produto (o campo `image` vira parte do JSON
  // salvo no banco/IndexedDB, então tamanho importa).
  function readImageAsDataUrl(file, maxDim, quality) {
    return new Promise(function (resolve, reject) {
      if (!file) { resolve(null); return; }
      if (!/^image\//.test(file.type)) { reject(new Error('Selecione um arquivo de imagem (JPG, PNG etc.).')); return; }
      if (file.size > 15 * 1024 * 1024) { reject(new Error('Imagem muito grande (máximo 15MB). Tente uma foto menor.')); return; }
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error('Não foi possível ler o arquivo.')); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error('Arquivo não é uma imagem válida.')); };
        img.onload = function () {
          var w = img.naturalWidth, h = img.naturalHeight;
          var scale = Math.min(1, maxDim / Math.max(w, h));
          var canvas = document.createElement('canvas');
          canvas.width = Math.max(1, Math.round(w * scale));
          canvas.height = Math.max(1, Math.round(h * scale));
          var ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', quality || 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Campo de foto: preview + input de arquivo + remover. Retorna { node,
  // getValue } — getValue() devolve a data URL atual (ou null) na hora de
  // salvar, já que não é um <input> simples de onde dar .value.
  function photoField(existingImage) {
    var current = existingImage || null;
    var preview = App.ui.el('img', {
      class: 'product-photo-preview',
      style: 'width:120px;height:120px;border-radius:12px;object-fit:cover;border:1px solid var(--color-border);' + (current ? '' : 'display:none;')
    });
    if (current) preview.src = current;

    var errorEl = App.ui.el('div', { class: 'hint', style: 'color:var(--color-danger);display:none;' });
    var fileInput = App.ui.el('input', {
      type: 'file', accept: 'image/*',
      onchange: function (e) {
        var file = e.target.files[0];
        errorEl.style.display = 'none';
        readImageAsDataUrl(file, 900, 0.82).then(function (dataUrl) {
          if (!dataUrl) return;
          current = dataUrl;
          preview.src = dataUrl;
          preview.style.display = '';
          removeBtn.style.display = '';
        }).catch(function (err) {
          errorEl.textContent = err.message;
          errorEl.style.display = '';
          fileInput.value = '';
        });
      }
    });
    var removeBtn = App.ui.el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm', style: current ? '' : 'display:none;',
      onclick: function () { current = null; preview.style.display = 'none'; fileInput.value = ''; removeBtn.style.display = 'none'; }
    }, ['Remover foto']);

    var node = App.ui.el('div', { class: 'form-field span-2' }, [
      App.ui.el('label', {}, ['Foto do produto']),
      App.ui.el('div', { class: 'flex items-center gap-8', style: 'flex-wrap:wrap;align-items:flex-start;' }, [preview, App.ui.el('div', {}, [fileInput, errorEl])]),
      removeBtn
    ]);
    return { node: node, getValue: function () { return current; } };
  }

  function inputField(id, label, value, opts) {
    opts = opts || {};
    var attrs = Object.assign({ id: id, value: value != null ? value : '' }, opts.attrs || {});
    return App.ui.el('div', { class: 'form-field' + (opts.span2 ? ' span-2' : '') }, [
      App.ui.el('label', {}, [label]),
      App.ui.el('input', attrs)
    ]);
  }

  // Campo "Por que você vai Amáhr": textarea + botões de geração + tags de
  // personalidade (opcionais) + inspiração cristã (opcional). Ver
  // js/core/whyAmahrEngine.js para a lógica de geração/aprendizado.
  // categories = lista completa (não só ativas), pra resolver o nome da
  // categoria mesmo quando o produto está com uma categoria já inativa.
  function whyAmahrField(existing, categories) {
    var engine = App.core.whyAmahrEngine;
    var initialText = (existing && existing.whyAmahr) || '';
    var baseline = (existing && (existing.whyAmahrSource === 'auto' || existing.whyAmahrSource === 'auto-edited') &&
      existing.whyAmahrSentences && existing.whyAmahrSentences.length)
      ? { sentences: existing.whyAmahrSentences, fragmentIds: existing.whyAmahrFragments || [] }
      : null;
    var existingStyleTags = (existing && existing.styleTags) || [];
    var generatedAt = (existing && existing.whyAmahrGeneratedAt) || null;

    function currentBaselineText() { return baseline ? baseline.sentences.join(' ') : null; }

    var statusBadge = App.ui.el('span', { class: 'badge badge-neutral' }, ['—']);
    var textarea = App.ui.el('textarea', {
      id: 'p-whyamahr', rows: '4',
      placeholder: 'Clique em "Gerar automaticamente" ou escreva livremente…',
      oninput: refreshStatus
    });
    textarea.value = initialText;

    function refreshStatus() {
      var val = textarea.value.trim();
      var baseText = currentBaselineText();
      var cls = 'badge-neutral', label = 'Ainda não gerado';
      if (val && baseline && val === baseText) { cls = 'badge-success'; label = 'Gerado automaticamente'; }
      else if (val) { cls = 'badge-warning'; label = 'Editado manualmente'; }
      statusBadge.className = 'badge ' + cls;
      statusBadge.textContent = label;
    }
    refreshStatus();

    function tagId(label) { return 'p-styletag-' + label.replace(/[^a-zA-Z0-9]/g, ''); }
    var tagsWrap = App.ui.el('div', { style: 'display:flex;flex-wrap:wrap;gap:2px;margin-top:4px;' },
      engine.PROFILE_LABELS.map(function (label) {
        var input = App.ui.el('input', Object.assign(
          { type: 'checkbox', id: tagId(label) },
          existingStyleTags.indexOf(label) !== -1 ? { checked: 'checked' } : {}
        ));
        return App.ui.el('label', { class: 'checkbox-row', style: 'margin:0 12px 6px 0;' }, [input, App.ui.el('span', {}, [label])]);
      }));
    function readStyleTags() {
      return engine.PROFILE_LABELS.filter(function (label) {
        var el = document.getElementById(tagId(label));
        return el && el.checked;
      });
    }

    var faithInput = App.ui.el('input', {
      id: 'p-faith', value: (existing && existing.faithInspiration) || '',
      placeholder: 'Ex.: inspirada na ideia de graça, coleção "Fé em detalhes"…'
    });

    function readDomVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }

    function collectDraft() {
      var catSelect = document.getElementById('p-category');
      var cat = catSelect ? categories.filter(function (c) { return c.id === catSelect.value; })[0] : null;
      return {
        name: readDomVal('p-name'),
        categoryName: cat ? cat.name : '',
        subcategory: readDomVal('p-subcategory'),
        collection: readDomVal('p-collection'),
        model: readDomVal('p-model'),
        color: readDomVal('p-color'),
        material: readDomVal('p-material'),
        description: readDomVal('p-notes'), // notas internas podem citar detalhes reais úteis pra classificação
        styleTags: readStyleTags(),
        faithInspiration: readDomVal('p-faith')
      };
    }

    var genBtn = App.ui.el('button', { type: 'button', class: 'btn btn-secondary btn-sm' }, ['✨ Gerar automaticamente']);
    var regenBtn = App.ui.el('button', { type: 'button', class: 'btn btn-ghost btn-sm' }, ['🔄 Gerar outra versão']);
    var editBtn = App.ui.el('button', {
      type: 'button', class: 'btn btn-ghost btn-sm',
      onclick: function () { textarea.focus(); textarea.select(); App.ui.toast('Edite livremente — o que você escrever é salvo do seu jeito.', 'info'); }
    }, ['✏️ Editar manualmente']);

    function doGenerate(isRegen) {
      var draft = collectDraft();
      if (!draft.name) { App.ui.toast('Preencha ao menos o nome do produto antes de gerar.', 'warning'); return; }
      genBtn.disabled = true; regenBtn.disabled = true;
      var exclude = (isRegen && baseline) ? baseline.fragmentIds : [];
      engine.gerar(draft, { excludeFragmentIds: exclude }).then(function (res) {
        baseline = { sentences: res.sentences, fragmentIds: res.fragmentIds };
        generatedAt = fmt.nowIso();
        textarea.value = res.text;
        refreshStatus();
      }).catch(function () {
        App.ui.toast('Não foi possível gerar o texto agora.', 'error');
      }).then(function () {
        genBtn.disabled = false; regenBtn.disabled = false;
      });
    }
    genBtn.addEventListener('click', function () { doGenerate(false); });
    regenBtn.addEventListener('click', function () { doGenerate(true); });

    var node = App.ui.el('div', { class: 'form-field span-2' }, [
      App.ui.el('div', { class: 'flex items-center gap-8', style: 'justify-content:space-between;flex-wrap:wrap;' }, [
        App.ui.el('label', { style: 'margin:0;' }, ['Por que você vai Amáhr']),
        statusBadge
      ]),
      textarea,
      App.ui.el('div', { class: 'flex gap-8', style: 'margin-top:6px;flex-wrap:wrap;' }, [genBtn, regenBtn, editBtn]),
      App.ui.el('div', { class: 'hint', style: 'margin-top:10px;' }, ['Personalidade da peça (opcional — ajuda a escolher o tom certo; deixe em branco para classificação automática)']),
      tagsWrap,
      App.ui.el('div', { class: 'hint', style: 'margin-top:10px;' }, ['Inspiração cristã / coleção especial (opcional — só entra no texto quando este campo está preenchido)']),
      faithInput
    ]);

    return {
      node: node,
      getValue: function () {
        var text = textarea.value.trim();
        var baseText = currentBaselineText();
        var source, sentences, fragmentIds;
        if (!text) { source = null; sentences = null; fragmentIds = null; }
        else if (baseline && text === baseText) { source = 'auto'; sentences = baseline.sentences; fragmentIds = baseline.fragmentIds; }
        else if (baseline) { source = 'auto-edited'; sentences = baseline.sentences; fragmentIds = baseline.fragmentIds; }
        else { source = 'manual'; sentences = null; fragmentIds = null; }
        return {
          text: text, source: source, sentences: sentences, fragmentIds: fragmentIds,
          generatedAt: (source === 'auto' || source === 'auto-edited') ? generatedAt : null,
          styleTags: readStyleTags(),
          faithInspiration: readDomVal('p-faith'),
          learnBaseline: baseline
        };
      }
    };
  }

  // Ação em lote: gera um rascunho de "Por que você vai Amáhr" para todo
  // produto ativo que ainda não tem o campo preenchido. Revisão obrigatória
  // antes de salvar (Aprovar / editar o texto / Gerar novamente).
  function openBatchGenerate() {
    Promise.all([App.db.getAll('products'), App.db.getAll('categories')]).then(function (results) {
      var products = results[0], categories = results[1];
      var pending = products.filter(function (p) { return p.active !== false && (!p.whyAmahr || !String(p.whyAmahr).trim()); });

      if (!pending.length) {
        App.ui.toast('Todos os produtos ativos já têm a descrição Amáhr.', 'success');
        return;
      }

      var engine = App.core.whyAmahrEngine;
      function catName(id) { var c = categories.filter(function (c) { return c.id === id; })[0]; return c ? c.name : ''; }
      function draftFor(p, excludeIds) {
        return engine.gerar({
          name: p.name, categoryName: catName(p.categoryId), subcategory: p.subcategory,
          collection: p.collection, model: p.model, color: p.color, material: p.material,
          description: p.notes || '', styleTags: p.styleTags || [], faithInspiration: p.faithInspiration
        }, { excludeFragmentIds: excludeIds || [] });
      }

      var items = {}; // productId -> { product, draft, textarea, approved, approveBtn, row }
      var pendingCount = pending.length;
      var counterEl = App.ui.el('span', {}, [String(pendingCount) + ' pendente(s)']);
      var listWrap = App.ui.el('div', { id: 'batch-list' });
      var body = App.ui.el('div', {}, [
        App.ui.el('div', { class: 'hint', style: 'margin-bottom:10px;' }, [
          pending.length + ' produto(s) ativo(s) ainda sem "Por que você vai Amáhr". Revise cada texto (edite se quiser) e aprove — ',
          counterEl
        ]),
        listWrap
      ]);

      function updateCounter() {
        counterEl.textContent = String(pendingCount) + ' pendente(s)';
        if (pendingCount === 0) {
          App.ui.toast('Todos os textos pendentes foram aprovados.', 'success');
          loadAll();
        }
      }

      function saveApproved(p, text, draft, row) {
        var record = Object.assign({}, p, {
          whyAmahr: text,
          whyAmahrSource: (text === draft.text) ? 'auto' : 'auto-edited',
          whyAmahrSentences: draft.sentences,
          whyAmahrFragments: draft.fragmentIds,
          whyAmahrGeneratedAt: fmt.nowIso(),
          updatedAt: fmt.nowIso()
        });
        return App.db.runAtomic(['products', 'audit_logs'], 'readwrite', function (t) {
          t.objectStore('products').put(record);
          App.core.audit.log(t, { operation: 'UPDATE', entity: 'products', entityId: record.id, oldValue: p, newValue: record });
        }).then(function () {
          if (text !== draft.text) engine.registrarEdicao(draft, text);
          row.style.opacity = '0.45';
          row.querySelectorAll('button, textarea').forEach(function (el) { el.disabled = true; });
          pendingCount -= 1;
          updateCounter();
        }).catch(function (err) {
          App.ui.toast('Erro ao salvar "' + p.name + '": ' + err.message, 'error');
        });
      }

      pending.forEach(function (p) {
        var row = App.ui.el('div', { class: 'card', style: 'margin-bottom:12px;' });
        var headerRow = App.ui.el('div', { class: 'flex items-center gap-8', style: 'padding:12px 16px 0;justify-content:space-between;flex-wrap:wrap;' }, [
          App.ui.el('strong', {}, [p.name]),
          App.ui.el('span', { class: 'text-faint' }, [p.sku || ''])
        ]);
        var contentWrap = App.ui.el('div', { class: 'card-body', style: 'padding:10px 16px 16px;' }, [
          App.ui.el('p', { class: 'text-muted' }, ['Gerando…'])
        ]);
        row.appendChild(headerRow);
        row.appendChild(contentWrap);
        listWrap.appendChild(row);
        items[p.id] = { row: row };

        draftFor(p).then(function (res) {
          items[p.id].draft = res;
          var textarea = App.ui.el('textarea', { rows: '3', style: 'width:100%;' });
          textarea.value = res.text;

          var approveBtn = App.ui.el('button', {
            type: 'button', class: 'btn btn-primary btn-sm',
            onclick: function () { saveApproved(p, textarea.value.trim(), items[p.id].draft, row); }
          }, ['Aprovar']);
          var regenBtn = App.ui.el('button', {
            type: 'button', class: 'btn btn-ghost btn-sm',
            onclick: function () {
              regenBtn.disabled = true;
              draftFor(p, items[p.id].draft.fragmentIds).then(function (res2) {
                items[p.id].draft = res2;
                textarea.value = res2.text;
              }).then(function () { regenBtn.disabled = false; });
            }
          }, ['Gerar novamente']);

          contentWrap.innerHTML = '';
          contentWrap.appendChild(textarea);
          contentWrap.appendChild(App.ui.el('div', { class: 'flex gap-8', style: 'margin-top:8px;' }, [approveBtn, regenBtn]));
        });
      });

      App.ui.openModal({
        title: 'Gerar descrições Amáhr',
        size: 'wide',
        bodyNode: body,
        closeOnBackdrop: false,
        footerButtons: [
          {
            label: 'Aprovar todos', className: 'btn-primary',
            onClick: function (close) {
              var promises = pending
                .filter(function (p) { return items[p.id] && items[p.id].draft && items[p.id].row.style.opacity !== '0.45'; })
                .map(function (p) {
                  var textareaEl = items[p.id].row.querySelector('textarea');
                  var text = textareaEl ? textareaEl.value.trim() : items[p.id].draft.text;
                  return saveApproved(p, text, items[p.id].draft, items[p.id].row);
                });
              Promise.all(promises).then(function () { close(); loadAll(); });
            }
          },
          { label: 'Fechar', className: 'btn-secondary', onClick: function (close) { close(); loadAll(); } }
        ]
      });
    });
  }

  function openForm(existing, onCreated, prefill) {
    var isEdit = !!existing;
    prefill = prefill || {};

    var wrapper = App.ui.el('div');
    var errorBox = App.ui.el('div', { class: 'modal-alert hidden' });
    wrapper.appendChild(errorBox);
    var photo = null; // preenchido depois que o form monta (ver photoField)
    var whyAmahr = null; // preenchido depois que o form monta (ver whyAmahrField)

    Promise.all([App.db.getAll('categories'), App.db.getAll('suppliers')]).then(function (results) {
      var categories = results[0].filter(function (c) { return c.active; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      var suppliers = results[1].filter(function (s) { return s.active; }).sort(function (a, b) { return a.name.localeCompare(b.name, 'pt-BR'); });
      photo = photoField(existing && existing.image);
      whyAmahr = whyAmahrField(existing, results[0]);

      var form = App.ui.el('div', { class: 'form-grid' }, [
        App.ui.el('div', { class: 'form-section-title' }, ['Identificação']),
        photo.node,
        inputField('p-name', 'Nome comercial *', existing && existing.name, { span2: true, attrs: { placeholder: 'Ex.: Brinco Argola Dourada' } }),
        inputField('p-sku', 'Código / SKU *', (existing && existing.sku) || prefill.sku, { attrs: { placeholder: 'Ex.: BR001' } }),
        inputField('p-barcode', 'Código de barras', (existing && existing.barcode) || prefill.barcode, { attrs: { placeholder: 'Opcional — leitura futura por scanner' } }),
        selectField('p-category', 'Categoria', categories, existing && existing.categoryId),
        selectField('p-supplier', 'Fornecedor principal', suppliers, existing && existing.supplierId),
        inputField('p-subcategory', 'Subcategoria', existing && existing.subcategory),
        inputField('p-collection', 'Coleção', existing && existing.collection),
        inputField('p-model', 'Modelo', existing && existing.model),
        inputField('p-color', 'Cor', existing && existing.color),
        inputField('p-material', 'Material', existing && existing.material),

        App.ui.el('div', { class: 'form-section-title' }, ['Custos e preços']),
        inputField('p-cost', 'Custo de aquisição (R$)', existing ? existing.cost : '', { attrs: { type: 'number', step: '0.01', min: '0', placeholder: 'Pode preencher depois' } }),
        inputField('p-addcost', 'Custos adicionais (R$)', existing ? existing.additionalCosts : '0', { attrs: { type: 'number', step: '0.01', min: '0' } }),
        inputField('p-retail', 'Preço de varejo (R$)', existing ? existing.retailPrice : '', { attrs: { type: 'number', step: '0.01', min: '0', placeholder: 'Pode preencher depois' } }),
        inputField('p-wholesale', 'Preço de atacado (R$)', existing ? existing.wholesalePrice : '', { attrs: { type: 'number', step: '0.01', min: '0' } }),
        inputField('p-promo', 'Preço promocional (R$)', existing ? existing.promoPrice : '', { attrs: { type: 'number', step: '0.01', min: '0' } }),

        App.ui.el('div', { class: 'form-section-title' }, ['Estoque']),
        isEdit
          ? App.ui.el('div', { class: 'form-field' }, [App.ui.el('label', {}, ['Estoque atual']), App.ui.el('input', { value: String((cache.stockMap[existing.id] || 0)), disabled: 'disabled' }), App.ui.el('div', { class: 'hint' }, ['Use "Ajustar estoque" na tela de detalhe para alterar.'])])
          : inputField('p-initial-stock', 'Estoque inicial', '0', { attrs: { type: 'number', step: '1', min: '0' } }),
        inputField('p-min-stock', 'Estoque mínimo', existing ? existing.minStock : '', { attrs: { type: 'number', step: '1', min: '0' } }),
        inputField('p-ideal-stock', 'Estoque ideal', existing ? existing.idealStock : '', { attrs: { type: 'number', step: '1', min: '0' } }),

        App.ui.el('div', { class: 'form-section-title' }, ['Localização física']),
        inputField('p-loc-shelf', 'Estante', existing && existing.location && existing.location.shelf),
        inputField('p-loc-drawer', 'Gaveta', existing && existing.location && existing.location.drawer),
        inputField('p-loc-box', 'Caixa', existing && existing.location && existing.location.box),

        App.ui.el('div', { class: 'form-section-title' }, ['Outros']),
        App.ui.el('div', { class: 'form-field span-2' }, [
          App.ui.el('label', {}, ['Observações']),
          App.ui.el('textarea', { id: 'p-notes' }, [(existing && existing.notes) || ''])
        ]),
        App.ui.el('div', { class: 'form-field' }, [
          App.ui.el('div', { class: 'checkbox-row' }, [
            App.ui.el('input', Object.assign({ type: 'checkbox', id: 'p-active' }, (!existing || existing.active) ? { checked: 'checked' } : {})),
            App.ui.el('label', { for: 'p-active' }, ['Produto ativo'])
          ])
        ]),

        App.ui.el('div', { class: 'form-section-title' }, ['Comunicação da vitrine']),
        whyAmahr.node
      ]);
      wrapper.appendChild(form);

      // Sugestão de código (Fase B — padronização): só no cadastro de produto
      // NOVO, e só preenche automaticamente enquanto o campo está vazio. Nunca
      // mexe no código de um produto já existente (imutabilidade preservada).
      // O banco continua sendo quem garante unicidade de verdade (skuUnico +
      // índice único em store_products.sku) — isto aqui é só uma sugestão.
      if (!isEdit) {
        var skuFieldInput = form.querySelector('#p-sku');
        var categorySelectEl = form.querySelector('#p-category');
        var skuFieldWrap = skuFieldInput ? skuFieldInput.closest('.form-field') : null;
        if (skuFieldInput && categorySelectEl && skuFieldWrap) {
          var suggestBtn = App.ui.el('button', {
            type: 'button', class: 'btn btn-ghost btn-sm', style: 'margin-top:6px;',
            onclick: function () { applyCodeSuggestion(true); }
          }, ['✨ Sugerir código']);
          skuFieldWrap.appendChild(suggestBtn);

          function applyCodeSuggestion(force) {
            if (!force && skuFieldInput.value.trim()) return;
            var catId = categorySelectEl.value;
            var cat = categories.filter(function (c) { return c.id === catId; })[0];
            if (!cat) {
              if (force) App.ui.toast('Selecione uma categoria antes de sugerir o código.', 'warning');
              return;
            }
            var prefix = App.core.productCodes.getPrefixFor(cat.name);
            // Busca a lista de produtos na hora, em vez de usar cache.products
            // (que só é atualizado quando a tela de lista recarrega) — sem
            // isso, cadastrar duas peças em sequência rápida (antes do
            // primeiro salvar terminar de recarregar a lista) podia sugerir
            // o mesmo código pras duas (2026-08-26).
            App.db.getAll('products').then(function (freshProducts) {
              skuFieldInput.value = App.core.productCodes.suggestNext(prefix, freshProducts);
            });
          }

          categorySelectEl.addEventListener('change', function () { applyCodeSuggestion(false); });
        }
      }
    });

    App.ui.openModal({
      title: isEdit ? 'Editar produto' : 'Novo produto',
      size: 'wide',
      bodyNode: wrapper,
      footerButtons: [
        { label: 'Cancelar', className: 'btn-secondary' },
        { label: isEdit ? 'Salvar alterações' : 'Criar produto', className: 'btn-primary', onClick: function (close) { save(close); } }
      ]
    });

    function readVal(id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; }
    function readNum(id) { var v = readVal(id); return v === '' ? null : Number(v); }

    function save(close) {
      errorBox.classList.add('hidden');
      var name = readVal('p-name');
      var sku = readVal('p-sku').toUpperCase();
      var cost = readNum('p-cost');
      var retail = readNum('p-retail');

      // Custo e preço de varejo deixaram de ser obrigatórios no cadastro rápido
      // (a pedido da usuária: fotografar + nomear + categorizar primeiro, e
      // preencher preço depois com calma) — ficam 0 até serem editados na tela
      // do produto. Nenhuma outra validação/campo foi alterado.
      if (cost == null) cost = 0;
      if (retail == null) retail = 0;
      try {
        App.core.validation.required(name, 'Nome do produto');
        App.core.validation.required(sku, 'Código/SKU');
        App.core.validation.positiveNumber(cost, 'Custo de aquisição', true);
        App.core.validation.positiveNumber(retail, 'Preço de varejo', true);
      } catch (err) {
        errorBox.textContent = err.message; errorBox.classList.remove('hidden'); return;
      }

      App.core.validation.skuUnico(sku, existing ? existing.id : null).then(function () {
        var record = existing ? Object.assign({}, existing) : {
          id: App.core.uuid(), createdAt: fmt.nowIso(), totalSold: 0, lastPurchaseAt: null, lastSaleAt: null
        };
        var oldValue = existing ? Object.assign({}, existing) : null;

        record.name = name;
        record.sku = sku;
        record.barcode = readVal('p-barcode') || null;
        record.image = photo ? photo.getValue() : (record.image || null);
        record.description = record.description || '';
        record.categoryId = readVal('p-category') || null;
        record.supplierId = readVal('p-supplier') || null;
        record.subcategory = readVal('p-subcategory');
        record.collection = readVal('p-collection');
        record.model = readVal('p-model');
        record.color = readVal('p-color');
        record.material = readVal('p-material');
        record.cost = cost;
        record.additionalCosts = readNum('p-addcost') || 0;
        record.wholesalePrice = readNum('p-wholesale') || 0;
        record.retailPrice = retail;
        record.promoPrice = readNum('p-promo');
        record.minStock = readNum('p-min-stock');
        record.idealStock = readNum('p-ideal-stock');
        record.location = { shelf: readVal('p-loc-shelf'), drawer: readVal('p-loc-drawer'), box: readVal('p-loc-box') };
        record.notes = readVal('p-notes');
        record.active = document.getElementById('p-active').checked;
        record.updatedAt = fmt.nowIso();

        var whyResult = whyAmahr.getValue();
        record.whyAmahr = whyResult.text;
        record.whyAmahrSource = whyResult.source;
        record.whyAmahrSentences = whyResult.sentences;
        record.whyAmahrFragments = whyResult.fragmentIds;
        record.whyAmahrGeneratedAt = whyResult.generatedAt;
        record.styleTags = whyResult.styleTags;
        record.faithInspiration = whyResult.faithInspiration || null;

        var initialStock = !isEdit ? (readNum('p-initial-stock') || 0) : 0;

        return App.db.runAtomic(['products', 'audit_logs'], 'readwrite', function (t) {
          t.objectStore('products').put(record);
          App.core.audit.log(t, {
            operation: isEdit ? 'UPDATE' : 'CREATE', entity: 'products', entityId: record.id,
            oldValue: oldValue, newValue: record
          });
        }).then(function () {
          if (!isEdit && initialStock > 0) {
            return stockEngine.registrarMovimentacao({
              productId: record.id, type: 'ENTRADA_INICIAL', quantity: initialStock, reason: 'Estoque inicial no cadastro do produto'
            });
          }
        }).then(function () {
          // Aprendizado editorial: se o texto veio de uma geração automática e foi
          // alterado (ou apenas aprovado), ajusta os pesos pra próxima geração —
          // não bloqueia o salvamento se falhar (best-effort).
          if (whyResult.learnBaseline && whyResult.text) {
            App.core.whyAmahrEngine.registrarEdicao(whyResult.learnBaseline, whyResult.text);
          }
        }).then(function () {
          App.ui.toast(isEdit ? 'Produto atualizado.' : 'Produto criado.', 'success');
          close();
          if (onCreated) onCreated(record);
          if (document.getElementById('products-body')) loadAll();
        });
      }).catch(function (err) {
        errorBox.textContent = err.message; errorBox.classList.remove('hidden');
      });
    }
  }

  global.App = global.App || {};
  global.App.modules = global.App.modules || {};
  global.App.modules.products = { render: render, reloadCache: loadAll, openForm: openForm, openDetail: openDetail };
})(window);
