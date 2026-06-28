import {
  box,
  catmullClark,
  cone,
  cylinder,
  merge,
  sphere,
  torus,
  transform,
  type Mesh,
  type NamedPart,
} from "../geometry/index.js";
import { polyline, sweep } from "../geometry/curve.js";
import { vec3, type Vec3 } from "../math/vec3.js";

type RGB = [number, number, number];

export interface CartoonMechPilotParams {
  height: number;
  armSpread: number;
  bootScale: number;
  armorScale: number;
  headsetScale: number;
}

export const CARTOON_MECH_PILOT_DEFAULTS: CartoonMechPilotParams = {
  height: 4.45,
  armSpread: 1,
  bootScale: 1,
  armorScale: 1,
  headsetScale: 1,
};

const SKIN: RGB = [0.82, 0.58, 0.5];
const HAIR: RGB = [0.25, 0.12, 0.08];
const HAIR_DARK: RGB = [0.13, 0.07, 0.05];
const BLUE: RGB = [0.09, 0.2, 0.95];
const BLUE_DARK: RGB = [0.04, 0.09, 0.38];
const CYAN: RGB = [0.02, 0.85, 1.0];
const MAGENTA: RGB = [0.72, 0.08, 0.34];
const WHITE: RGB = [0.82, 0.84, 0.8];
const LIGHT_GRAY: RGB = [0.58, 0.6, 0.58];
const DARK: RGB = [0.025, 0.027, 0.032];
const BLACK: RGB = [0.005, 0.006, 0.008];

function roundedBox(w: number, h: number, d: number, iterations = 1): Mesh {
  return catmullClark(box(w, h, d), iterations);
}

function ellipsoid(rx: number, ry: number, rz: number, translate: Vec3, rotate = vec3(0, 0, 0)): Mesh {
  return transform(sphere(1, 28, 20), {
    rotate,
    scale: vec3(rx, ry, rz),
    translate,
  });
}

function capsule(points: Vec3[], radius: number, sides = 12): Mesh {
  return sweep(polyline(points), { radius, sides, caps: true });
}

function part(parts: NamedPart[], name: string, mesh: Mesh, color: RGB, surface?: NamedPart["surface"]) {
  const p: NamedPart = { name, mesh, color };
  if (surface) p.surface = surface;
  parts.push(p);
}

function plastic(parts: NamedPart[], name: string, mesh: Mesh, color: RGB, roughness = 0.34) {
  part(parts, name, mesh, color, { type: "plastic", params: { color, roughness } });
}

function gloss(parts: NamedPart[], name: string, mesh: Mesh, color: RGB) {
  part(parts, name, mesh, color, { type: "glossPaint", params: { color } });
}

function rubber(parts: NamedPart[], name: string, mesh: Mesh, color = BLACK) {
  part(parts, name, mesh, color, { type: "rubber", params: { color } });
}

function skin(parts: NamedPart[], name: string, mesh: Mesh) {
  part(parts, name, mesh, SKIN, { type: "skin", params: { tone: SKIN } });
}

function glow(parts: NamedPart[], name: string, mesh: Mesh, color: RGB, intensity = 3.5) {
  part(parts, name, mesh, color, { type: "emissive", params: { color, intensity } });
}

function facePlate(y: number, z: number, w: number, h: number): Mesh {
  return transform(roundedBox(w, h, 0.025, 1), { translate: vec3(0, y, z) });
}

