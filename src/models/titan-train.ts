/**
 * Titan Train — reverse-engineered from Houdini "Tutorial_Train.hda" +
 * "project_titan_train_destructionfx" (project_titan). The HDA is a modular
 * train generator: a locomotive plus N repeated wagons riding a bogie/wheel
 * assembly, with a per-panel destruction switch that swaps intact side panels
 * for Voronoi-shattered fragments (the destructionfx .hip).
 *
 * We reproduce the *static* generator here (deterministic, no sim):
 *   - a loco/wagon body kit built from boxes (body shell, roof, underframe),
 *   - two bogies per car, each with an axle + wheel pair,
 *   - couplers between cars,
 *   - an optional `damage` param that fractures the side panels with
 *     `voronoiFracture` and nudges the shards outward (frozen debris look).
 *
 * Same params -> same train. The wagon count, body size and damage are the
 * primary knobs, mirroring the HDA's "Num Wagons / Body / Damage" controls.
 *
 * Run: pnpm tsx examples/titan-train.ts
 */
import {
  box,
  cylinder,
  merge,
  transform,
  translateMesh,
  voronoiFracture,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { vec3 } from "../math/vec3.js";
import { makeRng } from "../random/index.js";

type RGB = [number, number, number];

const BODY_RED: RGB = [0.55, 0.11, 0.1];
const ROOF_GREY: RGB = [0.32, 0.33, 0.35];
const FRAME_DARK: RGB = [0.14, 0.14, 0.16];
const WHEEL_STEEL: RGB = [0.4, 0.41, 0.43];
const COUPLER: RGB = [0.2, 0.2, 0.22];

export interface TitanTrainParams {
  /** Random stream seed (only affects damage shard scatter). Default 7. */
  seed: number;
  /** Number of wagons trailing the locomotive. Default 3. */
  wagons: number;
  /** Body length of a single car (metres). Default 8. */
  carLength: number;
  /** Body width. Default 2.6. */
  carWidth: number;
  /** Body height (shell only, above the underframe). Default 2.8. */
  carHeight: number;
  /** Gap between coupled cars. Default 0.6. */
  coupleGap: number;
  /** Wheel radius. Default 0.45. */
  wheelRadius: number;
  /**
   * Destruction amount 0..1 (HDA "Damage"). 0 = intact. >0 shatters each car's
   * side panels into that fraction of Voronoi shards and pushes them outward.
   */
  damage: number;
}

export const TITAN_TRAIN_DEFAULTS: TitanTrainParams = {
  seed: 7,
  wagons: 3,
  carLength: 8,
  carWidth: 2.6,
  carHeight: 2.8,
  coupleGap: 0.6,
  wheelRadius: 0.45,
  damage: 0,
};

/** One bogie: an axle box plus two wheels, centred at local origin. */
function bogie(p: TitanTrainParams): Mesh {
  const halfW = p.carWidth / 2;
  const wheel = cylinder(p.wheelRadius, 0.16, 20, true);
  const parts: Mesh[] = [];
  // axle beam
  parts.push(translateMesh(box(0.35, 0.3, 0.35), vec3(0, p.wheelRadius, 0)));
  for (const sx of [-halfW + 0.15, halfW - 0.15]) {
    // wheel disc lies in the YZ plane -> rotate cylinder (Y axis) onto X
    const w = transform(wheel, { rotate: vec3(0, 0, Math.PI / 2), translate: vec3(sx, p.wheelRadius, 0) });
    parts.push(w);
  }
  return merge(...parts);
}

/** The rigid parts of one car (frame, roof, ends), excluding side panels. */
function carCore(p: TitanTrainParams): Mesh {
  const L = p.carLength;
  const W = p.carWidth;
  const H = p.carHeight;
  const parts: Mesh[] = [];
  const frameY = p.wheelRadius + 0.3;
  // underframe slab
  parts.push(translateMesh(box(W, 0.4, L), vec3(0, frameY, 0)));
  const bodyY = frameY + 0.2 + H / 2;
  // end walls (front/back)
  const endT = 0.2;
  parts.push(translateMesh(box(W, H, endT), vec3(0, bodyY, -L / 2 + endT / 2)));
  parts.push(translateMesh(box(W, H, endT), vec3(0, bodyY, L / 2 - endT / 2)));
  // roof
  parts.push(translateMesh(box(W + 0.1, 0.3, L), vec3(0, bodyY + H / 2 + 0.15, 0)));
  return merge(...parts);
}

/** The two side panels of a car as a single mesh (targeted by damage). */
function carPanels(p: TitanTrainParams): Mesh {
  const L = p.carLength;
  const W = p.carWidth;
  const H = p.carHeight;
  const frameY = p.wheelRadius + 0.3;
  const bodyY = frameY + 0.2 + H / 2;
  const panelT = 0.16;
  const halfW = W / 2;
  const parts: Mesh[] = [];
  for (const sx of [-halfW + panelT / 2, halfW - panelT / 2]) {
    parts.push(translateMesh(box(panelT, H, L - 0.4), vec3(sx, bodyY, 0)));
  }
  return merge(...parts);
}

/**
 * Shatter the side panels into Voronoi shards and push each outward from the
 * car centre by `damage`, freezing the destructionfx into a static debris look.
 */
function damagedPanels(p: TitanTrainParams, seed: number): Mesh {
  const panels = carPanels(p);
  const cells = Math.max(3, Math.round(6 + p.damage * 18));
  const frags = voronoiFracture(panels, { cells, seed });
  const rng = makeRng(seed ^ 0x9e37);
  const push = p.damage * 0.6;
  const spun: Mesh[] = frags.map((f) => {
    const dir = f.center.x >= 0 ? 1 : -1;
    const dx = dir * push * (0.4 + rng.next() * 0.8);
    const dy = (rng.next() - 0.5) * push;
    const dz = (rng.next() - 0.5) * push;
    const spin = (rng.next() - 0.5) * p.damage * 1.2;
    return transform(f.mesh, { rotate: vec3(spin, 0, spin * 0.5), translate: vec3(dx, dy, dz) });
  });
  return merge(...spun);
}

/** Build the full Titan train as materialed parts. */
export function buildTitanTrainParts(params: Partial<TitanTrainParams> = {}): NamedPart[] {
  const p: TitanTrainParams = { ...TITAN_TRAIN_DEFAULTS, ...params };
  const cars = Math.max(1, Math.round(p.wagons) + 1); // loco + wagons
  const pitch = p.carLength + p.coupleGap;
  const startZ = -((cars - 1) * pitch) / 2;

  const cores: Mesh[] = [];
  const panels: Mesh[] = [];
  const running: Mesh[] = [];
  const couplers: Mesh[] = [];
  const bogieProto = bogie(p);
  const bogieOff = p.carLength * 0.32;

  for (let i = 0; i < cars; i++) {
    const cz = startZ + i * pitch;
    cores.push(translateMesh(carCore(p), vec3(0, 0, cz)));
    const panelMesh = p.damage > 0 ? damagedPanels(p, p.seed + i * 101) : carPanels(p);
    panels.push(translateMesh(panelMesh, vec3(0, 0, cz)));
    running.push(translateMesh(bogieProto, vec3(0, 0, cz - bogieOff)));
    running.push(translateMesh(bogieProto, vec3(0, 0, cz + bogieOff)));
    if (i < cars - 1) {
      const linkZ = cz + p.carLength / 2 + p.coupleGap / 2;
      couplers.push(translateMesh(box(0.3, 0.3, p.coupleGap + 0.4), vec3(0, p.wheelRadius + 0.5, linkZ)));
    }
  }

  return [
    { name: "running-gear", label: "转向架车轮", mesh: merge(...running), color: WHEEL_STEEL,
      surface: { type: "metal", params: { color: WHEEL_STEEL, roughness: 0.5, metallic: 1 } } },
    { name: "body-shell", label: "车体车架", mesh: merge(...cores), color: BODY_RED,
      surface: { type: "metal", params: { color: BODY_RED, roughness: 0.55, metallic: 0.6 } } },
    { name: "side-panels", label: p.damage > 0 ? "破损侧板" : "侧板", mesh: merge(...panels), color: BODY_RED,
      surface: { type: "metal", params: { color: BODY_RED, roughness: 0.5, metallic: 0.6 } },
      metadata: { source: "Tutorial_Train.hda + train_destructionfx", damage: p.damage } },
    { name: "couplers", label: "车钩", mesh: couplers.length ? merge(...couplers) : box(0.01, 0.01, 0.01), color: COUPLER,
      surface: { type: "metal", params: { color: COUPLER, roughness: 0.6, metallic: 0.9 } } },
  ] as NamedPart[];
}
