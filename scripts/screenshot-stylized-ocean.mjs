import { chromium } from "playwright";
import { createServer } from "node:http";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(process.cwd());
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
};

function startServer() {
  const server = createServer(async (request, response) => {
    try {
      const urlPath = decodeURIComponent((request.url || "/").split("?")[0]);
      const filePath = normalize(join(root, urlPath));
      if (!filePath.startsWith(root)) return response.writeHead(403).end();
      const info = await stat(filePath).catch(() => null);
      const target = info?.isDirectory() ? join(filePath, "index.html") : filePath;
      const body = await readFile(target);
      response.writeHead(200, { "content-type": mime[extname(target)] || "application/octet-stream" });
      response.end(body);
    } catch {
      response.writeHead(404).end("not found");
    }
  });
  return new Promise((resolveServer, reject) => {
    let port = 5460;
    const listen = () => {
      server.once("error", (error) => {
        if (error?.code === "EADDRINUSE" && port < 5500) {
          port++;
          listen();
        } else {
          reject(error);
        }
      });
      server.listen(port, "127.0.0.1", () => resolveServer({ server, port }));
    };
    listen();
  });
}

const { server, port } = await startServer();
const shellExecutable = chromium.executablePath();
const fullExecutable = shellExecutable
  .replace(/chromium_headless_shell-(\d+)/, "chromium-$1")
  .replace(/chrome-headless-shell-win64[\\/]chrome-headless-shell\.exe$/i, "chrome-win64\\chrome.exe");
const browser = await chromium.launch({
  executablePath: existsSync(fullExecutable) ? fullExecutable : undefined,
  headless: true,
  args: ["--use-gl=angle", "--ignore-gpu-blocklist", "--headless=new"],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5 });
const errors = [];
page.on("pageerror", (error) => errors.push(String(error)));
page.on("console", (message) => {
  if (message.type() === "error") errors.push(message.text());
});

await page.goto(`http://127.0.0.1:${port}/web/stylized-ocean.html?clean=1`, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForFunction(() => window.__meshovaOcean?.ready, null, { timeout: 120000 });
const outDir = join(root, "out", "shots");
await mkdir(outDir, { recursive: true });
for (const shot of [{ name: "day", hour: 13.2, time: 18 }, { name: "night", hour: 22.5, time: 38 }]) {
  await page.evaluate(({ hour, time }) => {
    window.__meshovaOcean.setTimeOfDay(hour);
    window.__meshovaOcean.setFxTime(time);
  }, shot);
  await page.waitForTimeout(350);
  await page.locator("canvas").screenshot({ path: join(outDir, `stylized-ocean-${shot.name}.png`) });
}
const stats = await page.evaluate(() => window.__meshovaOcean.stats());
await browser.close();
server.close();
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(JSON.stringify(stats));
console.log("captured out/shots/stylized-ocean-{day,night}.png");
