/* AMÁH Brand — motor de geração de texto "Por que você vai Amáhr"
 *
 * Gera, para cada produto, um pequeno texto emocional/comercial (2 a 4
 * frases) que conecta CARACTERÍSTICA REAL DA PEÇA → EFEITO VISUAL →
 * PERSONALIDADE/SENSAÇÃO. Ver especificação completa combinada com o
 * usuário em 2026-08-21 (registrada também em
 * claude/status-sistema-amah-brand.md, seção "Por que você vai Amáhr").
 *
 * Regras inegociáveis que este motor respeita:
 *  - NUNCA inventa material, pedra, banho ou característica física que não
 *    esteja no cadastro do produto (nome/categoria/subcategoria/coleção/
 *    modelo/cor/material/descrição). Frases que citam algo concreto só são
 *    escolhidas quando o dado correspondente existe.
 *  - A peça nunca "dá valor" à mulher — ela acompanha, expressa, complementa.
 *  - Variação real: várias famílias de personalidade, vários templates por
 *    frase, seleção aleatória ponderada por "aprendizado editorial"
 *    (fragmentStats, guardado em App.db 'settings'/'whyamahr_editorial').
 *  - Só usa vocabulário religioso explícito quando `product.faithInspiration`
 *    foi preenchido manualmente pela equipe.
 *
 * Este arquivo é 100% local/determinístico por regras (sem chamada a IA
 * externa) — não depende de internet nem de chave de API, e por isso nunca
 * foge do que está realmente cadastrado.
 */
