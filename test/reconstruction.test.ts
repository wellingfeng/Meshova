import { describe, expect, it } from "vitest";
import {
  box,
  buildBuickRiviera1965Parts,
  buildGmcCanyonAt4xParts,
  encodePNG,
  MockLlmClient,
  transform,
  vec3,
  type CritiqueReport,
  type NamedPart,
  type ReferenceEvaluation,
} from "../src/index.js";
import {
  advanceReconstructionPass,
  appendReviewLedger,
  attachmentContractFromAssemblySlot,
  createReconstructionPassState,
  createReviewLedger,
  evaluateAttachmentContracts,
  evaluateCriticalFeatures,
  evaluateReconstructionGate,
  getHeroReconstructionContract,
  serializeReviewLedger,
  validateReconstructionContract,
  withReconstructionMetadata,
  type ReconstructionContract,
  type ReconstructionEvidence,
} from "../src/reconstruction/index.js";
import { runImageLoop as runContractImageLoop } from "../src/agent/image-loop.ts";

const contract: ReconstructionContract = {
  version: 1,
  id: "hero-chair",
  subject: "office chair",
  complexity: "hero",
  intendedUse: "animation",
  referenceViews: ["front", "side"],
  criticalFeatures: [
    {
      id: "backrest",
      label: "靠背",
      description: "Tall curved backrest",
      partNames: ["backrest"],
      minimumScore: 0.8,
    },
  ],
  attachments: [
    {
      id: "backrest-seat",
      childPart: "backrest",
      parentPart: "seat",
      parentSocket: "seat-back",
      localStart: [0, 0, 0],
      localEnd: [0, 0, 0],
      embedDepth: 0.02,
      gapTolerance: 0.03,
    },
  ],
  actions: [
    {
      partName: "backrest",
      pivot: [0, -0.5, 0],
      collider: { type: "box", size: [1, 2, 0.2] },
      detachable: true,
      breakGroup: "upper-chair",
    },
  ],
  quality: {
    minimumGeometryScore: 0.6,
    requireCriticPass: true,
    requiredLookDevModes: ["reference", "neutral", "grazing"],
  },
};

function evaluation(highestPassedStage: ReferenceEvaluation["highestPassedStage"]): ReferenceEvaluation {
  return {
    score: 0.9,
    silhouetteIoU: 0.9,
    colorSimilarity: 0.9,
    normalizedSilhouetteIoU: 0.9,
    canvasSilhouetteIoU: 0.9,
    edgeF1: 0.9,
    bboxIoU: 0.9,
    centerSimilarity: 0.9,
    framingScore: 0.9,
    shapeScore: 0.9,
    stages: [],
    highestPassedStage,
  };
}

const passingCritique = {
  category: "chair",
  scores: { geometry: 0.9, proportion: 0.9, aesthetic: 0.9, realism: 0.9, deterministic: 0.9, overall: 0.9 },
  issues: [],
  passed: true,
  partMetrics: [],
} satisfies CritiqueReport;

function evidence(overrides: Partial<ReconstructionEvidence> = {}): ReconstructionEvidence {
  return {
    iteration: 0,
    runOk: true,
    candidateStable: true,
    evaluation: evaluation("D3"),
    critique: passingCritique,
    criticalFeatures: [{
      id: "backrest",
      label: "靠背",
      score: 1,
      threshold: 0.8,
      passed: true,
      matchedParts: ["backrest"],
      finding: "passed",
    }],
    attachments: [{
      id: "backrest-seat",
      childPart: "backrest",
      parentPart: "seat",
      gap: 0,
      allowedGap: 0.05,
      passed: true,
      finding: "attached",
    }],
    lookDevModes: ["reference", "neutral", "grazing"],
    ...overrides,
  };
}

