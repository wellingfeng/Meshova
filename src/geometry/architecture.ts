/**
 * Parametric architecture generators — arch / column / pavilion / bridge-wall.
 *
 * Reference: Elderwood Overlook's Houdini OTLs (Archway_Generator,
 * Column_Generator, Pavilion_Generator, BridgeWall_Generator) — the clean
 * "parameters -> structure" samples. Re-authored from public procedural
 * technique, no asset copied. Each generator is deterministic (same params ->
 * same mesh) and returns a plain indexed Mesh so the DSL/AI can compose them.
 *
 * All builders center the structure on the origin footprint and grow +Y up.
 */
import type { Vec3 } from "../math/vec3.js";
import type { Vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import { vec2 } from "../math/vec2.js";
import { box } from "./primitives.js";
import { cylinder } from "./primitives2.js";
import { transform } from "./transform.js";
import { merge, computeNormals, type Mesh } from "./mesh.js";
import { polyline, type Curve } from "./curve.js";
import { profileSweep, rectProfile, lathe } from "./shapes.js";

// ---------------------------------------------------------------------------
// Archway
// ---------------------------------------------------------------------------

export interface ArchwayOptions {
  /** Clear opening width between the piers. */
  span?: number;
  /** Height of the pier (springline) before the arch begins. */
  pierHeight?: number;
  /** Pier (jamb) thickness in X. */
  pierWidth?: number;
  /** Structure depth along Z. */
  depth?: number;
  /** Arch ring radial thickness. */
  ringThickness?: number;
  /** Arch profile: "round" (semicircle) or "pointed" (gothic two-arc). */
  archStyle?: "round" | "pointed";
  /** Add a keystone block at the crown. */
  keystone?: boolean;
  /** Segments along the arch curve. */
  segments?: number;
}

/** Arch centre-line: semicircle or pointed (two-centre gothic) opening down. */
function archCurve(r: number, style: "round" | "pointed", n: number): Curve {
  const pts: Vec3[] = [];
  if (style === "round") {
    for (let i = 0; i <= n; i++) {
      const t = Math.PI * (i / n); // 0..PI, left springer over crown to right
      pts.push(vec3(-r * Math.cos(t), r * Math.sin(t), 0));
    }
  } else {
    // Pointed: two arcs of radius = span struck from the opposite springers,
    // meeting at an apex above the semicircle crown.
    const R = 2 * r; // equilateral (second-point) arch
    const half = Math.floor(n / 2);
    // left arc: centre at (+r, 0), sweeps from left springer (-r,0) up to apex
    const apexY = Math.sqrt(Math.max(0, R * R - r * r));
    const aStart = Math.atan2(0, -r - r); // angle from centre(+r,0) to (-r,0) = PI
    const aEnd = Math.atan2(apexY, -r);    // to apex (0, apexY)
    for (let i = 0; i <= half; i++) {
      const a = aStart + (aEnd - aStart) * (i / half);
      pts.push(vec3(r + R * Math.cos(a), R * Math.sin(a), 0));
    }
    // right arc mirrored, apex down to right springer
    for (let i = 1; i <= half; i++) {
      const a = aEnd + ((Math.PI - aEnd) - aEnd) * (i / half);
      // mirror the left arc across x=0 in reverse
      const src = aEnd + (aStart - aEnd) * (i / half);
      pts.push(vec3(-(r + R * Math.cos(src)), R * Math.sin(src), 0));
    }
  }
  return polyline(pts, false);
}

/** A semicircular or pointed arch on two piers — a gate/doorway ring. */
export function archway(opts: ArchwayOptions = {}): Mesh {
  const span = opts.span ?? 2;
  const pierHeight = opts.pierHeight ?? 2;
  const pierWidth = opts.pierWidth ?? 0.5;
  const depth = opts.depth ?? 0.6;
  const ring = opts.ringThickness ?? 0.35;
  const style = opts.archStyle ?? "round";
  const segments = Math.max(6, opts.segments ?? 20);
  const keystone = opts.keystone ?? true;
  const r = span / 2;
  const parts: Mesh[] = [];

  // Two piers (jambs) from ground to springline.
  for (const side of [-1, 1] as const) {
    const px = side * (r + pierWidth / 2);
    parts.push(transform(box(pierWidth, pierHeight, depth), { translate: vec3(px, pierHeight / 2, 0) }));
  }

  // Arch ring swept as a rectangular voussoir band, lifted to the springline.
  const curve = archCurve(r, style, segments);
  const lifted = polyline(curve.points.map((p) => vec3(p.x, p.y + pierHeight, p.z)), false);
  const ringMesh = profileSweep(lifted, rectProfile(depth / 2, ring / 2), { caps: true });
  parts.push(ringMesh);

  // Keystone wedge at the crown.
  if (keystone) {
    const crownY = pierHeight + (style === "round" ? r : Math.sqrt(Math.max(0, 4 * r * r - r * r)));
    parts.push(transform(box(pierWidth * 0.8, ring * 1.6, depth * 1.05), { translate: vec3(0, crownY + ring * 0.4, 0) }));
  }

  return computeNormals(merge(...parts), 40);
}

// ---------------------------------------------------------------------------
// Column
// ---------------------------------------------------------------------------

export interface ColumnOptions {
  /** Total column height (base + shaft + capital). */
  height?: number;
  /** Shaft radius at the bottom. */
  radius?: number;
  /** Radial segments (facets). */
  segments?: number;
  /** Entasis: fraction the shaft narrows toward the top (0 = straight). */
  taper?: number;
  /** Number of flutes cut into the shaft (0 = smooth). */
  flutes?: number;
  /** Flute cut depth as a fraction of radius. */
  fluteDepth?: number;
  /** Add a stepped square base plinth. */
  base?: boolean;
  /** Add a flared capital block on top. */
  capital?: boolean;
}

/** A classical column: plinth + fluted tapering shaft + capital. */
export function column(opts: ColumnOptions = {}): Mesh {
  const height = opts.height ?? 4;
  const radius = opts.radius ?? 0.4;
  const segments = Math.max(6, opts.segments ?? 24);
  const taper = Math.min(0.6, Math.max(0, opts.taper ?? 0.15));
  const flutes = Math.max(0, Math.floor(opts.flutes ?? 0));
  const fluteDepth = Math.min(0.4, Math.max(0, opts.fluteDepth ?? 0.08));
  const wantBase = opts.base ?? true;
  const wantCapital = opts.capital ?? true;

  const baseH = wantBase ? height * 0.08 : 0;
  const capH = wantCapital ? height * 0.09 : 0;
  const shaftH = height - baseH - capH;
  const parts: Mesh[] = [];

  // Shaft as a lathe profile so taper + flute ripple live in one surface.
  const rings = 10;
  const prof: Vec2[] = [];
  prof.push(vec2(0, 0));
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const rr = radius * (1 - taper * t);
    prof.push(vec2(rr, t * shaftH));
  }
  prof.push(vec2(0, shaftH));
  let shaft = lathe(prof, { segments });
  // Flute the shaft: pull surface radius in on a cosine pattern per column angle.
  if (flutes > 0) {
    shaft = fluteShaft(shaft, flutes, fluteDepth * radius);
  }
  parts.push(transform(shaft, { translate: vec3(0, baseH, 0) }));

  if (wantBase) {
    const bw = radius * 2.8;
    parts.push(transform(box(bw, baseH * 0.6, bw), { translate: vec3(0, baseH * 0.3, 0) }));
    parts.push(transform(box(bw * 0.85, baseH * 0.6, bw * 0.85), { translate: vec3(0, baseH * 0.9, 0) }));
  }
  if (wantCapital) {
    const topR = radius * (1 - taper);
    const cw = topR * 3.2;
    const cy = baseH + shaftH;
    parts.push(transform(cylinder(topR * 1.3, capH * 0.5, segments), { translate: vec3(0, cy + capH * 0.25, 0) }));
    parts.push(transform(box(cw, capH * 0.5, cw), { translate: vec3(0, cy + capH * 0.75, 0) }));
  }
  return computeNormals(merge(...parts), 35);
}

