import {createServer}from 'node:http';import fs from 'node:fs/promises';import path from 'node:path';
if(process.env.BARBACUE_DISPOSABLE_QA!=='1')throw Error('QA only');
const root=path.resolve(import.meta.dirname,'../../../test-screenshots');await fs.mkdir(root,{recursive:true});
const server=createServer(async(req,res)=>{try{if(req.method!=='POST'||!/^\/gestao-native-cog-[a-z-]+-2026-10-27\.png$/.test(req.url))throw Error('route');let size=0;const chunks=[];for await(const chunk of req){size+=chunk.length;if(size>8e6)throw Error('size');chunks.push(chunk);}const png=Buffer.concat(chunks);if(png.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('PNG');await fs.writeFile(path.join(root,req.url.slice(1)),png);res.writeHead(201).end();}catch{res.writeHead(400).end();}});
server.listen(54801,'127.0.0.1',()=>console.log('QA screenshot receiver ready'));
