/**
 * Hard-surface mechanical parts kit — the parametric building blocks that make
 * AI-authored mechanical models read as *engineered* instead of blobby: hex
 * prisms (nuts/bolt heads), spur gears with a real involute-ish tooth profile,
 * threaded shafts, flanges with bolt-hole circles, and bolt-hole placement
 * helpers.
 *
 * This mirrors the role BOSL2 plays for OpenSCAD (gear/thread math self-written
 * from public knowledge — no GPL code copied). Every builder is deterministic
 * and returns a fresh watertight mesh.
 *
 * Axis convention: parts stand along +Y like the rest of the primitives, so
 * they drop straight into `merge` / boolean assemblies.
 */
import type { Vec3 } from "../math/vec3.js";
import { vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";
import { TAU } from "../math/scalar.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals, merge } from "./mesh.js";
import { subtractAll } from "./boolean.js";
import { cleanMesh } from "./blast.js";

/**
 * Extrude a closed 2D polygon (XZ plane, CCW) into a prism along +Y, centered
 * on the origin. Shared core for hex prisms, gears, and any flat-topped part.
 * `outline` points are (x, z); the prism spans y in [-height/2, height/2].
 */
export function prism(outline: Vec2[], height = 1): Mesh {
  const n = outline.length;
  if (n < 3) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });
  const hy = height / 2;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  // Outline extent for cap UVs (planar projection normalized to 0..1).
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const p of outline) {
    if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
    if (p.y < minz) minz = p.y; if (p.y > maxz) maxz = p.y;
  }
  const spanx = maxx - minx || 1, spanz = maxz - minz || 1;
  const capUV = (x: number, z: number) => vec2((x - minx) / spanx, (z - minz) / spanz);

  // Side walls: duplicate ring top/bottom for hard side normals. u follows the
  // accumulated perimeter, v the height — real UVs so anisotropic materials
  // (brushedMetal, etc.) get a valid tangent basis instead of NaN.
  let perim = 0;
  const cumU: number[] = [0];
  for (let i = 0; i < n; i++) {
    const a = outline[i]!, b = outline[(i + 1) % n]!;
    perim += Math.hypot(b.x - a.x, b.y - a.y);
    cumU.push(perim);
  }
  const invPerim = perim > 0 ? 1 / perim : 1;
  for (let i = 0; i < n; i++) {
    const a = outline[i]!;
    const b = outline[(i + 1) % n]!;
    const u0 = cumU[i]! * invPerim, u1 = cumU[i + 1]! * invPerim;
    const base = positions.length;
    positions.push(vec3(a.x, -hy, a.y), vec3(b.x, -hy, b.y), vec3(b.x, hy, b.y), vec3(a.x, hy, a.y));
    normals.push(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0));
    uvs.push(vec2(u0, 0), vec2(u1, 0), vec2(u1, 1), vec2(u0, 1));
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  // Caps: triangle-fan each end around its centroid, planar-projected UVs.
  let cx = 0, cz = 0;
  for (const p of outline) { cx += p.x; cz += p.y; }
  cx /= n; cz /= n;
  for (const end of [{ y: hy, flip: false }, { y: -hy, flip: true }]) {
    const c = positions.length;
    positions.push(vec3(cx, end.y, cz)); normals.push(vec3(0, 0, 0)); uvs.push(capUV(cx, cz));
    const ring: number[] = [];
    for (let i = 0; i < n; i++) {
      const a = outline[i]!;
      ring.push(positions.length);
      positions.push(vec3(a.x, end.y, a.y)); normals.push(vec3(0, 0, 0)); uvs.push(capUV(a.x, a.y));
    }
    for (let i = 0; i < n; i++) {
      const a = ring[i]!, b = ring[(i + 1) % n]!;
      if (end.flip) indices.push(c, b, a); else indices.push(c, a, b);
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

/**
 * Regular polygon outline (CCW in XZ plane) with a given number of sides.
 * `acrossFlats` sizes it by the wrench flat-to-flat distance (the way nuts are
 * spec'd) when true; otherwise `size` is the circumradius.
 */
export function regularPolygon(sides: number, size: number, acrossFlats = false): Vec2[] {
  const n = Math.max(3, Math.floor(sides));
  const r = acrossFlats ? size / (2 * Math.cos(Math.PI / n)) : size;
  const pts: Vec2[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + Math.PI / n; // flat facing +X for even n
    pts.push(vec2(Math.cos(a) * r, Math.sin(a) * r));
  }
  return pts;
}

export interface HexNutOptions {
  /** Wrench flat-to-flat width. */
  acrossFlats?: number;
  /** Prism height (thickness). */
  height?: number;
  /** Through-hole radius (0 = solid hex head). */
  boreRadius?: number;
  /** Bore facet count. */
  boreSegments?: number;
}

/**
 * Hex nut / bolt head: a hexagonal prism with an optional central through-bore.
 * Set `boreRadius=0` for a solid hex bolt head, or a positive radius for a nut.
 * Sized by across-flats like real hardware.
 */
export function hexNut(opts: HexNutOptions = {}): Mesh {
  const af = opts.acrossFlats ?? 1;
  const height = opts.height ?? af * 0.8;
  const bore = opts.boreRadius ?? af * 0.3;
  const outline = regularPolygon(6, af, true);
  if (bore <= 0) return prism(outline, height);
  return boredPrism(outline, height, bore, opts.boreSegments ?? 24);
}

/**
 * Hexagonal prism (nut blank / standoff / spacer) sized by across-flats.
 */
export function hexPrism(acrossFlats = 1, height = 1): Mesh {
  return prism(regularPolygon(6, acrossFlats, true), height);
}

/**
 * Prism with a concentric cylindrical through-bore, built directly as a
 * watertight solid (outer wall + inner wall + annular caps) — no CSG needed.
 * This is the robust path for the common nut/washer/flange case where the hole
 * is centered on the origin.
 */
export function boredPrism(outline: Vec2[], height: number, boreRadius: number, boreSegments = 24): Mesh {
  const n = outline.length;
  const bn = Math.max(3, Math.floor(boreSegments));
  if (n < 3 || boreRadius <= 0) return prism(outline, height);
  const hy = height / 2;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  // Planar UV extent from the outline, so anisotropic materials get a valid
  // tangent basis (all-zero UVs make brushedMetal etc. produce NaN tangents and
  // black-screen the whole render).
  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const p of outline) {
    if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
    if (p.y < minz) minz = p.y; if (p.y > maxz) maxz = p.y;
  }
  const spanx = (maxx - minx) || 1, spanz = (maxz - minz) || 1;
  const uvOf = (p: Vec3) => vec2((p.x - minx) / spanx, (p.z - minz) / spanz);

  const quad = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) => {
    const b = positions.length;
    positions.push(p0, p1, p2, p3);
    normals.push(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0));
    uvs.push(uvOf(p0), uvOf(p1), uvOf(p2), uvOf(p3));
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };

  // Outer side wall (outward faces, CCW outline).
  for (let i = 0; i < n; i++) {
    const a = outline[i]!, c = outline[(i + 1) % n]!;
    quad(vec3(a.x, -hy, a.y), vec3(c.x, -hy, c.y), vec3(c.x, hy, c.y), vec3(a.x, hy, a.y));
  }
  // Inner bore wall (faces pointing inward toward the axis).
  const ring: Vec2[] = [];
  for (let i = 0; i < bn; i++) {
    const ang = (i / bn) * TAU;
    ring.push(vec2(Math.cos(ang) * boreRadius, Math.sin(ang) * boreRadius));
  }
  for (let i = 0; i < bn; i++) {
    const a = ring[i]!, c = ring[(i + 1) % bn]!;
    // reversed winding so the wall faces inward
    quad(vec3(a.x, hy, a.y), vec3(c.x, hy, c.y), vec3(c.x, -hy, c.y), vec3(a.x, -hy, a.y));
  }
  // Annular caps: triangulate the ring between the outer outline (n verts) and
  // the bore ring (bn verts) by merge-walking both loops in angle order, so
  // EVERY vertex of both loops is referenced — the result shares its edges with
  // the side walls and stays watertight even when n != bn.
  const angleOf = (p: Vec2) => {
    let a = Math.atan2(p.y, p.x);
    if (a < 0) a += TAU;
    return a;
  };
  const outerAng = outline.map(angleOf);
  const ringAng = ring.map(angleOf);
  const tri = (p0: Vec3, p1: Vec3, p2: Vec3) => {
    const b = positions.length;
    positions.push(p0, p1, p2);
    normals.push(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0));
    uvs.push(uvOf(p0), uvOf(p1), uvOf(p2));
    indices.push(b, b + 1, b + 2);
  };
  // Fractional position of each edge's END vertex, in [0,1] around the circle,
  // so we can merge-walk both loops monotonically regardless of vertex counts.
  const frac = (a: number, a0: number) => ((a - a0 + TAU) % TAU) / TAU;
  for (const end of [{ y: hy, up: true }, { y: -hy, up: false }]) {
    const O = (i: number) => vec3(outline[i % n]!.x, end.y, outline[i % n]!.y);
    const I = (j: number) => vec3(ring[j % bn]!.x, end.y, ring[j % bn]!.y);
    const a0 = outerAng[0]!;
    let i = 0, j = 0;
    while (i < n || j < bn) {
      // fractional angle of each loop's NEXT vertex (1.0 once the loop closes)
      const fo = i < n ? (i + 1 >= n ? 1 : frac(outerAng[i + 1]!, a0)) : Infinity;
      const fi = j < bn ? (j + 1 >= bn ? 1 : frac(ringAng[j + 1]!, a0)) : Infinity;
      if (fo <= fi) {
        // advance outer: triangle outer[i] -> outer[i+1] -> inner[j]
        if (end.up) tri(O(i), O(i + 1), I(j));
        else tri(O(i), I(j), O(i + 1));
        i++;
      } else {
        // advance inner: triangle outer[i] -> inner[j+1] -> inner[j]
        if (end.up) tri(O(i), I(j + 1), I(j));
        else tri(O(i), I(j), I(j + 1));
        j++;
      }
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

export interface GearOptions {
  /** Number of teeth (>= 4). */
  teeth?: number;
  /** Module: pitch diameter / teeth. Sets overall size. */
  module?: number;
  /** Gear thickness along Y. */
  thickness?: number;
  /** Pressure angle in degrees (tooth flank slope). */
  pressureAngle?: number;
  /** Central bore radius (0 = solid). */
  boreRadius?: number;
  /** Bore facet count. */
  boreSegments?: number;
}

/**
 * Spur gear outline (XZ plane, CCW). A pragmatic involute-approximation tooth:
 * addendum/dedendum circles set tip and root radius, each tooth is a trapezoid
 * whose flank slope follows the pressure angle. Reads as a gear and meshes
 * visually; not a load-bearing tooth-contact solve.
 */
export function gearOutline(opts: GearOptions = {}): Vec2[] {
  const z = Math.max(4, Math.floor(opts.teeth ?? 16));
  const module = opts.module ?? 0.1;
  const pa = ((opts.pressureAngle ?? 20) * Math.PI) / 180;
  const pitchR = (module * z) / 2;
  const addendum = module;         // tip above pitch
  const dedendum = module * 1.25;  // root below pitch
  const tipR = pitchR + addendum;
  const rootR = Math.max(0.01, pitchR - dedendum);

  const toothAngle = TAU / z;
  const halfPitchArc = toothAngle * 0.5;
  // Flank pulls in toward the tip with pressure angle, widens toward the root.
  const flank = Math.tan(pa) * (module / pitchR);
  const tipHalf = Math.max(0.04 * halfPitchArc, halfPitchArc * 0.5 - flank);
  const rootHalf = Math.min(halfPitchArc * 0.98, halfPitchArc * 0.5 + flank);

  const pts: Vec2[] = [];
  const at = (r: number, a: number) => vec2(Math.cos(a) * r, Math.sin(a) * r);
  for (let i = 0; i < z; i++) {
    const c = i * toothAngle; // tooth center angle
    // valley -> leading flank up -> across tip -> trailing flank down (CCW)
    pts.push(at(rootR, c - rootHalf));
    pts.push(at(tipR, c - tipHalf));
    pts.push(at(tipR, c + tipHalf));
    pts.push(at(rootR, c + rootHalf));
  }
  return pts;
}

/**
 * Spur gear: extrude the gear outline into a solid disk of teeth, with an
 * optional central bore. The classic mechanical-kit part.
 */
export function gear(opts: GearOptions = {}): Mesh {
  const outline = gearOutline(opts);
  const thickness = opts.thickness ?? (opts.module ?? 0.1) * 4;
  const bore = opts.boreRadius ?? 0;
  if (bore > 0) return boredPrism(outline, thickness, bore, opts.boreSegments ?? 24);
  return prism(outline, thickness);
}

export interface RingGearOptions {
  /** Number of internal teeth (>= 6). */
  teeth?: number;
  /** Module: pitch diameter / teeth. Must match the planets/sun it meshes with. */
  module?: number;
  /** Ring thickness along Y. */
  thickness?: number;
  /** Pressure angle in degrees. */
  pressureAngle?: number;
  /** Radial width of the solid rim outside the tooth root circle. */
  rimWidth?: number;
}

/**
 * Internal ring gear (annulus / ring gear): the outer housing of a planetary
 * gear set, with teeth cut into its inner bore instead of standing out on a
 * disk. Built by subtracting an external-gear-shaped cutter from a solid rim,
 * so the inner wall becomes the negative of the tooth profile — a real internal
 * gear that visually meshes with the planet gears rolling inside it.
 *
 * The `module` and `pressureAngle` should match the sun/planet gears so the
 * teeth line up. Stands along +Y like every other part.
 */
export function ringGear(opts: RingGearOptions = {}): Mesh {
  const z = Math.max(6, Math.floor(opts.teeth ?? 36));
  const module = opts.module ?? 0.06;
  const thickness = opts.thickness ?? module * 6;
  const pitchR = (module * z) / 2;
  const rim = opts.rimWidth ?? module * 3;
  const outerR = pitchR + module * 1.25 + rim;
  const seg = Math.max(48, z * 2);
  const outer = regularPolygon(seg, outerR, false);
  // Inner wall is a gear tooth profile — cut into the bore, so the ring's inside
  // is the negative of an external gear and visually meshes with the planets.
  const inner = gearOutline({
    teeth: z,
    module,
    ...(opts.pressureAngle !== undefined ? { pressureAngle: opts.pressureAngle } : {}),
  });
  return annularPrism(outer, inner, thickness);
}

/**
 * Extrude the region between two concentric CCW outlines (outer + inner hole)
 * into a watertight solid along +Y. Generalizes `boredPrism` to an arbitrary
 * inner profile (round bore, gear teeth, keyway, ...). Both outlines must be
 * ordered CCW and monotonic in polar angle about the origin.
 */
export function annularPrism(outer: Vec2[], inner: Vec2[], height: number): Mesh {
  const n = outer.length, m = inner.length;
  if (n < 3 || m < 3) return prism(outer, height);
  const hy = height / 2;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];

  let minx = Infinity, maxx = -Infinity, minz = Infinity, maxz = -Infinity;
  for (const p of outer) {
    if (p.x < minx) minx = p.x; if (p.x > maxx) maxx = p.x;
    if (p.y < minz) minz = p.y; if (p.y > maxz) maxz = p.y;
  }
  const spanx = (maxx - minx) || 1, spanz = (maxz - minz) || 1;
  const uvOf = (p: Vec3) => vec2((p.x - minx) / spanx, (p.z - minz) / spanz);
  const quad = (p0: Vec3, p1: Vec3, p2: Vec3, p3: Vec3) => {
    const b = positions.length;
    positions.push(p0, p1, p2, p3);
    normals.push(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0));
    uvs.push(uvOf(p0), uvOf(p1), uvOf(p2), uvOf(p3));
    indices.push(b, b + 1, b + 2, b, b + 2, b + 3);
  };
  // Outer side wall (outward, CCW).
  for (let i = 0; i < n; i++) {
    const a = outer[i]!, c = outer[(i + 1) % n]!;
    quad(vec3(a.x, -hy, a.y), vec3(c.x, -hy, c.y), vec3(c.x, hy, c.y), vec3(a.x, hy, a.y));
  }
  // Inner wall (reversed winding so it faces inward toward the axis).
  for (let i = 0; i < m; i++) {
    const a = inner[i]!, c = inner[(i + 1) % m]!;
    quad(vec3(a.x, hy, a.y), vec3(c.x, hy, c.y), vec3(c.x, -hy, c.y), vec3(a.x, -hy, a.y));
  }
  // Annular caps: merge-walk both loops in angle order so every vertex of both
  // rings is referenced and the result stays watertight when n != m.
  const angleOf = (p: Vec2) => { let a = Math.atan2(p.y, p.x); if (a < 0) a += TAU; return a; };
  const outerAng = outer.map(angleOf);
  const innerAng = inner.map(angleOf);
  const tri = (p0: Vec3, p1: Vec3, p2: Vec3) => {
    const b = positions.length;
    positions.push(p0, p1, p2);
    normals.push(vec3(0, 0, 0), vec3(0, 0, 0), vec3(0, 0, 0));
    uvs.push(uvOf(p0), uvOf(p1), uvOf(p2));
    indices.push(b, b + 1, b + 2);
  };
  const frac = (a: number, a0: number) => ((a - a0 + TAU) % TAU) / TAU;
  for (const end of [{ y: hy, up: true }, { y: -hy, up: false }]) {
    const O = (i: number) => vec3(outer[i % n]!.x, end.y, outer[i % n]!.y);
    const I = (j: number) => vec3(inner[j % m]!.x, end.y, inner[j % m]!.y);
    const a0 = outerAng[0]!;
    let i = 0, j = 0;
    while (i < n || j < m) {
      const fo = i < n ? (i + 1 >= n ? 1 : frac(outerAng[i + 1]!, a0)) : Infinity;
      const fi = j < m ? (j + 1 >= m ? 1 : frac(innerAng[j + 1]!, a0)) : Infinity;
      if (fo <= fi) {
        if (end.up) tri(O(i), O(i + 1), I(j)); else tri(O(i), I(j), O(i + 1));
        i++;
      } else {
        if (end.up) tri(O(i), I(j + 1), I(j)); else tri(O(i), I(j), I(j + 1));
        j++;
      }
    }
  }
  return recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
}

