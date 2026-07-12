/**
 * Freeway overhead sign gantry — Meshova's take on the CitySample
 * Kit_FreewaySign / Kit_FWYSign_Pole / Kit_FWYSign_Guide props. A pair of
 * uprights carry a horizontal beam (solid box or an open truss) that spans the
 * carriageway; one or more green guide panels hang from the beam, each topped by
 * a small luminaire. Everything is parameter driven and centred on the origin
 * with the post feet at y=0 (Meshova determinism invariant — same params, same
 * mesh; the only randomness is seeded truss-diagonal jitter).
 *
 * Run: pnpm tsx examples/freeway-sign.ts
 */
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  cone,
  merge,
  transform,
  translateMesh,
  textMesh,
  textMeshWidth,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const METAL_GALV: RGB = [0.46, 0.47, 0.5];
const METAL_DARK: RGB = [0.14, 0.15, 0.17];
const SIGN_GREEN: RGB = [0.05, 0.3, 0.16];
const SIGN_TRIM: RGB = [0.88, 0.89, 0.9];
const LAMP_WARM: RGB = [0.96, 0.86, 0.58];

export interface FreewaySignParams {
  /** Clear span between the two uprights (metres). */
  span: number;
  /** Upright height from foot to beam underside. */
  postHeight: number;
  /** Number of green guide panels hung from the beam. */
  signCount: number;
  /** Panel face height. */
  signHeight: number;
  /** Open lattice beam (true) vs a solid box beam (false). */
  truss: boolean;
  /** Add luminaires above each panel. */
  lights: boolean;
  /**
   * Road-name legends painted on each panel (one per panel). Rendered as
   * procedural 5x7 dot-matrix glyph geometry — no bitmap. If fewer entries than
   * panels, later panels reuse a seeded default from ROAD_NAMES.
   */
  legends: string[];
  /** Exit number tab on the last panel (e.g. "42"), or "" for none. */
  exitNumber: string;
  /** Seed for truss-diagonal jitter + default legend pick. */
  seed: number;
}

/** Default legend pool when no legends are supplied (seeded pick). */
export const ROAD_NAMES = ["MAIN ST", "5TH AVE", "HARBOR", "CENTRAL", "AIRPORT", "DOWNTOWN", "RIVERSIDE", "PARK AVE"] as const;

export const FREEWAY_SIGN_DEFAULTS: FreewaySignParams = {
  span: 12,
  postHeight: 6.2,
  signCount: 2,
  signHeight: 2.2,
  truss: true,
  lights: true,
  legends: [],
  exitNumber: "",
  seed: 5,
};

const metal = (color: RGB, roughness = 0.45) =>
  ({ type: "metal", params: { color, roughness, metallic: 1 } }) as const;

/** One upright: tapered foot flange + column, standing at x = side*half. */
function upright(p: FreewaySignParams, side: -1 | 1): Mesh {
  const x = side * (p.span / 2);
  const foot = translateMesh(box(0.7, 0.2, 0.7), vec3(x, 0.1, 0));
  const col = translateMesh(cylinder(0.16, p.postHeight, 16), vec3(x, 0.2 + p.postHeight / 2, 0));
  const collar = translateMesh(cylinder(0.2, 0.24, 16), vec3(x, 0.2 + p.postHeight - 0.3, 0));
  return merge(foot, col, collar);
}

