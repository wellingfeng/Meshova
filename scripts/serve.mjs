/**
 * Zero-dependency static server for the Meshova viewer.
 *
 * Serves the repo root so the viewer (/web), vendored three.js (/web/vendor)
 * and generated models (/out) are all reachable. Run: pnpm view
 */
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, resolve } from "node:path";

const ROOT = resolve(process.cwd());
const PORT = process.env.PORT ? Number(process.env.PORT) : 5173;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".obj": "text/plain; charset=utf-8",
  ".mtl": "text/plain; charset=utf-8",
};

const server = createServer(async (req, res) => {
  try {
    let urlPath = decodeURIComponent((req.url || "/").split("?")[0]);
    if (urlPath === "/favicon.ico") { res.writeHead(204).end(); return; }
    if (urlPath === "/") urlPath = "/web/gallery.html";
    // Prevent path traversal: resolve and confirm it stays under ROOT.
    const filePath = normalize(join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end("forbidden");
      return;
    }
    const info = await stat(filePath).catch(() => null);
    const target = info?.isDirectory() ? join(filePath, "index.html") : filePath;
    const body = await readFile(target);
    const mime = MIME[extname(target)] || "application/octet-stream";
    res.writeHead(200, { "content-type": mime, "cache-control": "no-store, no-cache, must-revalidate", "pragma": "no-cache" });
    res.end(body);
  } catch {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
});

server.listen(PORT, () => {
  console.log(`\n  Meshova viewer  ->  http://localhost:${PORT}/\n`);
  console.log(`  根目录: ${ROOT}`);
  console.log(`  模型来自 out/models.json，改完模型刷新页面即可。\n`);
});
