/**
 * Fronds & needles — SpeedTree's continuous-leaf forms (palms, ferns, conifers).
 *
 * A frond is a central rachis (a thin swept stem) with shaped leaflets growing in
 * pairs down both sides, each angled and scaled by a length profile. Needle
 * clusters are short fronds bundled at a point. These cover plant types that the
 * scattered-card leaf system can't: palm fronds, fern blades, pine needles.
 *
 * Determinism: seeded; no Math.random / Date.now.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3, add, scale, normalize, lerpVec3 } from "../math/vec3.js";
import type { Curve } from "../geometry/curve.js";
import { sweep } from "../geometry/curve.js";
import type { Mesh } from "../geometry/mesh.js";
import { merge } from "../geometry/mesh.js";
import { makeRng } from "../random/prng.js";
import { curveFrameAt, rotateAround } from "./curve-frame.js";
import { leafCard, leafMesh, type LeafShape } from "./leaf.js";

export interface FrondOptions {
  seed?: number;
  /** Number of leaflet pairs along the rachis. */
  pairs?: number;
  /** Leaflet length at the frond base (world units). */
  leafletLength?: number;
  /** Leaflet width. */
  leafletWidth?: number;
  /** Angle leaflets sweep back from the rachis, in degrees. */
  angle?: number;
  /** Rachis radius (the central stem tube). */
  rachisRadius?: number;
  /** Leaflet length profile: scales base->tip (1 = uniform, <1 = taper). */
  tipScale?: number;
  /** Skip leaflets before this fraction of the rachis (bare base). */
  startPct?: number;
  /** Leaflet silhouette. Defaults to "lanceolate"; use "quad" for alpha cards. */
  leafletShape?: LeafShape;
  leafletSegments?: number;
  leafletCurl?: number;
  leafletFold?: number;
  roundedNormals?: boolean;
}

/**
 * Build a frond from a rachis curve: a thin swept stem plus paired leaflet cards
 * down both sides. Returns separate stem + blade meshes so they can take
 * different materials.
 */
export function frond(rachis: Curve, opts: FrondOptions = {}): { stem: Mesh; blades: Mesh } {
  const pairs = Math.max(1, Math.floor(opts.pairs ?? 12));
  const leafletLength = opts.leafletLength ?? 0.4;
  const leafletWidth = opts.leafletWidth ?? 0.06;
  const angleRad = ((opts.angle ?? 45) * Math.PI) / 180;
  const rachisRadius = opts.rachisRadius ?? 0.015;
  const tipScale = opts.tipScale ?? 0.35;
  const startPct = opts.startPct ?? 0.08;
  const leafletShape = opts.leafletShape ?? "lanceolate";

  const stem = sweep(rachis, { sides: 4, radius: rachisRadius, radiusAt: (t) => 1 - 0.8 * t, caps: false });

  const blades: Mesh[] = [];
  for (let i = 0; i < pairs; i++) {
    const t = startPct + (1 - startPct) * (i / Math.max(1, pairs - 1));
    const frame = curveFrameAt(rachis, Math.min(1, t));
    const len = leafletLength * (1 - (1 - tipScale) * t);
    for (const side of [-1, 1] as const) {
      // Leaflet direction: side axis swept back toward the tip by `angle`.
      const sideDir = scale(frame.binormal, side);
      const dir = normalize(add(scale(sideDir, Math.cos(angleRad)), scale(frame.tangent, Math.sin(angleRad))));
      const center = add(frame.position, scale(dir, len * 0.5));
      // Card normal faces roughly up out of the frond plane.
      const cardNormal = normalize(lerpVec3(frame.normal, vec3(0, 1, 0), 0.3));
      if (leafletShape !== "quad") {
        const leafOpts = {
          shape: leafletShape,
          segments: opts.leafletSegments ?? 6,
          curl: opts.leafletCurl ?? 0,
          fold: opts.leafletFold ?? 0,
        };
        if (opts.roundedNormals !== undefined) {
          (leafOpts as typeof leafOpts & { roundedNormals: boolean }).roundedNormals = opts.roundedNormals;
        }
        blades.push(leafMesh(center, cardNormal, dir, leafletWidth, len, leafOpts));
      } else {
        blades.push(leafCard(center, cardNormal, dir, leafletWidth, len));
      }
    }
  }
  return { stem, blades: blades.length ? merge(...blades) : merge() };
}

/**
 * A bundle of short needle fronds radiating from a point — a pine/spruce tuft.
 * Each needle is a thin tapered spike. Returns a single merged mesh.
 */
export function needleCluster(
  center: Vec3,
  direction: Vec3,
  opts: { seed?: number; count?: number; length?: number; spread?: number; radius?: number } = {},
): Mesh {
  const count = Math.max(2, Math.floor(opts.count ?? 7));
  const length = opts.length ?? 0.12;
  const spread = opts.spread ?? 0.5;
  const radius = opts.radius ?? 0.004;
  const rng = makeRng(opts.seed ?? 1);
  const dir = normalize(direction);
  const needles: Mesh[] = [];
  for (let i = 0; i < count; i++) {
    const roll = (i / count) * Math.PI * 2;
    // Tilt the needle away from the cluster axis by a spread angle.
    const tilted = rotateAround(dir, perp(dir), spread * (0.6 + rng.next() * 0.4));
    const final = rotateAround(tilted, dir, roll);
    const tip = add(center, scale(final, length * (0.8 + rng.next() * 0.4)));
    needles.push(
      sweep({ points: [{ ...center }, tip], closed: false }, {
        sides: 3,
        radius,
        radiusAt: (t) => 1 - 0.9 * t,
        caps: false,
      }),
    );
  }
  return needles.length ? merge(...needles) : merge();
}

/** Any unit vector perpendicular to `v`. */
function perp(v: Vec3): Vec3 {
  const ax = Math.abs(v.x), ay = Math.abs(v.y), az = Math.abs(v.z);
  const other = ax < ay && ax < az ? vec3(1, 0, 0) : ay < az ? vec3(0, 1, 0) : vec3(0, 0, 1);
  return normalize(cross3(v, other));
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return vec3(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}
