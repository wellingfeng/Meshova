import { describe, expect, it } from "vitest";
import {
  applyScatterTable,
  makePointCloud,
  parseScatterTable,
  scatterGrid,
  serializeScatterTable,
  vec3,
  type ScatterTable,
} from "../src/index.js";

const TABLE: ScatterTable = {
  schema: "meshova-scatter-table@1",
  seed: 17,
  rows: [
    {
      id: "low",
      label: "低地灌木",
      assetSlot: "shrub",
      mask: { type: "height", max: 2 },
      scale: [0.8, 1.2],
      yaw: [-Math.PI, Math.PI],
      attributes: { species: 10 },
    },
    {
      id: "high",
      label: "高地松树",
      assetSlot: "pine",
      mask: { type: "height", min: 3 },
      attributes: { species: 20 },
    },
  ],
};

describe("ScatterTable", () => {
  it("按每行条件选资产并写实例属性", () => {
    const cloud = makePointCloud({ points: [vec3(0, 0, 0), vec3(0, 5, 0)] });
    const out = applyScatterTable(cloud, TABLE, { assetVariants: { shrub: 3, pine: 7 } });
    expect(out.attributes.variant).toEqual([3, 7]);
    expect(out.attributes.species).toEqual([10, 20]);
    expect(out.attributes.mask).toEqual([1, 1]);
    expect(out.attributes.scale![0]).toBeGreaterThanOrEqual(0.8);
    expect(out.attributes.scale![0]).toBeLessThanOrEqual(1.2);
  });

  it("同 seed 结果完全确定", () => {
    const cloud = scatterGrid({ cols: 20, rows: 20 });
    const options = { assetVariants: { shrub: 3, pine: 7 } };
    const first = applyScatterTable(cloud, { ...TABLE, density: 0.4 }, options);
    const second = applyScatterTable(cloud, { ...TABLE, density: 0.4 }, options);
    expect(second.attributes).toEqual(first.attributes);
  });

  it("支持权重、独立密度与直接裁剪", () => {
    const cloud = scatterGrid({ cols: 40, rows: 10 });
    const table: ScatterTable = {
      schema: "meshova-scatter-table@1",
      seed: 2,
      density: 0.5,
      rows: [
        { id: "common", variant: 0, weight: 4, density: 1 },
        { id: "rare", variant: 1, weight: 1, density: 0.5 },
      ],
    };
    const out = applyScatterTable(cloud, table, { prune: true });
    expect(out.points.length).toBeGreaterThan(140);
    expect(out.points.length).toBeLessThan(260);
    const rare = out.attributes.variant!.filter((value) => value === 1).length;
    expect(rare).toBeGreaterThan(0);
    expect(rare).toBeLessThan(out.points.length / 3);
  });

  it("JSON 往返并拒绝无效表", () => {
    expect(parseScatterTable(serializeScatterTable(TABLE)).rows).toHaveLength(2);
    expect(() => applyScatterTable(makePointCloud({ points: [] }), TABLE)).toThrow(/missing variant mapping/);
    expect(() => serializeScatterTable({ ...TABLE, rows: [TABLE.rows[0]!, TABLE.rows[0]!] })).toThrow(/duplicate/);
  });
});
