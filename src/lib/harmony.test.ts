import { describe, expect, it } from "vitest";
import { hexToHsv } from "./color";
import { HARMONIES, paletteFromHarmony, type HarmonyId } from "./harmony";

const PICK = "#E4572E";

const hueDelta = (hex: string, target: number) => {
  const d = Math.abs(hexToHsv(hex).h - target) % 360;
  return d > 180 ? 360 - d : d;
};

const expectHue = (hex: string, target: number) => {
  expect(hueDelta(hex, ((target % 360) + 360) % 360)).toBeLessThan(2);
};

describe("paletteFromHarmony", () => {
  const base = hexToHsv(PICK);

  const offsets: Record<Exclude<HarmonyId, "shades" | "monochromatic">, number[]> = {
    analogous: [-30, -15, 15, 30],
    complementary: [0, 180, 180, 0],
    "split-complementary": [150, 210, 150, 210],
    triad: [120, 240, 0, 0],
    square: [90, 180, 270, 0],
    compound: [30, 180, 210, 0],
  };

  it.each(HARMONIES.map((item) => item.id))("returns five distinct colours for %s", (harmony) => {
    const palette = paletteFromHarmony(PICK, harmony);
    expect(palette).toHaveLength(5);
    expect(palette[0].hex).toBe(PICK);
    expect(new Set(palette.map((color) => color.hex)).size).toBe(5);
    for (const color of palette) {
      expect(color.hex).toMatch(/^#[0-9A-F]{6}$/);
      expect(color.name.length).toBeGreaterThan(0);
    }
  });

  it.each(Object.entries(offsets) as [keyof typeof offsets, number[]][])(
    "places %s on the expected hues",
    (harmony, shifts) => {
      const palette = paletteFromHarmony(PICK, harmony);
      shifts.forEach((shift, index) => {
        expectHue(palette[index + 1].hex, base.h + shift);
      });
    },
  );

  it("keeps shades on the picked hue, light through dark, with the pick first", () => {
    const palette = paletteFromHarmony(PICK, "shades");
    expect(palette[0].hex).toBe(PICK);
    for (const color of palette.slice(1)) expectHue(color.hex, base.h);
    const values = palette.slice(1).map((color) => hexToHsv(color.hex).v);
    expect(values[0]).toBeGreaterThan(values[values.length - 1]);
  });

  it("keeps a monochromatic set on the picked hue", () => {
    const palette = paletteFromHarmony(PICK, "monochromatic");
    for (const color of palette) expectHue(color.hex, base.h);
    const values = palette.map((color) => hexToHsv(color.hex).v);
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.3);
  });

  it("still separates a neutral pick into five colours", () => {
    const palette = paletteFromHarmony("#808080", "analogous");
    expect(palette[0].hex).toBe("#808080");
    expect(new Set(palette.map((color) => color.hex)).size).toBe(5);
  });
});
