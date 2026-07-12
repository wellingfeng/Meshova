/**
 * Titan Cable — reverse-engineered from Houdini "tutorial_cable.1.0.hda"
 * (project_titan). The HDA hangs a main cable + sub-cables between anchor
 * points and finds the sag with a Vellum sim ("Enable Sim", "Stretch",
 * "Friction"), then sweeps a tube (radius from @pscale). Its scale wrangles:
 *
 *   @pscale *= 0.1;            // base thickness
 *   @pscale *= ch("scale");    // overall cable scale
 *
 * We replace the Vellum solve with an analytic catenary (`catenaryCurve`),
 * which is deterministic and needs no simulation — the sag shape is the same
 * y = a·cosh(x/a) a real cable settles into. Poles carry the cable; the main
 * span plus N sub-cables droop at slightly different sags for a bundled look.
 *
 * Run: pnpm tsx examples/titan-cable.ts
 */
import {
  sweep,
  box,
  merge,
  translateMesh,
  catenaryCurve,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3, type Vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

const CABLE: RGB = [0.09, 0.09, 0.1];
const POLE: RGB = [0.33, 0.24, 0.15];
const METAL: RGB = [0.4, 0.41, 0.44];

export interface TitanCableParams {
  /** Optional editable pole-top anchors. */
  controlPoints?: ReadonlyArray<Vec3>;
  /** Number of poles along the run. */
  poles: number;
  /** Horizontal distance between poles (metres). */
  span: number;
  /** Pole height (metres). */
  poleHeight: number;
  /** Sag of the main cable as a fraction of span (Vellum-solved in the HDA). */
  sag: number;
  /** Number of sub-cables bundled with the main cable. */
  subCables: number;
  /** Main cable radius (HDA @pscale * 0.1 * scale). */
  radius: number;
  /** Overall cable scale (HDA ch("scale")). */
  scale: number;
  /** Small height variation per pole so spans droop unevenly. */
  poleJitter: number;
  /** Wooden poles vs metal pylons. */
  metalPoles: boolean;
}

export const TITAN_CABLE_DEFAULTS: TitanCableParams = {
  poles: 4,
  span: 12,
  poleHeight: 6,
  sag: 0.16,
  subCables: 2,
  radius: 0.08,
  scale: 1,
  poleJitter: 0.4,
  metalPoles: false,
};

/** Deterministic pole-top anchor positions along +X. */
function anchors(p: TitanCableParams): Vec3[] {
  if (p.controlPoints && p.controlPoints.length >= 2) {
    return p.controlPoints.map((point) => vec3(point.x, point.y, point.z));
  }
  const out: Vec3[] = [];
  const total = (p.poles - 1) * p.span;
  for (let i = 0; i < p.poles; i++) {
    const x = -total / 2 + i * p.span;
    // Deterministic height variation (sine, not RNG) for uneven droop.
    const h = p.poleHeight + Math.sin(i * 1.7) * p.poleJitter;
    out.push(vec3(x, h, 0));
  }
  return out;
}

export function buildTitanCableParts(params: Partial<TitanCableParams> = {}): NamedPart[] {
  const p: TitanCableParams = { ...TITAN_CABLE_DEFAULTS, ...params };
  const tops = anchors(p);
  const r = p.radius * p.scale;

  // Poles.
  const poleMeshes: Mesh[] = [];
  const poleW = p.metalPoles ? 0.18 : 0.24;
  for (const top of tops) {
    const h = top.y;
    const pole = box(poleW, h, poleW);
    poleMeshes.push(translateMesh(pole, vec3(top.x, h / 2, top.z)));
    // cross-arm near the top
    const arm = box(1.4, 0.12, 0.12);
    poleMeshes.push(translateMesh(arm, vec3(top.x, h - 0.4, top.z)));
  }

  // Cables between consecutive poles: main span + bundled sub-cables.
  const cableMeshes: Mesh[] = [];
  for (let i = 0; i < tops.length - 1; i++) {
    const a = tops[i]!;
    const b = tops[i + 1]!;
    // Main cable.
    cableMeshes.push(
      sweep(catenaryCurve(a, b, { sag: p.sag, segments: 28 }), { radius: r, sides: 6, caps: true }),
    );
    // Sub-cables: slight lateral offset and deeper sag.
    for (let s = 0; s < p.subCables; s++) {
      const off = ((s + 1) / (p.subCables + 1) - 0.5) * 0.6;
      const aa = vec3(a.x, a.y - 0.35, a.z + off);
      const bb = vec3(b.x, b.y - 0.35, b.z + off);
      cableMeshes.push(
        sweep(catenaryCurve(aa, bb, { sag: p.sag * 1.15, segments: 24 }), {
          radius: r * 0.6,
          sides: 5,
          caps: true,
        }),
      );
    }
  }

  const poleColor = p.metalPoles ? METAL : POLE;
  return [
    {
      name: "poles",
      label: p.metalPoles ? "金属杆" : "电杆",
      mesh: merge(...poleMeshes),
      color: poleColor,
      surface: p.metalPoles
        ? { type: "metal", params: { color: poleColor, roughness: 0.6, metallic: 1 } }
        : { type: "wood", params: { color: poleColor, roughness: 0.85 } },
    },
    {
      name: "cables",
      label: "电缆",
      mesh: merge(...cableMeshes),
      color: CABLE,
      surface: { type: "rubber", params: { color: CABLE, roughness: 0.7 } },
      metadata: { source: "tutorial_cable.1.0.hda", method: "analytic catenary (no vellum)" },
    },
  ] as NamedPart[];
}
