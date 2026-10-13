import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
const base=new URL('../',import.meta.url), docs=new URL('docs/brand-images-2026-09/',base);
const mapping=JSON.parse(await fs.readFile(new URL('src/data/generated-brand-images.json',base),'utf8'));
const domains={barbacue:'barbacue.cog.ia.br',chelas:'chelas.hirableaiagents.com',barbadog:'barbadog.hirableaiagents.com'};
const hash=b=>createHash('sha256').update(b).digest('hex');
const report={icons:[],images:[],catalogs:[],browser:[]};
for(const [brand,domain] of Object.entries(domains)){
 const html=await (await fetch(`https://${domain}/`)).text();
 assert(html.includes(`/brand/icons/${brand}-icon.png?v=20260920`),`${brand} icon metadata`);
 for(const kind of ['icon','apple']){
  const path=`/brand/icons/${brand}-${kind}.png`, response=await fetch(`https://${domain}${path}?v=20260920`);
  assert.equal(response.status,200);const actual=hash(Buffer.from(await response.arrayBuffer()));
  assert.equal(actual,hash(await fs.readFile(new URL(`public${path}`,base))));report.icons.push({brand,kind,hash:actual});
 }
 if(brand==='barbacue')continue;
 const data=await (await fetch(`https://${domain}/api/products`)).json();
 const before=JSON.parse(await fs.readFile(new URL(`${brand}-before.json`,docs),'utf8'));
 const expected=mapping.filter(x=>x.brand===brand);
 for(const group of before)for(const product of group.products){
  const current=data.flatMap(g=>g.products).find(p=>p.id===product.id);assert(current);
  const image=expected.find(x=>x.name===product.name);
  assert.deepEqual(current,{...product,...(image?{imageUrl:image.imageUrl}:{})},`Only intended image field changes: ${product.name}`);
 }
 report.catalogs.push({brand,updated:expected.length,total:data.flatMap(g=>g.products).length});
 await fs.writeFile(new URL(`${brand}-after.json`,docs),JSON.stringify(data,null,2));
}
for(const path of new Set(mapping.map(x=>x.imageUrl))){
 const response=await fetch(`https://barbacue.cog.ia.br${path}`);assert.equal(response.status,200,path);
 const actual=hash(Buffer.from(await response.arrayBuffer()));assert.equal(actual,hash(await fs.readFile(new URL(`public${path}`,base))));report.images.push({path,hash:actual});
}
const browser=await chromium.launch({headless:true});
try{
 for(const brand of ['chelas','barbadog']){
  const page=await browser.newPage({viewport:{width:390,height:844}});
  await page.goto(`https://${domains[brand]}/`,{waitUntil:'networkidle'});
  const cards=page.locator('img[src^="/menu/brands-2026-09/"]');
  assert.equal(await cards.count(),mapping.filter(x=>x.brand===brand).length);
  for(const image of await cards.all()) {await image.scrollIntoViewIfNeeded(); await image.evaluate(el=>el.decode());}
  const first=cards.first();await first.scrollIntoViewIfNeeded();
  assert.equal(await first.evaluate(el=>getComputedStyle(el).objectFit),'contain');
  assert.equal(await first.evaluate(el=>el.parentElement.querySelector('.brand-image-caption')?.textContent ?? getComputedStyle(el.parentElement,'::after').content.replaceAll('"','')), 'Imagem ilustrativa');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.screenshot({path:new URL(`${brand}-mobile.png`,docs).pathname});
  report.browser.push({brand,loaded:await cards.count(),overflow:false,illustrationLabel:true});await page.close();
 }
}finally{await browser.close();}
await fs.writeFile(new URL('verification.json',docs),JSON.stringify(report,null,2));
console.log(JSON.stringify({icons:report.icons.length,images:report.images.length,catalogs:report.catalogs,browser:report.browser},null,2));
