import { describe, expect, it } from "vitest";
import {
  MockLlmClient,
  encodePNG,
  evaluateReferencePng,
  gateReferenceCandidate,
  makeReferenceTarget,
  runImageLoop,
} from "../src/index.js";

const RENDER_BG: [number, number, number] = [13, 17, 23];

function squarePng(
  size: number,
  squareSize: number,
  offsetX: number,
  offsetY: number,
  foreground: [number, number, number],
  background: [number, number, number],
): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);
  const start = Math.floor((size - squareSize) / 2);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const inside =
        x >= start + offsetX &&
        x < start + offsetX + squareSize &&
        y >= start + offsetY &&
        y < start + offsetY + squareSize;
      const color = inside ? foreground : background;
      const index = (y * size + x) * 4;
      pixels[index] = color[0];
      pixels[index + 1] = color[1];
      pixels[index + 2] = color[2];
      pixels[index + 3] = 255;
    }
  }
  return encodePNG(size, size, 4, pixels);
}

function fixtures() {
  const reference = squarePng(64, 24, 0, 0, [210, 55, 45], [235, 235, 235]);
  const target = makeReferenceTarget(reference, { gridSize: 64, renderBg: RENDER_BG });
  const centered = evaluateReferencePng(
    target,
    squarePng(64, 24, 0, 0, [210, 55, 45], RENDER_BG),
  );
  const shifted = evaluateReferencePng(
    target,
    squarePng(64, 24, 13, 0, [210, 55, 45], RENDER_BG),
  );
  return { reference, target, centered, shifted };
}

describe("分级参考图评估", () => {
  it("归一化轮廓相同，也会惩罚错误画布位置", () => {
    const { centered, shifted } = fixtures();
    expect(shifted.normalizedSilhouetteIoU).toBeCloseTo(centered.normalizedSilhouetteIoU, 5);
    expect(centered.canvasSilhouetteIoU).toBeGreaterThan(shifted.canvasSilhouetteIoU);
    expect(centered.edgeF1).toBeGreaterThan(shifted.edgeF1);
    expect(centered.bboxIoU).toBeGreaterThan(shifted.bboxIoU);
    expect(centered.shapeScore).toBeGreaterThan(shifted.shapeScore);
    expect(centered.highestPassedStage).toBe("D3");
  });

  it("接受基线与真实改进，拒绝锁定指标回退", () => {
    const { centered, shifted } = fixtures();
    expect(gateReferenceCandidate({ evaluation: shifted }, null).reason).toBe("baseline");
    expect(gateReferenceCandidate({ evaluation: centered }, { evaluation: shifted }).accepted).toBe(true);

    const traded = {
      ...centered,
      score: centered.score + 0.05,
      edgeF1: centered.edgeF1 - 0.08,
    };
    const decision = gateReferenceCandidate(
      { evaluation: traded, rankScore: centered.score + 0.05 },
      { evaluation: centered, rankScore: centered.score },
    );
    expect(decision.accepted).toBe(false);
    expect(decision.reason).toBe("metric-regression");
    expect(decision.regressions.some((item) => item.metric === "edgeF1")).toBe(true);
  });
});

describe("图片代理候选门禁", () => {
  it("回退候选不会覆盖 accepted best", async () => {
    const { reference } = fixtures();
    const centered = squarePng(64, 24, 0, 0, [190, 105, 45], RENDER_BG);
    const shifted = squarePng(64, 24, 13, 0, [210, 55, 45], RENDER_BG);
    const client = new MockLlmClient([
      "```js\nreturn [part('body', box(1, 1, 1))];\n```",
      "```js\nreturn [part('body', box(1.1, 1, 1))];\n```",
    ]);
    const result = await runImageLoop({
      client,
      referencePng: reference,
      maxIterations: 2,
      targetScore: 2,
      scoreOptions: { gridSize: 64, renderBg: RENDER_BG },
      render: async (_parts, iteration) => ({
        imageBase64: Buffer.from(iteration === 0 ? centered : shifted).toString("base64"),
      }),
    });

    expect(result.steps).toHaveLength(2);
    expect(result.steps[0]!.gate?.accepted).toBe(true);
    expect(result.steps[1]!.gate?.accepted).toBe(false);
    expect(result.best?.iteration).toBe(0);
  });
});
