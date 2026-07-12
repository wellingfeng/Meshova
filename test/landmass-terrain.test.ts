import { describe, expect, it } from "vitest";
import {
  applyLandmassFalloff,
  buildLandmassChunk,
  buildLandmassMap,
  buildLandmassTerrain,
  chooseLandmassLOD,
  field2DStats,
  generateLandmassFalloffMap,
  generateLandmassNoiseMap,
  LandmassChunkStreamer,
  triangleCount,
  vertexCount,
} from "../src/index.js";

describe("Lague-style landmass terrain", () => {
  it("generates deterministic normalized noise maps", () => {
    const a = generateLandmassNoiseMap({
      width: 33,
      height: 33,
      seed: 12,
      scale: 28,
      octaves: 4,
      persistence: 0.48,
      lacunarity: 2.1,
    });
    const b = generateLandmassNoiseMap({
      width: 33,
      height: 33,
      seed: 12,
      scale: 28,
      octaves: 4,
      persistence: 0.48,
      lacunarity: 2.1,
    });
    expect(a.data).toEqual(b.data);
    const stats = field2DStats(a);
    expect(stats.min).toBeGreaterThanOrEqual(0);
    expect(stats.max).toBeLessThanOrEqual(1);
  });

  it("falloff pushes map edges down for island terrain", () => {
    const noise = generateLandmassNoiseMap({ width: 33, height: 33, seed: 3, scale: 35 });
    const falloff = generateLandmassFalloffMap({ size: 33 });
    const island = applyLandmassFalloff(noise, falloff);
    const center = island.data[16 * 33 + 16]!;
    const corner = island.data[0]!;
    expect(falloff.data[16 * 33 + 16]!).toBeLessThan(falloff.data[0]!);
    expect(center).toBeGreaterThan(corner);
  });

  it("builds color mapped mesh and lowers triangle count with LOD", () => {
    const full = buildLandmassTerrain({ width: 33, height: 33, seed: 9, size: 12, heightMultiplier: 3, lod: 0 });
    const lod = buildLandmassTerrain({ width: 33, height: 33, seed: 9, size: 12, heightMultiplier: 3, lod: 2 });
    expect(vertexCount(full.mesh)).toBe(33 * 33);
    expect(triangleCount(full.mesh)).toBe(32 * 32 * 2);
    expect(triangleCount(lod.mesh)).toBeLessThan(triangleCount(full.mesh));
    expect(full.colors).toHaveLength(vertexCount(full.mesh) * 3);
    expect(new Set(full.biomeIndex)).toContain(0);
  });

  it("flat shading duplicates triangle vertices", () => {
    const smooth = buildLandmassTerrain({ width: 17, height: 17, seed: 5, lod: 1, flatShaded: false });
    const flat = buildLandmassTerrain({ width: 17, height: 17, seed: 5, lod: 1, flatShaded: true });
    expect(triangleCount(flat.mesh)).toBe(triangleCount(smooth.mesh));
    expect(vertexCount(flat.mesh)).toBe(triangleCount(flat.mesh) * 3);
  });

  it("global-normalized adjacent chunks share seam heights", () => {
    const left = buildLandmassChunk({
      width: 33,
      height: 33,
      chunkSize: 8,
      chunkX: 0,
      chunkZ: 0,
      seed: 101,
      scale: 42,
      useFalloff: false,
    });
    const right = buildLandmassChunk({
      width: 33,
      height: 33,
      chunkSize: 8,
      chunkX: 1,
      chunkZ: 0,
      seed: 101,
      scale: 42,
      useFalloff: false,
    });
    for (let y = 0; y < 33; y++) {
      const a = left.data.heightMap.data[y * 33 + 32]!;
      const b = right.data.heightMap.data[y * 33]!;
      expect(a).toBeCloseTo(b, 6);
    }
  });

  it("integrates deterministic erosion maps while preserving chunk edges", () => {
    const base = buildLandmassMap({
      width: 33,
      height: 33,
      seed: 27,
      useFalloff: false,
      normalizeMode: "global",
    });
    const erosion = {
      iterations: 12,
      hydraulicStrength: 0.025,
      thermalStrength: 0.07,
      talus: 0.025,
    };
    const a = buildLandmassMap({
      width: 33,
      height: 33,
      seed: 27,
      useFalloff: false,
      normalizeMode: "global",
      erosion,
    });
    const b = buildLandmassMap({
      width: 33,
      height: 33,
      seed: 27,
      useFalloff: false,
      normalizeMode: "global",
      erosion,
    });

    expect(a.heightMap.data).toEqual(b.heightMap.data);
    expect(a.heightMap.data).not.toEqual(base.heightMap.data);
    expect(field2DStats(a.erosionMaps!.wear).max).toBe(1);
    expect(field2DStats(a.erosionMaps!.deposition).max).toBe(1);
    for (let x = 0; x < 33; x++) {
      expect(a.heightMap.data[x]).toBe(base.heightMap.data[x]);
      expect(a.heightMap.data[32 * 33 + x]).toBe(base.heightMap.data[32 * 33 + x]);
    }
  });

  it("stitches a fine chunk edge onto a coarse neighbour edge", () => {
    const fine = buildLandmassChunk({
      width: 17,
      height: 17,
      chunkSize: 8,
      chunkX: 0,
      chunkZ: 0,
      seed: 91,
      scale: 30,
      useFalloff: false,
      lod: 0,
      edgeLODs: { east: 2 },
    });
    const coarse = buildLandmassChunk({
      width: 17,
      height: 17,
      chunkSize: 8,
      chunkX: 1,
      chunkZ: 0,
      seed: 91,
      scale: 30,
      useFalloff: false,
      lod: 2,
    });
    const fineEdge = fine.data.mesh.positions.filter((position) => position.x === 8);
    const coarseEdge = coarse.data.mesh.positions.filter((position) => position.x === 8);

    expect(fineEdge).toHaveLength(17);
    expect(coarseEdge).toHaveLength(5);
    for (let segment = 0; segment < coarseEdge.length - 1; segment++) {
      const start = coarseEdge[segment]!;
      const end = coarseEdge[segment + 1]!;
      for (let offset = 0; offset <= 4; offset++) {
        const fineVertex = fineEdge[segment * 4 + offset]!;
        const expected = start.y + (end.y - start.y) * (offset / 4);
        expect(fineVertex.y).toBeCloseTo(expected, 6);
      }
    }
  });

  it("adds downward skirts around chunk borders", () => {
    const plain = buildLandmassTerrain({ width: 9, height: 9, seed: 4, lod: 0 });
    const skirted = buildLandmassTerrain({ width: 9, height: 9, seed: 4, lod: 0, skirtDepth: 1.5 });
    expect(vertexCount(skirted.mesh)).toBe(vertexCount(plain.mesh) + 9 * 4);
    expect(triangleCount(skirted.mesh)).toBe(triangleCount(plain.mesh) + 8 * 4 * 2);
    expect(Math.min(...skirted.mesh.positions.map((position) => position.y)))
      .toBeLessThan(Math.min(...plain.mesh.positions.map((position) => position.y)));
    expect(skirted.colors).toHaveLength(vertexCount(skirted.mesh) * 3);
  });

  it("selects LOD by increasing viewer distance", () => {
    const levels = [
      { distance: 0, lod: 0 },
      { distance: 25, lod: 1 },
      { distance: 60, lod: 3 },
    ];
    expect(chooseLandmassLOD(5, levels)).toBe(0);
    expect(chooseLandmassLOD(30, levels)).toBe(1);
    expect(chooseLandmassLOD(100, levels)).toBe(3);
  });

  it("streams chunks asynchronously, deduplicates requests and assigns neighbour LODs", async () => {
    const generated: Array<{ x: number; z: number; lod: number; east?: number }> = [];
    const streamer = new LandmassChunkStreamer({
      width: 9,
      height: 9,
      chunkSize: 8,
      seed: 61,
      useFalloff: false,
      radius: 1,
      lodLevels: [
        { distance: 0, lod: 0 },
        { distance: 6, lod: 2 },
      ],
      maxCachedChunks: 12,
      generateChunk: async (options) => {
        generated.push({
          x: options.chunkX!,
          z: options.chunkZ!,
          lod: options.lod!,
          east: options.edgeLODs?.east,
        });
        return buildLandmassChunk(options);
      },
    });

    const first = await streamer.update(4, 4);
    const second = await streamer.update(4, 4);
    expect(first).toHaveLength(9);
    expect(second).toHaveLength(9);
    expect(generated).toHaveLength(9);
    expect(generated.find((chunk) => chunk.x === 0 && chunk.z === 0)).toMatchObject({ lod: 0, east: 2 });
    expect(streamer.cachedChunkCount).toBe(9);

    await streamer.update(20, 4);
    expect(generated.length).toBeGreaterThan(9);
    expect(streamer.cachedChunkCount).toBeLessThanOrEqual(12);
  });
});
