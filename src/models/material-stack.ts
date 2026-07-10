/**
 * Construction material stack — Meshova's take on the CitySample
 * Kit_Pallet / Kit_Lumber / Kit_Plywood / Kit_SandBag props. A wooden pallet
 * carries a deterministically-chosen stack of goods: sawn lumber bundles,
 * stacked plywood sheets, or a pyramid of sandbags. Multiple pallets can be
 * lined up in a row to dress a construction site.
 *
 * Deterministic: cargo type per pallet, plank count and small placement jitter
 * all come from the seeded PRNG (never Math.random). Same seed -> same stack.
 *
 * Run: pnpm tsx examples/material-stack.ts
 */
import { vec3 } from "../math/vec3.js";
import { makeRng, type Rng } from "../random/prng.js";
import {
  box,
  cylinder,
  merge,
  transform,
  translateMesh,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const WOOD_PALLET: RGB = [0.5, 0.36, 0.2];
const WOOD_LUMBER: RGB = [0.62, 0.47, 0.28];
const PLYWOOD: RGB = [0.72, 0.6, 0.38];
const SANDBAG: RGB = [0.55, 0.5, 0.36];
const STRAP: RGB = [0.1, 0.1, 0.12];

export type CargoKind = "lumber" | "plywood" | "sandbag" | "mixed";

export interface MaterialStackParams {
  /** Number of pallets lined up along +X. */
  pallets: number;
  /** Cargo carried on each pallet. "mixed" picks per-pallet from the seed. */
  cargo: CargoKind;
  /** Pallet footprint (square) size. */
  palletSize: number;
  /** Stack height factor (scales cargo layers/rows). */
  stack: number;
  /** Add dark tension straps around lumber/plywood stacks. */
  straps: boolean;
  /** Seed for cargo selection + jitter. */
  seed: number;
}

export const MATERIAL_STACK_DEFAULTS: MaterialStackParams = {
  pallets: 3,
  cargo: "mixed",
  palletSize: 1.2,
  stack: 1,
  straps: true,
  seed: 11,
};

const woodSurf = (color: RGB, roughness = 0.8) =>
  ({ type: "wood", params: { color, roughness } }) as const;

/** A EUR-style wooden pallet: 3 bottom stringers + top/bottom deck boards. */
function pallet(size: number): Mesh {
  const t = 0.04; // board thickness
  const deckW = size;
  const parts: Mesh[] = [];
  // Bottom + top deck boards (5 each, running along Z).
  for (const layer of [{ y: 0.02, n: 3 }, { y: 0.14, n: 5 }]) {
    for (let i = 0; i < layer.n; i++) {
      const x = -deckW / 2 + (deckW / (layer.n - 1)) * i;
      parts.push(translateMesh(box(0.09, t, deckW), vec3(x, layer.y, 0)));
    }
  }
  // Three stringer blocks lifting the top deck.
  for (const z of [-deckW / 2 + 0.06, 0, deckW / 2 - 0.06]) {
    parts.push(translateMesh(box(deckW, 0.08, 0.12), vec3(0, 0.08, z)));
  }
  return merge(...parts);
}

/** Sawn lumber bundle: a grid of square battens, deterministic count. */
function lumberBundle(size: number, stack: number, rng: Rng): Mesh {
  const base = 0.16;
  const battenW = 0.08;
  const gap = 0.015;
  const cols = Math.max(4, Math.round((size * 0.9) / (battenW + gap)));
  const rows = Math.max(2, Math.round(3 * stack));
  const len = size * (0.9 + rng.range(0, 0.25)); // overhang the pallet a touch
  const parts: Mesh[] = [];
  const totalW = cols * (battenW + gap);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = -totalW / 2 + c * (battenW + gap) + battenW / 2;
      const y = base + r * (battenW + gap) + battenW / 2;
      parts.push(translateMesh(box(battenW, battenW, len), vec3(x, y, 0)));
    }
  }
  return merge(...parts);
}

/** Stacked plywood sheets: thin wide boards with tiny per-sheet slip. */
function plywoodStack(size: number, stack: number, rng: Rng): Mesh {
  const base = 0.16;
  const sheetT = 0.02;
  const n = Math.max(4, Math.round(10 * stack));
  const w = size * 1.05;
  const d = size * 0.75;
  const parts: Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const slip = rng.range(-0.015, 0.015);
    parts.push(translateMesh(box(w, sheetT, d), vec3(slip, base + sheetT / 2 + i * (sheetT + 0.004), slip * 0.5)));
  }
  return merge(...parts);
}

