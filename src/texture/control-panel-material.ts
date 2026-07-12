import { clamp, smoothstep } from "../math/scalar.js";
import { fbm2, makeNoise } from "../random/noise.js";
import { makeTexture, type TextureBuffer } from "./buffer.js";
import { heightToNormal, type Material } from "./pbr.js";
import {
  sdf2Subtract,
  sdf2Union,
  sdfCircle,
  sdfOutline,
  sdfRegularPolygon,
  sdfRoundedBox,
  sdfTransform,
  type Sdf2,
} from "./sdf.js";

export type ControlPanelIcon = "power" | "warning" | "arrowUp" | "arrowDown" | "check" | "stop";
export type ControlPanelControlRole = "display" | "button" | "indicator";
export type ControlPanelColor = readonly [number, number, number];

export interface ControlPanelControl {
  readonly id: number;
  readonly key: string;
  readonly label: string;
  readonly role: ControlPanelControlRole;
  readonly center: readonly [number, number];
  readonly icon?: ControlPanelIcon;
}

export interface ControlPanelMaterialOptions {
  readonly seed?: number;
  readonly panelColor?: ControlPanelColor;
  readonly accentColor?: ControlPanelColor;
  readonly activeControl?: number;
  readonly alarm?: number;
  readonly glow?: number;
  readonly wear?: number;
  readonly dirt?: number;
  readonly iconScale?: number;
  readonly normalStrength?: number;
}

export interface ControlPanelMaterialMasks {
  readonly controlId: TextureBuffer;
  readonly display: TextureBuffer;
  readonly button: TextureBuffer;
  readonly indicator: TextureBuffer;
  readonly icon: TextureBuffer;
  readonly displayGlyph: TextureBuffer;
  readonly active: TextureBuffer;
  readonly alarm: TextureBuffer;
  readonly edgeWear: TextureBuffer;
  readonly cavityDirt: TextureBuffer;
}

export interface ControlPanelMaterialResult {
  readonly material: Material;
  readonly masks: ControlPanelMaterialMasks;
  readonly controls: readonly ControlPanelControl[];
}

const BUTTON_CONTROLS: readonly ControlPanelControl[] = [
  { id: 2, key: "power", label: "电源", role: "button", center: [-0.58, 0.08], icon: "power" },
  { id: 3, key: "alarm", label: "警报", role: "button", center: [0, 0.08], icon: "warning" },
  { id: 4, key: "move-up", label: "上移", role: "button", center: [0.58, 0.08], icon: "arrowUp" },
  { id: 5, key: "move-down", label: "下移", role: "button", center: [-0.58, -0.46], icon: "arrowDown" },
  { id: 6, key: "confirm", label: "确认", role: "button", center: [0, -0.46], icon: "check" },
  { id: 7, key: "stop", label: "停止", role: "button", center: [0.58, -0.46], icon: "stop" },
];

const INDICATOR_CONTROLS: readonly ControlPanelControl[] = [
  { id: 8, key: "running", label: "运行指示", role: "indicator", center: [-0.52, 0.61] },
  { id: 9, key: "standby", label: "待机指示", role: "indicator", center: [0, 0.61] },
  { id: 10, key: "fault", label: "故障指示", role: "indicator", center: [0.52, 0.61] },
];

export const CONTROL_PANEL_CONTROLS: readonly ControlPanelControl[] = [
  { id: 1, key: "status-display", label: "状态显示屏", role: "display", center: [0, 0.58] },
  ...BUTTON_CONTROLS,
  ...INDICATOR_CONTROLS,
];

const ICON_SDFS: Readonly<Record<ControlPanelIcon, Sdf2>> = {
  power: createPowerIcon(),
  warning: createWarningIcon(),
  arrowUp: createArrowIcon(1),
  arrowDown: createArrowIcon(-1),
  check: createCheckIcon(),
  stop: sdfRegularPolygon(8, 0.56, Math.PI / 8),
};

export function controlPanelIconSdf(icon: ControlPanelIcon): Sdf2 {
  return ICON_SDFS[icon];
}

export function controlPanelMaterial(
  size: number,
  options: ControlPanelMaterialOptions = {},
): Material {
  return controlPanelMaterialResult(size, options).material;
}

