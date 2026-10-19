import { deltaE, hexToHsv, hsvToHex, nearestColorName, normalizeHex } from "./color";

export const HARMONIES = [
  { id: "analogous", label: "Analogous" },
  { id: "complementary", label: "Complementary" },
  { id: "split-complementary", label: "Split complementary" },
  { id: "triad", label: "Triad" },
  { id: "square", label: "Square" },
  { id: "compound", label: "Compound" },
  { id: "shades", label: "Shades" },
  { id: "monochromatic", label: "Monochromatic" },
] as const;

export type HarmonyId = (typeof HARMONIES)[number]["id"];

export interface HarmonyColor {
  hex: string;
  name: string;
}

interface Hsv {
  h: number;
  s: number;
  v: number;
}

const SHADE_VALUES = [0.94, 0.76, 0.58, 0.4, 0.22];

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const wrap = (hue: number) => ((hue % 360) + 360) % 360;

function shift(color: Hsv, degrees: number): Hsv {
  return { h: wrap(color.h + degrees), s: color.s, v: color.v };
}

function tint(color: Hsv): Hsv {
  return {
    h: color.h,
    s: clamp(color.s * 0.7, 0.08, 1),
    v: clamp(color.v + (1 - color.v) * 0.42, 0, 0.97),
  };
}

function shade(color: Hsv): Hsv {
  return {
    h: color.h,
    s: clamp(color.s * 0.9, 0, 1),
    v: clamp(color.v * 0.55, 0.1, 0.7),
  };
}

/** Grey picks still need a hue that can move, so derived colours leave neutral. */
function chromatic(color: Hsv): Hsv {
  return {
    h: color.h,
    s: color.s < 0.12 ? 0.62 : color.s,
    v: color.v < 0.08 ? 0.45 : color.v,
  };
}

function recipe(harmony: HarmonyId, color: Hsv): Hsv[] {
  switch (harmony) {
    case "analogous":
      return [shift(color, -30), shift(color, -15), shift(color, 15), shift(color, 30)];
    case "complementary":
      return [tint(color), shift(color, 180), tint(shift(color, 180)), shade(color)];
    case "split-complementary":
      return [
        shift(color, 150),
        shift(color, 210),
        tint(shift(color, 150)),
        tint(shift(color, 210)),
      ];
    case "triad":
      return [shift(color, 120), shift(color, 240), tint(color), shade(color)];
    case "square":
      return [shift(color, 90), shift(color, 180), shift(color, 270), tint(color)];
    case "compound":
      return [shift(color, 30), shift(color, 180), shift(color, 210), shade(color)];
    default:
      return [];
  }
}

function shadeSteps(color: Hsv): Hsv[] {
  return SHADE_VALUES.map((v) => ({ h: color.h, s: color.s, v }));
}

function monoSteps(color: Hsv): Hsv[] {
  return [
    { h: color.h, s: clamp(color.s * 0.18, 0.04, 0.3), v: 0.96 },
    { h: color.h, s: clamp(color.s * 0.45, 0.12, 0.55), v: 0.82 },
    { h: color.h, s: clamp(color.s, 0.2, 1), v: clamp(color.v, 0.35, 0.75) },
    { h: color.h, s: clamp(color.s * 0.85, 0.25, 1), v: 0.42 },
    { h: color.h, s: clamp(color.s * 0.7, 0.2, 0.9), v: 0.18 },
  ];
}

/** Drop the step closest to the picked colour; the exact pick takes its place. */
function withoutNearest(steps: Hsv[], picked: string): Hsv[] {
  let nearest = 0;
  let best = Number.POSITIVE_INFINITY;
  steps.forEach((step, index) => {
    const distance = deltaE(hsvToHex(step.h, step.s, step.v), picked);
    if (distance < best) {
      best = distance;
      nearest = index;
    }
  });
  return steps.filter((_, index) => index !== nearest);
}

function uniqueHex(color: Hsv, taken: string[]): string {
  let value = color.v;
  let hex = hsvToHex(color.h, color.s, value);
  for (let i = 0; i < 8 && taken.includes(hex); i++) {
    value = value > 0.5 ? Math.max(0.1, value - 0.08) : Math.min(0.94, value + 0.08);
    hex = hsvToHex(color.h, color.s, value);
  }
  return hex;
}

/**
 * Five colours from a picked hex and a harmony. Colour 1 is always the pick.
 * Hue harmonies are offsets from that pick; Shades and Monochromatic keep the
 * pick and fill the other four steps around it.
 */
export function paletteFromHarmony(hex: string, harmony: HarmonyId): HarmonyColor[] {
  const picked = normalizeHex(hex) ?? "#000000";
  const base = hexToHsv(picked);
  const steps =
    harmony === "shades"
      ? withoutNearest(shadeSteps(base), picked)
      : harmony === "monochromatic"
        ? withoutNearest(monoSteps(base), picked)
        : recipe(harmony, chromatic(base));

  const hexes = [picked];
  for (const step of steps) {
    const next = uniqueHex(step, hexes);
    hexes.push(next);
    if (hexes.length === 5) break;
  }
  return hexes.map((value) => ({ hex: value, name: nearestColorName(value) }));
}
