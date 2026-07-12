/**
 * Ribbon surface from a curve and parallel-transport frames.
 * Complements circular sweep: cloth strips, louvers, folded bands, roads.
 */
import { vec2 } from "../math/vec2.js";
import type { Vec3 } from "../math/vec3.js";
import { add, scale, normalize, cross } from "../math/vec3.js";
import type { Curve } from "./curve.js";
import { parallelTransportFrames, rotateAroundAxis } from "./frame.js";
import type { Mesh } from "./mesh.js";
import { makeMesh } from "./mesh.js";

export interface RibbonOptions {
  readonly width?: number;
  readonly widthAt?: (t: number) => number;
  readonly twistAt?: (t: number) => number;
  readonly initialNormal?: Vec3;
  readonly closed?: boolean;
}

export function ribbon(curve: Curve, options: RibbonOptions = {}): Mesh {
  const pts = curve.points;
  if (pts.length < 2) return makeMesh({ positions: [], normals: [], uvs: [], indices: [] });

  const closed = options.closed ?? curve.closed;
  const baseWidth = Math.max(1e-6, options.width ?? 0.1);
  const widthAt = options.widthAt ?? (() => 1);
  const twistAt = options.twistAt ?? (() => 0);
  const frameOptions: { closed: boolean; initialNormal?: Vec3 } = { closed };
  if (options.initialNormal !== undefined) frameOptions.initialNormal = options.initialNormal;
  const frames = parallelTransportFrames(pts, frameOptions);
  const rings = closed ? pts.length + 1 : pts.length;
  const denom = closed ? pts.length : pts.length - 1;
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs = [];
  const indices: number[] = [];

  for (let i = 0; i < rings; i++) {
    const src = closed && i === pts.length ? 0 : i;
    const t = i / denom;
    const frame = frames[src]!;
    const twist = twistAt(src / Math.max(1, pts.length - 1));
    const normal = normalize(rotateAroundAxis(frame.normal, frame.tangent, twist));
    const side = normalize(cross(frame.tangent, normal));
    const half = baseWidth * Math.max(0, widthAt(src / Math.max(1, pts.length - 1))) * 0.5;
    positions.push(add(frame.position, scale(side, -half)));
    positions.push(add(frame.position, scale(side, half)));
    normals.push(normal, normal);
    uvs.push(vec2(t, 0), vec2(t, 1));
  }

  for (let i = 0; i < rings - 1; i++) {
    const a = i * 2;
    const b = a + 1;
    const c = a + 2;
    const d = a + 3;
    indices.push(a, c, b, b, c, d);
  }

  return makeMesh({ positions, normals, uvs, indices });
}
