import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const ROOT = resolve(__dirname, '../..');
const SCRIPT_PATH = join(ROOT, 'linuxdo-moyu/linuxdo-moyu.user.js');
const PORT = 8767;
const MIME = { '.html':'text/html; charset=utf-8', '.js':'application/javascript', '.css':'text/css', '.png':'image/png', '.jpg':'image/jpeg', '.svg':'image/svg+xml' };
const server = createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/shouye.html';
  const filePath = join(ROOT, pathname.replace(/^\//,''));
  if (!existsSync(filePath)) { res.writeHead(404); res.end('nf'); return; }
  res.writeHead(200, {'Content-Type': MIME[extname(filePath)]||'application/octet-stream'});
  res.end(readFileSync(filePath));
});
await new Promise(r => server.listen(PORT,'127.0.0.1',r));
const browser = await chromium.launch({headless:true});
const page = await browser.newPage({viewport:{width:1440,height:900}});
await page.addInitScript(() => {
  const store={};
  window.GM_getValue=(k,d)=>k in store?store[k]:d;
  window.GM_setValue=(k,v)=>{store[k]=v};
  window.GM_deleteValue=(k)=>{delete store[k]};
  window.GM_listValues=()=>Object.keys(store);
  window.GM_addStyle=(css)=>{const s=document.createElement('style');s.textContent=css;document.documentElement.appendChild(s)};
  window.GM_registerMenuCommand=()=>{};
  window.unsafeWindow=window;
});
const code = readFileSync(SCRIPT_PATH,'utf8').replace(/\/\/\s*==UserScript==[\s\S]*?\/\/\s*==\/UserScript==/,'');
await page.goto(`http://127.0.0.1:${PORT}/shouye.html`,{waitUntil:'domcontentloaded'});
await page.evaluate(src=>eval(src), code);
await page.waitForFunction(()=>!!window.__LDMY__);
await page.evaluate(()=>{
  const s=window.__LDMY__;
  s.normal.excelMode=true; s.advanced.excelTheme='tencent'; s.advanced.excelTitle='工作簿1'; s.applyAll();
});
await page.waitForTimeout(400);
const info = await page.evaluate(()=>{
  const headerBottom = document.querySelector('#ldmy-excel-root .ldmy-excel-header').getBoundingClientRect().bottom;
  const table = document.querySelector('table.topic-list');
  const all = [];
  const walk = (el, depth=0) => {
    if (!el || depth>6) return;
    const st = getComputedStyle(el);
    if (st.display==='none' || st.visibility==='hidden') return;
    const r = el.getBoundingClientRect();
    if (r.height < 8 || r.bottom <= headerBottom+1 || r.top >= (table?.getBoundingClientRect().top||0) - 1) {
      // still list children of large containers above table
    }
    if (r.top < (table?.getBoundingClientRect().top||9999) && r.bottom > headerBottom && r.height>=8 && r.width>50) {
      all.push({
        tag: el.tagName,
        id: el.id,
        cls: (el.className||'').toString().slice(0,80),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        h: Math.round(r.height),
        mt: st.marginTop,
        pt: st.paddingTop,
      });
    }
    [...el.children].slice(0,30).forEach(c=>walk(c, depth+1));
  };
  walk(document.body);
  // unique-ish sorted by top
  all.sort((a,b)=>a.top-b.top || b.h-a.h);
  return { headerBottom, tableTop: table?.getBoundingClientRect().top, items: all.slice(0,40) };
});
console.log(JSON.stringify(info,null,2));
await browser.close(); server.close();
