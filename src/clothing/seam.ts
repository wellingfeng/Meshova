/**
 * Seam graph (M2 — Seam Graph).
 *
 * A garment's 3D topology comes from its seams, not from arbitrary triangle
 * stitching. A seam declares that edge A of one panel is sewn to edge B of
 * another (or the same) panel, with a direction and an optional gather ratio
 * (edge A longer than edge B => the cloth bunches, e.g. a gathered skirt or a
 * puff sleeve cap).
 *
 * This module is data + validation: it does not move geometry. The drape stage
 * reads the seam graph to know which boundary points to weld together.
 *
 * Deterministic: pure data transforms.
 */
import type { PanelDef } from "./pattern.js";
import { edgeLength } from "./pattern.js";

/** Reference to a specific edge of a specific panel. */
export interface EdgeRef {
  panel: string;
  edge: string;
}

/** A seam: edge `a` sewn to edge `b`. */
export interface SeamDef {
  a: EdgeRef;
  b: EdgeRef;
  /**
   * "same"     => a.start sews to b.start (parallel),
   * "opposite" => a.start sews to b.end (anti-parallel, the common mirror case).
   */
  direction: "same" | "opposite";
  /** Gather ratio = len(a)/len(b); >1 means edge a is eased onto b. */
  ratio?: number;
  /** Seam allowance (visual/thickness hint, unused by heuristic drape). */
  seamAllowance?: number;
}

/** A garment as a set of panels plus the seams joining them. */
export interface GarmentDef {
  id: string;
  panels: PanelDef[];
  seams: SeamDef[];
}

/** Build an EdgeRef. */
export function edgeRef(panel: string, edge: string): EdgeRef {
  return { panel, edge };
}

/** Build a seam. */
export function seam(
  a: EdgeRef,
  b: EdgeRef,
  direction: "same" | "opposite" = "opposite",
  opts: { ratio?: number; seamAllowance?: number } = {},
): SeamDef {
  const s: SeamDef = { a, b, direction };
  if (opts.ratio !== undefined) s.ratio = opts.ratio;
  if (opts.seamAllowance !== undefined) s.seamAllowance = opts.seamAllowance;
  return s;
}

export interface SeamDiagnostic {
  seamIndex: number;
  severity: "error" | "warn";
  message: string;
}

function findPanel(g: GarmentDef, id: string): PanelDef | undefined {
  return g.panels.find((p) => p.id === id);
}

function findEdge(panel: PanelDef | undefined, id: string) {
  return panel?.edges.find((e) => e.id === id);
}

/**
 * Validate a seam graph: every EdgeRef must resolve, and seamed edges should
 * have compatible lengths (within the declared gather ratio, default tolerance
 * 35%). Returns a list of diagnostics; empty means clean.
 */
export function validateSeams(g: GarmentDef, lengthTolerance = 0.35): SeamDiagnostic[] {
  const diags: SeamDiagnostic[] = [];
  g.seams.forEach((s, i) => {
    const pa = findPanel(g, s.a.panel);
    const pb = findPanel(g, s.b.panel);
    const ea = findEdge(pa, s.a.edge);
    const eb = findEdge(pb, s.b.edge);
    if (!pa) {
      diags.push({ seamIndex: i, severity: "error", message: `panel '${s.a.panel}' not found` });
    }
    if (!pb) {
      diags.push({ seamIndex: i, severity: "error", message: `panel '${s.b.panel}' not found` });
    }
    if (pa && !ea) {
      diags.push({ seamIndex: i, severity: "error", message: `edge '${s.a.edge}' not in panel '${s.a.panel}'` });
    }
    if (pb && !eb) {
      diags.push({ seamIndex: i, severity: "error", message: `edge '${s.b.edge}' not in panel '${s.b.panel}'` });
    }
    if (ea && eb) {
      const la = edgeLength(ea);
      const lb = edgeLength(eb);
      const ratio = s.ratio ?? 1;
      const expected = lb * ratio;
      if (expected > 0) {
        const err = Math.abs(la - expected) / expected;
        if (err > lengthTolerance) {
          diags.push({
            seamIndex: i,
            severity: "warn",
            message: `length mismatch: len(a)=${la.toFixed(3)} vs ratio*len(b)=${expected.toFixed(3)} (${(err * 100).toFixed(0)}%)`,
          });
        }
      }
    }
  });
  return diags;
}

/** True if the garment has no seam errors (warnings allowed). */
export function seamsAreValid(g: GarmentDef): boolean {
  return validateSeams(g).every((d) => d.severity !== "error");
}

/** Effective gather ratio of a seam (1 if unset). */
export function seamRatio(s: SeamDef): number {
  return s.ratio ?? 1;
}
