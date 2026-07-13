import {
  blend,
  blendColor,
  clamp,
  fbm2,
  makeNoise,
  ramp,
  voronoi,
  type MaterialFields,
} from "meshova";

export interface CorrodedMetalParams {
  seed: number;
  rust: number;
  scale: number;
  roughness: number;
}

export function corrodedMetalFields(params: CorrodedMetalParams): MaterialFields {
  const noise = makeNoise(params.seed);
  const rustMask = (u: number, v: number) => clamp(
    fbm2(noise, u * params.scale, v * params.scale, { octaves: 5 }) * 0.5 + 0.5 + params.rust,
    0,
    1,
  );
  const grain = (u: number, v: number) =>
    fbm2(noise, u * 26, v * 26, { octaves: 3 }) * 0.5 + 0.5;
  const cells = voronoi({ scale: 18, seed: params.seed, metric: "f1" });
  const cracks = voronoi({ scale: 9, seed: params.seed + 1, metric: "f2-f1" });
  const rustColor = ramp([
    { at: 0, color: [0.18, 0.07, 0.03] },
    { at: 0.45, color: [0.4, 0.16, 0.06] },
    { at: 0.7, color: [0.62, 0.3, 0.12] },
    { at: 1, color: [0.74, 0.45, 0.22] },
  ]);
  const metalColor: [number, number, number] = [0.42, 0.43, 0.45];
  return {
    baseColor: (u, v) => {
      const mask = rustMask(u, v);
      const corrosion = rustColor(clamp(cells(u, v) * 0.6 + grain(u, v) * 0.4, 0, 1));
      const metal = blendColor(metalColor, [0.2, 0.2, 0.22], cracks(u, v));
      return blendColor(metal, corrosion, mask);
    },
    metallic: (u, v) => blend(1, 0, rustMask(u, v)),
    roughness: (u, v) => clamp(blend(0.35, 0.9, rustMask(u, v)) + params.roughness, 0.04, 1),
    height: (u, v) => clamp(0.5 - rustMask(u, v) * 0.18 + grain(u, v) * 0.05, 0, 1),
    ao: (u, v) => clamp(1 - rustMask(u, v) * 0.22, 0, 1),
    normalStrength: 3,
    tileable: true,
  };
}
