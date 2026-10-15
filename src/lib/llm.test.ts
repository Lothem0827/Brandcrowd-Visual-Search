import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { buildVocab, parseQuery } from "./query";
import {
  AI_FACET_KEYS,
  buildAiVocab,
  buildInterpretPrompt,
  interpretationKey,
  sanitizeInterpretation,
  shouldInterpret,
  type AiFacetKey,
} from "./llm";

const { templates } = parseTemplates(fixture);
const vocab = buildVocab(templates);
const allowed = buildAiVocab(vocab);

describe("buildAiVocab", () => {
  it("only offers facets the interpreter is allowed to emit", () => {
    for (const key of Object.keys(allowed)) {
      expect(AI_FACET_KEYS).toContain(key as AiFacetKey);
    }
    expect(allowed).not.toHaveProperty("tag");
    expect(allowed).not.toHaveProperty("elements");
    expect(allowed).not.toHaveProperty("alignment");
  });

  it("offers only values that exist in the data, most common first", () => {
    const counts = new Map<string, number>();
    for (const t of templates) {
      for (const a of t.style.aesthetic) counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    const values = allowed.aesthetic ?? [];
    expect(values).toContain("bold");
    expect(values[0]).toBe("bold");
    for (let i = 1; i < values.length; i++) {
      expect(counts.get(values[i - 1]) ?? 0).toBeGreaterThanOrEqual(counts.get(values[i]) ?? 0);
    }
  });

  it("keeps 'none' image type available", () => {
    expect(allowed.imageType).toContain("none");
  });
});

describe("sanitizeInterpretation", () => {
  it("canonicalises case and keeps only real vocabulary values", () => {
    const out = sanitizeInterpretation(
      { facets: { industry: ["construction"], aesthetic: ["BOLD"], mood: ["zen"] }, text: "  coffee  ", reason: " reads as bold " },
      allowed,
    );
    expect(out).toEqual({
      facets: { industry: ["Construction"], aesthetic: ["bold"] },
      text: "coffee",
      reason: "reads as bold",
    });
  });

  it("accepts a bare string instead of an array", () => {
    const out = sanitizeInterpretation({ facets: { imageType: "none" } }, allowed);
    expect(out?.facets).toEqual({ imageType: ["none"] });
    expect(out?.text).toBe("");
  });

  it("rejects facets outside the AI vocabulary and values that do not exist", () => {
    expect(sanitizeInterpretation({ facets: { tag: ["coffee"] } }, allowed)).toBeNull();
    expect(sanitizeInterpretation({ facets: { industry: ["Astrology"] } }, allowed)).toBeNull();
    expect(sanitizeInterpretation({ facets: { industry: ["Astrology"] }, text: "" }, allowed)).toBeNull();
  });

  it("accepts keyword-only interpretations", () => {
    expect(sanitizeInterpretation({ text: "espresso latte" }, allowed)).toMatchObject({
      facets: {},
      text: "espresso latte",
    });
  });

  it("caps values per facet and in total", () => {
    const out = sanitizeInterpretation(
      {
        facets: {
          industry: ["Construction", "Real Estate", "Business", "Retail"],
          aesthetic: ["bold", "modern", "corporate", "elegant"],
          mood: ["energetic", "calm", "friendly"],
        },
      },
      allowed,
    );
    for (const values of Object.values(out?.facets ?? {})) {
      expect(values.length).toBeLessThanOrEqual(3);
    }
    const total = Object.values(out?.facets ?? {}).reduce((n, v) => n + v.length, 0);
    expect(total).toBeLessThanOrEqual(6);
  });

  it("returns null for junk", () => {
    expect(sanitizeInterpretation(null, allowed)).toBeNull();
    expect(sanitizeInterpretation("nope", allowed)).toBeNull();
    expect(sanitizeInterpretation({}, allowed)).toBeNull();
  });

  it("produces filters that match real templates", () => {
    const out = sanitizeInterpretation(
      { facets: { industry: ["Construction"], aesthetic: ["bold"] }, text: "" },
      allowed,
    );
    expect(out?.facets).toEqual({ industry: ["Construction"], aesthetic: ["bold"] });
  });
});

describe("shouldInterpret", () => {
  it("fires when words are left over that the vocabulary cannot explain", () => {
    expect(shouldInterpret("make it pop", parseQuery("make it pop", vocab))).toBe(true);
    expect(shouldInterpret("cosy coffee shop vibes", parseQuery("cosy coffee shop vibes", vocab))).toBe(true);
  });

  it("stays out of the way when the parser already understood everything", () => {
    expect(shouldInterpret("bold design", parseQuery("bold design", vocab))).toBe(false);
    expect(shouldInterpret("construction full-bleed photo", parseQuery("construction full-bleed photo", vocab))).toBe(false);
  });

  it("ignores very short input", () => {
    expect(shouldInterpret("x", parseQuery("x", vocab))).toBe(false);
    expect(shouldInterpret("", parseQuery("", vocab))).toBe(false);
  });
});

describe("buildInterpretPrompt", () => {
  const prompt = buildInterpretPrompt("make it pop", "Instagram Post", allowed);

  it("lists only the facets it was given values for", () => {
    expect(prompt.system).toContain("industry: ");
    expect(prompt.system).toContain("aesthetic: ");
    expect(prompt.system).not.toContain("elements:");
    expect(prompt.system).toContain("Never invent a value");
  });

  it("passes the query and category through", () => {
    expect(prompt.user).toBe("Category: Instagram Post\nQuery: make it pop");
  });
});

describe("interpretationKey", () => {
  it("ignores case and whitespace differences", () => {
    expect(interpretationKey("Instagram Post", "  Make   It Pop ")).toBe(
      interpretationKey("Instagram Post", "make it pop"),
    );
  });
});