/** Push shaft vertices radially inward on a per-angle cosine to carve flutes. */
function fluteShaft(mesh: Mesh, flutes: number, depth: number): Mesh {
  const positions = mesh.positions.map((p) => {
    const r = Math.hypot(p.x, p.z);
    if (r < 1e-5) return p;
    const ang = Math.atan2(p.z, p.x);
    // cosine flutes: 0 at ridges, 1 in the groove
    const groove = (1 - Math.cos(ang * flutes)) * 0.5;
    const nr = r - depth * groove;
    const k = nr / r;
    return vec3(p.x * k, p.y, p.z * k);
  });
  return computeNormals({ positions, normals: mesh.normals.slice(), uvs: mesh.uvs.slice(), indices: mesh.indices.slice() }, 25);
}

// ---------------------------------------------------------------------------
// Pavilion
// ---------------------------------------------------------------------------

export interface PavilionOptions {
  /** Footprint half-extent in X (columns sit on the corners of 2*size). */
  size?: number;
  /** Depth half-extent in Z (defaults to size, square). */
  depth?: number;
  /** Column height. */
  columnHeight?: number;
  /** Column radius. */
  columnRadius?: number;
  /** Columns per side edge (>=2, corners shared). */
  columnsPerSide?: number;
  /** Roof style: "hip" (pyramid), "flat" (slab), or "dome". */
  roof?: "hip" | "flat" | "dome";
  /** Roof rise (peak height above the entablature). */
  roofRise?: number;
  /** Add a raised floor platform. */
  platform?: boolean;
}

