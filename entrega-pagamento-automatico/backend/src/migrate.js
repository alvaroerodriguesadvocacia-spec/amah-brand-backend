/* AMÁH Brand — backend: criação/atualização do schema (idempotente).
 * Cada "store" vira uma tabela genérica (id TEXT PK, data JSONB) — mesmo
 * padrão documento-por-linha do IndexedDB, o que torna a troca do adapter no
 * frontend (Fase 10, ARQUITETURA.md §9) mecânica: getAll/getById/getByIndex/
 * put/putMany/remove mapeiam 1:1 para os endpoints REST genéricos.
 */
'use strict';

const crypto = require('crypto');
const { pool, STORE_NAMES, tableName } = require('./db');

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT,
        role TEXT NOT NULL DEFAULT 'admin',
        active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    for (const store of STORE_NAMES) {
      const table = tableName(store);
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await client.query(`CREATE INDEX IF NOT EXISTS ${table}_data_gin ON ${table} USING GIN (data);`);
    }

    // Índices específicos que espelham os índices únicos/consultados do IndexedDB.
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS store_products_sku_idx ON store_products (( data->>'sku' )) WHERE data->>'sku' IS NOT NULL AND data->>'sku' <> '';`);
    await client.query(`CREATE INDEX IF NOT EXISTS store_products_barcode_idx ON store_products (( data->>'barcode' ));`);
    await client.query(`CREATE INDEX IF NOT EXISTS store_products_category_idx ON store_products (( data->>'categoryId' ));`);
    await client.query(`CREATE INDEX IF NOT EXISTS store_products_active_idx ON store_products (( data->>'active' ));`);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS store_sales_number_idx ON store_sales (( data->>'number' )) WHERE data->>'number' IS NOT NULL;`);
    await client.query(`CREATE INDEX IF NOT EXISTS store_inventory_movements_product_idx ON store_inventory_movements (( data->>'productId' ));`);
    // Trava em nível de banco: nunca mais de um caixa "aberto" ao mesmo tempo.
    // A rota /operations/cash/open já bloqueia isso lendo as sessões com
    // FOR UPDATE, mas esse lock não protege a primeiríssima sessão (tabela
    // vazia, nada pra travar) — esse índice fecha exatamente essa brecha
    // (2026-08-26).
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS store_cash_sessions_single_open_idx ON store_cash_sessions ((1)) WHERE data->>'status' = 'aberto';`);

    // Item de contagem de inventário duplicado (mesmo produto, duas linhas
    // na mesma contagem): antes da correção de 2026-08-26, o frontend lia a
    // lista de itens e gravava a leitura em duas chamadas HTTP separadas
    // sem transação nenhuma entre elas — um duplo clique em "Adicionar
    // todos os produtos", ou uma edição digitada antes da tela terminar de
    // atualizar, podia fazer duas leituras concluírem "esse produto ainda
    // não tem item" e criar duas linhas pro mesmo produto. Antes de criar o
    // índice único abaixo, mescla qualquer duplicata já existente em
    // produção: mantém a linha já ajustada (se alguma foi) ou a de maior
    // quantidade contada (mais provável de ser a contagem real, não o zero
    // padrão de "adicionar todos"), e apaga as demais.
    await client.query(`
      WITH ranked AS (
        SELECT id,
          data->>'stockCountId' AS scid,
          data->>'productId' AS pid,
          ROW_NUMBER() OVER (
            PARTITION BY data->>'stockCountId', data->>'productId'
            ORDER BY COALESCE((data->>'adjusted')::boolean, false) DESC,
                     COALESCE((data->>'countedQty')::numeric, 0) DESC,
                     id
          ) AS rn
        FROM store_stock_count_items
        WHERE data->>'stockCountId' IS NOT NULL AND data->>'productId' IS NOT NULL
      ),
      any_adjusted AS (
        SELECT data->>'stockCountId' AS scid, data->>'productId' AS pid,
               bool_or(COALESCE((data->>'adjusted')::boolean, false)) AS was_adjusted
        FROM store_stock_count_items
        GROUP BY 1, 2
      )
      UPDATE store_stock_count_items s
      SET data = jsonb_set(s.data, '{adjusted}', 'true'::jsonb)
      FROM ranked r JOIN any_adjusted a ON a.scid = r.scid AND a.pid = r.pid
      WHERE s.id = r.id AND r.rn = 1 AND a.was_adjusted = true;
    `);
    await client.query(`
      WITH ranked AS (
        SELECT id,
          ROW_NUMBER() OVER (
            PARTITION BY data->>'stockCountId', data->>'productId'
            ORDER BY COALESCE((data->>'adjusted')::boolean, false) DESC,
                     COALESCE((data->>'countedQty')::numeric, 0) DESC,
                     id
          ) AS rn
        FROM store_stock_count_items
        WHERE data->>'stockCountId' IS NOT NULL AND data->>'productId' IS NOT NULL
      )
      DELETE FROM store_stock_count_items WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
    `);
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS store_stock_count_items_unique_idx ON store_stock_count_items ((data->>'stockCountId'), (data->>'productId'));`);

    // Formas de pagamento do Mercado Pago (Fase "Pagamentos automáticos",
    // 2026-08-28) — ensureSettings() do seed.js só cria o documento
    // payment_methods do zero (instalação nova, ver DEFAULT_PAYMENT_METHODS);
    // para quem já tem o sistema rodando (como a instalação de produção desta
    // usuária), precisamos ACRESCENTAR as 3 novas formas ao array já
    // existente, sem duplicar caso este script rode de novo (idempotente por
    // nome).
    const NEW_MP_METHODS = [
      { name: 'PIX (Mercado Pago)', feePercent: 0.99 },
      { name: 'Cartão (Mercado Pago)', feePercent: 4.98 },
      { name: 'Boleto (Mercado Pago) — taxa fixa ~R$3,49', feePercent: 0 }
    ];
    const pmResult = await client.query("SELECT data FROM store_settings WHERE id = 'payment_methods' FOR UPDATE");
    if (pmResult.rows[0]) {
      const doc = pmResult.rows[0].data;
      const items = Array.isArray(doc.items) ? doc.items : [];
      const existingNames = new Set(items.map((m) => m.name));
      const toAdd = NEW_MP_METHODS.filter((m) => !existingNames.has(m.name));
      if (toAdd.length > 0) {
        const updatedItems = items.concat(toAdd.map((m) => ({ id: crypto.randomUUID(), name: m.name, feePercent: m.feePercent, active: true })));
        const updatedDoc = Object.assign({}, doc, { items: updatedItems });
        await client.query("UPDATE store_settings SET data = $1, updated_at = now() WHERE id = 'payment_methods'", [updatedDoc]);
        console.log('[migrate] Formas de pagamento Mercado Pago adicionadas:', toAdd.map((m) => m.name).join(', '));
      }
    }

    // Cobranças Mercado Pago — nunca duas cobranças (presencial ou Vitrine)
    // apontando pro mesmo pagamento confirmado no Mercado Pago; rede de
    // segurança extra além da trava de linha + checagem de status já feita
    // no webhook (ver routes/payments.js).
    await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS store_mp_charges_mp_payment_idx ON store_mp_charges ((data->>'mpPaymentId')) WHERE data->>'mpPaymentId' IS NOT NULL;`);

    await client.query('COMMIT');
    console.log('[migrate] schema OK (%d stores + users)', STORE_NAMES.length);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { migrate };

if (require.main === module) {
  migrate().then(() => process.exit(0)).catch((err) => { console.error(err); process.exit(1); });
}