export interface ThreadedRodOptions {
  /** Nominal (major) radius of the shaft. */
  radius?: number;
  /** Shaft length along Y. */
  length?: number;
  /** Thread pitch (Y distance per turn). */
  pitch?: number;
  /** Thread depth (ridge height above the core). */
  depth?: number;
  /** Facets around the shaft. */
  segments?: number;
}

/**
 * Threaded shaft: a core cylinder with a helical V-ridge swept around it. The
 * ridge is a triangular profile lofted along a helix and merged onto the core —
 * a visually honest screw thread without a heavy boolean. Stands along +Y.
 */
export function threadedRod(opts: ThreadedRodOptions = {}): Mesh {
  const radius = opts.radius ?? 0.2;
  const length = opts.length ?? 1;
  const pitch = opts.pitch ?? radius * 0.6;
  const depth = opts.depth ?? radius * 0.18;
  const seg = Math.max(8, Math.floor(opts.segments ?? 24));
  const turns = Math.max(1, length / pitch);
  const coreR = radius - depth;

  // Core cylinder (self-built along Y so we don't depend on primitive winding).
  const core = prism(regularPolygon(seg, coreR, false), length);

  // Helical thread ridge: at each step, place a small outward V-triangle ring.
  const steps = Math.max(24, Math.floor(turns * seg));
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  let prevRing: number[] | null = null;
  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    const ang = t * turns * TAU;
    const y = t * length - length / 2;
    const ca = Math.cos(ang), sa = Math.sin(ang);
    // Triangle cross-section: inner-bottom, tip (outward), inner-top.
    const ringBase = positions.length;
    const half = pitch * 0.28;
    const inner = coreR;
    const tip = radius;
    const ptTop = vec3(ca * inner, y + half, sa * inner);
    const ptTip = vec3(ca * tip, y, sa * tip);
    const ptBot = vec3(ca * inner, y - half, sa * inner);
    positions.push(ptBot, ptTip, ptTop);
    for (let k = 0; k < 3; k++) { normals.push(vec3(ca, 0, sa)); uvs.push(vec2(t, 0)); }
    const ring = [ringBase, ringBase + 1, ringBase + 2];
    if (prevRing) {
      for (let k = 0; k < 3; k++) {
        const a = prevRing[k]!, b = prevRing[(k + 1) % 3]!;
        const c = ring[k]!, d = ring[(k + 1) % 3]!;
        indices.push(a, b, d, a, d, c);
      }
    }
    prevRing = ring;
  }
  const thread = recomputeNormals(makeMesh({ positions, normals, uvs, indices }));
  return merge(core, thread);
}

