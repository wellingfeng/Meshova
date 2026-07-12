/**
 * Modular street-furniture kit — Meshova's take on the CitySample "3D_Assets"
 * street props (fire hydrant, trash can, mailbox, street lamp, bench, bollard,
 * traffic sign, planter). Each prop is a small parameter-free builder returning
 * a NamedPart[] centred on the origin with its base at y=0, so it can be placed
 * on a sidewalk point cloud via copy-to-points.
 *
 * The scene assembler `buildStreetsceneParts` follows the CitySample
 * "SliceAndDice" idea: generate a point cloud along the sidewalk edges, then
 * apply placement rules (spacing + per-point prop selection + jitter) to scatter
 * the kit deterministically. Same seed -> same street dressing.
 *
 * Everything is parameter + seed driven (Meshova determinism invariant) and every
 * prop carries a matched surface material, built WITH the model.
 */
import { vec3, type Vec3 } from "../math/vec3.js";
import { makeRng } from "../random/prng.js";
import {
  box,
  cylinder,
  cone,
  sphere,
  torus,
  merge,
  transform,
  translateMesh,
  polyline,
  scatterAlongCurve,
  applyRules,
  ruleCadence,
  ruleWeightedFill,
  roadLaneLines,
  roadEdgeLines,
  pointContext,
  type PointCloud,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { buildFreewaySignParts } from "./freeway-sign.js";
import { buildMaterialStackParts } from "./material-stack.js";
import { buildTrafficConeParts, buildBarrierRunParts } from "./city-props.js";

type RGB = [number, number, number];

// --- shared palette (linear RGB) ---
const METAL_DARK: RGB = [0.12, 0.13, 0.15];
const METAL_GREY: RGB = [0.38, 0.39, 0.41];
const RED: RGB = [0.62, 0.11, 0.09];
const GREEN_CIVIC: RGB = [0.09, 0.28, 0.19];
const BLUE_MAIL: RGB = [0.08, 0.22, 0.42];
const WOOD: RGB = [0.34, 0.22, 0.12];
const CONCRETE: RGB = [0.55, 0.53, 0.5];
const YELLOW: RGB = [0.72, 0.58, 0.06];
const GLASS_WARM: RGB = [0.95, 0.82, 0.55];
const SOIL: RGB = [0.18, 0.13, 0.09];
const FOLIAGE: RGB = [0.16, 0.34, 0.14];

const metal = (color: RGB, roughness = 0.4) =>
  ({ type: "metal", params: { color, roughness } }) as const;
const painted = (color: RGB, roughness = 0.55) =>
  ({ type: "metal", params: { color, roughness } }) as const;

/** A prop builder: origin-centred, base at y=0. */
export type PropBuilder = () => NamedPart[];

/** Fire hydrant — squat body, dome cap, two side outlets. */
export function fireHydrant(): NamedPart[] {
  const bodyH = 0.62;
  const body = cylinder(0.11, bodyH, 16);
  const meshes: Mesh[] = [
    transform(box(0.34, 0.06, 0.34), { translate: vec3(0, 0.03, 0) }), // base flange
    translateMesh(body, vec3(0, 0.03 + bodyH / 2, 0)),
    translateMesh(sphere(0.12, 16, 10), vec3(0, 0.03 + bodyH, 0)), // dome cap
  ];
  // Two side outlets + front nozzle.
  const outlet = cylinder(0.045, 0.1, 10);
  meshes.push(
    transform(outlet, { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(0.12, 0.42, 0) }),
    transform(outlet, { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(-0.12, 0.42, 0) }),
    transform(cylinder(0.05, 0.1, 10), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, 0.5, 0.12) }),
  );
  // Bolt cap on top.
  meshes.push(translateMesh(box(0.07, 0.05, 0.07), vec3(0, 0.03 + bodyH + 0.08, 0)));
  return [{ name: "hydrant", label: "消防栓", mesh: merge(...meshes), color: RED, surface: painted(RED, 0.5) }];
}

