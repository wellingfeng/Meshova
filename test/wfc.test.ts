import { describe, it, expect } from "vitest";
import { solveWfc, wfcAt, expandProtos, type WfcTile } from "../src/geometry/wfc.js";
import { buildWfcRooftopParts } from "../src/models/wfc-rooftop.js";

const TILES: WfcTile[] = [
  { id: "deck", sockets: { px: "R", pz: "R", nx: "R", nz: "R" }, weight: 3 },
  { id: "wall", sockets: { px: "R", pz: "O", nx: "R", nz: "R" }, weight: 2, rotatable: true },
  { id: "corner", sockets: { px: "O", pz: "O", nx: "R", nz: "R" }, weight: 1, rotatable: true },
];

describe("WFC solver", () => {
  it("expands rotatable tiles into distinct socket prototypes", () => {
    const protos = expandProtos(TILES);
    // deck is symmetric -> 1; wall -> 4; corner -> 4. total 9.
    expect(protos.length).toBe(9);
    expect(protos.filter((p) => p.tile === "deck").length).toBe(1);
    expect(protos.filter((p) => p.tile === "wall").length).toBe(4);
  });

  it("solves a grid where every shared edge matches", () => {
    const g = solveWfc({ cols: 5, rows: 4, tiles: TILES, seed: 3 });
    expect(g.cells.length).toBe(20);
    // Check horizontal adjacency: px socket of (c,r) equals nx socket of (c+1,r).
    const socketOf = (tile: string, rot: number, dir: "px" | "pz" | "nx" | "nz") => {
      const t = TILES.find((x) => x.id === tile)!;
      const DIRS = ["px", "pz", "nx", "nz"] as const;
      const i = DIRS.indexOf(dir);
      return t.sockets[DIRS[(i + ((rot % 4) + 4) % 4) % 4]!];
    };
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols - 1; c++) {
        const a = wfcAt(g, c, r), b = wfcAt(g, c + 1, r);
        expect(socketOf(a.tile, a.rotation, "px")).toBe(socketOf(b.tile, b.rotation, "nx"));
      }
    }
  });

  it("is deterministic: same seed -> identical grid", () => {
    const a = solveWfc({ cols: 6, rows: 5, tiles: TILES, seed: 7 });
    const b = solveWfc({ cols: 6, rows: 5, tiles: TILES, seed: 7 });
    expect(a.cells).toEqual(b.cells);
  });

  it("different seeds can produce different grids", () => {
    const a = solveWfc({ cols: 6, rows: 6, tiles: TILES, seed: 1 });
    const b = solveWfc({ cols: 6, rows: 6, tiles: TILES, seed: 99 });
    // Not guaranteed different, but for these seeds they should differ somewhere.
    const same = a.cells.every((c, i) => c.tile === b.cells[i]!.tile && c.rotation === b.cells[i]!.rotation);
    expect(same).toBe(false);
  });

  it("boundarySocket pins open edges to the true perimeter", () => {
    const g = solveWfc({ cols: 5, rows: 4, tiles: TILES, seed: 4, boundarySocket: "O" });
    const socketOf = (tile: string, rot: number, dir: "px" | "pz" | "nx" | "nz") => {
      const t = TILES.find((x) => x.id === tile)!;
      const DIRS = ["px", "pz", "nx", "nz"] as const;
      const i = DIRS.indexOf(dir);
      return t.sockets[DIRS[(i + ((rot % 4) + 4) % 4) % 4]!];
    };
    const OFF = { px: [1, 0], nx: [-1, 0], pz: [0, 1], nz: [0, -1] } as const;
    for (let r = 0; r < g.rows; r++) {
      for (let c = 0; c < g.cols; c++) {
        const cell = wfcAt(g, c, r);
        for (const d of ["px", "nx", "pz", "nz"] as const) {
          const [dc, dr] = OFF[d];
          const outside = c + dc < 0 || c + dc >= g.cols || r + dr < 0 || r + dr >= g.rows;
          const isOpen = socketOf(cell.tile, cell.rotation, d) === "O";
          expect(isOpen).toBe(outside);
        }
      }
    }
  });

  it("honours fixed constraints", () => {
    const g = solveWfc({ cols: 4, rows: 4, tiles: TILES, seed: 2, fixed: { "0,0": "corner", "2,2": "deck" } });
    expect(wfcAt(g, 2, 2).tile).toBe("deck");
    expect(wfcAt(g, 0, 0).tile).toBe("corner");
  });
});

describe("WFC rooftop model", () => {
  it("builds deterministic parts with deck + parapet", () => {
    const a = buildWfcRooftopParts({ cols: 6, rows: 5, seed: 11 });
    const b = buildWfcRooftopParts({ cols: 6, rows: 5, seed: 11 });
    const names = a.map((p) => p.name);
    expect(names).toContain("deck");
    expect(names).toContain("parapet");
    // Determinism: same part list + same triangle totals.
    const tris = (parts: typeof a) => parts.reduce((s, p) => s + p.mesh.indices.length, 0);
    expect(a.map((p) => p.name)).toEqual(b.map((p) => p.name));
    expect(tris(a)).toBe(tris(b));
  });

  it("scales part geometry with grid size", () => {
    const small = buildWfcRooftopParts({ cols: 3, rows: 3, seed: 5 });
    const big = buildWfcRooftopParts({ cols: 10, rows: 8, seed: 5 });
    const deckTris = (parts: ReturnType<typeof buildWfcRooftopParts>) =>
      parts.find((p) => p.name === "deck")!.mesh.indices.length;
    expect(deckTris(big)).toBeGreaterThan(deckTris(small));
  });
});
