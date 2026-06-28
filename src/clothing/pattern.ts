/**
 * Pattern space (M1 — Pattern Core).
 *
 * A garment starts life as flat 2D panels, exactly like a sewing pattern. Each
 * panel is a closed loop of edges (straight or quadratic-Bezier), with stable
 * edge IDs that seams, darts and UVs reference. This is the heart of the
 * MD-inspired design: generate in pattern space, then map panels onto the body
 * (see drape.ts). Never sculpt a garment mesh directly.
 *
 * 2D convention: X right, Y up, all in "cloth units" that match avatar units.
 * Panels are authored front-facing (CCW) so normals point toward the viewer
 * before the panel is wrapped onto the body.
 *
 * Deterministic: pure geometry, no random, no time.
 */
import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";

/** Straight or quadratic-Bezier edge between two pattern points. */
export interface PatternEdge {
  /** Stable id within the panel; seams/darts reference this. */
  id: string;
  /** Start point. */
  a: Vec2;
  /** End point. */
  b: Vec2;
  /** Optional quadratic-Bezier control point; absent => straight line. */
  control?: Vec2;
  /** Semantic tag (neckline, armhole, hem, side, shoulder, inseam, ...). */
  role?: string;
}

/** A dart: a wedge removed from the panel to add 3D shaping (bust, waist). */
export interface DartDef {
  /** Edge this dart opens from. */
  edge: string;
  /** Parametric position along the edge (0..1). */
  position: number;
  /** Dart intake width at the edge. */
  width: number;
  /** Dart depth into the panel. */
  depth: number;
}

/** A panel: a closed loop of edges plus optional shaping. */
export interface PanelDef {
  id: string;
  /** Mirror behaviour when the garment is assembled. */
  mirror?: "none" | "left" | "right";
  /** Grain direction (warp), default +Y. Used for anisotropic fabric. */
  grain?: Vec2;
  /** Ordered, head-to-tail closed loop of edges. */
  edges: PatternEdge[];
  darts?: DartDef[];
  /** Body region the panel maps onto (front, back, sleeve, ...). */
  region?: string;
}

/** A polygon: a flat list of boundary points, CCW. */
export interface Polygon {
  points: Vec2[];
  /** For each boundary point, the source edge id (for seam mapping). */
  edgeOfPoint: string[];
  /** For each boundary point, parametric position along its source edge. */
  paramOfPoint: number[];
}

/** A triangulated panel: boundary points + triangle indices. */
export interface PanelMesh2D {
  panelId: string;
  points: Vec2[];
  indices: number[];
  edgeOfPoint: string[];
  paramOfPoint: number[];
}

/** Build a straight edge. */
export function edge(id: string, a: Vec2, b: Vec2, role?: string): PatternEdge {
  return role ? { id, a, b, role } : { id, a, b };
}

/** Build a curved (quadratic-Bezier) edge. */
export function curveEdge(
  id: string,
  a: Vec2,
  control: Vec2,
  b: Vec2,
  role?: string,
): PatternEdge {
  return role ? { id, a, b, control, role } : { id, a, b, control };
}

/** Sample an edge at parametric t in [0,1]. */
export function sampleEdge(e: PatternEdge, t: number): Vec2 {
  if (!e.control) {
    return vec2(e.a.x + (e.b.x - e.a.x) * t, e.a.y + (e.b.y - e.a.y) * t);
  }
  const mt = 1 - t;
  const x = mt * mt * e.a.x + 2 * mt * t * e.control.x + t * t * e.b.x;
  const y = mt * mt * e.a.y + 2 * mt * t * e.control.y + t * t * e.b.y;
  return vec2(x, y);
}

/** Approximate edge length by sampling. */
export function edgeLength(e: PatternEdge, samples = 16): number {
  if (!e.control) {
    const dx = e.b.x - e.a.x;
    const dy = e.b.y - e.a.y;
    return Math.hypot(dx, dy);
  }
  let len = 0;
  let prev = sampleEdge(e, 0);
  for (let i = 1; i <= samples; i++) {
    const p = sampleEdge(e, i / samples);
    len += Math.hypot(p.x - prev.x, p.y - prev.y);
    prev = p;
  }
  return len;
}

