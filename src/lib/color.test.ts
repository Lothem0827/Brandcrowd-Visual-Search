import { describe, expect, it } from "vitest";
import { rgbToHsv, hexToHsv, hsvToHex, colorMatchDistance, paletteMatchesColors, normalizeHex } from "./color";

describe("HSV helpers", () => {
  it("round-trips primary hues", () => {
    expect(hsvToHex(0, 1, 1)).toBe("#FF0000");
    expect(hsvToHex(120, 1, 1)).toBe("#00FF00");
    expect(hsvToHex(240, 1, 1)).toBe("#0000FF");
    expect(hsvToHex(0, 0, 1)).toBe("#FFFFFF");
    expect(hsvToHex(0, 0, 0)).toBe("#000000");
  });

  it("survives a hex -> hsv -> hex trip", () => {
    for (const hex of ["#F07B22", "#123456", "#FAFAF7", "#6B4226"]) {
      const h = hexToHsv(hex);
      expect(hsvToHex(h.h, h.s, h.v)).toBe(hex);
    }
  });

  it("reports hue, saturation and value", () => {
    const h = rgbToHsv(255, 128, 0);
    expect(h.h).toBeCloseTo(30, 0);
    expect(h.s).toBeCloseTo(1, 1);
    expect(h.v).toBeCloseTo(1, 2);
  });
});

describe("multi-colour OR matching", () => {
  const palette = [
    { hex: "#1E1E17", role: "background" },
    { hex: "#F27C31", role: "primary" },
    { hex: "#9D958D", role: "accent" },
  ];

  it("matches when any picked colour is close", () => {
    // one hit is enough...
    expect(paletteMatchesColors(["#F27C31"], palette, "any", 0.13)).toBe(true);
    // ...even when it is bundled with misses
    expect(paletteMatchesColors(["#0000FF", "#F27C31"], palette, "any", 0.13)).toBe(true);
    // all misses -> no match
    expect(paletteMatchesColors(["#0000FF", "#00FF00"], palette, "any", 0.13)).toBe(false);
  });

  it("matches everything when nothing is picked", () => {
    expect(paletteMatchesColors([], palette, "any", 0.13)).toBe(true);
  });

  it("honours the role mode", () => {
    // orange is the primary, so a primary-only match passes but background-only does not
    expect(colorMatchDistance("#F27C31", palette, "primary")).toBeLessThan(0.02);
    expect(colorMatchDistance("#F27C31", palette, "background")).toBeGreaterThan(0.13);
    expect(paletteMatchesColors(["#F27C31"], palette, "background", 0.13)).toBe(false);
    expect(paletteMatchesColors(["#25231C"], palette, "background", 0.13)).toBe(true);
  });
});

describe("normalizeHex", () => {
  it("expands short hex and uppercases", () => {
    expect(normalizeHex("#abc")).toBe("#AABBCC");
    expect(normalizeHex("f07b22")).toBe("#F07B22");
    expect(normalizeHex("nope")).toBeNull();
  });
});
