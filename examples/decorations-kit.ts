/**
 * Decorations kit — the small hard-surface props that dress a Skylark street:
 * bench, chair, table, stool, crate, fence, ground lamp, mailbox, sign.
 *
 * These are the "set dressing" meshes in Skylark's Decorations folder. Each is
 * a tiny parametric builder made of boxes/cylinders/prisms; laid out on a grid
 * so one script emits the whole prop library. This is the breadth Meshova wants
 * to prove: a bag of reusable furniture generators, not one-off models.
 *
 * Run: pnpm decorations-kit
 */
import fs from "node:fs";
import path from "node:path";
import {
  box,
  cylinder,
  transform,
  merge,
  computeNormals,
  vec3,
  toOBJScene,
  toViewerModel,
  type Mesh,
  type NamedPart,
} from "../src/index.js";

const WOOD: [number, number, number] = [0.5, 0.34, 0.2];
const WOOD_DK: [number, number, number] = [0.38, 0.25, 0.15];
const METAL: [number, number, number] = [0.35, 0.37, 0.4];
const RED: [number, number, number] = [0.7, 0.24, 0.2];
const LAMP: [number, number, number] = [0.95, 0.86, 0.55];

// Each builder returns parts in its own local frame, grounded at y=0.
// The assembler translates them onto a display grid.

