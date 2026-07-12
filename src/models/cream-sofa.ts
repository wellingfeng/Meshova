/** Procedural replicas measured from the cream-sofa Blender reference pack. */
import { roundedBox } from "../geometry/shapes.js";
import { sphere } from "../geometry/primitives.js";
import { merge, type NamedPart } from "../geometry/index.js";
import { transform } from "../geometry/transform.js";
import { vec3 } from "../math/vec3.js";
import {
  groundedTuftedPad,
  looseUpholsteredCushion,
  upholsteredPanel,
} from "./upholstery.js";

type RGB = [number, number, number];

export type CreamSofaVariant = "quilted" | "wrap";

export interface CreamSofaParams {
  variant: CreamSofaVariant;
  width: number;
  depth: number;
  height: number;
  seatColumns: number;
  fabricColor: RGB;
  pillowColor: RGB;
}

export const CREAM_SOFA_DEFAULTS: Record<CreamSofaVariant, CreamSofaParams> = {
  quilted: {
    variant: "quilted",
    width: 2.8,
    depth: 1.1,
    height: 0.8,
    seatColumns: 8,
    fabricColor: [0.78, 0.72, 0.63],
    pillowColor: [0.9, 0.85, 0.76],
  },
  wrap: {
    variant: "wrap",
    width: 2.68,
    depth: 0.943,
    height: 0.806,
    seatColumns: 3,
    fabricColor: [0.82, 0.76, 0.68],
    pillowColor: [0.91, 0.86, 0.78],
  },
};

const FOOT: RGB = [0.08, 0.075, 0.065];

const PART_LABELS: Record<string, string> = {
  sealed_quilted_seat: "连续绗缝座面",
  segmented_backrest: "分段软包靠背",
  rounded_armrests: "圆角软包扶手",
  loose_back_pillows: "松软靠枕",
  recessed_feet: "内缩支脚",
  sealed_seat_deck: "连续座面底胚",
  three_seat_cushions: "三联座垫",
  continuous_wrap_frame: "环抱软包框架",
  large_back_pillows: "大号靠枕",
  side_accent_pillows: "侧边装饰枕",
  flower_cushion: "花形抱枕",
  hidden_feet: "隐藏支脚",
};

function padded(width: number, height: number, depth: number, radius: number) {
  return upholsteredPanel(width, height, depth, radius, 3);
}

function softPillow(width: number, height: number, depth: number, radius: number) {
  return looseUpholsteredCushion(width, height, depth, radius);
}

function fabricPart(name: string, meshes: NamedPart["mesh"][], color: RGB): NamedPart {
  return {
    name,
    label: PART_LABELS[name] ?? name,
    mesh: merge(...meshes),
    color,
    surface: {
      type: "fabric",
      params: { color, roughness: 0.88, weaveScale: 112, normalStrength: 0.24 },
    },
  };
}

function solidPart(name: string, meshes: NamedPart["mesh"][], color: RGB): NamedPart {
  return {
    name,
    label: PART_LABELS[name] ?? name,
    mesh: merge(...meshes),
    color,
    surface: { type: "plastic", params: { color, roughness: 0.72 } },
  };
}

function quiltedSeat(width: number, height: number, depth: number, columns: number) {
  return groundedTuftedPad({
    width,
    height,
    depth,
    columns,
    rows: 2,
    seamDepth: 0.035,
    wrinkleStrength: 0.004,
  });
}

function buildQuilted(params: CreamSofaParams): NamedPart[] {
  const fabric = params.fabricColor;
  const pillow = params.pillowColor;
  const columns = Math.max(5, Math.min(10, Math.round(params.seatColumns)));
  const parts: NamedPart[] = [];

  const quiltedBody = transform(quiltedSeat(2.66, 0.305, 0.876, columns), {
    translate: vec3(0, 0, 0.112),
  });
  parts.push(fabricPart("sealed_quilted_seat", [
    quiltedBody,
  ], fabric));

  const backModules = Array.from({ length: 5 }, (_, index) =>
    transform(padded(0.505, 0.62, 0.29, 0.095), {
      translate: vec3(-1.01 + index * 0.505, 0.365, -0.39),
    }),
  );
  parts.push(fabricPart("segmented_backrest", backModules, fabric));

  const arms = [
    transform(padded(0.32, 0.66, 0.82, 0.14), { translate: vec3(-1.24, 0.36, -0.1) }),
    transform(padded(0.32, 0.66, 0.82, 0.14), { translate: vec3(1.24, 0.36, -0.1) }),
  ];
  parts.push(fabricPart("rounded_armrests", arms, fabric));

  const loosePillows = [
    transform(softPillow(0.632, 0.405, 0.22, 0.065), {
      rotate: vec3(-0.12, 0, -0.035),
      translate: vec3(-0.775, 0.595, -0.17),
    }),
    transform(softPillow(0.629, 0.287, 0.19, 0.055), {
      rotate: vec3(-0.08, 0, 0.02),
      translate: vec3(-0.02, 0.545, -0.13),
    }),
    transform(softPillow(0.632, 0.405, 0.22, 0.065), {
      rotate: vec3(-0.12, 0, 0.035),
      translate: vec3(0.735, 0.595, -0.17),
    }),
  ];
  parts.push(fabricPart("loose_back_pillows", loosePillows, pillow));

  const feet = [-1.21, 0.06, 0.245, 1.23].flatMap((x) => [-0.35, 0.3].map((z) =>
    transform(roundedBox({ width: 0.1, height: 0.032, depth: 0.1, radius: 0.014, steps: 2 }), {
      translate: vec3(x, 0.016, z),
    }),
  ));
  parts.push(solidPart("recessed_feet", feet, FOOT));
  return parts;
}

