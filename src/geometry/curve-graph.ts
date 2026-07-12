/**
 * Curve graph: node positions + weighted edges, with shortest-path routing.
 *
 * This is the generic "curve network" layer behind pipes, roads, vines and
 * light wiring. Graph edges can carry explicit polyline points; path extraction
 * turns a route through the graph back into a Curve so existing sweep code can
 * consume it directly.
 */
import type { Vec3 } from "../math/vec3.js";
import { length, sub } from "../math/vec3.js";
import { polyline, type Curve } from "./curve.js";

export interface CurveGraphNode {
  id: string;
  position: Vec3;
}

export interface CurveGraphEdge {
  from: string;
  to: string;
  cost?: number;
  /** Optional polyline for the edge. Should include endpoints in world space. */
  points?: Vec3[];
}

export interface CurveGraph {
  nodes: CurveGraphNode[];
  edges: CurveGraphEdge[];
}

export function makeCurveGraph(nodes: CurveGraphNode[] = [], edges: CurveGraphEdge[] = []): CurveGraph {
  return {
    nodes: nodes.map((n) => ({ id: n.id, position: { ...n.position } })),
    edges: edges.map((e) => {
      const edge: CurveGraphEdge = { from: e.from, to: e.to };
      if (e.cost !== undefined) edge.cost = e.cost;
      if (e.points) edge.points = e.points.map((p) => ({ ...p }));
      return edge;
    }),
  };
}

export function addCurveNode(graph: CurveGraph, node: CurveGraphNode): CurveGraph {
  return makeCurveGraph([...graph.nodes, node], graph.edges);
}

export function addCurveEdge(graph: CurveGraph, edge: CurveGraphEdge): CurveGraph {
  return makeCurveGraph(graph.nodes, [...graph.edges, edge]);
}

export function curveGraphNode(graph: CurveGraph, id: string): CurveGraphNode | undefined {
  return graph.nodes.find((n) => n.id === id);
}

export function curveGraphEdge(graph: CurveGraph, from: string, to: string): CurveGraphEdge | undefined {
  return graph.edges.find(
    (e) => (e.from === from && e.to === to) || (e.from === to && e.to === from),
  );
}

export function curveGraphNeighbors(graph: CurveGraph, id: string): Array<{ id: string; cost: number }> {
  const out: Array<{ id: string; cost: number }> = [];
  for (const edge of graph.edges) {
    if (edge.from === id) out.push({ id: edge.to, cost: edgeCost(graph, edge) });
    else if (edge.to === id) out.push({ id: edge.from, cost: edgeCost(graph, edge) });
  }
  return out;
}

export function curveGraphShortestPath(graph: CurveGraph, start: string, goal: string): string[] {
  if (start === goal) return curveGraphNode(graph, start) ? [start] : [];
  if (!curveGraphNode(graph, start) || !curveGraphNode(graph, goal)) return [];

  const dist = new Map<string, number>();
  const prev = new Map<string, string>();
  const pending = new Set(graph.nodes.map((n) => n.id));

  for (const node of pending) dist.set(node, Infinity);
  dist.set(start, 0);

  while (pending.size > 0) {
    let cur: string | null = null;
    let best = Infinity;
    for (const id of pending) {
      const d = dist.get(id) ?? Infinity;
      if (d < best) {
        best = d;
        cur = id;
      }
    }
    if (cur == null || best === Infinity) break;
    pending.delete(cur);
    if (cur === goal) break;

    for (const next of curveGraphNeighbors(graph, cur)) {
      if (!pending.has(next.id)) continue;
      const alt = best + next.cost;
      if (alt < (dist.get(next.id) ?? Infinity)) {
        dist.set(next.id, alt);
        prev.set(next.id, cur);
      }
    }
  }

  if (start !== goal && !prev.has(goal)) return [];
  const path = [goal];
  let cur = goal;
  while (cur !== start) {
    const p = prev.get(cur);
    if (!p) return [];
    path.push(p);
    cur = p;
  }
  return path.reverse();
}

export function curveGraphPathToCurve(graph: CurveGraph, path: ReadonlyArray<string>, closed = false): Curve {
  const pts: Vec3[] = [];
  for (let i = 0; i < path.length; i++) {
    const node = curveGraphNode(graph, path[i]!);
    if (!node) continue;
    if (pts.length === 0) pts.push({ ...node.position });
    if (i === path.length - 1) continue;
    const nextId = path[i + 1]!;
    const edge = curveGraphEdge(graph, node.id, nextId);
    if (!edge) continue;
    const edgePts = edgePathPoints(graph, edge, node.id === edge.from);
    for (let j = 1; j < edgePts.length; j++) pts.push({ ...edgePts[j]! });
  }
  return polyline(pts, closed);
}

function edgeCost(graph: CurveGraph, edge: CurveGraphEdge): number {
  if (edge.cost !== undefined) return edge.cost;
  return edgeLength(graph, edge);
}

function edgeLength(graph: CurveGraph, edge: CurveGraphEdge): number {
  const pts = edgePathPoints(graph, edge, true);
  let total = 0;
  for (let i = 0; i < pts.length - 1; i++) total += length(sub(pts[i + 1]!, pts[i]!));
  return total;
}

function edgePathPoints(graph: CurveGraph, edge: CurveGraphEdge, forward: boolean): Vec3[] {
  let points: Vec3[];
  if (edge.points && edge.points.length > 0) {
    points = edge.points.map((p) => ({ ...p }));
  } else {
    const a = curveGraphNode(graph, edge.from)?.position;
    const b = curveGraphNode(graph, edge.to)?.position;
    points = a && b ? [{ ...a }, { ...b }] : [];
  }
  return forward ? points : points.slice().reverse();
}
