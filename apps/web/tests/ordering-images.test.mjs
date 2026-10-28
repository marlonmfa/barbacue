import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const images=JSON.parse(readFileSync(new URL('../src/data/pedir-product-images.json',import.meta.url)));
const source=readFileSync(new URL('../src/lib/ordering-images.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true}}).outputText;
const context={exports:{},require(name){assert.equal(name,'@/data/pedir-product-images.json');return images;}};
vm.runInNewContext(compiled,context);
const {orderingImage}=context.exports;

test('reviewed photos match the exact restaurant, product, name and original upload',()=>{
  for(const image of images){
    const product={id:image.productId,name:image.name,imageUrl:image.originalImageUrl};
    assert.equal(orderingImage(image.brand,product).src,image.imageUrl);
    assert.equal(orderingImage(image.brand,{...product,imageUrl:image.imageUrl}).src,image.imageUrl);
    assert.equal(orderingImage(image.brand,{...product,imageUrl:'/uploads/new-owner-photo.jpg'}).src,'/uploads/new-owner-photo.jpg');
    assert.equal(orderingImage(image.brand,{...product,name:'New recipe'}).src,product.imageUrl);
  }
});
test('unknown products and missing photos preserve the catalog fallback',()=>{
  assert.equal(orderingImage('barbacue',{id:-1,name:'New item',imageUrl:null}).src,null);
  assert.equal(orderingImage('chelas',{id:-1,name:'New item',imageUrl:'https://example.com/photo.jpg'}).src,'https://example.com/photo.jpg');
});
test('every reviewed association has one packaged asset and one unambiguous restaurant id',()=>{
  const keys=new Set();
  for(const image of images){
    const key=`${image.brand}:${image.productId}`;
    assert(!keys.has(key),key);keys.add(key);
    if(image.imageUrl.startsWith('/'))assert(existsSync(new URL('../public'+image.imageUrl,import.meta.url)),image.imageUrl);
  }
});
