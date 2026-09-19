import { Pool } from "pg";
import { IfoodClient } from "./client";
import { loadConfig } from "./config";

/**
 * Sincroniza o cardápio do Postgres do barbacue para o catálogo do iFood.
 *
 *   npm run sync-menu --workspace=packages/ifood
 *   IFOOD_DRY_RUN=true npm run sync-menu --workspace=packages/ifood   # simula
 *
 * Estratégia (idempotente):
 *  - Categoria: casada por nome dentro do catálogo DELIVERY; criada se não existir.
 *  - Produto:  casado por `externalCode` = products.external_id do nosso banco.
 *              PUT /merchants/{id}/items cria OU atualiza (nome, descrição, preço, status).
 *
 * Não sincroniza imagens: `imagePath` exige upload prévio pelo endpoint de imagem
 * do Catalog. Faça isso num segundo passo se precisar.
 */

interface DbCategory {
  id: number;
  name: string;
  sort_order: number;
}

interface DbProduct {
  external_id: string;
  category_id: number;
  name: string;
  description: string | null;
  price_cents: number;
  available: boolean;
  sort_order: number;
}

async function main() {
  const config = loadConfig();
  const client = new IfoodClient(config);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  console.log(config.dryRun ? "Modo DRY RUN — nada será gravado no iFood.\n" : "");

  // 1) Escolhe o catálogo de DELIVERY
  const catalogs = await client.listCatalogs();
  const catalog =
    catalogs.find((c) => (c.context ?? []).includes("DELIVERY")) ?? catalogs[0];
  if (!catalog) throw new Error("Nenhum catálogo encontrado para este merchant.");
  console.log(`Catálogo: ${catalog.catalogId} (${(catalog.context ?? []).join(", ")})`);

  // 2) Categorias já existentes no iFood, indexadas por nome normalizado
  const norm = (s: string) => s.trim().toLowerCase();
  const remoteCategories = await client.listCategories(catalog.catalogId);
  const catByName = new Map(remoteCategories.map((c) => [norm(c.name), c.id]));

  // 3) Lê o cardápio local
  const { rows: dbCategories } = await pool.query<DbCategory>(
    "SELECT id, name, sort_order FROM categories ORDER BY sort_order, name"
  );
  const { rows: dbProducts } = await pool.query<DbProduct>(
    `SELECT external_id, category_id, name, description, price_cents, available, sort_order
       FROM products
      ORDER BY category_id, sort_order, name`
  );
  console.log(
    `Local: ${dbCategories.length} categorias, ${dbProducts.length} produtos.\n`
  );

  // 4) Garante as categorias no iFood
  const localToRemoteCat = new Map<number, string>();
  for (const cat of dbCategories) {
    let remoteId = catByName.get(norm(cat.name));
    if (!remoteId) {
      console.log(`+ categoria "${cat.name}"`);
      const created = await client.createCategory(catalog.catalogId, {
        name: cat.name,
        index: cat.sort_order,
        status: "AVAILABLE",
      });
      remoteId = created?.id;
      if (remoteId) catByName.set(norm(cat.name), remoteId);
    }
    if (remoteId) localToRemoteCat.set(cat.id, remoteId);
    else if (!config.dryRun) console.warn(`  ⚠ sem id para "${cat.name}"`);
  }

  // 5) Envia os produtos
  let ok = 0;
  let failed = 0;
  for (const prod of dbProducts) {
    const categoryId = localToRemoteCat.get(prod.category_id);
    if (!categoryId && !config.dryRun) {
      console.warn(`  ⚠ pulando "${prod.name}" — categoria sem correspondência`);
      failed++;
      continue;
    }

    const payload = {
      item: {
        type: "DEFAULT",
        categoryId,
        status: prod.available ? "AVAILABLE" : "UNAVAILABLE",
        price: { value: prod.price_cents / 100 },
        externalCode: prod.external_id,
        index: prod.sort_order,
      },
      products: [
        {
          name: prod.name.slice(0, 100),
          description: (prod.description ?? "").slice(0, 1000),
          externalCode: prod.external_id,
        },
      ],
    };

    try {
      await client.upsertItem(payload);
      ok++;
      if (ok % 20 === 0) console.log(`  … ${ok} itens enviados`);
    } catch (err) {
      failed++;
      console.error(`  ✗ "${prod.name}": ${(err as Error).message}`);
    }
  }

  console.log(`\nConcluído — ${ok} item(ns) sincronizado(s), ${failed} falha(s).`);
  if (!config.dryRun) {
    console.log(
      "As alterações passam por processamento assíncrono no iFood;" +
        " confira em GET /catalogs/{id}/categories em alguns minutos."
    );
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
