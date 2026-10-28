// Native Node 22 type stripping; resolve the same relative TS imports as Next.
// No runtime dependency or production loader is installed by this QA helper.
import { registerHooks } from 'node:module';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
registerHooks({resolve(specifier,context,next){
 if((specifier.startsWith('./')||specifier.startsWith('../')) && context.parentURL && !/\.[a-z]+$/i.test(specifier)) {
  const target=new URL(specifier+'.ts',context.parentURL);
  if(existsSync(fileURLToPath(target)))return next(target.href,context);
 }
 return next(specifier,context);
}});
