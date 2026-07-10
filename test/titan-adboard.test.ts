import { describe, it, expect } from "vitest";
import { buildTitanAdBoardParts, TITAN_ADBOARD_DEFAULTS } from "../src/models/titan-adboard.js";

describe("titan-adboard (TUT_ad_boards.hda)", () => {
  it("builds posts, frame, panel and text", () => {
    const parts = buildTitanAdBoardParts();
    const names = parts.map((p) => p.name).sort();
    expect(names).toEqual(["frame", "panel", "posts", "text"]);
    for (const p of parts) expect(p.mesh.positions.length).toBeGreaterThan(0);
  });

  it("stacks one text row per group of words (HDA split rule)", () => {
    const short = buildTitanAdBoardParts({ slogan: "ONE TWO THREE" }); // 1 row
    const long = buildTitanAdBoardParts({ slogan: "A B C D E F G H I" }); // 3 rows
    const st = short.find((p) => p.name === "text")!.mesh.positions.length;
    const lt = long.find((p) => p.name === "text")!.mesh.positions.length;
    expect(lt).toBeGreaterThan(st);
    expect(lt).toBeCloseTo(st * 3, -1);
  });

  it("empty slogan drops the text part", () => {
    const parts = buildTitanAdBoardParts({ slogan: "" });
    expect(parts.find((p) => p.name === "text")).toBeUndefined();
  });

  it("twin posts vs single post changes post geometry", () => {
    const single = buildTitanAdBoardParts({ twinPosts: false });
    const twin = buildTitanAdBoardParts({ twinPosts: true });
    const sp = single.find((p) => p.name === "posts")!.mesh.positions.length;
    const tp = twin.find((p) => p.name === "posts")!.mesh.positions.length;
    expect(tp).toBeCloseTo(sp * 2, -1);
  });

  it("text uses an emissive surface", () => {
    expect(buildTitanAdBoardParts().find((p) => p.name === "text")!.surface?.type).toBe("emissive");
  });

  it("is deterministic", () => {
    const a = buildTitanAdBoardParts({ width: 5 });
    const b = buildTitanAdBoardParts({ width: 5 });
    expect(a.find((p) => p.name === "panel")!.mesh.positions).toEqual(
      b.find((p) => p.name === "panel")!.mesh.positions,
    );
  });

  it("default words-per-row is 3", () => {
    expect(TITAN_ADBOARD_DEFAULTS.wordsPerRow).toBe(3);
  });
});
