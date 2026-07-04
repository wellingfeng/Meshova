import type { Vec2 } from "../math/vec2.js";
import { vec2 } from "../math/vec2.js";
import type { Vec3 } from "../math/vec3.js";
import { normalize, vec3 } from "../math/vec3.js";
import type { Mesh } from "./mesh.js";
import { makeMesh, recomputeNormals } from "./mesh.js";
import type { NamedPart } from "./export.js";

type OBJGroupMode = "object" | "group" | "material" | "objectOrGroup";

export interface OBJImportOptions {
  /** Which OBJ tag becomes a Meshova part name. Default: objectOrGroup. */
  groupBy?: OBJGroupMode;
  /** Flip V texture coordinate during import. Default false. */
  flipV?: boolean;
  /** Use file normals when present, or recompute all normals. Default file. */
  normals?: "file" | "recompute";
  /** Fallback part name when OBJ has no object/group tag. */
  defaultPartName?: string;
}

interface OBJCorner {
  v: number;
  vt: number;
  vn: number;
}

function parseIndex(raw: string | undefined, count: number): number {
  if (!raw) return -1;
  const index = Number.parseInt(raw, 10);
  if (!Number.isFinite(index)) return -1;
  return index < 0 ? count + index : index - 1;
}

function validIndex(index: number, count: number): boolean {
  return Number.isInteger(index) && index >= 0 && index < count;
}

function partNameFor(
  mode: OBJGroupMode,
  objectName: string,
  groupName: string,
  materialName: string,
): string {
  if (mode === "object") return objectName;
  if (mode === "group") return groupName || objectName;
  if (mode === "material") return materialName || groupName || objectName;
  return groupName || objectName;
}

function buildMesh(
  faces: OBJCorner[][],
  sourcePositions: Vec3[],
  sourceUvs: Vec2[],
  sourceNormals: Vec3[],
  opts: Required<Pick<OBJImportOptions, "flipV" | "normals">>,
): Mesh {
  const positions: Vec3[] = [];
  const normals: Vec3[] = [];
  const uvs: Vec2[] = [];
  const indices: number[] = [];
  const remap = new Map<string, number>();
  let everyCornerHasNormal = sourceNormals.length > 0;

  const addCorner = (corner: OBJCorner): number => {
    const key = `${corner.v}/${corner.vt}/${corner.vn}`;
    const cached = remap.get(key);
    if (cached !== undefined) return cached;

    if (!validIndex(corner.v, sourcePositions.length)) {
      throw new Error(`OBJ face references missing vertex index ${corner.v}`);
    }

    const next = positions.length;
    remap.set(key, next);
    positions.push(sourcePositions[corner.v]!);

    const uv = validIndex(corner.vt, sourceUvs.length) ? sourceUvs[corner.vt]! : vec2(0, 0);
    uvs.push(opts.flipV ? vec2(uv.x, 1 - uv.y) : uv);

    if (validIndex(corner.vn, sourceNormals.length)) {
      normals.push(normalize(sourceNormals[corner.vn]!));
    } else {
      everyCornerHasNormal = false;
      normals.push(vec3(0, 1, 0));
    }
    return next;
  };

  for (const face of faces) {
    if (face.length < 3) continue;
    const faceIndices = face.map(addCorner);
    for (let i = 1; i < faceIndices.length - 1; i++) {
      indices.push(faceIndices[0]!, faceIndices[i]!, faceIndices[i + 1]!);
    }
  }

  const mesh = makeMesh({ positions, normals, uvs, indices });
  return opts.normals === "recompute" || !everyCornerHasNormal ? recomputeNormals(mesh) : mesh;
}

/**
 * Parse Wavefront OBJ text into named Meshova parts.
 *
 * Supports v/vt/vn/f plus o/g/usemtl grouping. Polygon faces are triangulated
 * as a fan. Materials are names only; MTL texture loading belongs in host code.
 */
export function parseOBJ(text: string, options: OBJImportOptions = {}): NamedPart[] {
  const groupBy = options.groupBy ?? "objectOrGroup";
  const defaultPartName = options.defaultPartName ?? "mesh";
  const positions: Vec3[] = [];
  const uvs: Vec2[] = [];
  const normals: Vec3[] = [];
  const groups = new Map<string, OBJCorner[][]>();

  let objectName = defaultPartName;
  let groupName = "";
  let materialName = "";

  const ensureGroup = (name: string): OBJCorner[][] => {
    const safeName = name || defaultPartName;
    const existing = groups.get(safeName);
    if (existing) return existing;
    const created: OBJCorner[][] = [];
    groups.set(safeName, created);
    return created;
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const hash = rawLine.indexOf("#");
    const line = (hash >= 0 ? rawLine.slice(0, hash) : rawLine).trim();
    if (!line) continue;

    const tokens = line.split(/\s+/);
    const tag = tokens[0]!;

    if (tag === "v") {
      positions.push(vec3(Number(tokens[1]), Number(tokens[2]), Number(tokens[3])));
    } else if (tag === "vt") {
      uvs.push(vec2(Number(tokens[1]), Number(tokens[2])));
    } else if (tag === "vn") {
      normals.push(vec3(Number(tokens[1]), Number(tokens[2]), Number(tokens[3])));
    } else if (tag === "o") {
      objectName = tokens.slice(1).join("_") || defaultPartName;
      if (groupBy === "object") ensureGroup(objectName);
    } else if (tag === "g") {
      groupName = tokens.slice(1).join("_");
      if (groupBy === "group" || groupBy === "objectOrGroup") {
        ensureGroup(partNameFor(groupBy, objectName, groupName, materialName));
      }
    } else if (tag === "usemtl") {
      materialName = tokens.slice(1).join("_");
      if (groupBy === "material") ensureGroup(materialName || defaultPartName);
    } else if (tag === "f") {
      const face = tokens.slice(1).map((token): OBJCorner => {
        const [vRaw, vtRaw, vnRaw] = token.split("/");
        return {
          v: parseIndex(vRaw, positions.length),
          vt: parseIndex(vtRaw, uvs.length),
          vn: parseIndex(vnRaw, normals.length),
        };
      });
      const name = partNameFor(groupBy, objectName, groupName, materialName);
      ensureGroup(name).push(face);
    }
  }

  const meshOpts = {
    flipV: options.flipV ?? false,
    normals: options.normals ?? "file",
  } satisfies Required<Pick<OBJImportOptions, "flipV" | "normals">>;

  const parts: NamedPart[] = [];
  for (const [name, faces] of groups) {
    if (faces.length === 0) continue;
    parts.push({
      name,
      mesh: buildMesh(faces, positions, uvs, normals, meshOpts),
    });
  }
  return parts;
}
