/* AMÁH Brand — geração de dados de demonstração
 * Cria categorias, fornecedores e ~20 produtos fictícios, cada um com uma
 * movimentação ENTRADA_INICIAL registrada via StockEngine (nunca grava
 * estoque direto no produto — mesma regra usada em produção).
 */
(function (global) {
  'use strict';

  var uuid = function () { return App.core.uuid(); };

  function ensureDefaultSettings() {
    return App.modules.settings.ensureDefaults();
  }

  function seed() {
    var categoriesDef = [
      { name: 'Brincos', description: 'Brincos em geral: argolas, ear cuffs, pendentes' },
      { name: 'Colares', description: 'Colares e correntes' },
      { name: 'Anéis', description: 'Anéis e aliancas de bijuteria' },
      { name: 'Pulseiras', description: 'Pulseiras e braceletes' },
      { name: 'Conjuntos', description: 'Kits e conjuntos combinando peças' }
    ];

    var suppliersDef = [
      { name: 'Bijoux Import LTDA', razaoSocial: 'Bijoux Import Comércio LTDA', cnpjCpf: '12.345.678/0001-90', phone: '(11) 4002-8922', whatsapp: '(11) 98888-1234', email: 'vendas@bijouximport.com.br', conditions: '28 dias, pedido mínimo R$ 300', avgLeadTimeDays: 12 },
      { name: 'Folheados SP Atacado', razaoSocial: 'Folheados SP Comércio de Semijoias', cnpjCpf: '23.456.789/0001-11', phone: '(11) 3212-5566', whatsapp: '(11) 97777-2345', email: 'contato@folheadossp.com.br', conditions: '30/45 dias', avgLeadTimeDays: 7 },
      { name: 'Cristais & Cia', razaoSocial: 'Cristais e Companhia Semijoias ME', cnpjCpf: '34.567.890/0001-22', phone: '(19) 3322-4455', whatsapp: '(19) 96666-3456', email: 'pedidos@cristaisecia.com.br', conditions: 'à vista com 5% desconto', avgLeadTimeDays: 5 }
    ];

    var categories = categoriesDef.map(function (c) { return Object.assign({ id: uuid(), active: true, createdAt: App.core.format.nowIso() }, c); });
    var suppliers = suppliersDef.map(function (s) { return Object.assign({ id: uuid(), active: true, address: '', contact: '', notes: '', createdAt: App.core.format.nowIso() }, s); });

    function cat(name) { return categories.filter(function (c) { return c.name === name; })[0].id; }
    function sup(name) { return suppliers.filter(function (s) { return s.name === name; })[0].id; }

    var productsDef = [
      { sku: 'BR001', name: 'Brinco Argola Dourada Média', categoryId: cat('Brincos'), supplierId: sup('Folheados SP Atacado'), color: 'Dourado', material: 'Folheado a ouro', cost: 7.8, additionalCosts: 0.5, retailPrice: 24.9, wholesalePrice: 15.0, minStock: 10, idealStock: 40, initialStock: 32, location: { shelf: 'A', drawer: '01', box: '02' } },
      { sku: 'BR002', name: 'Brinco Argola Prateada Pequena', categoryId: cat('Brincos'), supplierId: sup('Folheados SP Atacado'), color: 'Prata', material: 'Folheado a prata', cost: 6.2, additionalCosts: 0.4, retailPrice: 19.9, wholesalePrice: 12.0, minStock: 10, idealStock: 30, initialStock: 8, location: { shelf: 'A', drawer: '01', box: '03' } },
      { sku: 'BR003', name: 'Brinco Ear Cuff Zircônia', categoryId: cat('Brincos'), supplierId: sup('Cristais & Cia'), color: 'Dourado', material: 'Folheado + zircônia', cost: 12.5, additionalCosts: 1.0, retailPrice: 39.9, wholesalePrice: 24.0, minStock: 6, idealStock: 20, initialStock: 3, location: { shelf: 'A', drawer: '02', box: '01' } },
      { sku: 'BR004', name: 'Brinco Pérola Clássico', categoryId: cat('Brincos'), supplierId: sup('Bijoux Import LTDA'), color: 'Branco', material: 'Pérola sintética', cost: 5.4, additionalCosts: 0.3, retailPrice: 17.9, wholesalePrice: 10.5, minStock: 8, idealStock: 25, initialStock: 25, location: { shelf: 'A', drawer: '02', box: '02' } },
      { sku: 'CL001', name: 'Colar Gargantilha Coração', categoryId: cat('Colares'), supplierId: sup('Folheados SP Atacado'), color: 'Dourado', material: 'Folheado a ouro', cost: 9.9, additionalCosts: 0.8, retailPrice: 32.9, wholesalePrice: 19.5, minStock: 8, idealStock: 30, initialStock: 18, location: { shelf: 'B', drawer: '01', box: '01' } },
      { sku: 'CL002', name: 'Colar Corrente Veneziana 45cm', categoryId: cat('Colares'), supplierId: sup('Folheados SP Atacado'), color: 'Dourado', material: 'Folheado a ouro', cost: 14.0, additionalCosts: 1.0, retailPrice: 45.0, wholesalePrice: 28.0, minStock: 6, idealStock: 20, initialStock: 5, location: { shelf: 'B', drawer: '01', box: '02' } },
      { sku: 'CL003', name: 'Colar Choker Veludo', categoryId: cat('Colares'), supplierId: sup('Cristais & Cia'), color: 'Preto', material: 'Veludo + metal', cost: 8.0, additionalCosts: 0.5, retailPrice: 27.9, wholesalePrice: 16.0, minStock: 6, idealStock: 20, initialStock: 0, location: { shelf: 'B', drawer: '02', box: '01' } },
      { sku: 'CL004', name: 'Colar Pingente Lua', categoryId: cat('Colares'), supplierId: sup('Bijoux Import LTDA'), color: 'Prata', material: 'Folheado a prata', cost: 10.5, additionalCosts: 0.6, retailPrice: 34.9, wholesalePrice: 21.0, minStock: 5, idealStock: 18, initialStock: 14, location: { shelf: 'B', drawer: '02', box: '02' } },
      { sku: 'AN001', name: 'Anel Solitário Zircônia', categoryId: cat('Anéis'), supplierId: sup('Cristais & Cia'), color: 'Dourado', material: 'Folheado + zircônia', cost: 8.9, additionalCosts: 0.5, retailPrice: 29.9, wholesalePrice: 17.5, minStock: 8, idealStock: 25, initialStock: 21, location: { shelf: 'C', drawer: '01', box: '01' } },
      { sku: 'AN002', name: 'Anel Aparador Duplo', categoryId: cat('Anéis'), supplierId: sup('Folheados SP Atacado'), color: 'Dourado', material: 'Folheado a ouro', cost: 6.5, additionalCosts: 0.4, retailPrice: 21.9, wholesalePrice: 13.0, minStock: 10, idealStock: 30, initialStock: 6, location: { shelf: 'C', drawer: '01', box: '02' } },
      { sku: 'AN003', name: 'Anel Liso Ajustável', categoryId: cat('Anéis'), supplierId: sup('Bijoux Import LTDA'), color: 'Prata', material: 'Folheado a prata', cost: 4.2, additionalCosts: 0.2, retailPrice: 14.9, wholesalePrice: 8.5, minStock: 12, idealStock: 40, initialStock: 40, location: { shelf: 'C', drawer: '02', box: '01' } },
      { sku: 'PU001', name: 'Pulseira Riviera Cravejada', categoryId: cat('Pulseiras'), supplierId: sup('Cristais & Cia'), color: 'Dourado', material: 'Folheado + zircônia', cost: 15.9, additionalCosts: 1.2, retailPrice: 49.9, wholesalePrice: 30.0, minStock: 5, idealStock: 15, initialStock: 2, location: { shelf: 'D', drawer: '01', box: '01' } },
      { sku: 'PU002', name: 'Pulseira Berloque Coração', categoryId: cat('Pulseiras'), supplierId: sup('Folheados SP Atacado'), color: 'Dourado', material: 'Folheado a ouro', cost: 9.5, additionalCosts: 0.6, retailPrice: 31.9, wholesalePrice: 19.0, minStock: 8, idealStock: 22, initialStock: 17, location: { shelf: 'D', drawer: '01', box: '02' } },
      { sku: 'PU003', name: 'Pulseira Elos Grossos', categoryId: cat('Pulseiras'), supplierId: sup('Folheados SP Atacado'), color: 'Prata', material: 'Folheado a prata', cost: 11.0, additionalCosts: 0.7, retailPrice: 36.9, wholesalePrice: 22.0, minStock: 6, idealStock: 18, initialStock: 9, location: { shelf: 'D', drawer: '02', box: '01' } },
      { sku: 'PU004', name: 'Pulseira Infantil Ajustável', categoryId: cat('Pulseiras'), supplierId: sup('Bijoux Import LTDA'), color: 'Rosa', material: 'Metal + esmalte', cost: 3.5, additionalCosts: 0.2, retailPrice: 12.9, wholesalePrice: 7.5, minStock: 10, idealStock: 30, initialStock: 28, location: { shelf: 'D', drawer: '02', box: '02' } },
      { sku: 'KT001', name: 'Kit Festa Colar + Brinco', categoryId: cat('Conjuntos'), supplierId: sup('Cristais & Cia'), color: 'Dourado', material: 'Folheado + zircônia', cost: 18.0, additionalCosts: 1.5, retailPrice: 59.9, wholesalePrice: 36.0, minStock: 5, idealStock: 15, initialStock: 11, location: { shelf: 'E', drawer: '01', box: '01' } },
      { sku: 'KT002', name: 'Conjunto Noiva Pérolas', categoryId: cat('Conjuntos'), supplierId: sup('Bijoux Import LTDA'), color: 'Branco', material: 'Pérola sintética', cost: 22.0, additionalCosts: 1.8, retailPrice: 74.9, wholesalePrice: 45.0, minStock: 3, idealStock: 10, initialStock: 1, location: { shelf: 'E', drawer: '01', box: '02' } },
      { sku: 'KT003', name: 'Conjunto Colar + Pulseira Elos', categoryId: cat('Conjuntos'), supplierId: sup('Folheados SP Atacado'), color: 'Dourado', material: 'Folheado a ouro', cost: 20.5, additionalCosts: 1.5, retailPrice: 68.9, wholesalePrice: 41.0, minStock: 4, idealStock: 12, initialStock: 6, location: { shelf: 'E', drawer: '02', box: '01' } },
      { sku: 'AN004', name: 'Anel Infinito Fino', categoryId: cat('Anéis'), supplierId: sup('Cristais & Cia'), color: 'Prata', material: 'Folheado a prata', cost: 5.0, additionalCosts: 0.3, retailPrice: 16.9, wholesalePrice: 9.9, minStock: 10, idealStock: 30, initialStock: 24, location: { shelf: 'C', drawer: '02', box: '02' } },
      { sku: 'BR005', name: 'Brinco Gota Cristal', categoryId: cat('Brincos'), supplierId: sup('Cristais & Cia'), color: 'Cristal', material: 'Metal + cristal', cost: 9.0, additionalCosts: 0.6, retailPrice: 28.9, wholesalePrice: 17.0, minStock: 6, idealStock: 18, initialStock: 4, location: { shelf: 'A', drawer: '03', box: '01' } }
    ];

    return App.db.putMany('categories', categories)
      .then(function () { return App.db.putMany('suppliers', suppliers); })
      .then(function () {
        var nowBase = Date.now();
        var products = productsDef.map(function (p, idx) {
          return {
            id: uuid(),
            sku: p.sku,
            barcode: '789' + String(1000000 + idx),
            qrcode: null,
            name: p.name,
            description: '',
            categoryId: p.categoryId,
            subcategory: '',
            collection: '',
            model: '',
            color: p.color,
            material: p.material,
            supplierId: p.supplierId,
            cost: p.cost,
            additionalCosts: p.additionalCosts,
            wholesalePrice: p.wholesalePrice,
            retailPrice: p.retailPrice,
            promoPrice: null,
            minStock: p.minStock,
            idealStock: p.idealStock,
            location: p.location,
            active: true,
            notes: '',
            image: null,
            createdAt: new Date(nowBase - (productsDef.length - idx) * 86400000).toISOString(),
            updatedAt: App.core.format.nowIso(),
            lastPurchaseAt: null,
            lastSaleAt: null,
            totalSold: 0,
            _initialStock: p.initialStock
          };
        });
        var cleanProducts = products.map(function (p) { var c = Object.assign({}, p); delete c._initialStock; return c; });
        return App.db.putMany('products', cleanProducts).then(function () { return products; });
      })
      .then(function (products) {
        // Movimentações de estoque inicial — sempre via StockEngine, nunca gravando direto no produto.
        return products.reduce(function (chain, p) {
          if (!p._initialStock || p._initialStock <= 0) return chain;
          return chain.then(function () {
            return App.core.stockEngine.registrarMovimentacao({
              productId: p.id, type: 'ENTRADA_INICIAL', quantity: p._initialStock, reason: 'Estoque inicial (dados de demonstração)'
            });
          });
        }, Promise.resolve());
      })
      .then(function () {
        return ensureDefaultSettings();
      });
  }

  global.App = global.App || {};
  global.App.demoData = { seed: seed, ensureDefaultSettings: ensureDefaultSettings };
})(window);