function bench(): NamedPart[] {
  const seat = transform(box(1.2, 0.08, 0.4), { translate: vec3(0, 0.45, 0) });
  const back = transform(box(1.2, 0.35, 0.06), { translate: vec3(0, 0.65, -0.17) });
  const legs: Mesh[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      legs.push(transform(box(0.08, 0.45, 0.08), { translate: vec3(sx * 0.52, 0.225, sz * 0.15) }));
  return [
    { name: "bench_top", mesh: computeNormals(merge(seat, back), 40), color: WOOD },
    { name: "bench_legs", mesh: computeNormals(merge(...legs), 40), color: WOOD_DK },
  ];
}

function chair(): NamedPart[] {
  const seat = transform(box(0.44, 0.06, 0.44), { translate: vec3(0, 0.46, 0) });
  const back = transform(box(0.44, 0.5, 0.05), { translate: vec3(0, 0.72, -0.19) });
  const legs: Mesh[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      legs.push(transform(box(0.05, 0.46, 0.05), { translate: vec3(sx * 0.18, 0.23, sz * 0.18) }));
  return [
    { name: "chair_top", mesh: computeNormals(merge(seat, back), 40), color: WOOD },
    { name: "chair_legs", mesh: computeNormals(merge(...legs), 40), color: WOOD_DK },
  ];
}

function table(): NamedPart[] {
  const top = transform(box(1.0, 0.07, 0.7), { translate: vec3(0, 0.72, 0) });
  const legs: Mesh[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      legs.push(transform(box(0.08, 0.72, 0.08), { translate: vec3(sx * 0.42, 0.36, sz * 0.28) }));
  return [
    { name: "table_top", mesh: computeNormals(top, 40), color: WOOD },
    { name: "table_legs", mesh: computeNormals(merge(...legs), 40), color: WOOD_DK },
  ];
}

function stool(): NamedPart[] {
  const seat = transform(cylinder(0.22, 0.07, 20), { translate: vec3(0, 0.5, 0) });
  const legs: Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    legs.push(transform(cylinder(0.03, 0.5, 8), { translate: vec3(Math.cos(a) * 0.15, 0.25, Math.sin(a) * 0.15) }));
  }
  return [
    { name: "stool_seat", mesh: computeNormals(seat, 40), color: WOOD },
    { name: "stool_legs", mesh: computeNormals(merge(...legs), 40), color: WOOD_DK },
  ];
}

function crate(): NamedPart[] {
  const body = transform(box(0.6, 0.6, 0.6), { translate: vec3(0, 0.3, 0) });
  // corner battens for the classic crate read
  const battens: Mesh[] = [];
  for (const sx of [-1, 1])
    for (const sz of [-1, 1])
      battens.push(transform(box(0.06, 0.62, 0.06), { translate: vec3(sx * 0.29, 0.3, sz * 0.29) }));
  return [
    { name: "crate_body", mesh: computeNormals(body, 40), color: WOOD },
    { name: "crate_battens", mesh: computeNormals(merge(...battens), 40), color: WOOD_DK },
  ];
}

function fence(): NamedPart[] {
  const rails: Mesh[] = [];
  const posts: Mesh[] = [];
  const spanW = 1.6;
  for (let i = 0; i < 3; i++) {
    posts.push(transform(box(0.08, 0.9, 0.08), { translate: vec3(-spanW / 2 + (i * spanW) / 2, 0.45, 0) }));
  }
  for (const y of [0.35, 0.7])
    rails.push(transform(box(spanW, 0.06, 0.05), { translate: vec3(0, y, 0) }));
  return [
    { name: "fence_posts", mesh: computeNormals(merge(...posts), 40), color: WOOD_DK },
    { name: "fence_rails", mesh: computeNormals(merge(...rails), 40), color: WOOD },
  ];
}

function groundLamp(): NamedPart[] {
  const pole = transform(cylinder(0.05, 1.6, 12), { translate: vec3(0, 0.8, 0) });
  const base = transform(cylinder(0.16, 0.1, 16), { translate: vec3(0, 0.05, 0) });
  const head = transform(cylinder(0.16, 0.22, 6), { translate: vec3(0, 1.62, 0) });
  const bulb = transform(box(0.18, 0.16, 0.18), { translate: vec3(0, 1.5, 0) });
  return [
    { name: "lamp_metal", mesh: computeNormals(merge(pole, base, head), 40), color: METAL },
    { name: "lamp_bulb", mesh: computeNormals(bulb, 40), color: LAMP },
  ];
}

function mailbox(): NamedPart[] {
  const post = transform(box(0.08, 1.0, 0.08), { translate: vec3(0, 0.5, 0) });
  // rounded-top box body: a box plus a half-cylinder lid along X
  const bodyBox = transform(box(0.28, 0.24, 0.4), { translate: vec3(0, 1.05, 0) });
  const lid = transform(cylinder(0.14, 0.4, 16, true), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(0, 1.17, 0),
  });
  const flag = transform(box(0.02, 0.14, 0.1), { translate: vec3(0.15, 1.12, 0.1) });
  return [
    { name: "mailbox_post", mesh: computeNormals(post, 40), color: WOOD_DK },
    { name: "mailbox_body", mesh: computeNormals(merge(bodyBox, lid), 40), color: METAL },
    { name: "mailbox_flag", mesh: computeNormals(flag, 40), color: RED },
  ];
}

function sign(): NamedPart[] {
  const post = transform(box(0.08, 1.2, 0.08), { translate: vec3(0, 0.6, 0) });
  const board = transform(box(0.7, 0.4, 0.05), { translate: vec3(0, 1.1, 0) });
  return [
    { name: "sign_post", mesh: computeNormals(post, 40), color: WOOD_DK },
    { name: "sign_board", mesh: computeNormals(board, 40), color: WOOD },
  ];
}

// --- assemble: lay each prop on a grid so the whole kit shows at once ---
const props: Array<{ id: string; make: () => NamedPart[] }> = [
  { id: "bench", make: bench },
  { id: "chair", make: chair },
  { id: "table", make: table },
  { id: "stool", make: stool },
  { id: "crate", make: crate },
  { id: "fence", make: fence },
  { id: "lamp", make: groundLamp },
  { id: "mailbox", make: mailbox },
  { id: "sign", make: sign },
];

const COLS = 3;
const SPACING = 2.2;
const parts: NamedPart[] = [];

props.forEach((p, i) => {
  const col = i % COLS;
  const row = Math.floor(i / COLS);
  const dx = (col - (COLS - 1) / 2) * SPACING;
  const dz = (row - 1) * SPACING;
  for (const part of p.make()) {
    parts.push({
      name: `${p.id}_${part.name}`,
      mesh: transform(part.mesh, { translate: vec3(dx, 0, dz) }),
      color: part.color,
    });
  }
});

// --- export ---
const { obj, mtl } = toOBJScene(parts, "decorations-kit.mtl");
const model = toViewerModel(parts, "decorations-kit");

const outDir = path.resolve(process.cwd(), "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "decorations-kit.obj"), obj);
fs.writeFileSync(path.join(outDir, "decorations-kit.mtl"), mtl);
fs.writeFileSync(path.join(outDir, "decorations-kit.json"), JSON.stringify(model));

const manifestPath = path.join(outDir, "models.json");
let manifest: { models: Array<{ id: string; name: string; file: string }> } = { models: [] };
if (fs.existsSync(manifestPath)) {
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch {
    /* rebuild on parse error */
  }
}
const entry = { id: "decorations-kit", name: "装饰小物件套件", file: "decorations-kit.json" };
manifest.models = manifest.models.filter((m) => m.id !== entry.id);
manifest.models.push(entry);
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

console.log(
  `decorations kit: ${model.meta.parts} parts, ${model.meta.verts} verts, ${model.meta.tris} tris`,
);
console.log("written: out/decorations-kit.{obj,mtl,json} + out/models.json");

