import { describe, expect, it } from "vitest";
import {
  buildUrbanBuildingParts,
  urbanDefaults,
  bounds,
  triangleCount,
  toViewerModel,
  type NamedPart,
  type UrbanStyle,
} from "../src/index.js";
import { zFightingReport } from "../src/critique/geometry-metrics.js";

const STYLES: UrbanStyle[] = [
  "artDeco",
  "glassTower",
  "brickWalkup",
  "modernOffice",
  "brownstone",
  "corporate",
];

function allFinite(parts: NamedPart[]): boolean {
  for (const part of parts) {
    for (const v of part.mesh.positions) {
      if (!Number.isFinite(v.x) || !Number.isFinite(v.y) || !Number.isFinite(v.z)) return false;
    }
  }
  return true;
}

describe("urban building generator", () => {
  it("builds finite, non-empty parts for every style", () => {
    for (const style of STYLES) {
      const parts = buildUrbanBuildingParts({ style });
      expect(parts.length).toBeGreaterThan(3);
      expect(allFinite(parts)).toBe(true);
      const names = parts.map((p) => p.name);
      // every style has a wall mass, floor slabs, framed glass windows
      expect(names).toContain("walls");
      expect(names).toContain("slabs");
      expect(names).toContain("window_frames");
      expect(names).toContain("windows");
      // total geometry is more than a single box
      const tris = parts.reduce((s, p) => s + triangleCount(p.mesh), 0);
      expect(tris).toBeGreaterThan(200);
    }
  });

  it("is deterministic: same seed -> identical geometry", () => {
    const a = buildUrbanBuildingParts({ style: "artDeco", seed: 3 });
    const b = buildUrbanBuildingParts({ style: "artDeco", seed: 3 });
    const va = a.find((p) => p.name === "walls")!.mesh.positions;
    const vb = b.find((p) => p.name === "walls")!.mesh.positions;
    expect(va.length).toBe(vb.length);
    for (let i = 0; i < va.length; i++) {
      expect(va[i]!.x).toBe(vb[i]!.x);
      expect(va[i]!.y).toBe(vb[i]!.y);
      expect(va[i]!.z).toBe(vb[i]!.z);
    }
  });

  it("taller floor counts produce a taller silhouette", () => {
    const low = buildUrbanBuildingParts({ style: "modernOffice", floors: 4 });
    const high = buildUrbanBuildingParts({ style: "modernOffice", floors: 20 });
    const lowH = bounds(low.find((p) => p.name === "walls")!.mesh).max.y;
    const highH = bounds(high.find((p) => p.name === "walls")!.mesh).max.y;
    expect(highH).toBeGreaterThan(lowH);
  });

  it("art-deco steps back: the crown footprint is narrower than the base", () => {
    const parts = buildUrbanBuildingParts({ style: "artDeco", floors: 15, setbackEvery: 4, setbackAmount: 0.5 });
    const wallB = bounds(parts.find((p) => p.name === "walls")!.mesh);
    const crown = parts.find((p) => p.name === "crown");
    expect(crown).toBeTruthy();
    const crownB = bounds(crown!.mesh);
    const baseWidth = wallB.max.x - wallB.min.x;
    const crownWidth = crownB.max.x - crownB.min.x;
    expect(crownWidth).toBeLessThan(baseWidth);
  });

  it("crown style selects the right roof part", () => {
    expect(buildUrbanBuildingParts({ style: "corporate" }).some((p) => p.name === "crown")).toBe(true);
    // watertank crown adds a rooftop plant group
    const office = buildUrbanBuildingParts({ style: "modernOffice" });
    expect(office.some((p) => p.name === "roof_plant")).toBe(true);
  });

  it("exposes per-style defaults", () => {
    const d = urbanDefaults("glassTower");
    expect(d.style).toBe("glassTower");
    expect(d.facade).toBe("ribbon");
    expect(d.floors).toBeGreaterThan(0);
  });

  it("exports facade GPU instances without dropping CPU geometry", () => {
    const parts = buildUrbanBuildingParts({ style: "glassTower", floors: 12 });
    const frames = parts.find((part) => part.name === "window_frames")!;
    expect(frames.mesh.positions.length).toBeGreaterThan(frames.renderInstances!.mesh.positions.length);
    expect(frames.renderInstances!.transforms.length).toBeGreaterThan(100);
    const viewerFrames = toViewerModel(parts, "tower").parts.find((part) => part.name === "window_frames")!;
    expect(viewerFrames.renderInstances?.transforms.length).toBe(frames.renderInstances!.transforms.length);
    expect(viewerFrames.positions.length).toBe(frames.mesh.positions.length * 3);
  });

  it("keeps facade and roof layers free of z-fighting", () => {
    for (const style of STYLES) {
      const parts = buildUrbanBuildingParts({ style, floors: 6, width: 5, depth: 4, seed: 3 });
      expect(zFightingReport(parts, { includeSamePart: false }).pairs, style).toBe(0);
    }
  });
});