/**
 * A ready-made bolt: threaded shaft + a hex head sitting on top.
 */
export function bolt(opts: { radius?: number; length?: number; pitch?: number; headAcrossFlats?: number; headHeight?: number } = {}): Mesh {
  const radius = opts.radius ?? 0.2;
  const length = opts.length ?? 1;
  const af = opts.headAcrossFlats ?? radius * 3.4;
  const headH = opts.headHeight ?? radius * 1.6;
  const shaft = threadedRod({ radius, length, ...(opts.pitch !== undefined ? { pitch: opts.pitch } : {}) });
  // Move the head to sit on the top of the shaft.
  const head = prism(regularPolygon(6, af, true), headH);
  const shifted = translateY(head, length / 2 + headH / 2);
  return merge(shaft, shifted);
}

function translateY(m: Mesh, dy: number): Mesh {
  return {
    positions: m.positions.map((p) => vec3(p.x, p.y + dy, p.z)),
    normals: m.normals.map((n) => ({ ...n })),
    uvs: m.uvs.map((u) => ({ ...u })),
    indices: m.indices.slice(),
  };
}

/**
 * Bolt-hole circle: evenly spaced positions on a circle of `boltCircleRadius`
 * in the XZ plane at height `y`. The standard way to lay out flange / hub /
 * cover fasteners. Returns center positions you can `copyToPoints` a hole or
 * bolt onto, or feed to `flange`'s subtract.
 */
