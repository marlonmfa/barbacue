import sharp from 'sharp';
import fs from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const entries=JSON.parse(await fs.readFile(`${root}/docs/brand-images-2026-09/generated.json`,'utf8'));
const edits=JSON.parse(await fs.readFile(`${root}/docs/brand-images-2026-09/edits.json`,'utf8'));
const panels=[];
for(let i=0;i<entries.length;i++){
 const e=edits.find(x=>x.key===entries[i].key)??entries[i];
 const file=e.hint.match(/ as (\/[^\n]+\.png) by default/)[1];
 await sharp(file).resize({width:900,withoutEnlargement:true}).webp({quality:85}).toFile(`${root}/public/menu/brands-2026-09/${e.key}.webp`);
 panels.push({input:await sharp(file).resize(220,220,{fit:'contain',background:'#fff'}).png().toBuffer(),left:i%5*240,top:Math.floor(i/5)*255});
 panels.push({input:Buffer.from(`<svg width="240" height="35"><rect width="240" height="35" fill="white"/><text x="5" y="20" font-size="12">${i+1}. ${e.name.slice(0,30)}</text></svg>`),left:i%5*240,top:Math.floor(i/5)*255+220});
}
await sharp({create:{width:1200,height:Math.ceil(entries.length/5)*255,channels:3,background:'#fff'}}).composite(panels).png().toFile(`${root}/docs/brand-images-2026-09/contact-sheet.png`);
console.log('31 reviewed illustrations installed');