export function controlPanelMaterialResult(
  size: number,
  options: ControlPanelMaterialOptions = {},
): ControlPanelMaterialResult {
  const resolution = Math.max(16, Math.floor(size));
  const seed = options.seed ?? 97;
  const panelColor = options.panelColor ?? [0.075, 0.12, 0.15];
  const accentColor = options.accentColor ?? [0.08, 0.82, 0.62];
  const activeControl = clamp(Math.round(options.activeControl ?? 0), 0, BUTTON_CONTROLS.length - 1);
  const alarmAmount = clamp(options.alarm ?? 0.22, 0, 1);
  const glowAmount = clamp(options.glow ?? 0.82, 0, 1);
  const wearAmount = clamp(options.wear ?? 0.38, 0, 1);
  const dirtAmount = clamp(options.dirt ?? 0.28, 0, 1);
  const iconScale = clamp(options.iconScale ?? 1, 0.65, 1.35);
  const noise = makeNoise(seed);
  const baseColor = makeTexture(resolution, resolution, 3);
  const metallic = makeTexture(resolution, resolution, 1);
  const roughness = makeTexture(resolution, resolution, 1);
  const ao = makeTexture(resolution, resolution, 1);
  const height = makeTexture(resolution, resolution, 1);
  const emission = makeTexture(resolution, resolution, 3);
  const masks: ControlPanelMaterialMasks = {
    controlId: makeTexture(resolution, resolution, 1),
    display: makeTexture(resolution, resolution, 1),
    button: makeTexture(resolution, resolution, 1),
    indicator: makeTexture(resolution, resolution, 1),
    icon: makeTexture(resolution, resolution, 1),
    displayGlyph: makeTexture(resolution, resolution, 1),
    active: makeTexture(resolution, resolution, 1),
    alarm: makeTexture(resolution, resolution, 1),
    edgeWear: makeTexture(resolution, resolution, 1),
    cavityDirt: makeTexture(resolution, resolution, 1),
  };
  const displayShape = sdfTransform(sdfRoundedBox(0.76, 0.2, 0.055), { translate: [0, 0.58] });
  const pixelSoftness = 2.5 / resolution;

  for (let pixelY = 0; pixelY < resolution; pixelY++) {
    const uvY = 1 - (pixelY + 0.5) / resolution;
    const domainY = uvY * 2 - 1;
    for (let pixelX = 0; pixelX < resolution; pixelX++) {
      const uvX = (pixelX + 0.5) / resolution;
      const domainX = uvX * 2 - 1;
      const pixel = pixelY * resolution + pixelX;
      const displayDistance = displayShape(domainX, domainY);
      const displayMask = distanceMask(displayDistance, pixelSoftness);
      const displaySeam = distanceBand(displayDistance, 0.025, pixelSoftness);
      const buttonHit = findNearestControl(domainX, domainY, BUTTON_CONTROLS, 0.19);
      const indicatorHit = findNearestControl(domainX, domainY, INDICATOR_CONTROLS, 0.052);
      const buttonMask = buttonHit ? distanceMask(buttonHit.distance, pixelSoftness) : 0;
      const buttonRim = buttonHit ? distanceBand(buttonHit.distance, 0.035, pixelSoftness) : 0;
      const indicatorMask = indicatorHit ? distanceMask(indicatorHit.distance, pixelSoftness) : 0;
      const indicatorRim = indicatorHit ? distanceBand(indicatorHit.distance, 0.014, pixelSoftness) : 0;
      const iconMask = buttonHit
        ? iconMaskAt(domainX, domainY, buttonHit.control, iconScale, pixelSoftness)
        : 0;
      const displayGlyph = displayMask * displayGlyphMask(domainX, domainY, pixelSoftness);
      const activeMask = buttonHit?.index === activeControl
        ? Math.max(iconMask, buttonRim * 0.72)
        : 0;
      const alarmMask = Math.max(
        indicatorHit?.control.key === "fault" ? indicatorMask * alarmAmount : 0,
        buttonHit?.control.key === "alarm" ? iconMask * alarmAmount : 0,
      );
      const borderDistance = Math.min(1 - Math.abs(domainX), 1 - Math.abs(domainY));
      const outerWear = 1 - smoothstep(0.02, 0.095, borderDistance);
      const surfaceNoise = fbm2(noise, uvX * 9 + 13, uvY * 9 - 7, { octaves: 4 }) * 0.5 + 0.5;
      const fineNoise = fbm2(noise, uvX * 41 - 19, uvY * 41 + 29, { octaves: 3 }) * 0.5 + 0.5;
      const edgeWear = clamp(
        Math.max(outerWear, displaySeam * 0.42, buttonRim * 0.78, indicatorRim * 0.34)
          * (0.46 + surfaceNoise * 0.54)
          * wearAmount,
        0,
        1,
      );
      const lowerBias = clamp((0.15 - domainY) * 0.22, 0, 0.32);
      const cavityDirt = clamp(
        (displaySeam * 0.52 + buttonRim * 0.6 + indicatorRim * 0.34 + lowerBias)
          * (0.55 + surfaceNoise * 0.45)
          * dirtAmount,
        0,
        1,
      );
      const semanticId = indicatorHit?.control.id
        ?? buttonHit?.control.id
        ?? (displayMask > 0.5 ? 1 : 0);
      const isActiveButton = buttonHit?.index === activeControl;
      const indicatorColor = indicatorHit
        ? indicatorColorFor(indicatorHit.control.key, alarmAmount)
        : [0, 0, 0] as const;

      let color: ControlPanelColor = [
        panelColor[0] * (0.86 + surfaceNoise * 0.2),
        panelColor[1] * (0.86 + surfaceNoise * 0.2),
        panelColor[2] * (0.86 + surfaceNoise * 0.2),
      ];
      let metalness = 0;
      let surfaceRoughness = 0.38 + fineNoise * 0.08;
      let surfaceHeight = 0.48 + fineNoise * 0.004;

      if (displayMask > 0.5) {
        color = [0.008, 0.026, 0.032];
        surfaceRoughness = 0.14;
        surfaceHeight = 0.42;
      }
      if (buttonMask > 0.5) {
        const activeBoost = isActiveButton ? 0.1 : 0;
        color = [0.09 + activeBoost, 0.115 + activeBoost, 0.13 + activeBoost];
        surfaceRoughness = 0.27;
        surfaceHeight = 0.57;
      }
      if (buttonRim > 0.5) {
        color = [0.29, 0.32, 0.34];
        metalness = 1;
        surfaceRoughness = 0.24;
        surfaceHeight = 0.535;
      }
      if (indicatorMask > 0.5) {
        color = scaleColor(indicatorColor, 0.34);
        surfaceRoughness = 0.1;
        surfaceHeight = 0.55;
      }
      if (iconMask > 0.02) {
        color = mixColor(color, isActiveButton ? accentColor : [0.62, 0.67, 0.68], iconMask);
        surfaceRoughness = 0.22;
        surfaceHeight += iconMask * 0.018;
      }
      if (displayGlyph > 0.02) color = mixColor(color, accentColor, displayGlyph * 0.82);
      color = mixColor(color, [0.5, 0.52, 0.53], edgeWear * 0.82);
      color = mixColor(color, [0.055, 0.045, 0.035], cavityDirt * 0.76);
      metalness = clamp(Math.max(metalness, edgeWear * 0.92) * (1 - cavityDirt * 0.38), 0, 1);
      surfaceRoughness = clamp(surfaceRoughness + cavityDirt * 0.3 - edgeWear * 0.08, 0.04, 1);
      surfaceHeight = clamp(surfaceHeight - cavityDirt * 0.018, 0, 1);

      for (let channel = 0; channel < 3; channel++) {
        baseColor.data[pixel * 3 + channel] = clamp(color[channel]!, 0, 1);
        const activeEmission = accentColor[channel]! * activeMask * glowAmount;
        const glyphEmission = accentColor[channel]! * displayGlyph * glowAmount * 0.5;
        const indicatorEmission = indicatorColor[channel]! * indicatorMask * glowAmount;
        const alarmEmission = (channel === 0 ? 1 : channel === 1 ? 0.055 : 0.025) * alarmMask * glowAmount;
        emission.data[pixel * 3 + channel] = clamp(
          Math.max(activeEmission, glyphEmission, indicatorEmission, alarmEmission),
          0,
          1,
        );
      }
      metallic.data[pixel] = metalness;
      roughness.data[pixel] = surfaceRoughness;
      ao.data[pixel] = clamp(1 - displaySeam * 0.32 - buttonRim * 0.2 - cavityDirt * 0.52, 0, 1);
      height.data[pixel] = surfaceHeight;
      masks.controlId.data[pixel] = semanticId / 10;
      masks.display.data[pixel] = displayMask;
      masks.button.data[pixel] = buttonMask;
      masks.indicator.data[pixel] = indicatorMask;
      masks.icon.data[pixel] = iconMask;
      masks.displayGlyph.data[pixel] = displayGlyph;
      masks.active.data[pixel] = activeMask;
      masks.alarm.data[pixel] = alarmMask;
      masks.edgeWear.data[pixel] = edgeWear;
      masks.cavityDirt.data[pixel] = cavityDirt;
    }
  }

  return {
    material: {
      baseColor,
      metallic,
      roughness,
      normal: heightToNormal(height, options.normalStrength ?? 7),
      ao,
      height,
      emission,
    },
    masks,
    controls: CONTROL_PANEL_CONTROLS,
  };
}