export function boltHoleCircle(count: number, boltCircleRadius: number, y = 0, phase = 0): Vec3[] {
  const n = Math.max(1, Math.floor(count));
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * TAU;
    pts.push(vec3(Math.cos(a) * boltCircleRadius, y, Math.sin(a) * boltCircleRadius));
  }
  return pts;
}

export interface FlangeOptions {
  /** Outer radius of the flange disk. */
  radius?: number;
  /** Disk thickness along Y. */
  thickness?: number;
  /** Central bore radius (the pipe passes through). */
  boreRadius?: number;
  /** Number of bolt holes around the rim (0 = none, solid ring). */
  boltHoles?: number;
  /** Radius of each bolt hole. */
  boltHoleRadius?: number;
  /** Radius of the bolt-hole circle (defaults between bore and rim). */
  boltCircleRadius?: number;
  /** Facets of the outer/inner rings. */
  segments?: number;
}

/**
 * Pipe flange: an annular disk (outer radius + central bore) with a ring of
 * bolt holes. Built as a watertight solid directly (no CSG) for the concentric
 * bore, then bolt holes are punched with the boolean solver only when present.
 */
export function flange(opts: FlangeOptions = {}): Mesh {
  const radius = opts.radius ?? 0.5;
  const thickness = opts.thickness ?? radius * 0.25;
  const bore = opts.boreRadius ?? radius * 0.4;
  const seg = Math.max(8, Math.floor(opts.segments ?? 48));
  const outline = regularPolygon(seg, radius, false);
  const disk = boredPrism(outline, thickness, bore, seg);

  const holes = Math.max(0, Math.floor(opts.boltHoles ?? 0));
  if (holes === 0) return disk;

  // Bolt holes need real subtraction (non-concentric). Defer to the caller's
  // boolean if available; here we return the disk plus a marker of hole centers
  // baked as tiny recessed rings is overkill — instead we expose the punch via
  // punchHoles which the public builder uses.
  const bcr = opts.boltCircleRadius ?? (bore + radius) / 2;
  const hr = opts.boltHoleRadius ?? radius * 0.06;
  return punchHoles(disk, boltHoleCircle(holes, bcr, 0), hr, thickness, seg);
}

