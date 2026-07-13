import {
  box,
  scaleMesh,
  sphere,
  transform,
  vec3,
  type NamedPart,
} from "meshova";

export interface PlushCharacterParams {
  headSize: number;
  earSize: number;
  bodyWidth: number;
  bodyHeight: number;
  limbSize: number;
  snoutSize: number;
}

function surfacePart(
  name: string,
  mesh: NamedPart["mesh"],
  type: string,
  params: Record<string, unknown>,
): NamedPart {
  const fallback = params.color ?? params.tint ?? [0.8, 0.8, 0.8];
  return {
    name,
    label: name.replaceAll("_", " "),
    mesh,
    color: fallback as [number, number, number],
    surface: { type, params },
  };
}

export function assemblePlushCharacter(params: PlushCharacterParams): NamedPart[] {
  const fur: [number, number, number] = [0.55, 0.36, 0.18];
  const light: [number, number, number] = [0.78, 0.6, 0.4];
  const dark: [number, number, number] = [0.07, 0.05, 0.04];
  const headY = 0.4 + params.bodyHeight;
  const parts: NamedPart[] = [];
  const plushPart = (name: string, mesh: NamedPart["mesh"], tint: [number, number, number]) =>
    surfacePart(name, mesh, "fur", { tint });

  parts.push(plushPart(
    "body",
    scaleMesh(sphere(1, 28, 22), vec3(params.bodyWidth, params.bodyHeight, params.bodyWidth * 0.94)),
    fur,
  ));
  parts.push(plushPart("belly", transform(sphere(0.55, 24, 18), {
    scale: vec3(0.7, 0.85, 0.5),
    translate: vec3(0, -0.05, params.bodyWidth * 0.65),
  }), light));
  parts.push(plushPart("head", transform(sphere(params.headSize, 28, 22), {
    translate: vec3(0, headY, 0.05),
  }), fur));

  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "left" : "right";
    parts.push(plushPart(`ear_${suffix}`, transform(sphere(params.earSize, 18, 14), {
      scale: vec3(1, 1, 0.55),
      translate: vec3(params.headSize * 0.66 * side, headY + params.headSize * 0.73, 0),
    }), fur));
    parts.push(plushPart(`ear_inner_${suffix}`, transform(sphere(params.earSize * 0.55, 16, 12), {
      scale: vec3(1, 1, 0.45),
      translate: vec3(params.headSize * 0.66 * side, headY + params.headSize * 0.73, 0.12),
    }), light));
  }

  parts.push(plushPart("muzzle", transform(sphere(params.snoutSize, 22, 16), {
    scale: vec3(1.1, 0.85, 0.9),
    translate: vec3(0, headY - 0.12, params.headSize * 0.82),
  }), light));
  parts.push(surfacePart("nose", transform(box(0.16, 0.12, 0.12), {
    translate: vec3(0, headY - 0.06, params.headSize * 0.82 + params.snoutSize * 0.7),
  }), "plastic", { color: dark, roughness: 0.3 }));

  const eyeOffsetX = params.headSize * 0.34;
  const eyeOffsetY = 0.16;
  const eyeRadius = Math.max(0.08, params.headSize * 0.13);
  const eyeZ = 0.05 + Math.sqrt(Math.max(
    0.02,
    params.headSize ** 2 - eyeOffsetX ** 2 - eyeOffsetY ** 2,
  )) - eyeRadius * 0.35;
  for (const side of [-1, 1]) {
    const suffix = side < 0 ? "left" : "right";
    parts.push(surfacePart(`eye_${suffix}`, transform(sphere(eyeRadius, 14, 10), {
      translate: vec3(eyeOffsetX * side, headY + eyeOffsetY, eyeZ),
    }), "plastic", { color: dark, roughness: 0.15 }));
    parts.push(plushPart(`arm_${suffix}`, transform(sphere(0.34, 18, 14), {
      scale: vec3(params.limbSize / 0.45 * 0.55, 0.9, 0.55),
      rotate: vec3(0, 0, side * 0.5),
      translate: vec3((params.bodyWidth + 0.1) * side, 0.25, 0.1),
    }), fur));
    parts.push(plushPart(`leg_${suffix}`, transform(sphere(0.42, 20, 16), {
      scale: vec3(params.limbSize / 0.45 * 0.7, 0.85, 0.85),
      translate: vec3(0.45 * side, -0.95, 0.1),
    }), fur));
  }
  return parts;
}
