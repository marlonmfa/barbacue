import { build } from 'esbuild';
import postcss from 'postcss';
import tailwind from '@tailwindcss/postcss';
import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const web = fileURLToPath(new URL('../../web/', import.meta.url));
const outdir = join(root, 'ui/renderer');
await mkdir(outdir, { recursive: true });
const result = await build({ entryPoints: [join(root, 'renderer/app.tsx')], outdir, entryNames: 'app',
  bundle: true, platform: 'browser', format: 'esm', target: 'chrome142', jsx: 'automatic', minify: true, metafile: true,
  define: { 'process.env.NODE_ENV': '"production"' },
  alias: { '@': join(web, 'src'), 'next/link': join(root, 'renderer/link.tsx'), 'next/image': join(root, 'renderer/image.tsx'), 'next/navigation': join(root, 'renderer/navigation.ts') },
  loader: { '.module.css': 'local-css' },
  plugins: [{ name: 'local-administration', setup(builder) {
    builder.onLoad({ filter: /admin\/tables\/page\.tsx$/ }, async args => ({ loader: 'tsx', contents: (await readFile(args.path, 'utf8')).replace('setOrigin(window.location.origin)', 'setOrigin(window.__BARBACUE_API_ORIGIN__)') }));
    builder.onResolve({ filter: /^(node:|pg$|drizzle-orm|next\/server|next\/headers|@\/db(?:\/|$)|@\/lib\/(?:admin-auth|staff-auth|erp|managed-catalog)$)/ }, args => ({ errors: [{ text: `Código do servidor não pode entrar no desktop: ${args.path}` }] }));
  } }], logLevel: 'warning',
});
const css = await postcss([tailwind({ base: root })]).process('@import "tailwindcss";\n@source "../../web/src";\n@source "../renderer";\n', { from: join(root, 'renderer/tailwind.css') });
await writeFile(join(outdir, 'tailwind.css'), css.css);
await cp(join(web, 'public/brand'), join(outdir, 'brand'), { recursive: true });
await writeFile(join(outdir, 'build.json'), JSON.stringify({ inputs: Object.keys(result.metafile.inputs).sort() }, null, 2));
console.log(`Telas locais compiladas (${Object.keys(result.metafile.inputs).length} fontes). Nenhum servidor ou banco incluído.`);
