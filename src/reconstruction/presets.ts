import type { ReconstructionContract } from "./protocol.js";

export type HeroReconstructionContractId = "buick-riviera-1965" | "gmc-canyon-at4x";

export const HERO_RECONSTRUCTION_CONTRACTS: Readonly<Record<HeroReconstructionContractId, ReconstructionContract>> = {
  "buick-riviera-1965": {
    version: 1,
    id: "hero:buick-riviera-1965",
    subject: "1965 personal-luxury hardtop coupe",
    complexity: "hero",
    intendedUse: "game-ready",
    referenceViews: ["persp", "front", "side", "rear", "top"],
    assumptions: ["Two-door hardtop", "Long hood and short rear deck", "Period-correct chrome and whitewall wheel language"],
    criticalFeatures: [
      {
        id: "razor-body",
        label: "刀锋车身",
        description: "Low, long razor-edge lower body with stable coupe proportions",
        partNames: ["razor_edge_lower_body"],
        minimumScore: 1,
      },
      {
        id: "pillarless-hardtop",
        label: "无柱硬顶",
        description: "Thin hardtop frame surrounding a pillarless glass greenhouse",
        partNames: ["hardtop_roof_frame", "pillarless_greenhouse_glass"],
        minimumCount: 2,
        minimumScore: 1,
      },
      {
        id: "clamshell-headlights",
        label: "蚌壳隐藏灯",
        description: "Paired ribbed clamshell hidden-headlight doors",
        partNames: ["ribbed_clamshell_headlight_-1", "ribbed_clamshell_headlight_1"],
        minimumCount: 2,
        minimumScore: 1,
      },
      {
        id: "buick-signature",
        label: "别克标志特征",
        description: "Center grille, chrome bumpers, and front tri-shield identity",
        partNames: ["front_center_grille", "front_chrome_bumper", "front_buick_trishield_badge"],
        minimumCount: 3,
        minimumScore: 1,
      },
    ],
    attachments: [
      {
        id: "hood-body",
        childPart: "long_hood_spear",
        parentPart: "razor_edge_lower_body",
        parentSocket: "front-upper-shell",
        localStart: [0, 0, 0],
        localEnd: [0, 0, 0],
        embedDepth: 0.05,
        gapTolerance: 0.03,
      },
      {
        id: "glass-roof",
        childPart: "pillarless_greenhouse_glass",
        parentPart: "hardtop_roof_frame",
        parentSocket: "greenhouse-frame",
        localStart: [0, 0, 0],
        localEnd: [0, 0, 0],
        embedDepth: 0.04,
        gapTolerance: 0.03,
      },
    ],
    actions: [
      {
        partName: "long_hood_spear",
        pivot: [0, 0, 0.5],
        collider: { type: "box" },
      },
    ],
    quality: {
      targetScore: 0.9,
      minimumGeometryScore: 0.72,
      requireCriticPass: true,
      requiredLookDevModes: ["reference", "neutral", "grazing"],
    },
  },
  "gmc-canyon-at4x": {
    version: 1,
    id: "hero:gmc-canyon-at4x",
    subject: "off-road crew-cab pickup",
    complexity: "hero",
    intendedUse: "game-ready",
    referenceViews: ["persp", "front", "side", "rear", "top"],
    assumptions: ["Four-door crew cab", "Separate open bed", "Four complete off-road wheel assemblies"],
    criticalFeatures: [
      {
        id: "pickup-layout",
        label: "皮卡三段布局",
        description: "Distinct hood, crew cab, and cargo bed silhouette",
        partNames: ["hood_power_dome", "crew_cab_pillars", "bed_box_liner"],
        minimumCount: 3,
        minimumScore: 1,
      },
      {
        id: "gmc-face",
        label: "GMC 前脸",
        description: "Large grille, GMC badge, paired C lamps, and steel lower protection",
        partNames: ["front_grille", "gmc_front_badge", "c_lamp_-1", "c_lamp_1", "front_steel_bumper", "front_skid_plate"],
        minimumCount: 6,
        minimumScore: 1,
      },
      {
        id: "offroad-hardware",
        label: "越野硬件",
        description: "Wheel flares, recovery hooks, underbody frame, and bed sport bar",
        partNames: ["wheel_flares", "red_recovery_hooks", "underbody_frame", "bed_sport_bar"],
        minimumCount: 4,
        minimumScore: 1,
      },
    ],
    attachments: [
      {
        id: "hood-body",
        childPart: "hood_power_dome",
        parentPart: "lower_body_shell",
        parentSocket: "front-upper-shell",
        localStart: [0, 0, 0],
        localEnd: [0, 0, 0],
        embedDepth: 0.05,
        gapTolerance: 0.03,
      },
      {
        id: "bed-body",
        childPart: "bed_box_liner",
        parentPart: "lower_body_shell",
        parentSocket: "rear-frame",
        localStart: [0, 0, 0],
        localEnd: [0, 0, 0],
        embedDepth: 0.05,
        gapTolerance: 0.03,
      },
    ],
    actions: [
      {
        partName: "tailgate_outer_skin",
        pivot: [0, -0.5, 0],
        collider: { type: "box" },
      },
    ],
    quality: {
      targetScore: 0.9,
      minimumGeometryScore: 0.72,
      requireCriticPass: true,
      requiredLookDevModes: ["reference", "neutral", "grazing"],
    },
  },
};

export function getHeroReconstructionContract(id: HeroReconstructionContractId): ReconstructionContract {
  return JSON.parse(JSON.stringify(HERO_RECONSTRUCTION_CONTRACTS[id])) as ReconstructionContract;
}
