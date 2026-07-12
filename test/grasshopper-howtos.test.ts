import { describe, expect, it } from "vitest";
import {
  GRASSHOPPER_HOWTOS_RECIPES,
  buildLandscapeContourParts,
  buildPackedCircleParts,
  buildRibbonLoopParts,
  buildVoxelBunnyParts,
  buildImageFieldReliefParts,
  buildGrasshopperHowtosShowcaseParts,
  buildReactionDiffusionPlateParts,
  buildRockTileParts,
  buildVoronoiPipeParts,
  buildWafflePatternParts,
  bounds,
  recipeDefaults,
  summarizeGrasshopperHowtos,
  toViewerModel,
  triangleCount,
  vertexCount,
  type NamedPart,
} from "../src/index.js";

function allFinite(parts: readonly NamedPart[]): boolean {
  for (const part of parts) {
    for (const p of part.mesh.positions) {
      if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) return false;
    }
  }
  return true;
}

function part(parts: readonly NamedPart[], name: string): NamedPart {
  const found = parts.find((p) => p.name === name);
  expect(found).toBeTruthy();
  return found!;
}

describe("GrasshopperHowtos recipe models", () => {
  it("exposes four parameterized recipes", () => {
    expect(GRASSHOPPER_HOWTOS_RECIPES.map((r) => r.id)).toEqual([
      "grasshopper-rock-tile",
      "grasshopper-voronoi-pipe",
      "grasshopper-waffle-pattern",
      "grasshopper-reaction-diffusion",
      "grasshopper-packed-circle",
      "grasshopper-landscape-contour",
      "grasshopper-ribbon-loop",
      "grasshopper-voxel-bunny",
      "grasshopper-image-field",
    ]);
    for (const recipe of GRASSHOPPER_HOWTOS_RECIPES) {
      expect(recipe.params.length).toBeGreaterThan(0);
      expect(recipe.build(recipeDefaults(recipe)).length).toBeGreaterThan(0);
    }
  });

  it("builds the four Grasshopper-inspired technique families", () => {
    const parts = buildGrasshopperHowtosShowcaseParts({ seed: 5, scale: 0.75 });
    const summary = summarizeGrasshopperHowtos(parts);
    expect(summary.categories.rockTile).toBeGreaterThanOrEqual(2);
    expect(summary.categories.voronoiPipe).toBeGreaterThanOrEqual(4);
    expect(summary.categories.waffle).toBeGreaterThanOrEqual(3);
    expect(summary.categories.reactionDiffusion).toBeGreaterThanOrEqual(1);
    expect(summary.categories.packing).toBeGreaterThanOrEqual(2);
    expect(summary.categories.contour).toBeGreaterThanOrEqual(2);
    expect(summary.categories.ribbon).toBeGreaterThanOrEqual(2);
    expect(summary.categories.sdfVoxel).toBeGreaterThanOrEqual(1);
    expect(summary.categories.imageField).toBeGreaterThanOrEqual(2);
    expect(summary.vertexCount).toBeGreaterThan(1000);
    expect(summary.triangleCount).toBeGreaterThan(1000);
    expect(allFinite(parts)).toBe(true);
  });

  it("turns rock tile fields into colored relief geometry", () => {
    const parts = buildRockTileParts({ resolution: 16, cells: 3, seed: 2 });
    const relief = part(parts, "rock_tile_relief");
    expect(vertexCount(relief.mesh)).toBe((16 + 1) * (16 + 1) * 2);
    expect(relief.colors?.length).toBe(vertexCount(relief.mesh) * 3);
    expect(bounds(relief.mesh).max.y).toBeGreaterThan(0.08);
    expect(toViewerModel(parts, "rock-tile").parts.find((p) => p.name === "rock_tile_relief")?.colors).toBeDefined();
  });

  it("uses Voronoi density to grow pipe network complexity", () => {
    const low = buildVoronoiPipeParts({ cells: 3, size: 2.4, seed: 7 });
    const high = buildVoronoiPipeParts({ cells: 6, size: 2.4, seed: 7 });
    expect(triangleCount(part(high, "voronoi_pipe_network").mesh)).toBeGreaterThan(
      triangleCount(part(low, "voronoi_pipe_network").mesh),
    );
    expect(vertexCount(part(high, "voronoi_pipe_nodes").mesh)).toBeGreaterThan(
      vertexCount(part(low, "voronoi_pipe_nodes").mesh),
    );
  });

  it("uses waffle slice counts to grow rib geometry", () => {
    const low = buildWafflePatternParts({ slicesX: 3, slicesZ: 3, seed: 3 });
    const high = buildWafflePatternParts({ slicesX: 7, slicesZ: 6, seed: 3 });
    expect(vertexCount(part(high, "waffle_ribs_x").mesh)).toBeGreaterThan(
      vertexCount(part(low, "waffle_ribs_x").mesh),
    );
    expect(vertexCount(part(high, "waffle_ribs_z").mesh)).toBeGreaterThan(
      vertexCount(part(low, "waffle_ribs_z").mesh),
    );
  });

  it("builds deterministic reaction diffusion relief from seed", () => {
    const a = buildReactionDiffusionPlateParts({ resolution: 20, iterations: 8, seed: 4 });
    const b = buildReactionDiffusionPlateParts({ resolution: 20, iterations: 8, seed: 4 });
    const c = buildReactionDiffusionPlateParts({ resolution: 20, iterations: 8, seed: 5 });
    const pa = part(a, "reaction_diffusion_plate");
    expect(pa.colors?.length).toBe(vertexCount(pa.mesh) * 3);
    expect(pa.mesh.positions).toEqual(part(b, "reaction_diffusion_plate").mesh.positions);
    expect(pa.mesh.positions).not.toEqual(part(c, "reaction_diffusion_plate").mesh.positions);
  });

  it("packs circles deterministically and reports relaxation metadata", () => {
    const a = buildPackedCircleParts({ count: 24, width: 2.4, depth: 1.8, seed: 9, relax: 80 });
    const b = buildPackedCircleParts({ count: 24, width: 2.4, depth: 1.8, seed: 9, relax: 80 });
    const c = buildPackedCircleParts({ count: 36, width: 2.4, depth: 1.8, seed: 9, relax: 80 });
    const pa = part(a, "packed_pebbles");
    expect(pa.mesh.positions).toEqual(part(b, "packed_pebbles").mesh.positions);
    expect(vertexCount(part(c, "packed_pebbles").mesh)).toBeGreaterThan(vertexCount(pa.mesh));
    expect((pa.metadata?.packing as { maxOverlap: number }).maxOverlap).toBeLessThan(0.08);
  });

  it("turns scalar terrain fields into contour line geometry", () => {
    const low = buildLandscapeContourParts({ resolution: 20, levels: 3, seed: 6 });
    const high = buildLandscapeContourParts({ resolution: 28, levels: 8, seed: 6 });
    expect(vertexCount(part(low, "contour_landscape_relief").mesh)).toBe((20 + 1) * (20 + 1) * 2);
    expect(vertexCount(part(high, "contour_lines").mesh)).toBeGreaterThan(
      vertexCount(part(low, "contour_lines").mesh),
    );
    expect(part(high, "contour_landscape_relief").colors?.length).toBe(
      vertexCount(part(high, "contour_landscape_relief").mesh) * 3,
    );
  });

  it("keeps contour tubes resting on terrain when line radius changes", () => {
    const thin = buildLandscapeContourParts({ resolution: 28, levels: 8, lineRadius: 0.004, seed: 6 });
    const thick = buildLandscapeContourParts({ resolution: 28, levels: 8, lineRadius: 0.04, seed: 6 });
    const thinBottom = bounds(part(thin, "contour_lines").mesh).min.y;
    const thickBottom = bounds(part(thick, "contour_lines").mesh).min.y;
    expect(thickBottom).toBeCloseTo(thinBottom, 2);
  });

  it("builds ribbon loop surfaces from curve frames", () => {
    const low = buildRibbonLoopParts({ segments: 24, waves: 2, seed: 8 });
    const high = buildRibbonLoopParts({ segments: 72, waves: 4, seed: 8 });
    const surface = part(high, "ribbon_loop_surface");
    expect(surface.doubleSided).toBe(true);
    expect(vertexCount(surface.mesh)).toBeGreaterThan(vertexCount(part(low, "ribbon_loop_surface").mesh));
    expect(bounds(surface.mesh).max.y).toBeGreaterThan(bounds(surface.mesh).min.y);
  });

  it("builds deterministic voxel bunny from composed SDFs", () => {
    const low = buildVoxelBunnyParts({ resolution: 22, seed: 11 });
    const high = buildVoxelBunnyParts({ resolution: 34, seed: 11 });
    const repeat = buildVoxelBunnyParts({ resolution: 22, seed: 11 });
    expect(triangleCount(part(high, "voxel_bunny_shell").mesh)).toBeGreaterThan(
      triangleCount(part(low, "voxel_bunny_shell").mesh),
    );
    expect(part(low, "voxel_bunny_shell").mesh.positions).toEqual(part(repeat, "voxel_bunny_shell").mesh.positions);
  });

  it("accepts RGBA image input for volume and pin relief", () => {
    const source = {
      width: 8,
      height: 8,
      data: new Uint8Array(8 * 8 * 4),
    };
    for (let y = 2; y < 6; y++) {
      for (let x = 2; x < 6; x++) {
        const offset = (y * 8 + x) * 4;
        source.data[offset] = 255;
        source.data[offset + 1] = 255;
        source.data[offset + 2] = 255;
        source.data[offset + 3] = 255;
      }
    }
    const parts = buildImageFieldReliefParts({ samples: 8, volumeResolution: 22 }, source);
    expect(triangleCount(part(parts, "image_field_volume").mesh)).toBeGreaterThan(20);
    expect(vertexCount(part(parts, "image_field_pins").mesh)).toBeGreaterThan(0);
  });
});
