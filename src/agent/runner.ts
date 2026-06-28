/**
 * Script runner (P4): execute an AI-written script in the sandbox, normalize
 * whatever it returns into scene parts, and compute a feedback summary the
 * agent loop can show the model alongside a screenshot.
 */
import { runScript, type SandboxOptions } from "../sandbox/sandbox.js";
import { SCRIPT_API } from "./api.js";
import { toViewerModel, type NamedPart, type ViewerModel } from "../geometry/export.js";
import { bounds, triangleCount, type Bounds, type Mesh } from "../geometry/mesh.js";

export interface RunScriptResult {
  ok: boolean;
  parts: NamedPart[];
  viewerModel: ViewerModel | null;
  /** Compact stats for the model's feedback (sizes, counts). */
  summary: string;
  error?: string;
  opsUsed?: number;
  elapsedMs?: number;
}

function isMesh(v: unknown): v is Mesh {
  return !!v && typeof v === "object" && Array.isArray((v as Mesh).positions) && Array.isArray((v as Mesh).indices);
}

function isPart(v: unknown): v is NamedPart {
  return !!v && typeof v === "object" && isMesh((v as NamedPart).mesh);
}

/** Coerce a script return value into a list of named parts. */
function normalizeParts(value: unknown): NamedPart[] {
  if (isMesh(value)) return [{ name: "mesh", mesh: value }];
  if (isPart(value)) return [value];
  if (Array.isArray(value)) {
    const parts: NamedPart[] = [];
    value.forEach((item, i) => {
      if (isPart(item)) parts.push(item);
      else if (isMesh(item)) parts.push({ name: `mesh_${i}`, mesh: item });
    });
    return parts;
  }
  return [];
}

function axisGap(aMin: number, aMax: number, bMin: number, bMax: number): number {
  if (aMax < bMin) return bMin - aMax;
  if (bMax < aMin) return aMin - bMax;
  return 0;
}

function boundsDistance(a: Bounds, b: Bounds): number {
  const dx = axisGap(a.min.x, a.max.x, b.min.x, b.max.x);
  const dy = axisGap(a.min.y, a.max.y, b.min.y, b.max.y);
  const dz = axisGap(a.min.z, a.max.z, b.min.z, b.max.z);
  return Math.hypot(dx, dy, dz);
}

function boundsVolume(bb: Bounds): number {
  const sx = Math.max(0, bb.max.x - bb.min.x);
  const sy = Math.max(0, bb.max.y - bb.min.y);
  const sz = Math.max(0, bb.max.z - bb.min.z);
  return sx * sy * sz;
}

function summarizeAssembly(parts: NamedPart[], sceneBounds: Bounds): string {
  if (parts.length <= 1) return "Assembly: single mesh/part; no attachment check needed.";

  const sceneSize = Math.max(
    sceneBounds.max.x - sceneBounds.min.x,
    sceneBounds.max.y - sceneBounds.min.y,
    sceneBounds.max.z - sceneBounds.min.z,
    1,
  );
  const contactMargin = sceneSize * 0.015;
  const boxes = parts.map((part) => ({
    name: part.name,
    bb: bounds(part.mesh),
    volume: boundsVolume(bounds(part.mesh)),
  }));
  const degrees = boxes.map(() => 0);
  const graph = boxes.map((): number[] => []);
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boundsDistance(boxes[i]!.bb, boxes[j]!.bb) <= contactMargin) {
        degrees[i]! += 1;
        degrees[j]! += 1;
        graph[i]!.push(j);
        graph[j]!.push(i);
      }
    }
  }

  const visited = boxes.map(() => false);
  const components: number[][] = [];
  for (let i = 0; i < boxes.length; i++) {
    if (visited[i]) continue;
    const stack = [i];
    const component: number[] = [];
    visited[i] = true;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      component.push(cur);
      for (const next of graph[cur]!) {
        if (!visited[next]) {
          visited[next] = true;
          stack.push(next);
        }
      }
    }
    components.push(component);
  }

  const largestIdx = boxes.reduce((best, b, i) => (b.volume > boxes[best]!.volume ? i : best), 0);
  const possibleFloating = boxes
    .map((boxInfo, i) => ({ name: boxInfo.name, i }))
    .filter((p) => p.i !== largestIdx && degrees[p.i] === 0)
    .map((p) => p.name);
  const lines = [
    `Assembly: ${components.length} AABB contact component(s), ${possibleFloating.length} possibly floating part(s); margin ${contactMargin.toFixed(3)}.`,
  ];
  if (possibleFloating.length > 0) {
    lines.push(`Possible floating/disconnected: ${possibleFloating.slice(0, 8).join(", ")}${possibleFloating.length > 8 ? ", ..." : ""}`);
  }
  if (components.length > 1) {
    const groupPreview = components
      .slice(0, 4)
      .map((group) => group.slice(0, 4).map((i) => boxes[i]!.name).join("+"))
      .join(" | ");
    lines.push(`Disconnected groups preview: ${groupPreview}${components.length > 4 ? " | ..." : ""}`);
  }
  return lines.join("\n");
}