export function buildCartoonMechPilotParts(params: Partial<CartoonMechPilotParams> = {}): NamedPart[] {
  const p = { ...CARTOON_MECH_PILOT_DEFAULTS, ...params };
  const parts: NamedPart[] = [];
  const k = p.height / CARTOON_MECH_PILOT_DEFAULTS.height;
  const arm = p.armSpread;
  const armor = p.armorScale;
  const boot = p.bootScale;
  const headset = p.headsetScale;

  plastic(parts, "black_under_suit_torso", ellipsoid(0.42, 0.72, 0.22, vec3(0, 2.75, 0.0)), DARK, 0.48);
  gloss(parts, "white_abdomen_suit", ellipsoid(0.36, 0.52, 0.2, vec3(0, 2.43, 0.07)), WHITE);
  gloss(parts, "blue_chest_armor", ellipsoid(0.5 * armor, 0.34 * armor, 0.19, vec3(0, 3.02, 0.11)), BLUE);
  gloss(parts, "blue_mid_chest_plate", transform(roundedBox(0.32, 0.22, 0.08, 1), { translate: vec3(0, 2.83, 0.25) }), BLUE_DARK);
  glow(parts, "cyan_chest_core", transform(torus(0.105, 0.018, 28, 8), { rotate: vec3(Math.PI / 2, 0, 0), translate: vec3(0, 3.14, 0.28) }), CYAN, 5);
  glow(parts, "cyan_core_glass", transform(sphere(0.07, 18, 12), { translate: vec3(0, 3.14, 0.3) }), CYAN, 4);

  for (const side of [-1, 1] as const) {
    const sx = side;
    gloss(parts, `torso_side_magenta_${sx}`, transform(roundedBox(0.045, 0.72, 0.04, 1), {
      rotate: vec3(0, 0, sx * 0.18),
      translate: vec3(sx * 0.34, 2.55, 0.2),
    }), MAGENTA);
    plastic(parts, `gray_ab_plate_${sx}`, transform(roundedBox(0.16, 0.12, 0.045, 1), {
      rotate: vec3(0, 0, sx * 0.08),
      translate: vec3(sx * 0.12, 2.52, 0.27),
    }), LIGHT_GRAY, 0.42);
    plastic(parts, `gray_rib_plate_${sx}`, transform(roundedBox(0.14, 0.1, 0.045, 1), {
      rotate: vec3(0, 0, sx * 0.18),
      translate: vec3(sx * 0.2, 2.68, 0.25),
    }), LIGHT_GRAY, 0.42);
  }
  plastic(parts, "black_high_collar", transform(cylinder(0.17, 0.34, 22, true), { translate: vec3(0, 3.37, 0.0) }), DARK, 0.5);
  plastic(parts, "gray_neck_socket", transform(cylinder(0.12, 0.18, 20, true), { translate: vec3(0, 3.44, 0.02) }), LIGHT_GRAY, 0.28);

  for (const side of [-1, 1] as const) {
    const sx = side;
    gloss(parts, `shoulder_pad_${sx}`, ellipsoid(0.22 * armor, 0.17 * armor, 0.18, vec3(sx * 0.53, 3.12, 0.02), vec3(0, 0, sx * 0.2)), BLUE);
    gloss(parts, `shoulder_magenta_trim_${sx}`, transform(roundedBox(0.17, 0.035, 0.18, 1), {
      rotate: vec3(0, 0, sx * 0.18),
      translate: vec3(sx * 0.5, 3.0, 0.16),
    }), MAGENTA);

    const shoulder = vec3(sx * 0.65, 2.98, 0.02);
    const elbow = vec3(sx * (0.92 + 0.12 * arm), 2.5, 0.07);
    const wrist = vec3(sx * (1.16 + 0.22 * arm), 2.15, 0.1);
    gloss(parts, `upper_arm_blue_${sx}`, capsule([shoulder, elbow], 0.095, 14), BLUE);
    rubber(parts, `elbow_ring_${sx}`, ellipsoid(0.12, 0.08, 0.1, vec3(elbow.x, elbow.y, elbow.z)), DARK);
    gloss(parts, `forearm_blue_${sx}`, capsule([elbow, wrist], 0.105, 14), BLUE);
    rubber(parts, `black_wrist_${sx}`, ellipsoid(0.11, 0.075, 0.09, vec3(wrist.x, wrist.y - 0.04, wrist.z)), DARK);
    rubber(parts, `glove_palm_${sx}`, ellipsoid(0.12, 0.09, 0.075, vec3(wrist.x + sx * 0.05, wrist.y - 0.13, wrist.z + 0.02)), BLACK);
    for (let i = 0; i < 3; i++) {
      rubber(parts, `finger_${sx}_${i}`, transform(roundedBox(0.026, 0.13 - i * 0.012, 0.026, 1), {
        rotate: vec3(0.25, 0, sx * (0.15 + i * 0.11)),
        translate: vec3(wrist.x + sx * (0.11 + i * 0.035), wrist.y - 0.24, wrist.z + 0.02 - i * 0.025),
      }), BLACK);
    }
  }

  gloss(parts, "white_pelvis_suit", ellipsoid(0.38, 0.24, 0.22, vec3(0, 2.08, 0.06)), WHITE);
  plastic(parts, "black_hip_split", transform(roundedBox(0.06, 0.22, 0.06, 1), { translate: vec3(0, 1.92, 0.2) }), DARK, 0.5);
  for (const side of [-1, 1] as const) {
    const sx = side;
    gloss(parts, `upper_leg_suit_${sx}`, capsule([vec3(sx * 0.22, 1.92, 0.02), vec3(sx * 0.27, 1.28, 0.03)], 0.15, 16), WHITE);
    gloss(parts, `leg_side_blue_stripe_${sx}`, transform(roundedBox(0.045, 0.58, 0.045, 1), {
      rotate: vec3(0, 0, sx * 0.06),
      translate: vec3(sx * 0.39, 1.58, 0.12),
    }), BLUE);
    gloss(parts, `knee_armor_${sx}`, ellipsoid(0.17, 0.12, 0.09, vec3(sx * 0.28, 1.22, 0.17)), BLUE);
    gloss(parts, `knee_magenta_pin_${sx}`, ellipsoid(0.055, 0.04, 0.035, vec3(sx * 0.28, 1.1, 0.22)), MAGENTA);
    gloss(parts, `lower_leg_white_${sx}`, capsule([vec3(sx * 0.27, 1.1, 0.01), vec3(sx * 0.27, 0.34, 0.03)], 0.12, 16), WHITE);
    gloss(parts, `shin_blue_plate_${sx}`, transform(roundedBox(0.15, 0.42, 0.055, 1), {
      translate: vec3(sx * 0.27, 0.77, 0.17),
    }), BLUE);
    plastic(parts, `ankle_gray_ring_${sx}`, transform(cylinder(0.13, 0.08, 20, true), {
      translate: vec3(sx * 0.27, 0.28, 0.02),
    }), LIGHT_GRAY, 0.35);
    gloss(parts, `boot_upper_${sx}`, transform(roundedBox(0.28 * boot, 0.18, 0.34 * boot, 1), {
      translate: vec3(sx * 0.27, 0.14, 0.09),
    }), WHITE);
    gloss(parts, `boot_toe_${sx}`, transform(roundedBox(0.28 * boot, 0.11, 0.24 * boot, 1), {
      translate: vec3(sx * 0.27, 0.08, 0.34),
    }), WHITE);
    rubber(parts, `boot_sole_${sx}`, transform(roundedBox(0.31 * boot, 0.055, 0.52 * boot, 1), {
      translate: vec3(sx * 0.27, 0.025, 0.16),
    }), BLACK);
    gloss(parts, `boot_blue_cap_${sx}`, transform(roundedBox(0.19, 0.055, 0.08, 1), {
      translate: vec3(sx * 0.27, 0.18, 0.28),
    }), BLUE);
  }

  skin(parts, "head_face", ellipsoid(0.31, 0.4, 0.29, vec3(0, 3.82, 0.08)));
  plastic(parts, "soft_chin_shadow", transform(roundedBox(0.18, 0.035, 0.025, 1), { translate: vec3(0, 3.55, 0.33) }), [0.58, 0.38, 0.34], 0.6);
  rubber(parts, "left_eye", ellipsoid(0.048, 0.03, 0.014, vec3(-0.1, 3.88, 0.35)), DARK);
  rubber(parts, "right_eye", ellipsoid(0.048, 0.03, 0.014, vec3(0.1, 3.88, 0.35)), DARK);
  gloss(parts, "mouth_line", transform(roundedBox(0.09, 0.012, 0.012, 1), { translate: vec3(0, 3.69, 0.36) }), [0.35, 0.1, 0.12]);
  gloss(parts, "left_cheek_mark", transform(roundedBox(0.085, 0.018, 0.012, 1), {
    rotate: vec3(0, 0, -0.18),
    translate: vec3(-0.18, 3.76, 0.34),
  }), MAGENTA);
  gloss(parts, "right_cheek_mark", transform(roundedBox(0.085, 0.018, 0.012, 1), {
    rotate: vec3(0, 0, 0.18),
    translate: vec3(0.18, 3.76, 0.34),
  }), MAGENTA);

  plastic(parts, "hair_cap_back", ellipsoid(0.34, 0.27, 0.32, vec3(0, 4.04, -0.02)), HAIR, 0.72);
  plastic(parts, "hair_forehead_sweep", transform(roundedBox(0.42, 0.13, 0.08, 2), {
    rotate: vec3(0.12, 0, -0.1),
    translate: vec3(-0.02, 4.02, 0.28),
  }), HAIR, 0.68);
  for (const [i, x] of [-0.19, -0.08, 0.04, 0.16].entries()) {
    plastic(
      parts,
      `bang_${i}`,
      ellipsoid(
        0.065,
        0.19,
        0.045,
        vec3(x, 3.9 - i * 0.025, 0.31),
        vec3(0.25, 0, x < 0 ? -0.4 : 0.28),
      ),
      i === 0 ? HAIR_DARK : HAIR,
      0.74,
    );
  }
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    plastic(parts, `top_hair_spike_${i}`, transform(cone(0.055, 0.28, 10, true), {
      rotate: vec3(0.55, a, 0.18),
      translate: vec3(Math.cos(a) * 0.08, 4.28, Math.sin(a) * 0.05),
    }), HAIR, 0.72);
  }

  for (const side of [-1, 1] as const) {
    const sx = side;
    gloss(parts, `headset_outer_${sx}`, transform(cylinder(0.115 * headset, 0.08, 20, true), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(sx * 0.35, 3.93, 0.04),
    }), BLUE);
    glow(parts, `headset_cyan_inner_${sx}`, transform(cylinder(0.065 * headset, 0.085, 18, true), {
      rotate: vec3(0, 0, Math.PI / 2),
      translate: vec3(sx * 0.37, 3.93, 0.06),
    }), CYAN, 3);
    gloss(parts, `headset_fin_${sx}`, transform(roundedBox(0.055, 0.38 * headset, 0.035, 1), {
      rotate: vec3(0.05, 0.1 * sx, sx * 0.45),
      translate: vec3(sx * 0.48, 4.02, 0.02),
    }), BLUE);
    glow(parts, `headset_fin_light_${sx}`, transform(roundedBox(0.024, 0.24 * headset, 0.018, 1), {
      rotate: vec3(0.05, 0.1 * sx, sx * 0.45),
      translate: vec3(sx * 0.51, 4.03, 0.06),
    }), CYAN, 2.5);
    gloss(parts, `pink_hair_clip_${sx}`, transform(roundedBox(0.13, 0.055, 0.055, 1), {
      rotate: vec3(0, 0, sx * 0.25),
      translate: vec3(sx * 0.17, 4.22, 0.16),
    }), MAGENTA);
  }

  plastic(parts, "lower_face_plane", facePlate(3.66, 0.34, 0.12, 0.03), [0.68, 0.42, 0.38], 0.6);

  return parts.map((src) => ({
    ...src,
    mesh: transform(src.mesh, { scale: vec3(k, k, k) }),
  }));
}