function createPowerIcon(): Sdf2 {
  const ring = sdf2Subtract(
    sdfOutline(sdfCircle(0.48), 0.14),
    sdfTransform(sdfRoundedBox(0.16, 0.22, 0.035), { translate: [0, 0.49] }),
  );
  const stem = sdfTransform(sdfRoundedBox(0.065, 0.34, 0.04), { translate: [0, 0.25] });
  return sdf2Union(ring, stem);
}

function createWarningIcon(): Sdf2 {
  const triangle = sdfOutline(sdfRegularPolygon(3, 0.66, Math.PI / 2), 0.12);
  const stem = sdfTransform(sdfRoundedBox(0.055, 0.22, 0.035), { translate: [0, 0.08] });
  const dot = sdfTransform(sdfCircle(0.065), { translate: [0, -0.31] });
  return sdf2Union(triangle, sdf2Union(stem, dot));
}

function createArrowIcon(direction: 1 | -1): Sdf2 {
  const shaft = segmentSdf(0, -0.45 * direction, 0, 0.28 * direction, 0.075);
  const head = sdfTransform(sdfRegularPolygon(3, 0.36, direction > 0 ? Math.PI / 2 : -Math.PI / 2), {
    translate: [0, 0.31 * direction],
  });
  return sdf2Union(shaft, head);
}

