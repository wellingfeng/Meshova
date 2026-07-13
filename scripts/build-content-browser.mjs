import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const outputRoot = resolve("dist", "web-content");

function importPath(fromFile, toFile) {
  const path = relative(dirname(fromFile), toFile).replaceAll("\\", "/");
  return path.startsWith(".") ? path : `./${path}`;
}

function rewriteImports(source, outputPath) {
  const pcgPath = importPath(outputPath, resolve(outputRoot, "pcg", "index.js"));
  const contentPath = importPath(outputPath, resolve(outputRoot, "content", "index.js"));
  const corePath = importPath(outputPath, resolve("dist", "index.js"));
  return source
    .replaceAll('from "meshova/pcg"', `from "${pcgPath}"`)
    .replaceAll('from "meshova/content"', `from "${contentPath}"`)
    .replaceAll('from "meshova/core"', `from "${corePath}"`)
    .replaceAll('from "meshova"', `from "${corePath}"`)
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
      const output = rewriteImports(source, outputPath);
      if (/(?:from\s+|import\()\s*["']\/dist\//.test(output)) {
        throw new Error(`absolute browser import: ${outputPath}`);
      }
      await writeFile(outputPath, output, "utf8");
    }
  }
}

await rm(outputRoot, { recursive: true, force: true });
await copyJavascript(resolve("dist", "pcg"), resolve(outputRoot, "pcg"));
await copyJavascript(resolve("dist", "content"), resolve(outputRoot, "content"));
console.log("built browser PCG/content modules");
