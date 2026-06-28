/**
 * Black office chair — procedural reference model based on the Sketchfab page:
 * https://sketchfab.com/3d-models/office-chair-622d4d7e7fcd449a9646626b46127749
 *
 * Run: pnpm office-chair
 */
import {
  box,
  cylinder,
  catmullClark,
  indentCreases,
  transform,
  merge,
  bezier,
  sweep,
  vec3,
  toOBJScene,
  toViewerModel,
  type NamedPart,
} from "../src/index.js";

const LEATHER: [number, number, number] = [0.012, 0.017, 0.016];
const LEATHER_HI: [number, number, number] = [0.03, 0.04, 0.038];
const FRAME: [number, number, number] = [0.015, 0.018, 0.018];
const METAL: [number, number, number] = [0.18, 0.19, 0.18];

const parts: NamedPart[] = [];

function roundedBox(w: number, h: number, d: number, iter = 1) {
  return catmullClark(box(w, h, d), iter);
}

function add(name: string, mesh: NamedPart["mesh"], color: [number, number, number], surface?: NamedPart["surface"]) {
  parts.push({ name, mesh, color, surface });
}

function leather(name: string, mesh: NamedPart["mesh"], color = LEATHER) {
  add(name, mesh, color, {
    type: "leather",
    params: { color, roughness: 0.72, grainScale: 96, grainStrength: 0.28, normalStrength: 0.45, clearcoat: 0.08 },
  });
}

function plastic(name: string, mesh: NamedPart["mesh"], color = FRAME) {
  add(name, mesh, color, { type: "plastic", params: { color, roughness: 0.76 } });
}

const seatW = 1.65;
const seatD = 1.35;
const seatH = 0.24;
const seatY = 1.02;
const backW = 1.22;
const backH = 2.2;
const backT = 0.18;
const backTilt = -0.12;
const backY = seatY + backH * 0.48;
const backZ = -seatD * 0.42;
const frontBackZ = backZ + backT * 0.58;

const seatTop = seatH * 0.5;
const seatMesh = indentCreases(
  roundedBox(seatW, seatH, seatD, 3),
  [
    { from: vec3(-seatW * 0.2, seatTop, -seatD * 0.16), to: vec3(-seatW * 0.17, seatTop, seatD * 0.28), depth: 0.018, width: 0.035 },
    { from: vec3(0.02, seatTop, -seatD * 0.1), to: vec3(0, seatTop, seatD * 0.24), depth: 0.014, width: 0.03 },
    { from: vec3(seatW * 0.22, seatTop, -seatD * 0.12), to: vec3(seatW * 0.17, seatTop, seatD * 0.2), depth: 0.012, width: 0.032 },
    { from: vec3(-seatW * 0.26, seatTop, seatD * 0.04), to: vec3(seatW * 0.28, seatTop, seatD * 0.01), depth: 0.012, width: 0.036 },
  ],
  { direction: vec3(0, -1, 0), surfaceNormal: vec3(0, 1, 0), normalThreshold: 0.35 },
);
leather("seat_cushion", transform(seatMesh, { translate: vec3(0, seatY, 0.08) }));
leather(
  "front_lip",
  transform(cylinder(0.075, seatW * 0.86, 24, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(0, seatY - 0.01, 0.08 + seatD * 0.48),
  }),
  LEATHER_HI,
);