/** Horizontal beam across the span: solid box or an open Warren truss. */
function beam(p: FreewaySignParams): Mesh {
  const y = 0.2 + p.postHeight + 0.35;
  const len = p.span + 0.4;
  if (!p.truss) {
    return translateMesh(box(len, 0.7, 0.5), vec3(0, y, 0));
  }
  const rng = makeRng(p.seed >>> 0);
  const parts: Mesh[] = [];
  const chordH = 0.7;
  // Top + bottom chords (round tubes running along X).
  for (const dy of [chordH / 2, -chordH / 2]) {
    parts.push(transform(cylinder(0.05, len, 10), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, y + dy, 0) }));
    parts.push(transform(cylinder(0.05, len, 10), { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0, y + dy, 0.35) }));
  }
  // Zig-zag web diagonals + verticals across the panels.
  const bays = Math.max(4, Math.round(p.span / 1.3));
  const step = len / bays;
  for (let i = 0; i <= bays; i++) {
    const px = -len / 2 + i * step;
    parts.push(translateMesh(cylinder(0.035, chordH, 8), vec3(px, y, 0)));
    parts.push(translateMesh(cylinder(0.035, chordH, 8), vec3(px, y, 0.35)));
    if (i < bays) {
      const jitter = rng.range(-0.03, 0.03);
      const diagLen = Math.hypot(step, chordH);
      const ang = Math.atan2(chordH, step) * (i % 2 === 0 ? 1 : -1);
      for (const z of [0, 0.35]) {
        parts.push(
          transform(cylinder(0.03, diagLen, 8), {
            rotate: vec3(0, 0, ang + jitter),
            translate: vec3(px + step / 2, y, z),
          }),
        );
      }
    }
  }
  // Cross-braces tying the two trusses front-to-back.
  for (let i = 0; i <= bays; i += 2) {
    const px = -len / 2 + i * step;
    parts.push(transform(cylinder(0.03, 0.35, 8), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(px, y + chordH / 2, 0.175) }));
  }
  return merge(...parts);
}

/**
 * Green guide panels + white trim + procedural road-name legends, hung under
 * the beam and evenly spread. Legends are 5x7 glyph geometry sitting proud of
 * the panel face (a separate mesh so it reads as retroreflective white text).
 */
function signs(p: FreewaySignParams): { face: Mesh; trim: Mesh; legend: Mesh } {
  const beamY = 0.2 + p.postHeight + 0.35;
  const topY = beamY - 0.4;
  const cy = topY - p.signHeight / 2;
  const usable = p.span * 0.82;
  const panelW = usable / p.signCount - 0.25;
  const faces: Mesh[] = [];
  const trims: Mesh[] = [];
  const legends: Mesh[] = [];
  const rng = makeRng((p.seed ^ 0x5f37) >>> 0);
  for (let i = 0; i < p.signCount; i++) {
    const cx = -usable / 2 + panelW / 2 + i * (panelW + 0.25);
    faces.push(translateMesh(box(panelW, p.signHeight, 0.06), vec3(cx, cy, 0.28)));
    // Hanger straps to the beam.
    for (const hx of [-panelW * 0.32, panelW * 0.32]) {
      trims.push(translateMesh(box(0.06, 0.4, 0.06), vec3(cx + hx, topY + 0.2, 0.28)));
    }
    // Thin white border frame (four bars).
    const bw = 0.05;
    trims.push(translateMesh(box(panelW, bw, 0.04), vec3(cx, cy + p.signHeight / 2 - bw, 0.34)));
    trims.push(translateMesh(box(panelW, bw, 0.04), vec3(cx, cy - p.signHeight / 2 + bw, 0.34)));

    // --- road-name legend on this panel ---
    const legend = (p.legends[i] ?? ROAD_NAMES[rng.int(0, ROAD_NAMES.length - 1)]!).trim();
    if (legend.length > 0) {
      // Fit the glyph height to the panel, then shrink if the run is too wide.
      let gh = p.signHeight * 0.42;
      const maxW = panelW * 0.84;
      const w0 = textMeshWidth(legend, { height: gh });
      if (w0 > maxW) gh *= maxW / w0;
      const text = textMesh(legend, { height: gh, depth: 0.04 });
      legends.push(translateMesh(text, vec3(cx, cy, 0.32)));
    }
  }

  // Exit-number tab: a small yellow-free (white-text) box perched top-right of
  // the last panel, with its own glyph run.
  if (p.exitNumber.trim().length > 0) {
    const lastCx = -usable / 2 + panelW / 2 + (p.signCount - 1) * (panelW + 0.25);
    const tabW = Math.min(panelW * 0.5, 1.2);
    const tabH = p.signHeight * 0.32;
    const tabY = topY + tabH * 0.6;
    const tabX = lastCx + panelW / 2 - tabW / 2;
    faces.push(translateMesh(box(tabW, tabH, 0.06), vec3(tabX, tabY, 0.28)));
    const label = "EXIT " + p.exitNumber.trim();
    let gh = tabH * 0.4;
    const w0 = textMeshWidth(label, { height: gh });
    const maxW = tabW * 0.86;
    if (w0 > maxW) gh *= maxW / w0;
    legends.push(translateMesh(textMesh(label, { height: gh, depth: 0.04 }), vec3(tabX, tabY, 0.32)));
  }

  return { face: merge(...faces), trim: merge(...trims), legend: legends.length ? merge(...legends) : merge() };
}