function flowerCushion(): NamedPart["mesh"] {
  const petals = [];
  for (let index = 0; index < 8; index++) {
    const angle = (index / 8) * Math.PI * 2;
    petals.push(transform(sphere(1, 14, 10), {
      scale: vec3(0.045, 0.022, 0.078),
      rotate: vec3(0, angle, 0),
      translate: vec3(Math.sin(angle) * 0.055, 0, Math.cos(angle) * 0.055),
    }));
  }
  petals.push(transform(sphere(0.045, 12, 8), { scale: vec3(1, 0.6, 1) }));
  return merge(...petals);
}

function buildWrap(params: CreamSofaParams): NamedPart[] {
  const fabric = params.fabricColor;
  const pillow = params.pillowColor;
  const parts: NamedPart[] = [];

  parts.push(fabricPart("sealed_seat_deck", [
    transform(padded(2.36, 0.2, 0.78, 0.09), {
      translate: vec3(0, 0.15, 0.075),
    }),
  ], fabric));

  const seats = [-0.78, 0, 0.78].map((x) =>
    transform(padded(0.805, 0.345, 0.79, 0.11), { translate: vec3(x, 0.18, 0.075) }),
  );
  parts.push(fabricPart("three_seat_cushions", seats, fabric));

  const back = [-0.78, 0, 0.78].map((x) =>
    transform(padded(0.79, 0.34, 0.2, 0.09), { translate: vec3(x, 0.43, -0.37) }),
  );
  const arms = [
    transform(padded(0.29, 0.8, 0.9, 0.14), { translate: vec3(-1.195, 0.403, -0.03) }),
    transform(padded(0.29, 0.8, 0.9, 0.14), { translate: vec3(1.195, 0.403, -0.03) }),
  ];
  parts.push(fabricPart("continuous_wrap_frame", [...back, ...arms], fabric));

  const largePillows = [-0.75, 0, 0.75].map((x, index) =>
    transform(softPillow(index === 1 ? 0.62 : 0.714, index === 1 ? 0.437 : 0.395, index === 1 ? 0.245 : 0.207, 0.065), {
      rotate: vec3(-0.1, 0, index === 0 ? -0.035 : index === 2 ? 0.035 : 0),
      translate: vec3(x, index === 1 ? 0.588 : 0.553, -0.2),
    }),
  );
  parts.push(fabricPart("large_back_pillows", largePillows, pillow));

  const sidePillows = [
    transform(softPillow(0.245, 0.35, 0.18, 0.05), {
      rotate: vec3(-0.12, 0, -0.2),
      translate: vec3(-1.06, 0.52, 0.05),
    }),
    transform(softPillow(0.245, 0.35, 0.18, 0.05), {
      rotate: vec3(-0.12, 0, 0.2),
      translate: vec3(1.06, 0.52, 0.05),
    }),
  ];
  parts.push(fabricPart("side_accent_pillows", sidePillows, [0.72, 0.66, 0.58]));

  parts.push(fabricPart("flower_cushion", [transform(flowerCushion(), {
    translate: vec3(0.38, 0.43, 0.2),
  })], [0.76, 0.68, 0.57]));

  const feet = [-1.08, -0.38, 0.38, 1.08].map((x) =>
    transform(roundedBox({ width: 0.08, height: 0.02, depth: 0.08, radius: 0.01, steps: 2 }), {
      translate: vec3(x, 0.01, 0.24),
    }),
  );
  parts.push(solidPart("hidden_feet", feet, FOOT));
  return parts;
}

export function buildCreamSofaParts(input: Partial<CreamSofaParams> = {}): NamedPart[] {
  const variant = input.variant ?? "quilted";
  const defaults = CREAM_SOFA_DEFAULTS[variant];
  const params: CreamSofaParams = { ...defaults, ...input, variant };
  const canonical = variant === "quilted"
    ? { width: 2.8, depth: 1.1, height: 0.8 }
    : { width: 2.68, depth: 0.943, height: 0.806 };
  const sx = Math.max(0.2, params.width) / canonical.width;
  const sy = Math.max(0.2, params.height) / canonical.height;
  const sz = Math.max(0.2, params.depth) / canonical.depth;
  const parts = variant === "quilted" ? buildQuilted(params) : buildWrap(params);
  return parts.map((part) => ({
    ...part,
    mesh: transform(part.mesh, { scale: vec3(sx, sy, sz) }),
  }));
}