/** Pyramid of sandbags: rows shrink toward the top, staggered per layer. */
function sandbagPile(size: number, stack: number, rng: Rng): Mesh {
  const bagW = size * 0.34;
  const bagH = 0.12;
  const bagD = size * 0.24;
  const baseRow = 3;
  const layers = Math.max(2, Math.round(3 * stack));
  const parts: Mesh[] = [];
  let y = 0.16 + bagH / 2;
  for (let l = 0; l < layers; l++) {
    const n = Math.max(1, baseRow - l);
    const rowW = n * bagW;
    for (let i = 0; i < n; i++) {
      const x = -rowW / 2 + bagW / 2 + i * bagW + rng.range(-0.02, 0.02);
      const b = transform(box(bagW * 0.96, bagH, bagD), {
        rotate: vec3(0, rng.range(-0.08, 0.08), 0),
        translate: vec3(x, y, rng.range(-0.03, 0.03)),
      });
      parts.push(b);
    }
    y += bagH * 0.86;
  }
  return merge(...parts);
}

/** Two dark tension straps wrapping a cuboid cargo. */
function straps(size: number, topY: number): Mesh {
  const parts: Mesh[] = [];
  for (const z of [-size * 0.22, size * 0.22]) {
    parts.push(translateMesh(box(size * 1.1, topY - 0.14, 0.02), vec3(0, 0.16 + (topY - 0.16) / 2, z)));
  }
  return merge(...parts);
}

export function buildMaterialStackParts(params: Partial<MaterialStackParams> = {}): NamedPart[] {
  const p: MaterialStackParams = { ...MATERIAL_STACK_DEFAULTS, ...params };
  const n = Math.max(1, Math.round(p.pallets));
  const rng = makeRng(p.seed >>> 0);
  const pitch = p.palletSize + 0.35;

  const palletMeshes: Mesh[] = [];
  const lumberMeshes: Mesh[] = [];
  const plywoodMeshes: Mesh[] = [];
  const sandbagMeshes: Mesh[] = [];
  const strapMeshes: Mesh[] = [];

  const kinds: CargoKind[] = ["lumber", "plywood", "sandbag"];
  for (let i = 0; i < n; i++) {
    const x = -((n - 1) * pitch) / 2 + i * pitch;
    palletMeshes.push(translateMesh(pallet(p.palletSize), vec3(x, 0, 0)));

    const kind: CargoKind = p.cargo === "mixed" ? kinds[Math.floor(rng.next() * kinds.length)]! : p.cargo;
    if (kind === "lumber") {
      lumberMeshes.push(translateMesh(lumberBundle(p.palletSize, p.stack, rng), vec3(x, 0, 0)));
      if (p.straps) strapMeshes.push(translateMesh(straps(p.palletSize, 0.16 + 0.4 * p.stack), vec3(x, 0, 0)));
    } else if (kind === "plywood") {
      plywoodMeshes.push(translateMesh(plywoodStack(p.palletSize, p.stack, rng), vec3(x, 0, 0)));
      if (p.straps) strapMeshes.push(translateMesh(straps(p.palletSize, 0.16 + 0.3 * p.stack), vec3(x, 0, 0)));
    } else {
      sandbagMeshes.push(translateMesh(sandbagPile(p.palletSize, p.stack, rng), vec3(x, 0, 0)));
    }
  }

  const parts: NamedPart[] = [
    { name: "pallets", label: "托盘", mesh: merge(...palletMeshes), color: WOOD_PALLET, surface: woodSurf(WOOD_PALLET, 0.85) },
  ];
  if (lumberMeshes.length) parts.push({ name: "lumber", label: "木方", mesh: merge(...lumberMeshes), color: WOOD_LUMBER, surface: woodSurf(WOOD_LUMBER, 0.75) });
  if (plywoodMeshes.length) parts.push({ name: "plywood", label: "胶合板", mesh: merge(...plywoodMeshes), color: PLYWOOD, surface: woodSurf(PLYWOOD, 0.7) });
  if (sandbagMeshes.length) parts.push({ name: "sandbags", label: "沙袋", mesh: merge(...sandbagMeshes), color: SANDBAG, surface: { type: "fabric", params: { color: SANDBAG, roughness: 0.95 } } });
  if (strapMeshes.length) parts.push({ name: "straps", label: "捆扎带", mesh: merge(...strapMeshes), color: STRAP, surface: { type: "plastic", params: { color: STRAP, roughness: 0.5 } } });

  return parts.map((part) => ({ ...part, metadata: { source: "CitySample Kit_Pallet/Lumber/Plywood/SandBag" } }));
}
