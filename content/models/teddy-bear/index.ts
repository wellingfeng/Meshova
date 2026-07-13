import { defineModel, assemblePlushCharacter, type ContentParams } from "meshova/pcg";

export type TeddyBearParams = ContentParams & {
  headSize: number;
  earSize: number;
  bodyW: number;
  bodyH: number;
  limb: number;
  snout: number;
};

export const teddyBear = defineModel<TeddyBearParams, ReturnType<typeof assemblePlushCharacter>>({
  kind: "model",
  id: "teddy",
  version: "1.0.0",
  metadata: {
    name: "卡通小熊",
    category: "角色",
    tags: ["小熊", "毛绒", "对称角色"],
    description: "由语义参数驱动的程序化毛绒小熊。",
  },
  params: [
    { key: "headSize", label: "头部大小", min: 0.4, max: 1.1, step: 0.01, default: 0.75 },
    { key: "earSize", label: "耳朵大小", min: 0.1, max: 0.5, step: 0.01, default: 0.3 },
    { key: "bodyW", label: "身体宽度", min: 0.6, max: 1.2, step: 0.01, default: 0.85 },
    { key: "bodyH", label: "身体高度", min: 0.8, max: 1.4, step: 0.01, default: 1.05 },
    { key: "limb", label: "四肢粗细", min: 0.3, max: 0.7, step: 0.01, default: 0.45 },
    { key: "snout", label: "口鼻大小", min: 0.2, max: 0.5, step: 0.01, default: 0.34 },
  ],
  defaultParams: {
    headSize: 0.75,
    earSize: 0.3,
    bodyW: 0.85,
    bodyH: 1.05,
    limb: 0.45,
    snout: 0.34,
  },
  preview: { camera: "persp", material: "follow-model", background: "studio" },
  build(params) {
    return assemblePlushCharacter({
      headSize: params.headSize,
      earSize: params.earSize,
      bodyWidth: params.bodyW,
      bodyHeight: params.bodyH,
      limbSize: params.limb,
      snoutSize: params.snout,
    });
  },
});

export default teddyBear;