/** Metal trash can — tapered drum with a lid ring. */
export function trashCan(): NamedPart[] {
  const drum = cylinder(0.19, 0.7, 20);
  const lid = cylinder(0.21, 0.06, 20);
  const meshes: Mesh[] = [
    translateMesh(drum, vec3(0, 0.35, 0)),
    translateMesh(lid, vec3(0, 0.73, 0)),
    translateMesh(cylinder(0.05, 0.06, 10), vec3(0, 0.79, 0)), // lid knob
  ];
  return [{ name: "trashcan", label: "垃圾桶", mesh: merge(...meshes), color: METAL_GREY, surface: metal(METAL_GREY, 0.35) }];
}

/** US-style mailbox — rounded-top box on a single post. */
export function mailbox(): NamedPart[] {
  const post = translateMesh(cylinder(0.045, 0.7, 12), vec3(0, 0.35, 0));
  const bodyBase = translateMesh(box(0.34, 0.26, 0.5), vec3(0, 0.83, 0));
  // Rounded top approximated by a half-cylinder (rotate a capped cylinder).
  const top = transform(cylinder(0.17, 0.34, 16), {
    rotate: vec3(0, 0, Math.PI / 2),
    translate: vec3(0, 0.96, 0),
  });
  const flag = translateMesh(box(0.02, 0.12, 0.02), vec3(0.18, 0.98, -0.18));
  return [
    { name: "mailbox_post", label: "邮筒立柱", mesh: post, color: METAL_DARK, surface: metal(METAL_DARK, 0.4) },
    { name: "mailbox_body", label: "邮筒箱体", mesh: merge(bodyBase, top), color: BLUE_MAIL, surface: painted(BLUE_MAIL, 0.45) },
    { name: "mailbox_flag", label: "邮筒旗", mesh: flag, color: RED, surface: painted(RED, 0.5) },
  ];
}

/** Street lamp — tall pole with a curved arm and a warm luminaire head. */
export function streetLamp(): NamedPart[] {
  const poleH = 3.0;
  const pole = translateMesh(cylinder(0.06, poleH, 14), vec3(0, poleH / 2, 0));
  const foot = translateMesh(cylinder(0.12, 0.16, 14), vec3(0, 0.08, 0));
  // Curved arm: two short segments approximating a gooseneck.
  const arm1 = transform(cylinder(0.04, 0.5, 10), {
    rotate: vec3(Math.PI / 2.6, 0, 0),
    translate: vec3(0, poleH - 0.02, 0.16),
  });
  const arm2 = translateMesh(cylinder(0.04, 0.4, 10), vec3(0, poleH + 0.18, 0.42));
  const head = transform(cone(0.16, 0.24, 14), {
    rotate: vec3(Math.PI, 0, 0),
    translate: vec3(0, poleH + 0.02, 0.6),
  });
  const lens = translateMesh(sphere(0.1, 12, 8), vec3(0, poleH - 0.06, 0.6));
  return [
    { name: "lamp_pole", label: "灯柱", mesh: merge(foot, pole, arm1, arm2), color: METAL_DARK, surface: metal(METAL_DARK, 0.35) },
    { name: "lamp_head", label: "灯罩", mesh: head, color: METAL_DARK, surface: metal(METAL_DARK, 0.3) },
    { name: "lamp_lens", label: "灯泡", mesh: lens, color: GLASS_WARM, surface: { type: "glass", params: { tint: GLASS_WARM, roughness: 0.1 } } },
  ];
}

/** Park bench — wood slats on two metal legs. */
export function bench(): NamedPart[] {
  const legs: Mesh[] = [];
  for (const sx of [-1, 1] as const) {
    legs.push(
      translateMesh(box(0.06, 0.42, 0.5), vec3(sx * 0.62, 0.21, 0)),
      translateMesh(box(0.06, 0.06, 0.5), vec3(sx * 0.62, 0.42, 0)),
    );
  }
  const slats: Mesh[] = [];
  // Seat slats (3) + backrest slats (2).
  for (let i = 0; i < 3; i++) slats.push(translateMesh(box(1.5, 0.05, 0.13), vec3(0, 0.44, -0.18 + i * 0.17)));
  for (let i = 0; i < 2; i++) slats.push(transform(box(1.5, 0.05, 0.13), { rotate: vec3(-0.35, 0, 0), translate: vec3(0, 0.62 + i * 0.16, -0.22) }));
  return [
    { name: "bench_frame", label: "长椅骨架", mesh: merge(...legs), color: METAL_DARK, surface: metal(METAL_DARK, 0.4) },
    { name: "bench_slats", label: "长椅木条", mesh: merge(...slats), color: WOOD, surface: { type: "wood", params: { color: WOOD } } },
  ];
}

