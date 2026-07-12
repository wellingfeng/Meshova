import { clamp } from "../math/scalar.js";
import { vec3 } from "../math/vec3.js";
import { icosphere } from "../geometry/primitives2.js";
import { makeMesh, recomputeNormals, type Mesh } from "../geometry/mesh.js";
import type { NamedPart } from "../geometry/export.js";
import { fbm3, makeNoise, type Noise } from "../random/noise.js";

export interface ProceduralPlanetParams {
  seed: number;
  radius: number;
  subdivisions: number;
  continentScale: number;
  continentBias: number;
  continentHeight: number;
  oceanDepth: number;
  oceanFloor: number;
  mountainScale: number;
  mountainHeight: number;
  roughness: number;
  oceanLevel: number;
  snowLine: number;
  atmosphere: number;
}

export const PROCEDURAL_PLANET_DEFAULTS: ProceduralPlanetParams = {
  seed: 42,
  radius: 4,
  subdivisions: 5,
  continentScale: 1.2,
  continentBias: 0.055,
  continentHeight: 0.45,
  oceanDepth: 0.34,
  oceanFloor: 0.32,
  mountainScale: 4.2,
  mountainHeight: 0.28,
  roughness: 0.04,
  oceanLevel: 0,
  snowLine: 0.72,
  atmosphere: 0.12,
};

interface PlanetFields {
  continent: Noise;
  warp: Noise;
  mountain: Noise;
  mountainMask: Noise;
  detail: Noise;
  biome: Noise;
}

function resolveParams(options: Partial<ProceduralPlanetParams>): ProceduralPlanetParams {
  return {
    seed: Math.round(options.seed ?? PROCEDURAL_PLANET_DEFAULTS.seed),
    radius: clamp(options.radius ?? PROCEDURAL_PLANET_DEFAULTS.radius, 0.5, 100),
    subdivisions: Math.round(clamp(options.subdivisions ?? PROCEDURAL_PLANET_DEFAULTS.subdivisions, 1, 5)),
    continentScale: clamp(options.continentScale ?? PROCEDURAL_PLANET_DEFAULTS.continentScale, 0.25, 8),
    continentBias: clamp(options.continentBias ?? PROCEDURAL_PLANET_DEFAULTS.continentBias, -0.7, 0.7),
    continentHeight: clamp(options.continentHeight ?? PROCEDURAL_PLANET_DEFAULTS.continentHeight, 0, 5),
    oceanDepth: clamp(options.oceanDepth ?? PROCEDURAL_PLANET_DEFAULTS.oceanDepth, 0, 5),
    oceanFloor: clamp(options.oceanFloor ?? PROCEDURAL_PLANET_DEFAULTS.oceanFloor, 0.02, 1),
    mountainScale: clamp(options.mountainScale ?? PROCEDURAL_PLANET_DEFAULTS.mountainScale, 0.5, 24),
    mountainHeight: clamp(options.mountainHeight ?? PROCEDURAL_PLANET_DEFAULTS.mountainHeight, 0, 5),
    roughness: clamp(options.roughness ?? PROCEDURAL_PLANET_DEFAULTS.roughness, 0, 1),
    oceanLevel: clamp(options.oceanLevel ?? PROCEDURAL_PLANET_DEFAULTS.oceanLevel, -1, 1),
    snowLine: clamp(options.snowLine ?? PROCEDURAL_PLANET_DEFAULTS.snowLine, 0, 1),
    atmosphere: clamp(options.atmosphere ?? PROCEDURAL_PLANET_DEFAULTS.atmosphere, 0, 1),
  };
}