function createCheckIcon(): Sdf2 {
  return sdf2Union(
    segmentSdf(-0.46, -0.02, -0.13, -0.33, 0.085),
    segmentSdf(-0.13, -0.33, 0.49, 0.35, 0.085),
  );
}

function segmentSdf(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  radius: number,
): Sdf2 {
  const edgeX = endX - startX;
  const edgeY = endY - startY;
  const edgeLengthSquared = edgeX * edgeX + edgeY * edgeY;
  return (localX, localY) => {
    const amount = clamp(
      ((localX - startX) * edgeX + (localY - startY) * edgeY) / edgeLengthSquared,
      0,
      1,
    );
    return Math.hypot(
      localX - (startX + edgeX * amount),
      localY - (startY + edgeY * amount),
    ) - radius;
  };
}

function findNearestControl(
  domainX: number,
  domainY: number,
  controls: readonly ControlPanelControl[],
  radius: number,
): { control: ControlPanelControl; index: number; distance: number } | undefined {
  let nearest: { control: ControlPanelControl; index: number; distance: number } | undefined;
  for (let index = 0; index < controls.length; index++) {
    const control = controls[index]!;
    const distance = Math.hypot(domainX - control.center[0], domainY - control.center[1]) - radius;
    if (!nearest || distance < nearest.distance) nearest = { control, index, distance };
  }
  return nearest && nearest.distance <= radius * 0.4 ? nearest : undefined;
}

function iconMaskAt(
  domainX: number,
  domainY: number,
  control: ControlPanelControl,
  scale: number,
  softness: number,
): number {
  if (!control.icon) return 0;
  const radius = 0.125 * scale;
  const localX = (domainX - control.center[0]) / radius;
  const localY = (domainY - control.center[1]) / radius;
  return distanceMask(controlPanelIconSdf(control.icon)(localX, localY) * radius, softness);
}

function displayGlyphMask(domainX: number, domainY: number, softness: number): number {
  const lineOne = roundedRectMask(domainX, domainY, -0.22, 0.51, 0.28, 0.018, softness);
  const lineTwo = roundedRectMask(domainX, domainY, 0.2, 0.51, 0.16, 0.018, softness);
  const statusBar = roundedRectMask(domainX, domainY, 0, 0.43, 0.54, 0.012, softness);
  return Math.max(lineOne, lineTwo, statusBar);
}

function roundedRectMask(
  domainX: number,
  domainY: number,
  centerX: number,
  centerY: number,
  halfWidth: number,
  halfHeight: number,
  softness: number,
): number {
  const distance = sdfRoundedBox(halfWidth, halfHeight, halfHeight)(
    domainX - centerX,
    domainY - centerY,
  );
  return distanceMask(distance, softness);
}

function indicatorColorFor(key: string, alarm: number): ControlPanelColor {
  if (key === "running") return [0.04, 0.92, 0.36];
  if (key === "standby") return [0.96, 0.62, 0.05];
  return [0.34 + alarm * 0.66, 0.025, 0.018];
}

function distanceMask(distance: number, softness: number): number {
  return 1 - smoothstep(-softness, softness, distance);
}

function distanceBand(distance: number, width: number, softness: number): number {
  return 1 - smoothstep(width - softness, width + softness, Math.abs(distance));
}

function scaleColor(color: ControlPanelColor, amount: number): ControlPanelColor {
  return [color[0] * amount, color[1] * amount, color[2] * amount];
}

function mixColor(first: ControlPanelColor, second: ControlPanelColor, amount: number): ControlPanelColor {
  return [
    mix(first[0], second[0], amount),
    mix(first[1], second[1], amount),
    mix(first[2], second[2], amount),
  ];
}

function mix(first: number, second: number, amount: number): number {
  return first + (second - first) * amount;
}