/** Bollard — short concrete/metal post with a reflective band. */
export function bollard(): NamedPart[] {
  const post = translateMesh(cylinder(0.08, 0.8, 14), vec3(0, 0.4, 0));
  const cap = translateMesh(sphere(0.09, 12, 8), vec3(0, 0.8, 0));
  const band = translateMesh(cylinder(0.083, 0.08, 14), vec3(0, 0.6, 0));
  return [
    { name: "bollard_post", label: "护柱", mesh: merge(post, cap), color: METAL_GREY, surface: metal(METAL_GREY, 0.35) },
    { name: "bollard_band", label: "反光带", mesh: band, color: YELLOW, surface: painted(YELLOW, 0.3) },
  ];
}

/** Traffic sign — pole with a rectangular panel (no-parking style). */
export function trafficSign(): NamedPart[] {
  const poleH = 2.1;
  const pole = translateMesh(cylinder(0.03, poleH, 10), vec3(0, poleH / 2, 0));
  const panel = translateMesh(box(0.42, 0.56, 0.02), vec3(0, poleH - 0.05, 0.02));
  const border = translateMesh(box(0.46, 0.6, 0.01), vec3(0, poleH - 0.05, 0.005));
  return [
    { name: "sign_pole", label: "标志杆", mesh: pole, color: METAL_GREY, surface: metal(METAL_GREY, 0.4) },
    { name: "sign_panel", label: "标志面", mesh: panel, color: [0.86, 0.86, 0.88], surface: painted([0.86, 0.86, 0.88], 0.3) },
    { name: "sign_border", label: "标志边", mesh: border, color: RED, surface: painted(RED, 0.35) },
  ];
}

/** Concrete planter with foliage — a simple street greenery module. */
export function planter(): NamedPart[] {
  const pot = translateMesh(cylinder(0.28, 0.4, 6), vec3(0, 0.2, 0));
  const rim = translateMesh(cylinder(0.3, 0.06, 6), vec3(0, 0.4, 0));
  const soil = translateMesh(cylinder(0.25, 0.05, 6), vec3(0, 0.4, 0));
  const foliage: Mesh[] = [];
  foliage.push(translateMesh(sphere(0.26, 12, 8), vec3(0, 0.6, 0)));
  foliage.push(translateMesh(sphere(0.18, 10, 6), vec3(0.14, 0.7, 0.1)));
  foliage.push(translateMesh(sphere(0.16, 10, 6), vec3(-0.12, 0.68, -0.08)));
  return [
    { name: "planter_pot", label: "花盆", mesh: merge(pot, rim), color: CONCRETE, surface: { type: "concrete" } },
    { name: "planter_soil", label: "土壤", mesh: soil, color: SOIL, surface: { type: "stone", params: { color: SOIL } } },
    { name: "planter_foliage", label: "灌木", mesh: merge(...foliage), color: FOLIAGE, surface: { type: "leaf", params: { color: FOLIAGE } } },
  ];
}

/** The full street-furniture kit, keyed by prop id. */
export const STREET_PROP_KIT: Record<string, PropBuilder> = {
  hydrant: fireHydrant,
  trashcan: trashCan,
  mailbox,
  lamp: streetLamp,
  bench,
  bollard,
  sign: trafficSign,
  planter,
};

export type StreetPropId = keyof typeof STREET_PROP_KIT;

// ---------------------------------------------------------------------------
// Scene assembler — SliceAndDice-style rule scatter along sidewalk edges.
// ---------------------------------------------------------------------------

