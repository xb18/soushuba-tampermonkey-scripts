import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCRIPT_PATH = join(ROOT, 'linuxdo-moyu/linuxdo-moyu.user.js');
const PORT = 8766;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
};

const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/shouye.html';
  const filePath = join(ROOT, pathname.replace(/^\//, ''));
  if (!filePath.startsWith(ROOT) || !existsSync(filePath)) {
    res.writeHead(404); res.end('nf'); return;
  }
  res.writeHead(200, { 'Content-Type': MIME[extname(filePath)] || 'application/octet-stream' });
  res.end(readFileSync(filePath));
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.addInitScript(() => {
  const store = {};
  window.GM_getValue = (k, d) => (k in store ? store[k] : d);
  window.GM_setValue = (k, v) => { store[k] = v; };
  window.GM_deleteValue = (k) => { delete store[k]; };
  window.GM_listValues = () => Object.keys(store);
  window.GM_addStyle = (css) => {
    const s = document.createElement('style');
    s.textContent = css;
    document.documentElement.appendChild(s);
  };
  window.GM_registerMenuCommand = () => {};
  window.GM_xmlhttpRequest = () => {};
  window.unsafeWindow = window;
});

const code = readFileSync(SCRIPT_PATH, 'utf8').replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/, '');
await page.goto(`http://127.0.0.1:${PORT}/shouye.html`, { waitUntil: 'domcontentloaded' });
await page.evaluate((src) => { eval(src); }, code);
await page.waitForFunction(() => !!window.__LDMY__, null, { timeout: 5000 });

for (const theme of ['tencent', 'office']) {
  await page.evaluate((t) => {
    const s = window.__LDMY__;
    s.normal.excelMode = true;
    s.advanced.excelTheme = t;
    s.advanced.excelTitle = '工作簿1';
    s.advanced.excelShowRowIndex = true;
    s.applyAll();
  }, theme);
  await page.waitForTimeout(500);
  const path = join(__dirname, `excel-${theme}-v2.png`);
  await page.screenshot({ path, fullPage: false });
  const meta = await page.evaluate(() => ({
    headerH: getComputedStyle(document.querySelector('#ldmy-excel-root .ldmy-excel-header')).height,
    padTop: getComputedStyle(document.querySelector('#main-outlet') || document.body).paddingTop,
    icons: document.querySelectorAll('#ldmy-excel-root .ldmy-excel-ico').length,
    slices: document.querySelectorAll('#ldmy-excel-root img.ldmy-excel-slice').length,
    gap: (() => {
      const h = document.querySelector('#ldmy-excel-root .ldmy-excel-header');
      const table = document.querySelector('table.topic-list');
      if (!h || !table) return null;
      return table.getBoundingClientRect().top - h.getBoundingClientRect().bottom;
    })(),
  }));
  console.log('saved', theme, path, meta);
}

await browser.close();
server.close();
