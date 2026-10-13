import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const entries=JSON.parse(await fs.readFile(`${root}/docs/brand-images-2026-09/generated.json`,'utf8'));
const mapping=entries.flatMap(e=>e.refs.map(ref=>({...ref,imageUrl:`/menu/brands-2026-09/${e.key}.webp`})));
await fs.writeFile(`${root}/src/data/generated-brand-images.json`,JSON.stringify(mapping,null,2)+'\n');
for(const brand of ['chelas','barbadog']){
 const file=`${root}/src/data/${brand}.json`, data=JSON.parse(await fs.readFile(file,'utf8'));
 for(const p of data.items){const ref=mapping.find(r=>r.brand===brand&&r.id===p.id&&r.name===p.name);if(ref&&!p.imageUrl)p.imageUrl=ref.imageUrl;}
 await fs.writeFile(file,JSON.stringify(data,null,2)+'\n');
}
const quote=s=>"'"+s.replaceAll("'","''")+"'";
let sql='BEGIN;\nDO $$\nDECLARE changed integer;\nBEGIN\n';
let rollback='BEGIN;\n';
for(const ref of mapping){
 const match=`brand = ${quote(ref.brand)} AND external_id = ${quote(ref.id)} AND name = ${quote(ref.name)}`;
 sql+=`UPDATE brand_catalog_products SET image_url = ${quote(ref.imageUrl)} WHERE ${match} AND (image_url IS NULL OR image_url = '');\nGET DIAGNOSTICS changed = ROW_COUNT;\nIF changed <> 1 THEN RAISE EXCEPTION 'Product changed: ${ref.id}'; END IF;\n`;
 rollback+=`UPDATE brand_catalog_products SET image_url = NULL WHERE ${match} AND image_url = ${quote(ref.imageUrl)};\n`;
}
sql+='END $$;\nCOMMIT;\n';rollback+='COMMIT;\n';
await fs.writeFile(`${root}/docs/brand-images-2026-09/apply.sql`,sql);
await fs.writeFile(`${root}/docs/brand-images-2026-09/rollback.sql`,rollback);
console.log(`${mapping.length} products mapped`);