/** An open colonnaded pavilion: platform + perimeter columns + roof. */
export function pavilion(opts: PavilionOptions = {}): Mesh {
  const sx = opts.size ?? 3;
  const sz = opts.depth ?? opts.size ?? 3;
  const colH = opts.columnHeight ?? 4;
  const colR = opts.columnRadius ?? 0.35;
  const perSide = Math.max(2, Math.floor(opts.columnsPerSide ?? 3));
  const roof = opts.roof ?? "hip";
  const rise = opts.roofRise ?? 1.6;
  const wantPlatform = opts.platform ?? true;
  const parts: Mesh[] = [];

  const platH = wantPlatform ? 0.4 : 0;
  if (wantPlatform) {
    parts.push(transform(box(sx * 2 + colR * 4, platH, sz * 2 + colR * 4), { translate: vec3(0, platH / 2, 0) }));
    parts.push(transform(box(sx * 2 + colR * 6, 0.15, sz * 2 + colR * 6), { translate: vec3(0, 0.075, 0) }));
  }

  // Perimeter column positions (dedup corners via a set).
  const seen = new Set<string>();
  const colTemplate = column({ height: colH, radius: colR, segments: 20, base: true, capital: true, flutes: 12, fluteDepth: 0.06 });
  for (let i = 0; i < perSide; i++) {
    const u = perSide === 1 ? 0 : i / (perSide - 1);
    const x = -sx + u * (2 * sx);
    const z = -sz + u * (2 * sz);
    const spots: Array<[number, number]> = [[x, -sz], [x, sz], [-sx, z], [sx, z]];
    for (const [px, pz] of spots) {
      const key = `${px.toFixed(3)},${pz.toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      parts.push(transform(colTemplate, { translate: vec3(px, platH, pz) }));
    }
  }

  // Entablature ring on top of the columns.
  const entY = platH + colH;
  const ew = sx * 2 + colR * 4;
  const ed = sz * 2 + colR * 4;
  parts.push(transform(box(ew, 0.35, ed), { translate: vec3(0, entY + 0.175, 0) }));

  // Roof.
  const roofBaseY = entY + 0.35;
  if (roof === "flat") {
    parts.push(transform(box(ew * 1.1, 0.3, ed * 1.1), { translate: vec3(0, roofBaseY + 0.15, 0) }));
  } else if (roof === "dome") {
    const domeR = Math.min(ew, ed) / 2;
    const prof: Vec2[] = [];
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      const a = (Math.PI / 2) * (i / steps);
      prof.push(vec2(domeR * Math.cos(a), rise * Math.sin(a)));
    }
    parts.push(transform(lathe(prof, { segments: 24 }), { translate: vec3(0, roofBaseY, 0) }));
  } else {
    // Hip: a pyramid via a 4-sided lathe-like cone (use cone-shaped box stack).
    parts.push(transform(pyramidRoof(ew * 1.15 / 2, ed * 1.15 / 2, rise), { translate: vec3(0, roofBaseY, 0) }));
  }
  return computeNormals(merge(...parts), 40);
}

/** A four-sided hip roof (rectangular pyramid) apex at +Y. */
function pyramidRoof(hx: number, hz: number, rise: number): Mesh {
  const positions: Vec3[] = [
    vec3(-hx, 0, -hz), vec3(hx, 0, -hz), vec3(hx, 0, hz), vec3(-hx, 0, hz), vec3(0, rise, 0),
  ];
  const normals = positions.map(() => vec3(0, 1, 0));
  const uvs = positions.map(() => vec2(0, 0));
  const indices = [0, 1, 4, 1, 2, 4, 2, 3, 4, 3, 0, 4, 0, 2, 1, 0, 3, 2];
  return computeNormals({ positions, normals, uvs, indices }, 1);
}

// ---------------------------------------------------------------------------
// Bridge wall (parapet run with balusters / merlons)
// ---------------------------------------------------------------------------

export interface BridgeWallOptions {
  /** Total run length along X. */
  length?: number;
  /** Wall height. */
  height?: number;
  /** Wall thickness in Z. */
  thickness?: number;
  /** Number of openings (balustrade gaps / crenels). 0 = solid wall. */
  openings?: number;
  /** Opening style: "baluster" (posts) or "crenel" (merlon gaps). */
  style?: "baluster" | "crenel" | "solid";
  /** Add a coping cap rail on top. */
  coping?: boolean;
}

/** A parapet / balustrade wall run for bridges and terraces. */
export function bridgeWall(opts: BridgeWallOptions = {}): Mesh {
  const length = opts.length ?? 6;
  const height = opts.height ?? 1;
  const thick = opts.thickness ?? 0.3;
  const openings = Math.max(0, Math.floor(opts.openings ?? 0));
  const style = opts.style ?? (openings > 0 ? "baluster" : "solid");
  const wantCoping = opts.coping ?? true;
  const parts: Mesh[] = [];

  const copingH = wantCoping ? height * 0.12 : 0;
  const bodyH = height - copingH;

  if (style === "solid" || openings === 0) {
    parts.push(transform(box(length, bodyH, thick), { translate: vec3(0, bodyH / 2, 0) }));
  } else if (style === "crenel") {
    // Merlons: solid base band + toothed top.
    const baseH = bodyH * 0.55;
    parts.push(transform(box(length, baseH, thick), { translate: vec3(0, baseH / 2, 0) }));
    const teeth = openings + 1;
    const toothW = length / (teeth * 2 - 1);
    for (let i = 0; i < teeth; i++) {
      const x = -length / 2 + toothW / 2 + i * (toothW * 2);
      parts.push(transform(box(toothW, bodyH - baseH, thick), { translate: vec3(x, baseH + (bodyH - baseH) / 2, 0) }));
    }
  } else {
    // Baluster: bottom rail + top rail + turned posts between.
    const railH = bodyH * 0.14;
    parts.push(transform(box(length, railH, thick), { translate: vec3(0, railH / 2, 0) }));
    parts.push(transform(box(length, railH, thick), { translate: vec3(0, bodyH - railH / 2, 0) }));
    const posts = openings + 1;
    const balProf: Vec2[] = [
      vec2(0, 0), vec2(thick * 0.35, 0), vec2(thick * 0.22, bodyH * 0.25),
      vec2(thick * 0.4, bodyH * 0.5), vec2(thick * 0.2, bodyH * 0.75), vec2(thick * 0.32, bodyH), vec2(0, bodyH),
    ];
    const baluster = lathe(balProf, { segments: 12 });
    for (let i = 0; i < posts; i++) {
      const x = -length / 2 + (length / (posts - 1 || 1)) * i;
      const px = posts === 1 ? 0 : x;
      parts.push(transform(baluster, { translate: vec3(px, railH, 0) }));
    }
  }

  if (wantCoping) {
    parts.push(transform(box(length + thick * 0.6, copingH, thick + 0.1), { translate: vec3(0, bodyH + copingH / 2, 0) }));
  }
  return computeNormals(merge(...parts), 40);
}