function createFields(seed: number): PlanetFields {
  return {
    continent: makeNoise((seed + 101) >>> 0),
    warp: makeNoise((seed + 1307) >>> 0),
    mountain: makeNoise((seed + 3571) >>> 0),
    mountainMask: makeNoise((seed + 7411) >>> 0),
    detail: makeNoise((seed + 12011) >>> 0),
    biome: makeNoise((seed + 19001) >>> 0),
  };
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  if (edge0 === edge1) return value < edge0 ? 0 : 1;
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function smoothMax(a: number, b: number, smoothing: number): number {
  if (smoothing <= 0) return Math.max(a, b);
  const h = clamp(0.5 + 0.5 * (a - b) / smoothing, 0, 1);
  return b + (a - b) * h + smoothing * h * (1 - h);
}

function ridgedFbm(noise: Noise, x: number, y: number, z: number): number {
  let frequency = 1;
  let amplitude = 1;
  let sum = 0;
  let normalization = 0;
  let weight = 1;
  for (let octave = 0; octave < 5; octave++) {
    let ridge = 1 - Math.abs(noise.noise3(x * frequency, y * frequency, z * frequency));
    ridge *= ridge;
    ridge *= weight;
    weight = clamp(ridge * 2.25, 0, 1);
    sum += ridge * amplitude;
    normalization += amplitude;
    frequency *= 2.05;
    amplitude *= 0.5;
  }
  return clamp((sum / normalization - 0.42) / 0.58, 0, 1);
}

function sampleElevation(
  x: number,
  y: number,
  z: number,
  params: ProceduralPlanetParams,
  fields: PlanetFields,
): number {
  const warpScale = 0.82;
  const warpX = fbm3(fields.warp, x * warpScale, y * warpScale, z * warpScale, { octaves: 3 });
  const warpY = fbm3(fields.warp, x * warpScale + 17.1, y * warpScale - 9.2, z * warpScale + 4.7, { octaves: 3 });
  const warpZ = fbm3(fields.warp, x * warpScale - 13.4, y * warpScale + 5.8, z * warpScale - 8.3, { octaves: 3 });
  const warpStrength = 0.22;
  const wx = (x + warpX * warpStrength) * params.continentScale;
  const wy = (y + warpY * warpStrength) * params.continentScale;
  const wz = (z + warpZ * warpStrength) * params.continentScale;

  const continentRaw = fbm3(fields.continent, wx, wy, wz, {
    octaves: 6,
    lacunarity: 2.03,
    gain: 0.53,
  }) * 1.35 + params.continentBias;
  const continent = smoothMax(continentRaw, -params.oceanFloor, 0.08);
  const continentalRelief = continent >= 0
    ? continent * params.continentHeight
    : continent * params.oceanDepth;

  const mountainMaskNoise = fbm3(fields.mountainMask, x * 2.15, y * 2.15, z * 2.15, { octaves: 4 });
  const landMask = smoothstep(-0.035, 0.16, continentRaw);
  const rangeMask = smoothstep(-0.2, 0.34, mountainMaskNoise);
  const mountains = ridgedFbm(
    fields.mountain,
    x * params.mountainScale,
    y * params.mountainScale,
    z * params.mountainScale,
  ) * params.mountainHeight * landMask * rangeMask;
  const detail = fbm3(fields.detail, x * 18, y * 18, z * 18, {
    octaves: 4,
    lacunarity: 2.1,
    gain: 0.46,
  }) * params.roughness * (0.35 + landMask * 0.65);
  return continentalRelief + mountains + detail;
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const w = clamp(t, 0, 1);
  return [
    a[0] + (b[0] - a[0]) * w,
    a[1] + (b[1] - a[1]) * w,
    a[2] + (b[2] - a[2]) * w,
  ];
}

function terrainColor(
  position: { x: number; y: number; z: number },
  normal: { x: number; y: number; z: number },
  params: ProceduralPlanetParams,
  fields: PlanetFields,
): [number, number, number] {
  const radial = Math.hypot(position.x, position.y, position.z);
  const nx = position.x / radial;
  const ny = position.y / radial;
  const nz = position.z / radial;
  const elevation = radial - (params.radius + params.oceanLevel);
  const slope = clamp(1 - (normal.x * nx + normal.y * ny + normal.z * nz), 0, 1);
  const biome = fbm3(fields.biome, nx * 2.6, ny * 2.6, nz * 2.6, { octaves: 4 });
  const speckle = fbm3(fields.detail, nx * 28, ny * 28, nz * 28, { octaves: 3 }) * 0.035;

  const seaFloor: [number, number, number] = [0.035, 0.09, 0.065];
  const sand: [number, number, number] = [0.4, 0.3, 0.13];
  const grass: [number, number, number] = biome > 0.08 ? [0.055, 0.24, 0.04] : [0.1, 0.19, 0.035];
  const dryLand: [number, number, number] = [0.28, 0.17, 0.055];
  const rock: [number, number, number] = [0.19, 0.17, 0.145];
  const snow: [number, number, number] = [0.72, 0.79, 0.84];

  let color: [number, number, number];
  if (elevation < 0) {
    color = mixColor(seaFloor, sand, smoothstep(-0.16, 0.01, elevation));
  } else {
    const shore = 1 - smoothstep(0.015, 0.12, elevation);
    const arid = smoothstep(0.12, 0.42, biome);
    const lowland = mixColor(grass, dryLand, arid);
    color = mixColor(lowland, sand, shore);
    const rockWeight = Math.max(
      smoothstep(0.18, 0.75, elevation / Math.max(0.05, params.mountainHeight)),
      smoothstep(0.015, 0.16, slope),
    );
    color = mixColor(color, rock, rockWeight);
  }

  const snowNoise = fbm3(fields.detail, nx * 7, ny * 7, nz * 7, { octaves: 3 }) * 0.055;
  const snowLatitude = Math.abs(ny) + snowNoise + Math.max(0, elevation) * 0.08;
  const snowWeight = smoothstep(params.snowLine - 0.06, params.snowLine + 0.07, snowLatitude)
    * smoothstep(-0.02, 0.08, elevation);
  color = mixColor(color, snow, snowWeight);
  return [
    clamp(color[0] + speckle, 0, 1),
    clamp(color[1] + speckle, 0, 1),
    clamp(color[2] + speckle, 0, 1),
  ];
}

export function buildProceduralPlanetTerrain(
  options: Partial<ProceduralPlanetParams> = {},
): { mesh: Mesh; colors: number[]; oceanRadius: number } {
  const params = resolveParams(options);
  const fields = createFields(params.seed);
  const base = icosphere(1, params.subdivisions);
  const positions = base.positions.map((direction) => {
    const elevation = sampleElevation(direction.x, direction.y, direction.z, params, fields);
    const radius = Math.max(params.radius * 0.2, params.radius + elevation);
    return vec3(direction.x * radius, direction.y * radius, direction.z * radius);
  });
  const mesh = recomputeNormals(makeMesh({
    positions,
    normals: base.normals.map((normal) => ({ ...normal })),
    uvs: base.uvs.map((uv) => ({ ...uv })),
    indices: [...base.indices],
  }));
  const colors: number[] = [];
  for (let index = 0; index < mesh.positions.length; index++) {
    colors.push(...terrainColor(mesh.positions[index]!, mesh.normals[index]!, params, fields));
  }
  return { mesh, colors, oceanRadius: params.radius + params.oceanLevel };
}

export function buildProceduralPlanetParts(
  options: Partial<ProceduralPlanetParams> = {},
): NamedPart[] {
  const params = resolveParams(options);
  const terrain = buildProceduralPlanetTerrain(params);
  const shellSubdivisions = Math.min(4, params.subdivisions);
  const parts: NamedPart[] = [
    {
      name: "planet_terrain",
      label: "大陆与海床",
      mesh: terrain.mesh,
      color: [0.25, 0.34, 0.18],
      colors: terrain.colors,
      surface: {
        type: "terrain",
        params: { seed: params.seed, scale: 7, color: [0.25, 0.34, 0.18] },
      },
      metadata: {
        source: "Sebastian Lague Solar System Episode 02",
        license: "MIT",
        technique: "uniform sphere, domain-warped fractal continents, ridged mountains, height/slope/latitude biomes",
      },
    },
    {
      name: "planet_ocean",
      label: "海洋",
      mesh: icosphere(terrain.oceanRadius, shellSubdivisions),
      color: [0.025, 0.19, 0.38],
      surface: {
        type: "liquid",
        params: {
          tint: [0.025, 0.19, 0.38],
          ior: 1.333,
          transmission: 0.24,
        },
      },
      metadata: {
        oceanRadius: terrain.oceanRadius,
        castShadow: false,
        renderFx: "planet-ocean",
      },
    },
  ];

  if (params.atmosphere > 0) {
    parts.push({
      name: "planet_atmosphere",
      label: "大气层",
      mesh: icosphere(terrain.oceanRadius + params.atmosphere, shellSubdivisions),
      color: [0.18, 0.48, 0.92],
      surface: {
        type: "glass",
        params: {
          tint: [0.18, 0.48, 0.92],
          roughness: 0.18,
          thickness: Math.max(0.015, params.atmosphere * 0.28),
        },
      },
      metadata: {
        castShadow: false,
        renderFx: "planet-atmosphere",
        atmosphereColor: [0.18, 0.48, 0.92],
        atmosphereStrength: 0.72,
      },
    });
  }

  return parts;
}