export interface StreetsceneParams {
  /** Sidewalk run length (Z axis) in metres. */
  length: number;
  /** Half-width of the road: props line up at +/- this X. */
  roadHalfWidth: number;
  /** Sidewalk width (props sit near the outer edge). */
  sidewalkWidth: number;
  /** Base spacing between placement slots along the run. */
  spacing: number;
  /** Random along-slot jitter (0..1 of spacing). */
  jitter: number;
  /** Place props on both sides of the road (else only +X). */
  bothSides: boolean;
  /** Draw the road + sidewalk ground slabs. */
  ground: boolean;
  /** Span a freeway sign gantry across the road (0 = none, else count along run). */
  gantries: number;
  /** Drop seeded construction material stacks on the sidewalk. */
  materialStacks: number;
  /** Draw a taper line of traffic cones closing off one lane edge. */
  coneRun: boolean;
  /**
   * Cluster the material stacks into fenced construction zones (barrier run
   * ringing a group of stacks) instead of scattering them along the sidewalk.
   * 0 = scatter (legacy); 1+ = that many fenced work zones.
   */
  workZones: number;
  /** Placement seed. */
  seed: number;
}

export const STREETSCENE_DEFAULTS: StreetsceneParams = {
  length: 24,
  roadHalfWidth: 3.2,
  sidewalkWidth: 2.0,
  spacing: 3.0,
  jitter: 0.35,
  bothSides: true,
  ground: true,
  gantries: 1,
  materialStacks: 1,
  coneRun: true,
  workZones: 1,
  seed: 21,
};

/**
 * Placement rule (mirrors CitySample SliceAndDice): weighted prop selection +
 * a lamp cadence so lamps land on a regular rhythm while smaller props fill in.
 */
interface Placement {
  prop: StreetPropId;
  pos: Vec3;
  yaw: number;
}

/**
 * Prop id order for the scatter DSL: variant index maps into this list. Index 0
 * is the "feature" prop (lamp, placed on a cadence); the rest are weighted
 * fillers. Keeping this as an explicit array is what lets the generic point-
 * cloud rules (which only speak integer "variant") drive the typed kit.
 */
const PROP_ORDER: StreetPropId[] = [
  "lamp", // 0 = feature (cadence)
  "trashcan",
  "hydrant",
  "mailbox",
  "bench",
  "planter",
  "bollard",
  "sign",
];
const FILLER_INDICES = [1, 2, 3, 4, 5, 6, 7];
const FILLER_WEIGHTS = [3, 2, 2, 1, 2, 3, 2];

/**
 * Plan placements via the SliceAndDice scatter DSL: lay a row of slots along
 * each sidewalk edge, land lamps on a 3-slot cadence, weighted-fill the rest,
 * then read back the standard variant/yaw/point attributes. This is the same
 * pipeline exposed to AI scripts, dog-fooded here.
 */
function planPlacements(p: StreetsceneParams): Placement[] {
  const edgeX = p.roadHalfWidth + p.sidewalkWidth * 0.6;
  const halfLen = p.length / 2;
  // Centerline runs along Z; scatterAlongCurve emits both sides at +/- offset.
  const centerline = polyline([vec3(0, 0, -halfLen), vec3(0, 0, halfLen)], false);
  const cloud: PointCloud = scatterAlongCurve(centerline, {
    spacing: p.spacing,
    offset: edgeX,
    bothSides: p.bothSides,
    endPadding: 0.5,
  });
  const seed = Math.round(p.seed) >>> 0;
  const decorated = applyRules(cloud, [
    ruleCadence(3, 0, -1), // every 3rd slot -> lamp (variant 0)
    ruleWeightedFill(FILLER_INDICES, { weights: FILLER_WEIGHTS, seed }),
  ]);

  const out: Placement[] = [];
  const variant = decorated.attributes["variant"];
  const yawAttr = decorated.attributes["yaw"];
  for (let i = 0; i < decorated.points.length; i++) {
    const ctx = pointContext(decorated, i);
    const vi = Math.max(0, Math.round(variant?.[i] ?? 0)) % PROP_ORDER.length;
    // Seeded along-slot jitter (kept here so ground stays aligned to slots).
    const jitterRng = makeRng((seed ^ (i * 2654435761)) >>> 0);
    const jitterZ = (jitterRng.next() - 0.5) * 2 * p.jitter * p.spacing;
    out.push({
      prop: PROP_ORDER[vi]!,
      pos: vec3(ctx.point.x, 0, ctx.point.z + jitterZ),
      yaw: yawAttr?.[i] ?? 0,
    });
  }
  return out;
}

