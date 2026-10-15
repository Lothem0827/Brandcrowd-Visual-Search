import { describe, expect, it } from "vitest";
import raw from "../../data/templates.json";
import { parseTemplates, VOCAB } from "./schema";

/** Sanity checks for whatever dataset is in data/templates.json (fixture or real). */
describe("data/templates.json", () => {
  const { templates, errors } = parseTemplates(raw);

  it("parses, with at most 5% invalid records", () => {
    expect(templates.length).toBeGreaterThan(0);
    if (errors.length) console.warn(`${errors.length} invalid record(s):\n${errors.slice(0, 5).join("\n")}`);
    expect(errors.length).toBeLessThanOrEqual(Math.ceil((raw as unknown[]).length * 0.05));
  });

  it("contains no logo templates (single GUID preview URLs)", () => {
    const withLogo = templates.filter((t) => {
      const m = t.previewImage.match(/\/template\/preview\/design\/([^?]+)/);
      return m ? m[1].split("/").filter(Boolean).length > 1 : false;
    });
    expect(withLogo.map((t) => t.slug)).toEqual([]);
  });

  it("reports values outside the controlled vocabularies (informational)", () => {
    const off: Record<string, Set<string>> = {};
    const check = (k: keyof typeof VOCAB, vals: (string | null)[]) => {
      const allowed = new Set<string>((VOCAB[k] as readonly string[]).map((x) => x.toLowerCase()));
      for (const v of vals) if (v && !allowed.has(v.toLowerCase())) (off[k] ??= new Set()).add(v);
    };
    for (const t of templates) {
      check("structure", [t.layout.structure]);
      check("imageType", [t.imagery.type]);
      check("placement", [t.imagery.placement]);
      check("aesthetic", t.style.aesthetic);
      check("mood", t.style.mood);
      check("contentType", [t.content.type]);
      check("fontStyle", t.typography.fontStyles);
    }
    const summary = Object.fromEntries(Object.entries(off).map(([k, v]) => [k, [...v]]));
    if (Object.keys(summary).length) console.info("Out-of-vocab values (still filterable):", summary);
    expect(true).toBe(true);
  });
});