function summarize(parts: NamedPart[]): string {
  if (parts.length === 0) return "Empty scene: the script returned no parts.";
  let totalTris = 0;
  let totalVerts = 0;
  for (const p of parts) {
    totalTris += triangleCount(p.mesh);
    totalVerts += p.mesh.positions.length;
  }
  // overall bounds via merged extents
  const allPos = parts.flatMap((p) => p.mesh.positions);
  const bb = bounds({ positions: allPos, normals: allPos, uvs: [], indices: [] } as unknown as Mesh);
  const size = {
    x: +(bb.max.x - bb.min.x).toFixed(3),
    y: +(bb.max.y - bb.min.y).toFixed(3),
    z: +(bb.max.z - bb.min.z).toFixed(3),
  };
  const partList = parts.map((p) => `${p.name}(${triangleCount(p.mesh)}tri)`).join(", ");
  return [
    `Parts: ${parts.length} [${partList}]`,
    `Triangles: ${totalTris}, Vertices: ${totalVerts}`,
    `Bounding size: ${size.x} x ${size.y} x ${size.z}`,
    `Center: (${((bb.min.x + bb.max.x) / 2).toFixed(2)}, ${((bb.min.y + bb.max.y) / 2).toFixed(2)}, ${((bb.min.z + bb.max.z) / 2).toFixed(2)})`,
    summarizeAssembly(parts, bb),
  ].join("\n");
}

/** Run one generated script and produce parts + feedback. */
export function runMeshScript(source: string, name = "ai-model", opts: SandboxOptions = {}): RunScriptResult {
  try {
    const res = runScript<unknown>(source, {
      timeoutMs: opts.timeoutMs ?? 5000,
      opBudget: opts.opBudget ?? 5e7,
      api: { ...SCRIPT_API, ...(opts.api ?? {}) },
    });
    const parts = normalizeParts(res.value);
    if (parts.length === 0) {
      return {
        ok: false,
        parts: [],
        viewerModel: null,
        summary: summarize(parts),
        error: "Script ran but returned no usable mesh/parts. Make sure to `return` an array of part(name, mesh, [r,g,b]).",
        opsUsed: res.opsUsed,
        elapsedMs: res.elapsedMs,
      };
    }
    return {
      ok: true,
      parts,
      viewerModel: toViewerModel(parts, name),
      summary: summarize(parts),
      opsUsed: res.opsUsed,
      elapsedMs: res.elapsedMs,
    };
  } catch (err) {
    return {
      ok: false,
      parts: [],
      viewerModel: null,
      summary: "",
      error: err instanceof Error ? `${err.name}: ${err.message}` : String(err),
    };
  }
}
