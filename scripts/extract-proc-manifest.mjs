import { readFile, writeFile } from "node:fs/promises";
import ts from "typescript";

const SOURCE = "web/procmodels.js";
const OUTPUT = "web/procmodels-manifest.json";

function evalLiteral(node) {
  if (!node) return undefined;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isArrayLiteralExpression(node)) return node.elements.map(evalLiteral);
  if (ts.isObjectLiteralExpression(node)) {
    const obj = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop) && ts.isIdentifier(prop.name)) {
        obj[prop.name.text] = evalLiteral(prop.initializer);
      } else if (ts.isPropertyAssignment(prop) && ts.isStringLiteral(prop.name)) {
        obj[prop.name.text] = evalLiteral(prop.initializer);
      }
    }
    return obj;
  }
  return undefined;
}

function findStringProp(props, key) {
  const prop = props.find(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key && ts.isStringLiteral(p.initializer)
  );
  return prop ? prop.initializer.text : undefined;
}

function findProp(props, key) {
  const prop = props.find(
    (p) => ts.isPropertyAssignment(p) && ts.isIdentifier(p.name) && p.name.text === key
  );
  return prop ? evalLiteral(prop.initializer) : undefined;
}

function extractModelManifests(sourceText) {
  const sourceFile = ts.createSourceFile(
    SOURCE,
    sourceText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS
  );

  const models = [];
  const seen = new Set();

  function visit(node) {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        if (!decl.initializer || !ts.isObjectLiteralExpression(decl.initializer)) continue;
        const props = decl.initializer.properties;
        const id = findStringProp(props, "id");
        const name = findStringProp(props, "name");
        if (!id || !name) continue;
        if (seen.has(id)) continue;
        seen.add(id);
        const category = findStringProp(props, "category") || "";
        const critiqueGoal = findStringProp(props, "critiqueGoal") || "";
function simplifySchema(schema) {
  if (!Array.isArray(schema)) return [];
  return schema
    .filter((entry) => entry && typeof entry.key === "string")
    .map((entry) => ({ key: entry.key, default: entry.default }));
}

        const assetMeta = findProp(props, "assetMeta") || {};
        const schema = findProp(props, "schema") || [];
        models.push({
          id,
          name,
          category,
          critiqueGoal,
          assetMeta,
          schema: simplifySchema(schema),
        });
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return models;
}

const sourceText = await readFile(SOURCE, "utf8");
const models = extractModelManifests(sourceText);
models.sort((a, b) => a.id.localeCompare(b.id));

const manifest = {
  generatedAt: new Date().toISOString(),
  count: models.length,
  models,
};

await writeFile(OUTPUT, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`extracted ${models.length} proc models to ${OUTPUT}`);
