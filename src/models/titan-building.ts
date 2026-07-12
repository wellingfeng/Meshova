/**
 * Titan Building — reverse-engineered from Houdini "Tutorial_Building_Generator.hda"
 * (project_titan). The HDA generates a building from a footprint + pattern +
 * data-tables of facade meshes. Key wrangles seen:
 *
 *   @length = atoi(s@Size);              // module count per facade edge
 *   @height = atoi(s@height_S);          // floor count
 *   @P.y += @edgedist;                   // stack floors upward
 *   float model_scale = (name=="Small")?4 : (name=="Medium")?6 : 8;
 *   @pscale = @restlength / model_scale; // fit module to edge segment (Rail rule)
 *
 * So a facade edge is divided into modules whose count comes from restlength /
 * model_scale, floors are stacked by @edgedist, and a Pattern string chooses the
 * module per cell (window / door / wall / balcony).
 *
 * We reproduce the module-grid facade deterministically: a rectangular footprint,
 * each edge divided into a whole number of bays, floors stacked, and a pattern
 * string ("Wd|WWW|WWW"... per floor, or a single repeated row) selecting a bay
 * module. Ground floor gets doors; upper floors windows; a parapet roof caps it.
 *
 * Run: pnpm tsx examples/titan-building.ts
 */
import {
  box,
  merge,
  translateMesh,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";

/** Rotate a mesh 90° around Y so an X-running bay faces the ±X edges. */
function rotateY90(m: Mesh): Mesh {
  return transform(m, { rotate: vec3(0, Math.PI / 2, 0) });
}

type RGB = [number, number, number];

const WALL: RGB = [0.72, 0.68, 0.6];
const WINDOW: RGB = [0.24, 0.34, 0.42];
const DOOR: RGB = [0.3, 0.2, 0.12];
const FRAME: RGB = [0.5, 0.47, 0.42];
const ROOF: RGB = [0.3, 0.29, 0.28];

/** Facade bay module kinds. */
export type BayKind = "wall" | "window" | "door" | "balcony";

export interface TitanBuildingParams {
  /** Footprint width along +X (metres). */
  width: number;
  /** Footprint depth along +Z (metres). */
  depth: number;
  /** Number of floors (HDA @height). */
  floors: number;
  /** Floor height (metres). HDA @edgedist stack step. */
  floorHeight: number;
  /** Target bay width; edge divides into round(edgeLen / bayWidth) bays. */
  bayWidth: number;
  /**
   * Facade pattern per bay on upper floors. Characters: W=window w=wall b=balcony.
   * Repeated/truncated to fit the bay count. Ground floor overrides centre with a door.
   */
  pattern: string;
  /** Wall thickness of the facade shell. */
  wallThickness: number;
  /** Add a parapet roof cap. */
  roof: boolean;
}

export const TITAN_BUILDING_DEFAULTS: TitanBuildingParams = {
  width: 12,
  depth: 9,
  floors: 4,
  floorHeight: 3,
  bayWidth: 2,
  pattern: "WwWWwW",
  wallThickness: 0.3,
  roof: true,
};

interface Sink {
  wall: Mesh[];
  window: Mesh[];
  door: Mesh[];
  frame: Mesh[];
}

/** Build one facade bay module of the given kind, centred at origin in its cell. */
function bay(kind: BayKind, w: number, h: number, t: number, sink: Sink): void {
  // Wall slab always present (the window/door is inset into it via a frame).
  if (kind === "wall") {
    sink.wall.push(box(w, h, t));
    return;
  }
  // Surrounding wall border + inset panel.
  const openW = w * 0.6;
  const openH = h * 0.62;
  // top/bottom/side wall borders
  const bTop = (h - openH) / 2;
  const bSide = (w - openW) / 2;
  sink.wall.push(translateMesh(box(w, bTop, t), vec3(0, (h - bTop) / 2, 0)));
  sink.wall.push(translateMesh(box(w, bTop, t), vec3(0, -(h - bTop) / 2, 0)));
  sink.wall.push(translateMesh(box(bSide, openH, t), vec3(-(w - bSide) / 2, 0, 0)));
  sink.wall.push(translateMesh(box(bSide, openH, t), vec3((w - bSide) / 2, 0, 0)));
  // Four real frame bars, not a full backing plate. A solid plate would share
  // the glass front plane and z-fight in the viewer.
  const frameBar = Math.max(0.035, Math.min(openW, openH) * 0.08);
  const frameDepth = t * 0.5;
  const frameZ = t * 0.25;
  const innerW = Math.max(openW - frameBar * 2, openW * 0.55);
  const innerH = Math.max(openH - frameBar * 2, openH * 0.55);
  sink.frame.push(translateMesh(box(openW, frameBar, frameDepth), vec3(0, (openH - frameBar) / 2, frameZ)));
  sink.frame.push(translateMesh(box(openW, frameBar, frameDepth), vec3(0, -(openH - frameBar) / 2, frameZ)));
  sink.frame.push(translateMesh(box(frameBar, innerH, frameDepth), vec3(-(openW - frameBar) / 2, 0, frameZ)));
  sink.frame.push(translateMesh(box(frameBar, innerH, frameDepth), vec3((openW - frameBar) / 2, 0, frameZ)));
  const panel = box(innerW, innerH, t * 0.12);
  if (kind === "door") sink.door.push(translateMesh(panel, vec3(0, 0, -t * 0.02)));
  else sink.window.push(translateMesh(panel, vec3(0, 0, -t * 0.02)));
  if (kind === "balcony") {
    // slab jutting out front
    sink.frame.push(translateMesh(box(w * 0.9, 0.08, 0.5), vec3(0, -openH / 2, t * 0.5 + 0.25)));
  }
}

function kindFromPattern(pattern: string, i: number): BayKind {
  if (pattern.length === 0) return "window";
  const c = pattern[i % pattern.length]!;
  if (c === "w") return "wall";
  if (c === "b") return "balcony";
  return "window";
}

export function buildTitanBuildingParts(params: Partial<TitanBuildingParams> = {}): NamedPart[] {
  const p: TitanBuildingParams = { ...TITAN_BUILDING_DEFAULTS, ...params };
  const sink: Sink = { wall: [], window: [], door: [], frame: [] };
  const t = p.wallThickness;

  const hx = p.width / 2;
  const hz = p.depth / 2;

  // Four edges, each with an outward normal and a run direction along +local X.
  // We emit bays for each edge and floor, transforming the local bay into place.
  const edges = [
    { len: p.width, axis: "x" as const, sign: 1, offset: hz }, // +Z face
    { len: p.width, axis: "x" as const, sign: -1, offset: -hz }, // -Z face
    { len: p.depth, axis: "z" as const, sign: 1, offset: hx }, // +X face
    { len: p.depth, axis: "z" as const, sign: -1, offset: -hx }, // -X face
  ];

  for (const e of edges) {
    const bays = Math.max(1, Math.round(e.len / p.bayWidth)); // HDA @length = restlength/model_scale
    const cellW = e.len / bays;
    for (let f = 0; f < p.floors; f++) {
      const cy = f * p.floorHeight + p.floorHeight / 2; // @P.y += @edgedist
      for (let i = 0; i < bays; i++) {
        // ground floor centre bay is a door
        let kind: BayKind = f === 0 && i === Math.floor(bays / 2) ? "door" : kindFromPattern(p.pattern, i);
        if (f === 0 && kind === "balcony") kind = "window";
        const local: Sink = { wall: [], window: [], door: [], frame: [] };
        bay(kind, cellW - 0.05, p.floorHeight - 0.05, t, local);
        const along = -e.len / 2 + (i + 0.5) * cellW;
        // Position the bay group onto the edge. For x-axis edges the bay runs
        // along X at Z=offset; for z-axis edges it runs along Z at X=offset and
        // must be rotated 90° — we swap X/Z of each mesh by rebuilding position.
        const place = (m: Mesh): Mesh => {
          if (e.axis === "x") return translateMesh(m, vec3(along, cy, e.offset));
          // rotate 90° around Y: (x,y,z)->(z,y,-x) handled by swapping the box's
          // footprint; simplest is to translate then the mesh keeps orientation.
          // For z-axis edges we author bays already thin along Z, so rotate by
          // swapping local X extent to Z via a transform.
          return translateMesh(rotateY90(m), vec3(e.offset, cy, along));
        };
        for (const key of ["wall", "window", "door", "frame"] as const) {
          for (const m of local[key]) sink[key].push(place(m));
        }
      }
    }
  }

  const parts: NamedPart[] = [
    {
      name: "walls",
      label: "墙体",
      mesh: merge(...sink.wall),
      color: WALL,
      surface: { type: "concrete", params: { color: WALL, roughness: 0.85 } },
      metadata: { source: "Tutorial_Building_Generator.hda", pattern: p.pattern },
    },
    {
      name: "frames",
      label: "窗框",
      mesh: merge(...sink.frame),
      color: FRAME,
      surface: { type: "concrete", params: { color: FRAME, roughness: 0.7 } },
    },
    {
      name: "windows",
      label: "玻璃",
      mesh: merge(...sink.window),
      color: WINDOW,
      surface: { type: "glass", params: { color: WINDOW, roughness: 0.1 } },
    },
    {
      name: "doors",
      label: "门",
      mesh: merge(...sink.door),
      color: DOOR,
      surface: { type: "wood", params: { color: DOOR, roughness: 0.6 } },
    },
  ];

  if (p.roof) {
    const roofY = p.floors * p.floorHeight;
    const parapet: Mesh[] = [];
    parapet.push(translateMesh(box(p.width + t, 0.1, p.depth + t), vec3(0, roofY + 0.05, 0)));
    parapet.push(translateMesh(box(p.width + t, 0.5, t), vec3(0, roofY + 0.3, hz)));
    parapet.push(translateMesh(box(p.width + t, 0.5, t), vec3(0, roofY + 0.3, -hz)));
    parapet.push(translateMesh(box(t, 0.5, p.depth + t), vec3(hx, roofY + 0.3, 0)));
    parapet.push(translateMesh(box(t, 0.5, p.depth + t), vec3(-hx, roofY + 0.3, 0)));
    parts.push({
      name: "roof",
      label: "屋顶",
      mesh: merge(...parapet),
      color: ROOF,
      surface: { type: "concrete", params: { color: ROOF, roughness: 0.9 } },
    });
  }

  return parts.filter((part) => part.mesh.positions.length > 0);
}
