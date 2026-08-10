import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const metablock = JSON.parse(fs.readFileSync(path.join(__dirname, 'metablock.json'), 'utf8'));

function buildBanner(meta) {
  const lines = ['// ==UserScript=='];
  const push = (k, v) => lines.push(`// @${k.padEnd(13)} ${v}`);
  push('name', meta.name);
  push('namespace', meta.namespace);
  push('version', meta.version);
  push('description', meta.description);
  push('author', meta.author);
  push('license', meta.license);
  for (const m of meta.match || []) push('match', m);
  if (meta.icon) push('icon', meta.icon);
  for (const g of meta.grant || []) push('grant', g);
  if (meta['run-at']) push('run-at', meta['run-at']);
  lines.push('// ==/UserScript==');
  lines.push('');
  return lines.join('\n');
}

/** Import .css as default-exported string */
function cssStringPlugin() {
  return {
    name: 'css-as-string',
    transform(code, id) {
      if (!id.endsWith('.css')) return null;
      return {
        code: `export default ${JSON.stringify(code)};`,
        map: { mappings: '' },
      };
    },
  };
}

/** After bundle, also copy to root linuxdo-moyu.user.js for GF compatibility */
function syncRootPlugin() {
  return {
    name: 'sync-root-userscript',
    writeBundle(_opts, bundle) {
      for (const file of Object.values(bundle)) {
        if (file.type === 'chunk' && file.fileName.endsWith('.user.js')) {
          const out = path.join(__dirname, 'linuxdo-moyu.user.js');
          fs.writeFileSync(out, file.code);
          console.log('[sync] wrote linuxdo-moyu.user.js');
        }
      }
    },
  };
}

export default {
  input: 'src/main.js',
  output: {
    file: 'dist/linuxdo-moyu.user.js',
    format: 'iife',
    banner: buildBanner(metablock),
    generatedCode: 'es2015',
    strict: false,
  },
  plugins: [cssStringPlugin(), syncRootPlugin()],
  onwarn(warning, warn) {
    if (warning.code === 'THIS_IS_UNDEFINED') return;
    warn(warning);
  },
};
