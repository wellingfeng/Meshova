import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesBelow(path));
    else if (/\.(?:ts|js|mjs)$/.test(entry.name)) files.push(path);
  }
  return files;
}

const rules = [
  { directory: resolve("src"), forbidden: [/from\s+["'](?:meshova\/)?(?:pcg|content)(?:\/[^"']*)?["']/] },
  { directory: resolve("pcg"), forbidden: [/from\s+["'](?:meshova\/)?content(?:\/[^"']*)?["']/] },
];
const failures = [];
for (const rule of rules) {
  for (const file of await filesBelow(rule.directory)) {
    const source = await readFile(file, "utf8");
    for (const pattern of rule.forbidden) {
      if (pattern.test(source)) failures.push(`${file}: forbidden dependency ${pattern}`);
    }
  }
}
if (failures.length) throw new Error(failures.join("\n"));
console.log("PCG dependency boundaries valid");
