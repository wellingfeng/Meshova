import { describe, expect, it } from "vitest";
import {
  buildPcgBrickWallLayout,
  buildPcgBrickWallParts,
  triangleCount,
  vertexCount,
} from "../src/index.js";

describe("PCG brick wall", () => {
  it("builds the expected running-bond brick count", () => {
    const layout = buildPcgBrickWallLayout();
    const evenRows = Math.ceil(layout.params.rows / 2);
    const oddRows = Math.floor(layout.params.rows / 2);
    expect(layout.bricks.length).toBe(
      evenRows * layout.params.columns + oddRows * (layout.params.columns + 2),
    );
  });

  it("keeps the half-brick stagger on alternate rows", () => {
    const layout = buildPcgBrickWallLayout({ jitter: 0, stagger: 1 });
    const row0 = layout.bricks.find((b) => b.row === 0 && b.column === 0)!;
    const row1 = layout.bricks.find((b) => b.row === 1 && b.column === 0)!;
    expect(row1.distance - row0.distance).toBeCloseTo(layout.brickPitch * 0.5, 6);
  });

  it("is deterministic for the same seed", () => {
    const a = buildPcgBrickWallLayout({ seed: 17 });
    const b = buildPcgBrickWallLayout({ seed: 17 });
    expect(a.bricks).toEqual(b.bricks);
  });

  it("changes brick jitter and tint by seed without changing layout count", () => {
    const a = buildPcgBrickWallLayout({ seed: 1 });
    const b = buildPcgBrickWallLayout({ seed: 2 });
    expect(a.bricks.length).toBe(b.bricks.length);
    expect(a.bricks[8]!.center).not.toEqual(b.bricks[8]!.center);
    expect(a.bricks[8]!.color).not.toEqual(b.bricks[8]!.color);
  });

  it("returns renderable brick and mortar parts", () => {
    const parts = buildPcgBrickWallParts();
    const names = parts.map((p) => p.name);
    expect(names).toEqual(["brick_shell", "mortar_backing"]);

    const bricks = parts[0]!;
    const core = parts[1]!;
    expect(vertexCount(bricks.mesh)).toBeGreaterThan(0);
    expect(triangleCount(bricks.mesh)).toBeGreaterThan(0);
    expect(bricks.colors?.length).toBe(vertexCount(bricks.mesh) * 3);
    expect(bricks.surface?.type).toBe("stone");
    expect(core.surface?.type).toBe("concrete");
  });
});