/** Small downward luminaires perched on the beam above each panel. */
function lights(p: FreewaySignParams): { arm: Mesh; lens: Mesh } {
  const beamY = 0.2 + p.postHeight + 0.35;
  const usable = p.span * 0.82;
  const panelW = usable / p.signCount - 0.25;
  const arms: Mesh[] = [];
  const lenses: Mesh[] = [];
  for (let i = 0; i < p.signCount; i++) {
    const cx = -usable / 2 + panelW / 2 + i * (panelW + 0.25);
    const armLen = 0.6;
    arms.push(transform(cylinder(0.03, armLen, 8), { rotate: vec3(Math.PI / 2.3, 0, 0), translate: vec3(cx, beamY + 0.35, 0.3) }));
    const head = transform(cone(0.11, 0.16, 12), { rotate: vec3(Math.PI, 0, 0), translate: vec3(cx, beamY + 0.5, 0.62) });
    arms.push(head);
    lenses.push(translateMesh(box(0.14, 0.03, 0.14), vec3(cx, beamY + 0.41, 0.62)));
  }
  return { arm: merge(...arms), lens: merge(...lenses) };
}

export function buildFreewaySignParts(params: Partial<FreewaySignParams> = {}): NamedPart[] {
  const p: FreewaySignParams = { ...FREEWAY_SIGN_DEFAULTS, ...params };
  p.signCount = Math.max(1, Math.round(p.signCount));

  const structure = merge(upright(p, -1), upright(p, 1), beam(p));
  const { face, trim, legend } = signs(p);

  const parts: NamedPart[] = [
    { name: "gantry", label: "门架", mesh: structure, color: METAL_GALV, surface: metal(METAL_GALV, 0.5) },
    { name: "sign_face", label: "导向牌面", mesh: face, color: SIGN_GREEN, surface: { type: "metal", params: { color: SIGN_GREEN, roughness: 0.6, metallic: 0.2 } } },
    { name: "sign_trim", label: "牌框吊挂", mesh: trim, color: SIGN_TRIM, surface: { type: "metal", params: { color: SIGN_TRIM, roughness: 0.5, metallic: 0.3 } } },
  ];
  if (legend.positions.length > 0) {
    // Retroreflective white legend text — matte white so it reads at any angle.
    parts.push({ name: "sign_legend", label: "路名字牌", mesh: legend, color: SIGN_TRIM, surface: { type: "plastic", params: { color: SIGN_TRIM, roughness: 0.7 } } });
  }
  if (p.lights) {
    const { arm, lens } = lights(p);
    parts.push({ name: "lamp_arm", label: "灯臂", mesh: arm, color: METAL_DARK, surface: metal(METAL_DARK, 0.4) });
    parts.push({ name: "lamp_lens", label: "灯罩", mesh: lens, color: LAMP_WARM, surface: { type: "glass", params: { tint: LAMP_WARM, roughness: 0.15 } } });
  }
  return parts;
}