describe("重建质量合同", () => {
  it("校验标识、阈值、引用视角和连接参数", () => {
    expect(validateReconstructionContract(contract)).toEqual([]);
    const invalid: ReconstructionContract = {
      ...contract,
      id: "",
      referenceViews: [],
      criticalFeatures: [{ ...contract.criticalFeatures[0]!, minimumScore: 2 }],
      attachments: [{ ...contract.attachments![0]!, gapTolerance: -1 }],
    };
    expect(validateReconstructionContract(invalid).map((issue) => issue.path)).toEqual([
      "id",
      "referenceViews",
      "criticalFeatures.backrest.minimumScore",
      "attachments.backrest-seat",
    ]);
  });

  it("用语义标签或外部评分门禁关键特征", () => {
    const parts: NamedPart[] = [{ name: "raw.0", label: "backrest", mesh: box() }];
    expect(evaluateCriticalFeatures(parts, contract.criticalFeatures)[0]?.passed).toBe(true);
    const failed = evaluateCriticalFeatures([], contract.criticalFeatures);
    expect(failed[0]?.passed).toBe(false);
    expect(evaluateCriticalFeatures([], contract.criticalFeatures, { backrest: 0.95 })[0]?.passed).toBe(true);
  });

  it("按部件包围盒间隙检查连接", () => {
    const touching: NamedPart[] = [
      { name: "seat", mesh: box() },
      { name: "backrest", mesh: transform(box(), { translate: vec3(1, 0, 0) }) },
    ];
    const detached: NamedPart[] = [
      touching[0]!,
      { name: "backrest", mesh: transform(box(), { translate: vec3(2, 0, 0) }) },
    ];
    expect(evaluateAttachmentContracts(touching, contract.attachments!)[0]?.passed).toBe(true);
    expect(evaluateAttachmentContracts(detached, contract.attachments!)[0]?.passed).toBe(false);
  });

  it("严格按阶段推进并阻止回退候选", () => {
    let state = createReconstructionPassState(contract);
    const phases = ["blockout", "structure", "shape", "material", "lookdev"] as const;
    for (let iteration = 0; iteration < phases.length; iteration++) {
      expect(state.phase).toBe(phases[iteration]);
      const decision = evaluateReconstructionGate(contract, state.phase, evidence({ iteration }));
      expect(decision.accepted).toBe(true);
      state = advanceReconstructionPass(state, decision, iteration);
    }
    expect(state.completed).toBe(true);
    expect(state.acceptedIterations).toEqual([0, 1, 2, 3, 4]);

    const blocked = evaluateReconstructionGate(
      contract,
      "shape",
      evidence({ candidateStable: false, criticalFeatures: [] }),
    );
    expect(blocked.accepted).toBe(false);
    expect(blocked.issues.map((issue) => issue.code)).toContain("candidate");
    expect(blocked.issues.map((issue) => issue.code)).toContain("feature");
  });

  it("VLM 分层分数硬门禁造型、空间、色彩、材质与灯光", () => {
    const guarded: ReconstructionContract = {
      ...contract,
      quality: {
        ...contract.quality,
        requireVlmReview: true,
        minimumVlmScore: 0.7,
        minimumVlmConfidence: 0.6,
        minimumVlmLayerScore: 0.65,
      },
    };
    const visualReview = {
      visualScore: 0.82,
      confidence: 0.9,
      aesthetic: 0.8,
      realism: 0.8,
      layerScores: {
        silhouetteProportion: 0.8,
        componentStructure: 0.8,
        spatialStructure: 0.8,
        formDetail: 0.8,
        colorPalette: 0.8,
        materialSurface: 0.8,
        lightingCamera: 0.8,
      },
    };
    expect(evaluateReconstructionGate(guarded, "shape", evidence({ visualReview })).accepted).toBe(true);
    const conservative = evaluateReconstructionGate(guarded, "shape", evidence({
      visualReview,
      critique: {
        ...passingCritique,
        scores: { ...passingCritique.scores, deterministic: 0.76 },
      },
      criticalFeatures: [{
        ...evidence().criticalFeatures[0]!,
        score: 0.71,
        passed: false,
      }],
    }));
    expect(conservative.qualityScore).toBeCloseTo(0.71);
    expect(conservative.qualityComponents).toEqual({
      deterministic: 0.76,
      visual: 0.82,
      criticalFeatures: 0.71,
    });
    expect(evaluateReconstructionGate(guarded, "shape", evidence()).issues.map((issue) => issue.code)).toContain("vision");
    const badColor = {
      ...visualReview,
      layerScores: { ...visualReview.layerScores, colorPalette: 0.4 },
    };
    const materialGate = evaluateReconstructionGate(guarded, "material", evidence({ visualReview: badColor }));
    expect(materialGate.accepted).toBe(false);
    expect(materialGate.issues.some((issue) => issue.message.includes("colorPalette"))).toBe(true);
  });

  it("VLM 必需时关键特征不能只靠部件命名通过", () => {
    const parts: NamedPart[] = [{ name: "backrest", mesh: box() }];
    const missing = evaluateCriticalFeatures(parts, contract.criticalFeatures, {}, { requireExternalScores: true });
    expect(missing[0]?.passed).toBe(false);
    expect(missing[0]?.finding).toContain("no visual review score");
    const reviewed = evaluateCriticalFeatures(parts, contract.criticalFeatures, { backrest: 0.9 }, { requireExternalScores: true });
    expect(reviewed[0]?.passed).toBe(true);
  });

  it("把装配槽和动作信息接到语义部件", () => {
    const attachment = attachmentContractFromAssemblySlot({
      id: "seat-back",
      label: "靠背接口",
      type: "chair-part",
      requiredTags: ["chair"],
      position: [0, 1, 0],
      orientation: { yaw: 0, pitch: 0, roll: 0 },
      size: { width: 1, height: 0.5, depth: 0.2 },
      capacity: 1,
    }, "backrest", "seat");
    expect(attachment.parentSocket).toBe("seat-back");
    const annotated = withReconstructionMetadata([{ name: "backrest", mesh: box() }], contract);
    expect(annotated[0]?.metadata?.actionProfile).toBeDefined();
    expect(annotated[0]?.metadata?.reconstructionAttachments).toBeDefined();
  });

  it("不可变追加可序列化复盘账本", () => {
    const ledger = createReviewLedger(contract);
    const gate = evaluateReconstructionGate(contract, "blockout", evidence());
    const updated = appendReviewLedger(ledger, {
      iteration: 0,
      phase: "blockout",
      script: "return [];",
      screenshots: [{ id: "shot-0", mode: "reference", imageBase64: "png" }],
      score: 0.9,
      candidateAccepted: true,
      gate,
      criticalFeatures: [],
      attachments: [],
    });
    expect(ledger.entries).toHaveLength(0);
    expect(updated.entries).toHaveLength(1);
    expect(JSON.parse(serializeReviewLedger(updated)).entries[0].script).toBe("return [];");
  });

  it("图片闭环输出阶段状态和复盘账本", async () => {
    const pixels = new Uint8Array(16 * 16 * 4);
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const foreground = x >= 4 && x < 12 && y >= 4 && y < 12;
        const offset = (y * 16 + x) * 4;
        pixels[offset] = foreground ? 210 : 235;
        pixels[offset + 1] = foreground ? 55 : 235;
        pixels[offset + 2] = foreground ? 45 : 235;
        pixels[offset + 3] = 255;
      }
    }
    const referencePng = encodePNG(16, 16, 4, pixels);
    const renderPixels = pixels.slice();
    for (let index = 0; index < renderPixels.length; index += 4) {
      if (renderPixels[index] === 235) {
        renderPixels[index] = 13;
        renderPixels[index + 1] = 17;
        renderPixels[index + 2] = 23;
      }
    }
    const renderPng = encodePNG(16, 16, 4, renderPixels);
    const result = await runContractImageLoop({
      client: new MockLlmClient(["```js\nreturn [part('body', box(1, 1, 1))];\n```"]),
      referencePng,
      maxIterations: 1,
      targetScore: 2,
      scoreOptions: { gridSize: 16, renderBg: [13, 17, 23] },
      reconstructionContract: contract,
      render: async () => ({ imageBase64: Buffer.from(renderPng).toString("base64") }),
    });
    expect(result.passState?.phase).toBe("structure");
    expect(result.passState?.completed).toBe(false);
    expect(result.reviewLedger?.entries).toHaveLength(1);
    expect(result.reviewLedger?.entries[0]?.phase).toBe("blockout");
    expect(result.success).toBe(false);

    const progressiveContract: ReconstructionContract = {
      ...contract,
      id: "progressive-chair",
      criticalFeatures: [],
      attachments: [],
      quality: { minimumGeometryScore: 0, requireCriticPass: false },
    };
    const progressive = await runContractImageLoop({
      client: new MockLlmClient([
        "```js\nreturn [part('body', box(1, 1, 1))];\n```",
        "```js\nreturn [part('body', box(1, 1, 1))];\n```",
      ]),
      referencePng,
      maxIterations: 2,
      targetScore: 2,
      scoreOptions: { gridSize: 16, renderBg: [13, 17, 23] },
      reconstructionContract: progressiveContract,
      render: async () => ({ imageBase64: Buffer.from(renderPng).toString("base64") }),
    });
    expect(progressive.steps[1]?.gate?.reason).toBe("no-improvement");
    expect(progressive.steps[1]?.reconstructionGate?.accepted).toBe(true);
    expect(progressive.best?.iteration).toBe(1);
  });

  it("两个旗舰合同覆盖真实模型关键特征和连接", () => {
    const cases = [
      [getHeroReconstructionContract("buick-riviera-1965"), buildBuickRiviera1965Parts()],
      [getHeroReconstructionContract("gmc-canyon-at4x"), buildGmcCanyonAt4xParts()],
    ] as const;
    for (const [heroContract, parts] of cases) {
      expect(evaluateCriticalFeatures(parts, heroContract.criticalFeatures).every((item) => item.passed)).toBe(true);
      expect(evaluateAttachmentContracts(parts, heroContract.attachments ?? []).every((item) => item.passed)).toBe(true);
    }
  });
});
