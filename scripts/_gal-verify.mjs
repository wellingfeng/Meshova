import { chromium } from "playwright";
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const MIME = { ".html":"text/html", ".js":"text/javascript", ".json":"application/json", ".png":"image/png", ".css":"text/css", ".wasm":"application/wasm", ".map":"application/json" };

const server = createServer(async (req, res) => {
  try {
    let p = decodeURIComponent((req.url||"/").split("?")[0]);
    if (p === "/favicon.ico") return res.writeHead(204).end();
    if (p === "/") p = "/web/gallery.html";
    const fp = normalize(join(ROOT, p));
    if (!fp.startsWith(ROOT)) return res.writeHead(403).end();
    const info = await stat(fp).catch(()=>null);
    const target = info?.isDirectory() ? join(fp,"index.html") : fp;
    const body = await readFile(target);
    res.writeHead(200, { "content-type": MIME[extname(target)]||"application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404).end("not found"); }
});
const port = await new Promise((r)=>server.listen(5395,"127.0.0.1",()=>r(5395)));

const shell = chromium.executablePath();
const full = shell.replace(/chromium_headless_shell-(\d+)/,"chromium-$1").replace(/chrome-headless-shell-win64[\/]chrome-headless-shell\.exe$/i,"chrome-win64\chrome.exe");
const browser = await chromium.launch({ executablePath: existsSync(full)?full:undefined, headless:true, args:["--use-gl=angle","--ignore-gpu-blocklist","--headless=new"] });
const page = await browser.newPage({ viewport:{width:1280,height:800} });
const errs=[]; page.on("pageerror",e=>errs.push(String(e)));
await page.goto(`http://localhost:${port}/web/gallery.html`,{waitUntil:"networkidle"});
await page.waitForTimeout(3500);
// dump first 6 card titles to confirm ordering
const titles = await page.evaluate(()=>[...document.querySelectorAll("#grid .card")].slice(0,6).map(c=>{
  const t=c.querySelector(".title,.name,h3,.card-title"); return (t?t.textContent:c.textContent||"").trim().slice(0,20);
}));
console.log("first cards:", titles);
console.log("errors:", errs.length?errs:"none");
await page.screenshot({ path:"out/shots/_gallery-top.png" });
console.log("shot -> out/shots/_gallery-top.png");
await browser.close();
server.close();