const backFront = backT * 0.5;
const backMesh = indentCreases(
  roundedBox(backW, backH, backT, 3),
  [
    { from: vec3(-backW * 0.18, -backH * 0.28, backFront), to: vec3(-backW * 0.15, backH * 0.18, backFront), depth: 0.018, width: 0.03 },
    { from: vec3(backW * 0.18, -backH * 0.24, backFront), to: vec3(backW * 0.14, backH * 0.16, backFront), depth: 0.016, width: 0.03 },
    { from: vec3(-backW * 0.28, backH * 0.02, backFront), to: vec3(backW * 0.27, backH * -0.01, backFront), depth: 0.013, width: 0.035 },
    { from: vec3(-backW * 0.24, -backH * 0.18, backFront), to: vec3(backW * 0.22, -backH * 0.2, backFront), depth: 0.012, width: 0.034 },
  ],
  { direction: vec3(0, 0, -1), surfaceNormal: vec3(0, 0, 1), normalThreshold: 0.3 },
);
leather(
  "back_outer",
  transform(backMesh, {
    rotate: vec3(backTilt, 0, 0),
    translate: vec3(0, backY, backZ),
  }),
);
leather(
  "head_panel",
  transform(roundedBox(backW * 0.78, backH * 0.22, backT * 0.7, 1), {
    rotate: vec3(backTilt, 0, 0),
    translate: vec3(0, backY + backH * 0.32, frontBackZ + 0.035),
  }),
  LEATHER_HI,
);
leather(
  "lumbar_panel",
  transform(roundedBox(backW * 0.86, backH * 0.16, backT * 0.66, 1), {
    rotate: vec3(backTilt, 0, 0),
    translate: vec3(0, backY - backH * 0.27, frontBackZ + 0.035),
  }),
  LEATHER_HI,
);
for (const side of [-1, 1] as const) {
  leather(
    `side_bolster_${side}`,
    transform(roundedBox(backW * 0.16, backH * 0.72, backT * 0.62, 1), {
      rotate: vec3(backTilt, 0, 0),
      translate: vec3(side * backW * 0.41, backY - backH * 0.03, frontBackZ + 0.04),
    }),
    LEATHER_HI,
  );
}

const armX = seatW * 0.62;
for (const side of [-1, 1] as const) {
  const x = side * armX;
  const armCurve = bezier(
    vec3(x, seatY - 0.08, -seatD * 0.36),
    vec3(x, seatY + 0.58, -seatD * 0.34),
    vec3(x, seatY + 0.72, seatD * 0.18),
    vec3(x, seatY + 0.08, seatD * 0.48),
    28,
  );
  plastic(`arm_curve_${side}`, sweep(armCurve, { radius: 0.045, sides: 10, caps: true }));
  plastic(
    `arm_top_${side}`,
    transform(roundedBox(0.16, 0.08, seatD * 0.66, 1), {
      rotate: vec3(0.04, 0, 0),
      translate: vec3(x, seatY + 0.58, seatD * 0.06),
    }),
  );
  plastic(`arm_front_post_${side}`, transform(cylinder(0.045, 0.58, 12, true), { translate: vec3(x, seatY + 0.23, seatD * 0.46) }));
}

add("gas_lift", transform(cylinder(0.095, 0.72, 24, true), { translate: vec3(0, 0.62, 0.02) }), METAL, {
  type: "brushedMetal",
  params: { color: METAL },
});
plastic("seat_mount", transform(roundedBox(0.54, 0.12, 0.42, 1), { translate: vec3(0, seatY - 0.22, 0.0) }));
plastic("base_hub", transform(cylinder(0.18, 0.16, 24, true), { translate: vec3(0, 0.29, 0) }));

const baseR = 0.86;
for (let i = 0; i < 5; i++) {
  const a = (i / 5) * Math.PI * 2;
  const cx = Math.sin(a) * baseR * 0.43;
  const cz = Math.cos(a) * baseR * 0.43;
  plastic(
    `base_spoke_${i}`,
    transform(roundedBox(0.16, 0.095, baseR * 0.92, 1), {
      rotate: vec3(0, a, 0),
      translate: vec3(cx, 0.28, cz),
    }),
  );
  const wx = Math.sin(a) * baseR * 0.9;
  const wz = Math.cos(a) * baseR * 0.9;
  plastic(
    `caster_${i}`,
    transform(cylinder(0.075, 0.1, 14, true), {
      rotate: vec3(0, a, Math.PI / 2),
      translate: vec3(wx, 0.13, wz),
    }),
  );
  plastic(
    `caster_fork_${i}`,
    transform(roundedBox(0.12, 0.08, 0.07, 1), {
      rotate: vec3(0, a, 0),
      translate: vec3(wx, 0.22, wz),
    }),
  );
}

const { obj, mtl } = toOBJScene(parts, "office-chair.mtl");
const model = toViewerModel(parts, "office-chair");

const fs = await import("node:fs");
const path = await import("node:path");
const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "office-chair.obj"), obj);
fs.writeFileSync(path.join(outDir, "office-chair.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "office-chair.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "office-chair", name: "黑色办公椅", file: "office-chair.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

const merged = merge(...parts.map((p) => p.mesh));
console.log(`office chair: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`);
console.log(`bbox source parts merged: ${merged.positions.length} verts`);
console.log("written: out/office-chair.{obj,mtl,json} + out/models.json");
