import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const dist = path.join(root, 'dist/linuxdo-moyu.user.js');
const dest = path.join(root, 'linuxdo-moyu.user.js');
if (!fs.existsSync(dist)) {
  console.error('dist missing; run npm run build first');
  process.exit(1);
}
fs.copyFileSync(dist, dest);
console.log('synced dist -> linuxdo-moyu.user.js');