(function (global) {
  'use strict';

  // ---------------------------------------------------------------------
  // Utilidades de texto
  // ---------------------------------------------------------------------

  function stripAccents(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
  }
  // low(): usada SÓ para comparar palavras-chave internamente (remove
  // acento pra casar "atemporal"/"atempor" etc). NUNCA usar pra montar
  // texto exibido — pra isso existe lowerDisplay(), que preserva acentos.
  function low(s) { return stripAccents(s).toLowerCase(); }
  function lowerDisplay(s) { return String(s || '').toLowerCase(); }
  function has(haystack, needle) { return haystack.indexOf(needle) !== -1; }
  function trim(s) { return (s == null ? '' : String(s)).trim(); }
  function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

  function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  // Escolha aleatória ponderada. items: [{id, text, weight}]. Pesos vêm do
  // aprendizado editorial (fragmentStats) e nunca zeram uma opção — só a
  // tornam menos provável, pra não travar a variação.
  function weightedChoice(items) {
    var total = items.reduce(function (s, it) { return s + it.weight; }, 0);
    var r = Math.random() * total;
    for (var i = 0; i < items.length; i++) {
      r -= items[i].weight;
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function weightFor(stats, id) {
    var st = (stats && stats[id]) || { kept: 0, removed: 0 };
    var w = 1 + (st.kept * 0.35) - (st.removed * 0.55);
    return Math.max(0.12, w);
  }

  // ---------------------------------------------------------------------
  // Famílias de personalidade (agrupam os 13 perfis pedidos em 5 famílias
  // de vocabulário — mantém a riqueza pedida sem duplicar banco de frases
  // 13x). Cada perfil mapeia para exatamente uma família.
  // ---------------------------------------------------------------------

  var PROFILE_TO_FAMILY = {
    'Delicada': 'DEL', 'Romântica': 'DEL',
    'Clássica': 'CLA', 'Elegante': 'CLA', 'Atemporal': 'CLA', 'Sofisticada': 'CLA',
    'Marcante': 'MAR', 'Ousada': 'MAR', 'Glamourosa': 'MAR',
    'Moderna': 'MOD', 'Contemporânea': 'MOD',
    'Minimalista': 'MIN', 'Casual': 'MIN'
  };

  var FAMILY_LABEL = { DEL: 'Delicada', CLA: 'Clássica', MAR: 'Marcante', MOD: 'Moderna', MIN: 'Minimalista' };

  var FAMILIES = ['DEL', 'CLA', 'MAR', 'MOD', 'MIN'];

  // Palavras-chave (já sem acento) que empurram a classificação pra cada
  // família, lidas de subcategoria + material + cor + coleção + modelo +
  // descrição — ou seja, sempre a partir de texto que a própria equipe
  // cadastrou, nunca inventado.
  var KEYWORDS = {
    DEL: ['delicad', 'fin', 'miud', 'suave', 'sutil', 'peque', 'gentil', 'leve', 'ponto de luz'],
    CLA: ['classic', 'atempor', 'elegant', 'sofistic', 'refinad', 'tradicional'],
    MAR: ['grande', 'statement', 'volumos', 'marcante', 'ousad', 'glamour', 'luxuos', 'imponente'],
    MOD: ['modern', 'contempor', 'geometric', 'assimetric', 'despoj', 'urbano', 'design'],
    MIN: ['minimal', 'simples', 'basic', 'clean', 'essencial', 'casual', 'discret']
  };
  // Sinais "ambíguos" (podem reforçar mais de uma família ao mesmo tempo).
  var AMBIGUOUS_KEYWORDS = [
    { re: /zirc|cristal|strass|brilhant|polid/, boosts: { DEL: 0.6, MAR: 0.6 } },
    { re: /perol/, boosts: { DEL: 1, CLA: 0.3 } },
    { re: /dourad|ouro/, boosts: { CLA: 0.3, MAR: 0.3 } },
    { re: /prat(a|ead)/, boosts: { MIN: 0.3, CLA: 0.3 } }
  ];
  var CATEGORY_DEFAULTS = [
    { re: /brinco/, boosts: { DEL: 0.8 } },
    { re: /colar/, boosts: { CLA: 0.5 } },
    { re: /pulseira/, boosts: { MOD: 0.4 } },
    { re: /anel/, boosts: { CLA: 0.4 } },
    { re: /presilha/, boosts: { DEL: 0.8 } }
  ];

  function extractFacts(product) {
    return {
      name: trim(product.name),
      categoryName: trim(product.categoryName || product.category),
      subcategory: trim(product.subcategory),
      collection: trim(product.collection),
      model: trim(product.model),
      color: trim(product.color),
      material: trim(product.material),
      description: trim(product.description),
      styleTags: Array.isArray(product.styleTags) ? product.styleTags : [],
      faithInspiration: trim(product.faithInspiration)
    };
  }

  function classify(facts) {
    var haystack = low([facts.subcategory, facts.material, facts.color, facts.collection, facts.model, facts.description].join(' '));
    var catHay = low(facts.categoryName + ' ' + facts.subcategory);
    var scores = { DEL: 0, CLA: 0, MAR: 0, MOD: 0, MIN: 0 };

    FAMILIES.forEach(function (fam) {
      KEYWORDS[fam].forEach(function (kw) { if (has(haystack, kw)) scores[fam] += 1; });
    });
    AMBIGUOUS_KEYWORDS.forEach(function (rule) {
      if (rule.re.test(haystack)) {
        Object.keys(rule.boosts).forEach(function (fam) { scores[fam] += rule.boosts[fam]; });
      }
    });
    CATEGORY_DEFAULTS.forEach(function (rule) {
      if (rule.re.test(catHay)) {
        Object.keys(rule.boosts).forEach(function (fam) { scores[fam] += rule.boosts[fam]; });
      }
    });
    // Tags manuais (cadastradas pela equipe) valem mais que qualquer inferência.
    facts.styleTags.forEach(function (tag) {
      var fam = PROFILE_TO_FAMILY[tag];
      if (fam) scores[fam] += 4;
    });

    var best = null, bestScore = -1;
    FAMILIES.forEach(function (fam) { if (scores[fam] > bestScore) { bestScore = scores[fam]; best = fam; } });

    if (bestScore <= 0) {
      // Sem nenhum sinal (cadastro muito enxuto) — sorteia com leve viés
      // para o "centro" da marca (Clássica/Delicada), garantindo que um
      // lote de produtos pouco detalhados não vire tudo idêntico.
      var weighted = [
        { fam: 'CLA', w: 0.30 }, { fam: 'DEL', w: 0.30 }, { fam: 'MIN', w: 0.15 },
        { fam: 'MOD', w: 0.15 }, { fam: 'MAR', w: 0.10 }
      ];
      var r = Math.random(), acc = 0;
      for (var i = 0; i < weighted.length; i++) { acc += weighted[i].w; if (r <= acc) { best = weighted[i].fam; break; } }
    }
    return { family: best, scores: scores };
  }

  // ---------------------------------------------------------------------
  // Qualificadores por família (adjetivos/expressões curtas e seguras —
  // não afirmam nenhum material/pedra específico, só o efeito).
  // ---------------------------------------------------------------------

  var QUALIFIERS = {
    DEL: ['delicado', 'sutil', 'suave', 'gentil'],
    CLA: ['atemporal', 'refinado', 'equilibrado', 'discreto'],
    MAR: ['expressivo', 'marcante', 'vibrante', 'presente'],
    MOD: ['contemporâneo', 'autêntico', 'despojado', 'com traço próprio'],
    MIN: ['essencial', 'limpo', 'sereno', 'preciso']
  };

  // ---------------------------------------------------------------------
  // Frase 1 (a peça) — templates GROUNDED: só entram na disputa quando os
  // dados que citam existem de verdade no cadastro.
  // ---------------------------------------------------------------------

  // Só usa a subcategoria (texto livre, singular, como a equipe digitou) —
  // nunca o nome da categoria (que costuma estar no plural, ex.: "Anéis",
  // "Colares"), pra não gerar concordância errada ("desta Anéis").
  function subcatOrCat(facts) { return facts.subcategory || 'peça'; }

  var OPENER_TEMPLATES = [
    {
      id: 'T1_color', needs: function (f) { return !!f.color; },
      build: function (f, q) { return 'O tom ' + lowerDisplay(f.color) + ' desta ' + subcatOrCat(f) + ' traz um efeito ' + q + ' ao visual.'; }
    },
    {
      id: 'T2_material', needs: function (f) { return !!f.material; },
      build: function (f, q) { return 'O acabamento em ' + lowerDisplay(f.material) + ' dá um toque ' + q + ' a esta ' + subcatOrCat(f) + '.'; }
    },
    {
      id: 'T3_color_material', needs: function (f) { return !!f.color && !!f.material; },
      build: function (f, q) { return 'O encontro entre o ' + lowerDisplay(f.material) + ' e o tom ' + lowerDisplay(f.color) + ' marca, de um jeito ' + q + ', o design desta ' + subcatOrCat(f) + '.'; }
    },
    {
      id: 'T4_collection', needs: function (f) { return !!f.collection; },
      build: function (f, q) { return 'Parte da coleção ' + f.collection + ', esta ' + subcatOrCat(f) + ' carrega um desenho ' + q + '.'; }
    },
    {
      id: 'T5_subcategory', needs: function (f) { return !!f.subcategory; },
      build: function (f, q) { return 'Cada detalhe desta ' + f.subcategory + ' foi pensado para um efeito ' + q + '.'; }
    },
    {
      id: 'T6_fallback', needs: function () { return true; },
      build: function (f, q) { return 'O desenho desta ' + subcatOrCat(f) + ' é ' + q + ' do começo ao fim.'; }
    }
  ];

  function buildOpenerCandidates(facts, family) {
    var quals = QUALIFIERS[family];
    var out = [];
    OPENER_TEMPLATES.forEach(function (tpl) {
      if (!tpl.needs(facts)) return;
      quals.forEach(function (q, qi) {
        out.push({ id: 'opener:' + tpl.id + ':' + family + ':' + qi, text: capitalize(tpl.build(facts, q)) });
      });
    });
    return out;
  }

  // ---------------------------------------------------------------------
  // Frase 2 (o efeito) e Frase 3 (a mulher), por família — banco de frases
  // que fala de sensação/efeito/personalidade, nunca de um material
  // específico (por isso não precisam ser "grounded" como a frase 1).
  // ---------------------------------------------------------------------

  var EFFECT = {
    DEL: [
      'Sem excessos, ilumina o visual com uma leveza que não pede esforço.',
      'É o tipo de brilho que aparece de perto, num segundo olhar.',
      'Soma ao look sem disputar espaço com o resto do conjunto.',
      'Dá um respiro delicado à composição, do jeito que os bons detalhes costumam fazer.',
      'Aparece aos poucos — no gesto, no movimento, na luz que pega de leve.'
    ],
    CLA: [
      'Atravessa estações e ocasiões sem perder a mesma força discreta.',
      'Compõe com quase tudo, sem nunca parecer fora de lugar.',
      'Tem o tipo de acabamento que não sai de moda porque nunca tentou seguir uma.',
      'Funciona no trabalho, no jantar, no domingo comum — sem precisar se adaptar.',
      'Dá um ar de cuidado ao look, sem parecer produzido demais.'
    ],
    MAR: [
      'Puxa o olhar primeiro, sem precisar de mais nada ao redor.',
      'Assume o centro da composição com naturalidade, não com esforço.',
      'É a peça que termina o look — a última palavra do conjunto.',
      'Dá presença ao visual sem precisar gritar por atenção.',
      'Marca o conjunto do jeito que só uma peça de verdade consegue.'
    ],
    MOD: [
      'Foge do óbvio sem tentar demais — só assume um caminho próprio.',
      'Traz um contraste que atualiza o resto do look.',
      'Tem aquele traço de quem não segue fórmula pronta.',
      'Dá um toque de agora ao conjunto, sem depender de tendência passageira.',
      'Assina o visual com um jeito próprio de existir.'
    ],
    MIN: [
      'Soma ao look como quem resolve tudo com uma frase curta.',
      'Prova que presença não precisa de volume.',
      'Deixa o essencial em evidência — e só isso já basta.',
      'Combina com dias cheios e looks que não pedem explicação.',
      'Fecha a composição sem sobrar nada além do necessário.'
    ]
  };

  var WOMAN = {
    DEL: [
      'Acompanha quem encontra beleza nos detalhes pequenos do dia.',
      'Combina com uma feminilidade que não precisa se anunciar para ser sentida.',
      'Fala com quem escolhe delicadeza como forma de presença, não de esconderijo.',
      'É companhia de quem gosta de deixar espaço para a leveza.',
      'Traduz uma graça que já é dela — a peça só acompanha.'
    ],
    CLA: [
      'Combina com quem valoriza consistência mais do que tendência.',
      'Acompanha uma elegância que não precisa provar nada a ninguém.',
      'Fala com quem já sabe o que gosta e não muda de estilo por modismo.',
      'É para quem entende beleza como algo que se constrói, não que se improvisa.',
      'Expressa uma confiança tranquila — sem pressa de impressionar.'
    ],
    MAR: [
      'Acompanha quem gosta de ser lembrada pela presença, não pelo volume.',
      'Fala com uma confiança que já existia antes da peça — ela só destaca.',
      'Combina com quem tem algo a dizer e não tem medo de dizer.',
      'É para mulheres que entendem autenticidade como a forma mais forte de estilo.',
      'Expressa uma personalidade que não pede licença para aparecer.'
    ],
    MOD: [
      'Combina com quem constrói o próprio estilo em vez de copiar um pronto.',
      'Fala com uma feminilidade que também é atitude, não só aparência.',
      'Acompanha quem gosta de misturar referências e criar algo só seu.',
      'É para quem entende elegância como um jeito de pensar, não uma regra a seguir.',
      'Expressa autenticidade — a peça só ajuda a mostrar o que já é dela.'
    ],
    MIN: [
      'Combina com quem acredita que menos, bem escolhido, já é suficiente.',
      'Acompanha uma feminilidade tranquila, que não precisa de excesso para ser notada.',
      'Fala com quem prefere clareza a exagero, em tudo que escolhe usar.',
      'É para quem entende que presença também pode ser discrição.',
      'Expressa um jeito de ser sereno — sem nada sobrando.'
    ]
  };

  // ---------------------------------------------------------------------
  // Frase final (assinatura emocional) — nem sempre aparece, nem sempre
  // usa o trocadilho "Amáhr" (ver regra do item 10 da especificação).
  // ---------------------------------------------------------------------

  var FINAL_GENERAL = [
    'Uma peça para guardar entre as favoritas.',
    'Do tipo que vira parte da rotina sem se notar disso.',
    'Simples de amar, fácil de usar todos os dias.',
    'Uma escolha que continua fazendo sentido daqui a um tempo.',
    'Pequena na forma, presente no efeito.',
    'Feita para acompanhar, não para competir.'
  ];
  var FINAL_WORDPLAY = [
    'Amáhr essa peça é entender que ela combina com quem você já é.',
    'Tem peça que a gente só usa. Essa, dá vontade de Amáhr.',
    'Amáhr começa nos detalhes — essa peça é um bom lugar para começar.',
    'Não é só sobre usar. É sobre Amáhr o que combina com você.',
    'Uma peça Amáh, pensada para quem sabe Amáhr os próprios detalhes.',
    'Amáhr essa peça é, no fundo, Amáhr um pouco mais de si mesma.'
  ];
  var FINAL_FAITH = [
    'Essa peça também carrega um significado especial: {faith}.',
    'Inspirada em {faith}, essa peça carrega um significado além do design.'
  ];

  function pickFragment(list, prefix, stats, excludeIds) {
    var items = list.map(function (text, i) {
      var id = prefix + ':' + i;
      return { id: id, text: text, weight: weightFor(stats, id) };
    }).filter(function (it) { return excludeIds.indexOf(it.id) === -1; });
    if (!items.length) {
      items = list.map(function (text, i) {
        var id = prefix + ':' + i;
        return { id: id, text: text, weight: weightFor(stats, id) };
      });
    }
    return weightedChoice(items);
  }

  function pickFinal(facts, family, stats, excludeIds) {
    if (facts.faithInspiration && Math.random() < 0.8) {
      var idx = Math.floor(Math.random() * FINAL_FAITH.length);
      var id = 'final:faith:' + idx;
      return { id: id, text: FINAL_FAITH[idx].replace('{faith}', facts.faithInspiration) };
    }
    if (Math.random() < 0.45) return null; // nem toda descrição termina com assinatura
    var useWordplay = Math.random() < 0.5;
    var pool = useWordplay ? FINAL_WORDPLAY : FINAL_GENERAL;
    var prefix = 'final:' + (useWordplay ? 'wordplay' : 'general');
    return pickFragment(pool, prefix, stats, excludeIds);
  }

  // ---------------------------------------------------------------------
  // Geração principal
  // ---------------------------------------------------------------------

  var statsCache = null;
  function loadStats() {
    if (statsCache) return Promise.resolve(statsCache);
    if (!(global.App && App.db && App.db.getById)) return Promise.resolve({});
    return App.db.getById('settings', 'whyamahr_editorial').then(function (doc) {
      statsCache = (doc && doc.fragmentStats) || {};
      return statsCache;
    }).catch(function () { return {}; });
  }
  function invalidateStats() { statsCache = null; }

  // gerar(productLike, opts) -> Promise<{ text, sentences, fragmentIds, family }>
  // productLike: { name, categoryName, subcategory, collection, model, color,
  //   material, description, styleTags, faithInspiration }
  // opts.excludeFragmentIds: ids a evitar (usado por "Gerar outra versão"
  // para não repetir exatamente a combinação anterior).
  function gerar(productLike, opts) {
    opts = opts || {};
    var exclude = opts.excludeFragmentIds || [];
    return loadStats().then(function (stats) {
      var facts = extractFacts(productLike);
      var cls = classify(facts);
      var family = cls.family;

      var openerCandidates = buildOpenerCandidates(facts, family).map(function (c) {
        return { id: c.id, text: c.text, weight: weightFor(stats, c.id) };
      }).filter(function (c) { return exclude.indexOf(c.id) === -1; });
      if (!openerCandidates.length) openerCandidates = buildOpenerCandidates(facts, family).map(function (c) {
        return { id: c.id, text: c.text, weight: weightFor(stats, c.id) };
      });
      var opener = weightedChoice(openerCandidates);

      var usedIds = [opener.id];
      var includeEffect = Math.random() < 0.85;
      var effect = includeEffect ? pickFragment(EFFECT[family], 'effect:' + family, stats, exclude.concat(usedIds)) : null;
      if (effect) usedIds.push(effect.id);

      var mulher = pickFragment(WOMAN[family], 'woman:' + family, stats, exclude.concat(usedIds));
      usedIds.push(mulher.id);

      var finalFrag = pickFinal(facts, family, stats, exclude.concat(usedIds));

      var sentences = [opener.text, effect ? effect.text : null, mulher.text, finalFrag ? finalFrag.text : null].filter(Boolean);
      var fragmentIds = [opener.id, effect ? effect.id : null, mulher.id, finalFrag ? finalFrag.id : null].filter(Boolean);

      return {
        text: sentences.join(' '),
        sentences: sentences,
        fragmentIds: fragmentIds,
        family: family,
        familyLabel: FAMILY_LABEL[family]
      };
    });
  }

  // ---------------------------------------------------------------------
  // Aprendizado editorial simples: compara o texto salvo com a última
  // geração automática conhecida (frase a frase) e ajusta pesos.
  // ---------------------------------------------------------------------

  function registrarEdicao(baseline, finalText) {
    if (!baseline || !baseline.sentences || !baseline.fragmentIds || !baseline.sentences.length) {
      return Promise.resolve(null); // nada pra aprender (não veio de geração automática)
    }
    if (!(global.App && App.db && App.db.getById && App.db.put)) return Promise.resolve(null);

    return loadStats().then(function (stats) {
      var next = Object.assign({}, stats);
      baseline.sentences.forEach(function (sentence, i) {
        var id = baseline.fragmentIds[i];
        if (!id) return;
        var cur = next[id] || { kept: 0, removed: 0 };
        cur = { kept: cur.kept, removed: cur.removed };
        if (finalText.indexOf(sentence) !== -1) cur.kept += 1;
        else cur.removed += 1;
        next[id] = cur;
      });
      return App.db.getById('settings', 'whyamahr_editorial').then(function (doc) {
        var record = {
          id: 'whyamahr_editorial',
          fragmentStats: next,
          updatedAt: (App.core && App.core.format ? App.core.format.nowIso() : new Date().toISOString())
        };
        return App.db.put('settings', record).then(function () {
          statsCache = next;
          return record;
        });
      });
    }).catch(function () { return null; });
  }

  // Rótulos usados no formulário (para o multi-select opcional de perfil).
  var PROFILE_LABELS = Object.keys(PROFILE_TO_FAMILY);

  global.App = global.App || {};
  global.App.core = global.App.core || {};
  global.App.core.whyAmahrEngine = {
    gerar: gerar,
    registrarEdicao: registrarEdicao,
    classify: classify,
    extractFacts: extractFacts,
    invalidateStats: invalidateStats,
    PROFILE_LABELS: PROFILE_LABELS
  };
})(window);
