/* AMÁH Brand — backend: criação/atualização do schema (idempotente).
 * Cada "store" vira uma tabela genérica (id TEXT PK, data JSONB) — mesmo
 * padrão documento-por-linha do IndexedDB, o que torna a troca do adapter no
 * frontend (Fase 10, ARQUITETURA.md §9) mecânica: getAll/getById/getByIndex/
 * put/putMany/remove mapeiam 1:1 para os endpoints REST genéricos.
 */
'use strict';

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
