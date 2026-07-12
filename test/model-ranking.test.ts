import { describe, expect, it } from "vitest";
import {
  createRankedModelLibrary,
  rankModelEntries,
  scoreModelEntry,
  scoreModelEntryDetails,
} from "../web/model-ranking.js";

describe("model gallery ranking", () => {
  it("puts curated visually rich scenes before utility models", () => {
    const entries = [
      { id: "plain-box", model: { name: "基础盒" }, cat: "基础" },
      { id: "pcg-biome-river", model: { name: "PCG 湿地河道" }, cat: "植被" },
      { id: "street-lamp", model: { name: "街灯" }, cat: "城市" },
    ];

    expect(rankModelEntries(entries).map((entry) => entry.id)).toEqual([
      "pcg-biome-river",
      "street-lamp",
      "plain-box",
    ]);
  });

  it("rewards color, scene, curve, and layered composition signals", () => {
    const richScene = {
      id: "colorful-river-garden-scene",
      model: {
        name: "彩色河流花园场景",
        assetMeta: { tags: ["曲线路径", "分层散布", "生态"] },
      },
      cat: "自然",
    };
    const isolatedAsset = { id: "plain-prop", model: { name: "单体道具" }, cat: "基础" };

    expect(scoreModelEntry(richScene)).toBeGreaterThan(scoreModelEntry(isolatedAsset));
  });

  it("explains rule scores without presenting them as visual review", () => {
    const entry = { id: "plain-box", model: { name: "基础盒" }, cat: "基础" };
    const details = scoreModelEntryDetails(entry);

    expect(details.score).toBe(scoreModelEntry(entry));
    expect(details.mode).toBe("rule");
    expect(details.reasons.join(" ")).toContain("规则分上限 70");
    expect(details.reasons.join(" ")).toContain("简化词");
  });

  it("keeps materials after every model", () => {
    const ranked = rankModelEntries([
      { id: "mat:a", model: { name: "材质 A" }, cat: "材质", isMaterial: true },
      { id: "rock", model: { name: "石头" }, cat: "自然" },
      { id: "mat:b", model: { name: "材质 B" }, cat: "材质", isMaterial: true },
    ]);

    expect(ranked.map((entry) => entry.id)).toEqual(["rock", "mat:a", "mat:b"]);
  });

  it("reranks the library whenever a model is added", () => {
    const library = createRankedModelLibrary([
      { id: "plain-box", model: { name: "基础盒" }, cat: "基础" },
      { id: "street-lamp", model: { name: "街灯" }, cat: "城市" },
    ]);

    library.add({
      id: "colorful-river-garden-scene",
      model: { name: "彩色河流花园场景" },
      cat: "自然",
    });

    expect(library.entries.map((entry) => entry.id)).toEqual([
      "colorful-river-garden-scene",
      "street-lamp",
      "plain-box",
    ]);
  });
});
