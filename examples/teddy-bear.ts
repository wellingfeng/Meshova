/**
 * Cartoon teddy bear — built purely from Meshova geometry primitives.
 *
 * Demonstrates the P1 geometry core: sphere/box primitives, transforms,
 * per-part coloring, and OBJ scene export. Pure procedural, zero art assets.
 *
 * Run: pnpm tsx examples/teddy-bear.ts   (or build + node dist)
 */
import {
  sphere,
  box,
  transform,
  scaleMesh,
  vec3,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const FUR: [number, number, number] = [0.55, 0.36, 0.18]; // warm brown
const FUR_LIGHT: [number, number, number] = [0.78, 0.6, 0.4]; // muzzle / inner ear / paws
const DARK: [number, number, number] = [0.07, 0.05, 0.04]; // eyes / nose

const parts: NamedPart[] = [];
function add(name: string, mesh: NamedPart["mesh"], color: [number, number, number]) {
  parts.push({ name, mesh, color });
}

// Body: a rounded barrel (sphere squashed taller).
add("body", scaleMesh(sphere(1, 28, 22), vec3(0.85, 1.05, 0.8)), FUR);

// Belly patch: lighter, slightly in front.
add(
  "belly",
  transform(sphere(0.55, 24, 18), { scale: vec3(0.7, 0.85, 0.5), translate: vec3(0, -0.05, 0.55) }),
  FUR_LIGHT,
);

// Head: big round sphere on top.
const headY = 1.45;
add("head", transform(sphere(0.75, 28, 22), { translate: vec3(0, headY, 0.05) }), FUR);

// Ears: two flattened spheres up top, with lighter inner ears.
for (const side of [-1, 1] as const) {
  add(
    `ear_${side}`,
    transform(sphere(0.3, 18, 14), {
      scale: vec3(1, 1, 0.55),
      translate: vec3(0.5 * side, headY + 0.55, 0.0),
    }),
    FUR,
  );
  add(
    `ear_inner_${side}`,
    transform(sphere(0.17, 16, 12), {
      scale: vec3(1, 1, 0.45),
      translate: vec3(0.5 * side, headY + 0.55, 0.12),
    }),
    FUR_LIGHT,
  );
}

// Muzzle: light rounded snout pushed forward.
add(
  "muzzle",
  transform(sphere(0.34, 22, 16), { scale: vec3(1.1, 0.85, 0.9), translate: vec3(0, headY - 0.12, 0.62) }),
  FUR_LIGHT,
);

// Nose: small dark box on the muzzle tip.
add(
  "nose",
  transform(box(0.16, 0.12, 0.12), { translate: vec3(0, headY - 0.06, 0.92) }),
  DARK,
);

// Eyes: two small dark spheres.
for (const side of [-1, 1] as const) {
  add(
    `eye_${side}`,
    transform(sphere(0.1, 14, 10), { translate: vec3(0.26 * side, headY + 0.16, 0.66) }),
    DARK,
  );
}

// Arms: stubby spheres on the sides, angled down.
for (const side of [-1, 1] as const) {
  add(
    `arm_${side}`,
    transform(sphere(0.34, 18, 14), {
      scale: vec3(0.55, 0.9, 0.55),
      rotate: vec3(0, 0, side * 0.5),
      translate: vec3(0.85 * side, 0.25, 0.1),
    }),
    FUR,
  );
  // paw pad
  add(
    `paw_${side}`,
    transform(sphere(0.16, 14, 10), { translate: vec3(1.0 * side, -0.25, 0.25) }),
    FUR_LIGHT,
  );
}

// Legs: chunky spheres at the bottom.
for (const side of [-1, 1] as const) {
  add(
    `leg_${side}`,
    transform(sphere(0.42, 20, 16), {
      scale: vec3(0.7, 0.85, 0.85),
      translate: vec3(0.45 * side, -0.95, 0.1),
    }),
    FUR,
  );
  // foot pad (front of each foot)
  add(
    `footpad_${side}`,
    transform(sphere(0.2, 14, 10), { scale: vec3(1, 0.7, 1), translate: vec3(0.45 * side, -1.05, 0.5) }),
    FUR_LIGHT,
  );
}

const { obj, mtl } = toOBJScene(parts, "teddy-bear.mtl");
const model = toViewerModel(parts, "teddy-bear");

// Write files (Node only).
const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "teddy-bear.obj"), obj);
fs.writeFileSync(path.join(outDir, "teddy-bear.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "teddy-bear.json"), JSON.stringify(model));

// Manifest: the viewer reads this to list every available model.
const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = {
  models: [],
};
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "teddy-bear", name: "卡通小熊", file: "teddy-bear.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `teddy bear: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log(`written: out/teddy-bear.{obj,mtl,json} + out/models.json`);