/**
 * Flatten a panel boundary into a polygon, sampling curved edges into
 * `curveSamples` segments. Straight edges contribute their start point only
 * (the next edge's start continues the loop), curved edges contribute
 * intermediate samples for a smooth boundary.
 */
export function panelToPolygon(panel: PanelDef, curveSamples = 12): Polygon {
  const points: Vec2[] = [];
  const edgeOfPoint: string[] = [];
  const paramOfPoint: number[] = [];
  for (const e of panel.edges) {
    const steps = e.control ? curveSamples : 1;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      points.push(sampleEdge(e, t));
      edgeOfPoint.push(e.id);
      paramOfPoint.push(t);
    }
  }
  return { points, edgeOfPoint, paramOfPoint };
}

/** Signed area of a polygon (positive = CCW). */
export function polygonArea(points: ReadonlyArray<Vec2>): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const a = points[i]!;
    const b = points[(i + 1) % points.length]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** True if the panel loop is closed enough (start ~= projected end). */
export function isClosedLoop(panel: PanelDef, eps = 1e-6): boolean {
  if (panel.edges.length < 3) return false;
  for (let i = 0; i < panel.edges.length; i++) {
    const cur = panel.edges[i]!;
    const next = panel.edges[(i + 1) % panel.edges.length]!;
    if (Math.hypot(cur.b.x - next.a.x, cur.b.y - next.a.y) > eps) return false;
  }
  return true;
}

function pointInTriangle(p: Vec2, a: Vec2, b: Vec2, c: Vec2): boolean {
  const d1 = (p.x - b.x) * (a.y - b.y) - (a.x - b.x) * (p.y - b.y);
  const d2 = (p.x - c.x) * (b.y - c.y) - (b.x - c.x) * (p.y - c.y);
  const d3 = (p.x - a.x) * (c.y - a.y) - (c.x - a.x) * (p.y - a.y);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}

/**
 * Ear-clipping triangulation of a simple polygon. Handles convex and mildly
 * concave panels (necklines, armholes). Expects CCW winding; flips if CW.
 */
export function triangulatePolygon(points: ReadonlyArray<Vec2>): number[] {
  const n = points.length;
  if (n < 3) return [];
  const ccw = polygonArea(points) > 0;
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push(ccw ? i : n - 1 - i);

  const tris: number[] = [];
  let guard = 0;
  const maxGuard = n * n + 10;
  while (idx.length > 3 && guard++ < maxGuard) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const i0 = idx[(i - 1 + idx.length) % idx.length]!;
      const i1 = idx[i]!;
      const i2 = idx[(i + 1) % idx.length]!;
      const a = points[i0]!;
      const b = points[i1]!;
      const c = points[i2]!;
      // Convex corner test (CCW).
      const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
      if (cross <= 0) continue;
      // No other vertex inside this ear.
      let contains = false;
      for (const j of idx) {
        if (j === i0 || j === i1 || j === i2) continue;
        if (pointInTriangle(points[j]!, a, b, c)) {
          contains = true;
          break;
        }
      }
      if (contains) continue;
      // Emit in CCW order matching the original orientation.
      if (ccw) tris.push(i0, i1, i2);
      else tris.push(i0, i2, i1);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break; // degenerate; bail with what we have
  }
  if (idx.length === 3) {
    if (ccw) tris.push(idx[0]!, idx[1]!, idx[2]!);
    else tris.push(idx[0]!, idx[2]!, idx[1]!);
  }
  return tris;
}

/** Triangulate a panel into a 2D mesh with seam-mapping metadata. */
export function triangulatePanel(panel: PanelDef, curveSamples = 12): PanelMesh2D {
  const poly = panelToPolygon(panel, curveSamples);
  const indices = triangulatePolygon(poly.points);
  return {
    panelId: panel.id,
    points: poly.points,
    indices,
    edgeOfPoint: poly.edgeOfPoint,
    paramOfPoint: poly.paramOfPoint,
  };
}

/** Axis-aligned bounds of a panel's flattened boundary. */
export function panelBounds(panel: PanelDef): { min: Vec2; max: Vec2 } {
  const poly = panelToPolygon(panel, 8);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly.points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { min: vec2(minX, minY), max: vec2(maxX, maxY) };
}
