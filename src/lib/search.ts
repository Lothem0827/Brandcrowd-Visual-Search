import MiniSearch from "minisearch";
import type { Template } from "./schema";

/** Weighted fuzzy text search over every textual field of a template. */
export function buildSearchIndex(templates: Template[]) {
  const ms = new MiniSearch<{ id: string } & Record<string, string>>({
    fields: ["title", "tags", "taxonomy", "design", "content", "description"],
    storeFields: [],
    searchOptions: {
      boost: { title: 3, tags: 2.5, taxonomy: 2.5, design: 1.5, content: 1.4, description: 1 },
      fuzzy: 0.2,
      prefix: true,
    },
  });
  ms.addAll(
    templates.map((t) => ({
      id: t.templateId,
      title: `${t.displayTitle} ${t.name}`,
      tags: [...t.tags, ...t.hashtags.map((h) => h.replace(/^#/, ""))].join(" "),
      taxonomy: `${t.industry} ${t.topic} ${t.category}`,
      design: [
        ...t.style.aesthetic, ...t.style.mood, ...t.style.colorScheme, t.style.texture, t.style.era,
        t.typography.headline, t.typography.accent, t.typography.body, ...t.typography.fontStyles, t.typography.case,
        ...t.typography.effects,
        t.layout.structure, t.layout.alignment, t.layout.focalPoint, t.layout.balance, t.layout.whitespace,
        t.layout.textDensity ? `${t.layout.textDensity} text` : null,
        t.imagery.type, t.imagery.subject, t.imagery.placement, t.imagery.frameShape, t.imagery.illustrationStyle,
        ...t.elements, ...t.colors.map((c) => c.name), t.content.type,
      ].filter(Boolean).join(" "),
      content: [t.content.headline, t.content.subheadline, t.content.body, t.content.cta, t.content.footer, t.content.offer]
        .filter(Boolean)
        .join(" "),
      description: t.description,
    })),
  );
  return {
    /**
     * id -> score. A single OR query, then each hit is scaled by the fraction of
     * query terms it actually matched (soft-AND). Full matches rank above partial
     * ones, so a single unmatched word no longer demotes the whole query to an
     * undifferentiated OR dump (the old binary AND→OR fallback).
     */
    search(text: string): Map<string, number> {
      const q = text.trim();
      if (!q) return new Map();
      const terms = q.split(/\s+/).filter(Boolean);
      const res = ms.search(q, { combineWith: "OR" });
      const out = new Map<string, number>();
      for (const r of res) {
        const coverage = r.queryTerms.length / terms.length;
        out.set(String(r.id), r.score * coverage);
      }
      return out;
    },
  };
}
export type SearchIndex = ReturnType<typeof buildSearchIndex>;
