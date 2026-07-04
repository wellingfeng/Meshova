import { merge, triangleCount, vertexCount } from "../geometry/mesh.js";
import type { TreeLODOptions, TreeLODSet } from "./lod.js";
import { buildTreeLOD } from "./lod.js";
import { windChannels, type WindChannels } from "./wind.js";

export type GameExportProfileId = "hero" | "realtime" | "mobile";
export type WindPackingMode = "combined" | "channels";

export interface GameExportProfile {
  id: GameExportProfileId;
  highDistance: number;
  midDistance: number;
  lowDistance: number;
  imposterDistance: number;
  imposterViews: number;
  atlasSize: number;
  windPacking: WindPackingMode;
  materialSlots: {
    wood: string;
    leaves: string;
    features: string;
    imposter: string;
  };
}

export interface TreeGameExport {
  profile: GameExportProfile;
  lod: TreeLODSet;
  stats: {
    highVertices: number;
    midVertices: number;
    lowVertices: number;
    highTriangles: number;
    midTriangles: number;
    lowTriangles: number;
  };
  wind: {
    highWood: WindChannels;
    highLeaves: WindChannels;
    midWood: WindChannels;
    midLeaves: WindChannels;
    lowWood: WindChannels;
    lowLeaves: WindChannels;
  };
}

export function gameExportProfile(
  profile: GameExportProfileId | Partial<GameExportProfile> = "realtime",
): GameExportProfile {
  const base = typeof profile === "string" ? profileBase(profile) : profileBase(profile.id ?? "realtime");
  return typeof profile === "string"
    ? base
    : {
        ...base,
        ...profile,
        materialSlots: { ...base.materialSlots, ...profile.materialSlots },
      };
}

export function buildTreeGameExport(
  opts: TreeLODOptions = {},
  profileInput: GameExportProfileId | Partial<GameExportProfile> = "realtime",
): TreeGameExport {
  const profile = gameExportProfile(profileInput);
  const lod = buildTreeLOD({
    ...opts,
    highDistance: opts.highDistance ?? profile.highDistance,
    midDistance: opts.midDistance ?? profile.midDistance,
    lowDistance: opts.lowDistance ?? profile.lowDistance,
    imposterDistance: opts.imposterDistance ?? profile.imposterDistance,
  });
  return {
    profile,
    lod,
    stats: {
      highVertices: levelVertexCount(lod.high),
      midVertices: levelVertexCount(lod.mid),
      lowVertices: levelVertexCount(lod.low),
      highTriangles: levelTriangleCount(lod.high),
      midTriangles: levelTriangleCount(lod.mid),
      lowTriangles: levelTriangleCount(lod.low),
    },
    wind: {
      highWood: windChannels(lod.high.wood, { kind: "wood", seed: 11 }),
      highLeaves: windChannels(lod.high.leaves, { kind: "foliage", seed: 12 }),
      midWood: windChannels(lod.mid.wood, { kind: "wood", seed: 21 }),
      midLeaves: windChannels(lod.mid.leaves, { kind: "foliage", seed: 22 }),
      lowWood: windChannels(lod.low.wood, { kind: "wood", seed: 31 }),
      lowLeaves: windChannels(lod.low.leaves, { kind: "foliage", seed: 32 }),
    },
  };
}

function profileBase(id: GameExportProfileId): GameExportProfile {
  const materialSlots = {
    wood: "bark",
    leaves: "leaf",
    features: "barkFeature",
    imposter: "leafImposter",
  };
  if (id === "hero") {
    return { id, highDistance: 0, midDistance: 30, lowDistance: 70, imposterDistance: 130, imposterViews: 12, atlasSize: 2048, windPacking: "channels", materialSlots };
  }
  if (id === "mobile") {
    return { id, highDistance: 0, midDistance: 12, lowDistance: 28, imposterDistance: 50, imposterViews: 6, atlasSize: 1024, windPacking: "combined", materialSlots };
  }
  return { id, highDistance: 0, midDistance: 18, lowDistance: 42, imposterDistance: 80, imposterViews: 8, atlasSize: 1024, windPacking: "channels", materialSlots };
}

function levelVertexCount(level: TreeLODSet["high"]): number {
  return vertexCount(merge(level.wood, level.leaves));
}

function levelTriangleCount(level: TreeLODSet["high"]): number {
  return triangleCount(merge(level.wood, level.leaves));
}
