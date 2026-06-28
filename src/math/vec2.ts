/** 2D vector — immutable, functional style. Used for UVs and texture coords. */
export interface Vec2 {
  readonly x: number;
  readonly y: number;
}

export function vec2(x = 0, y = 0): Vec2 {
  return { x, y };
}

export function add2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function sub2(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scale2(a: Vec2, s: number): Vec2 {
  return { x: a.x * s, y: a.y * s };
}

export function dot2(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function length2(a: Vec2): number {
  return Math.sqrt(a.x * a.x + a.y * a.y);
}

export function lerp2(a: Vec2, b: Vec2, t: number): Vec2 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}