/** Road-name legend pool for scattered gantries (procedural glyph text). */
const GANTRY_LEGENDS = [
  "MAIN ST", "5TH AVE", "HARBOR", "CENTRAL", "AIRPORT", "DOWNTOWN",
  "RIVERSIDE", "PARK AVE", "BAY BRIDGE", "MARKET ST", "OAK BLVD", "PORT",
];

/** Build a dressed street segment: ground + scattered furniture kit. */
export function buildStreetsceneParts(params: Partial<StreetsceneParams> = {}): NamedPart[] {
  const p: StreetsceneParams = { ...STREETSCENE_DEFAULTS, ...params };
  const placements = planPlacements(p);

  // Merge placed props by part name so the scene stays a few material groups.
  const byName = new Map<string, { meshes: Mesh[]; part: NamedPart }>();
  const propY = p.ground ? 0.08 : 0;
  for (const pl of placements) {
    const builder = STREET_PROP_KIT[pl.prop]!;
    for (const part of builder()) {
      const placed = transform(part.mesh, { rotate: vec3(0, pl.yaw, 0), translate: vec3(pl.pos.x, propY, pl.pos.z) });
      const key = part.name;
      const entry = byName.get(key);
      if (entry) entry.meshes.push(placed);
      else byName.set(key, { meshes: [placed], part });
    }
  }

  const parts: NamedPart[] = [];
  if (p.ground) {
    const road = translateMesh(box(p.roadHalfWidth * 2, 0.04, p.length), vec3(0, 0.02, 0));
    const walkW = p.sidewalkWidth;
    const walks: Mesh[] = [];
    for (const side of p.bothSides ? [1, -1] : [1]) {
      walks.push(translateMesh(box(walkW, 0.08, p.length), vec3(side * (p.roadHalfWidth + walkW / 2), 0.04, 0)));
    }
    parts.push({ name: "road", label: "车行道", mesh: road, color: [0.09, 0.09, 0.1], surface: { type: "concrete", params: { color: [0.09, 0.09, 0.1] } } });
    parts.push({ name: "sidewalk", label: "人行道", mesh: merge(...walks), color: CONCRETE, surface: { type: "concrete" } });

    // Lane markings driven by the road ribbon centerline (runs along Z).
    const halfLen = p.length / 2;
    const line = polyline([vec3(0, 0, -halfLen), vec3(0, 0, halfLen)], false);
    const roadOpts = { halfWidth: p.roadHalfWidth, verticalOffset: 0.04, uvLengthScale: 4 } as const;
    const laneLines = roadLaneLines(line, { ...roadOpts, lanes: 4, dashed: true, dashLength: 1.6, gapLength: 2.2, skipCenter: true, lineWidth: 0.12 });
    // Double yellow center line: two solid strips straddling the centerline.
    // (roadLaneLines with lanes:2 + skipCenter would drop the only line, so we
    // build the pair explicitly by offsetting the centerline left/right.)
    const centerGap = 0.14;
    const centerLeft = roadEdgeLines(line, { ...roadOpts, lineWidth: 0.1, edgeInset: p.roadHalfWidth - centerGap / 2 });
    const centerDouble = centerLeft;
    const edges = roadEdgeLines(line, { ...roadOpts, lineWidth: 0.1, edgeInset: 0.18 });
    const WHITE: RGB = [0.9, 0.9, 0.92];
    const YELLOW_LINE: RGB = [0.78, 0.66, 0.12];
    parts.push({ name: "lane_lines", label: "车道线", mesh: merge(laneLines, edges), color: WHITE, surface: { type: "plastic", params: { color: WHITE, roughness: 0.6 } } });
    parts.push({ name: "center_line", label: "中央双黄线", mesh: centerDouble, color: YELLOW_LINE, surface: { type: "plastic", params: { color: YELLOW_LINE, roughness: 0.6 } } });
  }

  for (const { meshes, part } of byName.values()) {
    const merged: NamedPart = { name: part.name, mesh: merge(...meshes) };
    if (part.label !== undefined) merged.label = part.label;
    if (part.color !== undefined) merged.color = part.color;
    if (part.surface !== undefined) merged.surface = part.surface;
    parts.push(merged);
  }

  // --- large landmark props: freeway gantries + sidewalk material stacks ---
  // These are too big to merge into the per-slot furniture pass, so they keep
  // their own named parts. Placement is seeded off the master seed so the same
  // street always dresses identically (determinism invariant).
  const seed = Math.round(p.seed) >>> 0;
  const halfLen = p.length / 2;

  const gantryN = Math.max(0, Math.round(p.gantries));
  if (gantryN > 0) {
    // Span the full road (uprights land just outside each sidewalk).
    const span = (p.roadHalfWidth + p.sidewalkWidth) * 2 + 0.6;
    for (let i = 0; i < gantryN; i++) {
      // Even spread along the run, inset from the ends.
      const t = gantryN === 1 ? 0.5 : (i + 0.5) / gantryN;
      const z = -halfLen + t * p.length;
      const gRng = makeRng((seed ^ (0x9e37 + i * 0x85eb)) >>> 0);
      const signCount = gRng.next() < 0.5 ? 2 : 3;
      // Pick distinct road-name legends per panel from the shared pool.
      const legends: string[] = [];
      for (let k = 0; k < signCount; k++) {
        legends.push(GANTRY_LEGENDS[gRng.int(0, GANTRY_LEGENDS.length - 1)]!);
      }
      const gantry = buildFreewaySignParts({
        span,
        postHeight: 6.0 + gRng.range(-0.3, 0.6),
        signCount,
        truss: true,
        lights: true,
        legends,
        exitNumber: gRng.next() < 0.6 ? String(gRng.int(1, 99)) : "",
        seed: (seed + i * 17) >>> 0,
      });
      for (const part of gantry) {
        // Freeway sign spans along X by default; the road runs along Z, so the
        // default orientation already crosses it. Just station it along Z.
        const placed = translateMesh(part.mesh, vec3(0, p.ground ? 0.04 : 0, z));
        pushLandmark(parts, `gantry_${part.name}`, placed, part);
      }
    }
  }

  const stackN = Math.max(0, Math.round(p.materialStacks));
  const zoneN = Math.max(0, Math.round(p.workZones));
  const edgeX = p.roadHalfWidth + p.sidewalkWidth * 0.55;
  if (stackN > 0 && zoneN > 0) {
    // --- clustered work zones: group stacks and ring each cluster with a
    // barrier run. Stacks are split as evenly as possible across the zones. ---
    for (let zi = 0; zi < zoneN; zi++) {
      const zRng = makeRng((seed ^ (0x27d4eb2f + zi * 0x165667b1)) >>> 0);
      const side = p.bothSides ? (zi % 2 === 0 ? 1 : -1) : 1;
      const yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      // Zone centre along the run (evenly spread, seeded jitter).
      const t = zoneN === 1 ? 0.5 : (zi + 0.5) / zoneN;
      const zc = -halfLen + t * p.length + zRng.range(-0.6, 0.6);
      // How many stacks in this zone.
      const inThis = Math.floor(stackN / zoneN) + (zi < stackN % zoneN ? 1 : 0);
      const clusterHalf = Math.max(1.4, inThis * 0.9);

      // Stacks lined up inside the zone, parallel to the road.
      for (let k = 0; k < inThis; k++) {
        const sRng = makeRng((seed ^ (0x1b873 + (zi * 31 + k) * 0xc2b2)) >>> 0);
        const localZ = inThis === 1 ? 0 : -clusterHalf * 0.6 + (k / Math.max(1, inThis - 1)) * clusterHalf * 1.2;
        const sz = zc + localZ;
        const sx = side * (edgeX + p.sidewalkWidth + 1 + sRng.range(-0.1, 0.1));
        const stack = buildMaterialStackParts({
          pallets: sRng.int(2, 4),
          cargo: "mixed",
          stack: sRng.range(0.7, 1.2),
          straps: true,
          seed: (seed + (zi * 31 + k) * 29 + 3) >>> 0,
        });
        for (const part of stack) {
          const placed = transform(part.mesh, { rotate: vec3(0, yaw, 0), translate: vec3(sx, 0.08, sz) });
          pushLandmark(parts, `stack_${part.name}`, placed, part);
        }
      }

      // Fence the zone: a barrier run on the road-facing side + two short end
      // returns, so the cluster reads as a cordoned work area.
      const style: "jersey" | "aframe" | "chainlink" = zRng.next() < 0.5 ? "jersey" : "aframe";
      const runLen = clusterHalf * 2 + 1.2;
      const segLen = 2.0;
      const segs = Math.max(2, Math.round(runLen / segLen));
      const fenceX = side * (p.roadHalfWidth + 0.15); // road-facing edge
      // Road-facing run (spans along Z -> rotate 90° from default X run).
      addBarrier(parts, buildBarrierRunParts({ segments: segs, segLength: segLen, style, height: 1.0 }),
        { rotate: vec3(0, Math.PI / 2, 0), translate: vec3(fenceX, 0, zc) });
      // Two end returns (span along X), capping the cluster.
      const endSegs = Math.max(1, Math.round((p.sidewalkWidth * 0.7) / segLen) + 1);
      for (const endZ of [zc - runLen / 2, zc + runLen / 2]) {
        addBarrier(parts, buildBarrierRunParts({ segments: endSegs, segLength: segLen * 0.7, style, height: 1.0 }),
          { translate: vec3(side * (p.roadHalfWidth + p.sidewalkWidth * 0.35), 0, endZ) });
      }
    }
  } else if (stackN > 0) {
    // --- legacy scatter: stacks strung along the sidewalk edge ---
    for (let i = 0; i < stackN; i++) {
      const sRng = makeRng((seed ^ (0x1b873 + i * 0xc2b2)) >>> 0);
      const side = p.bothSides ? (i % 2 === 0 ? 1 : -1) : 1;
      const z = sRng.range(-halfLen * 0.7, halfLen * 0.7);
      const yaw = side > 0 ? Math.PI / 2 : -Math.PI / 2;
      const stack = buildMaterialStackParts({
        pallets: sRng.int(2, 4),
        cargo: "mixed",
        stack: sRng.range(0.7, 1.2),
        straps: true,
        seed: (seed + i * 29 + 3) >>> 0,
      });
      for (const part of stack) {
        const placed = transform(part.mesh, { rotate: vec3(0, yaw, 0), translate: vec3(side * (edgeX + p.sidewalkWidth + 1), 0.08, z) });
        pushLandmark(parts, `stack_${part.name}`, placed, part);
      }
    }
  }

  // --- traffic-cone taper: a line of cones angling in from the lane edge to
  // close a lane, the way CitySample dresses a work zone. Deterministic taper.
  if (p.coneRun) {
    const coneRng = makeRng((seed ^ 0x51ed270b) >>> 0);
    const n = 7;
    const startZ = -halfLen * 0.5;
    const step = (p.length * 0.55) / (n - 1);
    // Taper from the sidewalk edge inward toward the centerline.
    const xEdge = p.roadHalfWidth - 0.25;
    const xIn = p.roadHalfWidth - 1.4;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      const z = startZ + i * step;
      const x = xEdge + (xIn - xEdge) * t + coneRng.range(-0.05, 0.05);
      const cone = buildTrafficConeParts({ height: 0.7, baseWidth: 0.17, collars: 2 });
      for (const part of cone) {
        const placed = translateMesh(part.mesh, vec3(x, 0.06, z));
        pushLandmark(parts, `cone_${part.name}`, placed, part);
      }
    }
  }

  return parts;
}

/**
 * Merge a placed landmark sub-part into the scene part list under a namespaced
 * name (so multiple gantries/stacks collapse into one material group each).
 */
function pushLandmark(parts: NamedPart[], name: string, mesh: Mesh, src: NamedPart): void {
  const existing = parts.find((q) => q.name === name);
  if (existing) {
    existing.mesh = merge(existing.mesh, mesh);
    return;
  }
  const part: NamedPart = { name, mesh };
  if (src.label !== undefined) part.label = src.label;
  if (src.color !== undefined) part.color = src.color;
  if (src.surface !== undefined) part.surface = src.surface;
  parts.push(part);
}

/** Place a barrier run (all its parts) under namespaced `fence_*` groups. */
function addBarrier(
  parts: NamedPart[],
  barrier: NamedPart[],
  xf: { rotate?: Vec3; translate: Vec3 },
): void {
  for (const part of barrier) {
    const placed = xf.rotate
      ? transform(part.mesh, { rotate: xf.rotate, translate: xf.translate })
      : translateMesh(part.mesh, xf.translate);
    pushLandmark(parts, `fence_${part.name}`, placed, part);
  }
}
