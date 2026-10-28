import { createServer } from 'node:http';
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { db } from '../../src/db';
import { PgDialect } from 'drizzle-orm/pg-core';
import { readAISettings, saveAISettings, publicAISettings } from '../../src/lib/ai-settings';
const require = createRequire(import.meta.url);
process.env.AI_ENCRYPTION_KEY = 'barbacue-e2e-only-encryption-key-32-characters';
let encrypted: string | undefined;
(db as any).execute = async (query: any) => {
  const params = new PgDialect().sqlToQuery(query).params;
  if (params.length) encrypted = params[0];
  return { rows: encrypted ? [{ encrypted_value: encrypted }] : [] };
};
let defaults: Record<string,string> = {};
try { defaults = require('dotenv').parse(readFileSync('/Users/marlonalcantara/Repos/.env.default')); } catch {}
const email = process.env.TEST_USER_EMAIL || defaults.TEST_USER_EMAIL || 'teste@teste.com';
const password = process.env.TEST_USER_PASSWORD || defaults.TEST_USER_PASSWORD || 'teste123';
const js = await build({stdin:{contents:`import React from 'react';import{createRoot}from'react-dom/client';import Form from './apps/web/src/app/admin/system/ai-provider-settings';fetch('/api/admin/system').then(r=>r.json()).then(initial=>createRoot(document.getElementById('root')).render(<main style={{maxWidth:850,margin:'40px auto',padding:20}}><h1 style={{fontSize:28,marginBottom:20}}>Sistema · Barbacue</h1><Form initial={initial}/></main>));`,resolveDir:process.cwd(),loader:'tsx'},bundle:true,write:false,format:'iife',jsx:'automatic'});
const postcss = require('postcss');
const tailwind = require('@tailwindcss/postcss');
const css = await postcss([tailwind({base:resolve('apps/web')})]).process(readFileSync('apps/web/src/app/globals.css','utf8'),{from:resolve('apps/web/src/app/globals.css')});
async function body(req: any) { let text='';for await(const part of req)text+=part;return JSON.parse(text||'{}'); }
createServer(async (req,res)=>{
 const url=req.url?.split('?')[0];
 try {
  if(url==='/test-login'&&req.method==='POST'){const input=await body(req);if(input.email!==email||input.password!==password){res.writeHead(401).end();return;}res.setHeader('Set-Cookie','ai_test_admin=valid; HttpOnly; SameSite=Strict; Path=/');res.end('{}');return;}
  if(url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(js.outputFiles[0].text);return;}
  if(url==='/app.css'){res.setHeader('Content-Type','text/css');res.end(css.css);return;}
  if(url==='/api/admin/system'){
   if(!req.headers.cookie?.includes('ai_test_admin=valid')){res.writeHead(401).end('{}');return;}
   res.setHeader('Content-Type','application/json');
   if(req.method==='PUT'){if(req.headers.origin!=='http://127.0.0.1:5289'){res.writeHead(403).end('{}');return;}res.end(JSON.stringify(await saveAISettings(await body(req))));return;}
   res.end(JSON.stringify(publicAISettings(await readAISettings())));return;
  }
  res.setHeader('Content-Type','text/html');res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"><div id="root"></div><script src="/app.js"></script></html>');
 }catch{res.writeHead(500).end('{}');}
}).listen(5289,'127.0.0.1');
