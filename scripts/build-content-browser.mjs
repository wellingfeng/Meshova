import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const outputRoot = resolve("dist", "web-content");

function rewriteImports(source) {
  return source
    .replaceAll('from "meshova/pcg"', 'from "/dist/web-content/pcg/index.js"')
    .replaceAll('from "meshova/content"', 'from "/dist/web-content/content/index.js"')
    .replaceAll('from "meshova/core"', 'from "/dist/index.js"')
    .replaceAll('from "meshova"', 'from "/dist/index.js"')
    .replace(/\n\/\/# sourceMappingURL=.*$/gm, "");
}

async function copyJavascript(sourceDirectory, outputDirectory) {
  await mkdir(outputDirectory, { recursive: true });
  const entries = await readdir(sourceDirectory, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = resolve(sourceDirectory, entry.name);
    const outputPath = resolve(outputDirectory, entry.name);
    if (entry.isDirectory()) {
      await copyJavascript(sourcePath, outputPath);
    } else if (entry.name.endsWith(".js")) {
      const source = await readFile(sourcePath, "utf8");
      await writeFile(outputPath, rewriteImports(source), "utf8");
    }
  }
}

await rm(outputRoot, { recursive: true, force: true });
await copyJavascript(resolve("dist", "pcg"), resolve(outputRoot, "pcg"));
await copyJavascript(resolve("dist", "content"), resolve(outputRoot, "content"));
console.log("built browser PCG/content modules");
