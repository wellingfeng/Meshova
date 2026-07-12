/**
 * Parametric Chinese stone arch bridge studied from Bilibili BV15LZhBdE8u.
 *
 * Construction mirrors the reference workflow: build a cambered side profile,
 * batch-cut repeated arches, add facade arch rings, then instance paving and
 * rail modules along the same elevation curve.
 */
import { vec2, type Vec2 } from "../math/vec2.js";
import { vec3 } from "../math/vec3.js";
import {
  box,
  icosphere,
  prism,
  loft,
  polyline,
  profileSweep,
  rectProfile,
  transform,
  merge,
  computeNormals,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";

type RGB = [number, number, number];

const MASONRY: RGB = [0.45, 0.36, 0.28];
const ARCH_STONE: RGB = [0.74, 0.7, 0.62];
const PAVING_STONE: RGB = [0.64, 0.58, 0.48];
const RAIL_STONE: RGB = [0.72, 0.68, 0.59];
const BUTTRESS_STONE: RGB = [0.38, 0.31, 0.25];

export interface StoneArchBridgeParams {
  /** Number of repeated clear arch openings. */
  arches: number;
  /** Clear radius of each semicircular opening. */
  archRadius: number;
  /** Height of the straight jamb below each arch. */
  springHeight: number;
  /** Masonry width between adjacent arch openings. */
  pierWidth: number;
  /** Structural bridge depth along Z. */
  depth: number;
  /** Extra rise at the bridge crown. */
  camber: number;
  /** Radial thickness of the pale facade arch ring. */
  ringThickness: number;
  /** Thickness of the cap slab above the masonry body. */
  deckThickness: number;
  /** Height of the modular stone railing. */
  railingHeight: number;
  /** Approximate distance between railing posts. */
  postSpacing: number;
  /** Semicircle resolution used by cutters and arch rings. */
  archSegments: number;
  /** Number of paving rows across the bridge. */
  pavingRows: number;
  /** Add four stylized guardian stones at the bridge entrances. */
  guardianStones: boolean;
}

export const STONE_ARCH_BRIDGE_DEFAULTS: StoneArchBridgeParams = {
  arches: 7,
  archRadius: 1.05,
  springHeight: 1.35,
  pierWidth: 0.48,
  depth: 2.8,
  camber: 0.82,
  ringThickness: 0.22,
  deckThickness: 0.22,
  railingHeight: 0.9,
  postSpacing: 1.25,
  archSegments: 28,
  pavingRows: 3,
  guardianStones: true,
};

function sideProfilePrism(outline: Vec2[], depth: number): Mesh {
  return transform(prism(outline, depth), { rotate: vec3(-Math.PI / 2, 0, 0) });
}

function camberedSlab(
  halfLength: number,
  depth: number,
  bottomAt: (x: number) => number,
  thickness: number,
  samples: number,
): Mesh {
  const halfDepth = depth / 2;
  const rings = [];
  for (let i = 0; i <= samples; i++) {
    const x = -halfLength + (i / samples) * halfLength * 2;
    const y0 = bottomAt(x);
    const y1 = y0 + thickness;
    rings.push([
      vec3(x, y0, -halfDepth),
      vec3(x, y0, halfDepth),
      vec3(x, y1, halfDepth),
      vec3(x, y1, -halfDepth),
    ]);
  }
  return computeNormals(loft(rings, { caps: true }), 40);
}

function guardianStone(x: number, y: number, z: number, facing: -1 | 1): Mesh {
  const pedestal = transform(box(0.5, 0.22, 0.5), {
    translate: vec3(x, y + 0.11, z),
  });
  const body = transform(icosphere(0.5, 1), {
    scale: vec3(0.62, 0.82, 0.55),
    translate: vec3(x - facing * 0.03, y + 0.52, z),
  });
  const head = transform(icosphere(0.34, 1), {
    translate: vec3(x + facing * 0.18, y + 0.84, z),
  });
  const muzzle = transform(icosphere(0.18, 1), {
    scale: vec3(0.9, 0.72, 0.85),
    translate: vec3(x + facing * 0.45, y + 0.8, z),
  });
  return computeNormals(merge(pedestal, body, head, muzzle), 35);
}

/** Build a deterministic multi-span stone bridge as semantic named parts. */
export function buildStoneArchBridgeParts(
  params: Partial<StoneArchBridgeParams> = {},
): NamedPart[] {
  const p: StoneArchBridgeParams = { ...STONE_ARCH_BRIDGE_DEFAULTS, ...params };
  p.arches = Math.max(1, Math.min(15, Math.floor(p.arches)));
  p.archRadius = Math.max(0.35, p.archRadius);
  p.springHeight = Math.max(0.35, p.springHeight);
  p.pierWidth = Math.max(0.18, p.pierWidth);
  p.depth = Math.max(0.8, p.depth);
  p.camber = Math.max(0, p.camber);
  p.ringThickness = Math.max(0.08, p.ringThickness);
  p.deckThickness = Math.max(0.08, p.deckThickness);
  p.railingHeight = Math.max(0.35, p.railingHeight);
  p.postSpacing = Math.max(0.4, p.postSpacing);
  p.archSegments = Math.max(12, Math.floor(p.archSegments));
  p.pavingRows = Math.max(1, Math.min(6, Math.floor(p.pavingRows)));

  const pitch = p.archRadius * 2 + p.pierWidth;
  const endAbutment = Math.max(0.65, p.pierWidth * 1.5);
  const firstCenter = -((p.arches - 1) * pitch) / 2;
  const halfLength = Math.abs(firstCenter) + p.archRadius + endAbutment;
  const bodyBase = -0.12;
  const spandrel = p.ringThickness + 0.3;
  const topAt = (x: number): number => {
    const u = Math.min(1, Math.abs(x) / halfLength);
    return p.springHeight + p.archRadius + spandrel + p.camber * (1 - u * u);
  };

  const centers = Array.from({ length: p.arches }, (_, i) => firstCenter + i * pitch);
  const profileSamples = Math.max(24, p.arches * 8);
  const structuralRingThickness = p.ringThickness + 0.14;
  const structuralRingRadius = p.archRadius + structuralRingThickness / 2;
  const structuralOuterRadius = p.archRadius + structuralRingThickness;
  const bodyMeshes: Mesh[] = [];
  const ringMeshes: Mesh[] = [];
  for (const centerX of centers) {
    const structuralPoints = [];
    const facadePointsBySide = new Map<-1 | 1, ReturnType<typeof vec3>[]>();
    facadePointsBySide.set(-1, []);
    facadePointsBySide.set(1, []);
    for (const side of [-1, 1] as const) {
      for (let i = 0; i <= p.archSegments; i++) {
        const angle = Math.PI * (i / p.archSegments);
        facadePointsBySide.get(side)!.push(vec3(
          centerX - (p.archRadius + p.ringThickness / 2) * Math.cos(angle),
          p.springHeight + (p.archRadius + p.ringThickness / 2) * Math.sin(angle),
          side * (p.depth / 2 + 0.035),
        ));
      }
      ringMeshes.push(profileSweep(
        polyline(facadePointsBySide.get(side)!),
        rectProfile(p.ringThickness / 2, 0.055),
        { caps: true },
      ));
    }
    for (let i = 0; i <= p.archSegments; i++) {
      const angle = Math.PI * (i / p.archSegments);
      structuralPoints.push(vec3(
        centerX - structuralRingRadius * Math.cos(angle),
        p.springHeight + structuralRingRadius * Math.sin(angle),
        0,
      ));
    }
    bodyMeshes.push(profileSweep(
      polyline(structuralPoints),
      rectProfile(structuralRingThickness / 2, p.depth / 2),
      { caps: true },
    ));

    const spandrelRings = [];
    for (let i = 0; i <= p.archSegments; i++) {
      const x = centerX - p.archRadius + (i / p.archSegments) * p.archRadius * 2;
      const dx = x - centerX;
      const lowerY = p.springHeight + Math.sqrt(Math.max(0, structuralOuterRadius ** 2 - dx ** 2));
      spandrelRings.push([
        vec3(x, lowerY, -p.depth / 2),
        vec3(x, lowerY, p.depth / 2),
        vec3(x, topAt(x), p.depth / 2),
        vec3(x, topAt(x), -p.depth / 2),
      ]);
    }
    bodyMeshes.push(loft(spandrelRings, { caps: true }));
  }

  const pierRuns: Array<{ center: number; width: number }> = [
    { center: -halfLength + endAbutment / 2, width: endAbutment },
    { center: halfLength - endAbutment / 2, width: endAbutment },
  ];
  for (let i = 0; i < centers.length - 1; i++) {
    pierRuns.push({ center: (centers[i]! + centers[i + 1]!) / 2, width: p.pierWidth + 0.04 });
  }
  for (const pier of pierRuns) {
    const left = pier.center - pier.width / 2;
    const right = pier.center + pier.width / 2;
    bodyMeshes.push(sideProfilePrism([
      vec2(left, bodyBase),
      vec2(right, bodyBase),
      vec2(right, topAt(right)),
      vec2(left, topAt(left)),
    ], p.depth));
  }
  const carvedBody = computeNormals(merge(...bodyMeshes), 36);

  const buttressMeshes: Mesh[] = [];
  const buttressHeight = p.springHeight + p.archRadius * 0.18;
  const buttressWidth = p.pierWidth * 1.35;
  const buttressDepth = 0.42;
  const buttressProfile = [
    vec2(-buttressWidth / 2, 0),
    vec2(buttressWidth / 2, 0),
    vec2(buttressWidth / 2, buttressHeight * 0.72),
    vec2(0, buttressHeight),
    vec2(-buttressWidth / 2, buttressHeight * 0.72),
  ];
  for (let i = 0; i < centers.length - 1; i++) {
    const x = (centers[i]! + centers[i + 1]!) / 2;
    for (const side of [-1, 1] as const) {
      buttressMeshes.push(transform(sideProfilePrism(buttressProfile, buttressDepth), {
        translate: vec3(x, 0, side * (p.depth / 2 + buttressDepth / 2 - 0.04)),
      }));
    }
  }

  const deckDepth = p.depth + 0.55;
  const deckCap = camberedSlab(halfLength + 0.16, deckDepth, topAt, p.deckThickness, profileSamples);

  const pavingMeshes: Mesh[] = [];
  const pavingSegments = Math.max(12, p.arches * 3);
  const pavingWidth = p.depth * 0.72;
  const rowWidth = pavingWidth / p.pavingRows;
  const segmentLength = (halfLength * 2) / pavingSegments;
  for (let i = 0; i < pavingSegments; i++) {
    const x0 = -halfLength + i * segmentLength;
    const x1 = x0 + segmentLength;
    const x = (x0 + x1) / 2;
    const slope = Math.atan2(topAt(x1) - topAt(x0), segmentLength);
    for (let row = 0; row < p.pavingRows; row++) {
      const stagger = row % 2 === 0 ? 0 : segmentLength * 0.16;
      const tileX = Math.min(halfLength - segmentLength * 0.45, x + stagger);
      const z = -pavingWidth / 2 + rowWidth * (row + 0.5);
      pavingMeshes.push(transform(box(segmentLength * 0.9, 0.075, rowWidth * 0.91), {
        rotate: vec3(0, 0, slope),
        translate: vec3(tileX, topAt(tileX) + p.deckThickness + 0.038, z),
      }));
    }
  }

  const railMeshes: Mesh[] = [];
  const postCount = Math.max(3, Math.ceil((halfLength * 2) / p.postSpacing) + 1);
  const railZ = deckDepth / 2 - 0.13;
  const postXs = Array.from({ length: postCount }, (_, i) =>
    -halfLength + (i / (postCount - 1)) * halfLength * 2);
  for (const side of [-1, 1] as const) {
    for (const x of postXs) {
      const baseY = topAt(x) + p.deckThickness;
      railMeshes.push(transform(box(0.3, 0.16, 0.3), {
        translate: vec3(x, baseY + 0.08, side * railZ),
      }));
      railMeshes.push(transform(box(0.17, p.railingHeight, 0.17), {
        translate: vec3(x, baseY + p.railingHeight / 2, side * railZ),
      }));
      railMeshes.push(transform(box(0.31, 0.12, 0.31), {
        translate: vec3(x, baseY + p.railingHeight + 0.06, side * railZ),
      }));
    }
    for (let i = 0; i < postXs.length - 1; i++) {
      const x0 = postXs[i]!;
      const x1 = postXs[i + 1]!;
      const y0 = topAt(x0) + p.deckThickness;
      const y1 = topAt(x1) + p.deckThickness;
      const length = Math.hypot(x1 - x0, y1 - y0);
      const angle = Math.atan2(y1 - y0, x1 - x0);
      for (const height of [p.railingHeight * 0.38, p.railingHeight * 0.72]) {
        railMeshes.push(transform(box(length * 0.98, 0.1, 0.12), {
          rotate: vec3(0, 0, angle),
          translate: vec3((x0 + x1) / 2, (y0 + y1) / 2 + height, side * railZ),
        }));
      }
    }
  }

  const guardianMeshes: Mesh[] = [];
  if (p.guardianStones) {
    for (const facing of [-1, 1] as const) {
      const x = facing * (halfLength - 0.45);
      const y = topAt(x) + p.deckThickness;
      for (const side of [-1, 1] as const) {
        guardianMeshes.push(guardianStone(x, y, side * (railZ - 0.34), -facing as -1 | 1));
      }
    }
  }

  const parts: NamedPart[] = [
    {
      name: "bridge_body",
      label: "拱桥承重墙体",
      mesh: carvedBody,
      color: MASONRY,
      surface: { type: "concrete", params: { color: MASONRY, seed: 15 } },
    },
    {
      name: "arch_rings",
      label: "拱券饰面",
      mesh: computeNormals(merge(...ringMeshes), 36),
      color: ARCH_STONE,
      surface: { type: "concrete", params: { color: ARCH_STONE, seed: 22 } },
    },
    {
      name: "deck_cap",
      label: "随坡桥面压顶",
      mesh: deckCap,
      color: ARCH_STONE,
      surface: { type: "concrete", params: { color: ARCH_STONE, seed: 9 } },
    },
    {
      name: "paving",
      label: "桥面石板铺装",
      mesh: computeNormals(merge(...pavingMeshes), 35),
      color: PAVING_STONE,
      surface: { type: "concrete", params: { color: PAVING_STONE, seed: 31 } },
    },
    {
      name: "railings",
      label: "双侧石栏杆",
      mesh: computeNormals(merge(...railMeshes), 38),
      color: RAIL_STONE,
      surface: { type: "concrete", params: { color: RAIL_STONE, seed: 18 } },
    },
  ];
  if (buttressMeshes.length > 0) {
    parts.push({
      name: "cutwater_buttresses",
      label: "桥墩分水撑",
      mesh: computeNormals(merge(...buttressMeshes), 34),
      color: BUTTRESS_STONE,
      surface: { type: "concrete", params: { color: BUTTRESS_STONE, seed: 7 } },
    });
  }
  if (guardianMeshes.length > 0) {
    parts.push({
      name: "guardian_stones",
      label: "桥头守护石兽",
      mesh: computeNormals(merge(...guardianMeshes), 35),
      color: RAIL_STONE,
      surface: { type: "concrete", params: { color: RAIL_STONE, seed: 27 } },
    });
  }
  return parts;
}