/**
 * Punch cylindrical holes through a solid at the given XZ centers, using the
 * CSG subtract solver. `depth` should exceed the solid's Y extent so each
 * cutter fully passes through. Result is cleaned (welded, degenerate-free).
 */
export function punchHoles(solid: Mesh, centers: Vec3[], holeRadius: number, depth: number, segments = 24): Mesh {
  if (centers.length === 0 || holeRadius <= 0) return solid;
  // Drill via a single combined-tool subtract (see subtractAll): chaining one
  // subtract per hole cracks the mesh and the next boolean returns empty.
  const cutH = depth * 4 + 0.04; // generous overshoot so caps never stay coplanar
  const cutters = centers.map((c) => translateXZ(yCylinder(holeRadius, cutH, segments), c.x, c.z));
  return cleanMesh(subtractAll(solid, cutters));
}

/** Simple watertight cylinder along +Y (self-built, consistent outward normals). */
function yCylinder(radius: number, height: number, segments: number): Mesh {
  const outline: Vec2[] = [];
  const n = Math.max(3, Math.floor(segments));
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU;
    outline.push(vec2(Math.cos(a) * radius, Math.sin(a) * radius));
  }
  return prism(outline, height);
}

function translateXZ(m: Mesh, dx: number, dz: number): Mesh {
  return {
    positions: m.positions.map((p) => vec3(p.x + dx, p.y, p.z + dz)),
    normals: m.normals.map((nn) => ({ ...nn })),
    uvs: m.uvs.map((u) => ({ ...u })),
    indices: m.indices.slice(),
  };
}



