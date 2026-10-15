import { z } from "zod";

/**
 * Controlled vocabularies from schema.md. Records may contain values outside
 * these lists (the dataset is AI-tagged); the UI shows the union of these
 * values and whatever is actually in the data.
 */
export const VOCAB = {
  imageType: ["photo", "illustration", "none"],
  placement: ["frame", "background", "cutout", "full-bleed", "collage"],
  frameShape: ["circle", "arch", "rounded", "rectangle", "custom curve", "torn paper", "polaroid"],
  illustrationStyle: ["flat", "line art", "hand-drawn", "watercolor", "3D", "cartoon", "vector"],
  structure: [
    "centered stack",
    "centered text block",
    "split",
    "text top image bottom",
    "image top text bottom",
    "full-bleed photo",
    "frame/border",
    "grid",
    "collage",
  ],
  alignment: ["left", "center", "right"],
  balance: ["symmetrical", "asymmetrical"],
  whitespace: ["tight", "balanced", "airy"],
  textDensity: ["low", "medium", "high"],
  fontStyle: ["serif", "sans serif", "script", "display", "condensed"],
  case: ["all caps", "mixed"],
  effects: ["outline", "shadow", "gradient", "curved", "highlight"],
  contentType: [
    "promo", "sale", "quote", "announcement", "event", "tips", "testimonial",
    "hiring", "menu", "service", "product", "greeting", "other",
  ],
  placeholders: ["website", "phone", "email", "address", "social handle", "date", "price"],
  aesthetic: [
    "minimalist", "retro", "luxury", "playful", "corporate", "bold", "elegant", "editorial",
    "organic", "y2k", "modern", "vintage", "grunge", "cute", "brutalist",
  ],
  mood: ["calm", "energetic", "festive", "serious", "romantic", "inspiring", "friendly", "urgent"],
  colorScheme: [
    "warm", "cool", "neutral", "pastel", "neon", "earthy", "monochrome", "high contrast", "low contrast",
  ],
  texture: ["flat", "grain", "paper", "gradient", "glossy", "3D"],
} as const;

const str = z.string().trim();
const optStr = z.string().trim().nullish().transform((v) => (v ? v : null));
const strList = z
  .array(z.string().nullish())
  .nullish()
  .transform((v) => (v ?? []).filter((x): x is string => !!x && x.trim() !== "").map((x) => x.trim()));
/** accept "a" or ["a","b"] */
const strOrList = z
  .union([z.string(), z.array(z.string().nullish())])
  .nullish()
  .transform((v) => {
    if (!v) return [] as string[];
    const arr = Array.isArray(v) ? v : [v];
    return arr.filter((x): x is string => !!x && x.trim() !== "").map((x) => x.trim());
  });

export const ColorSchema = z.object({
  hex: str.regex(/^#?[0-9a-fA-F]{6}$/).transform((h) => (h.startsWith("#") ? h : `#${h}`).toUpperCase()),
  role: str.default("accent"),
  name: str.default(""),
});

export const TemplateSchema = z.object({
  templateId: str,
  slug: str,
  category: str.default("Instagram Post"),
  industry: str.default("Other"),
  topic: str.default("General"),
  name: str,
  displayTitle: str,
  url: str,
  tags: strList,
  hashtags: strList,
  description: z.string().nullish().transform((v) => v ?? ""),
  colors: z.array(ColorSchema).min(1),
  style: z
    .object({
      aesthetic: strOrList,
      mood: strOrList,
      colorScheme: strOrList,
      texture: optStr,
      era: optStr,
    })
    .default({ aesthetic: [], mood: [], colorScheme: [], texture: null, era: null }),
  typography: z
    .object({
      headline: optStr,
      accent: optStr,
      body: optStr,
      fontStyles: strOrList,
      case: optStr,
      effects: strOrList,
    })
    .default({ headline: null, accent: null, body: null, fontStyles: [], case: null, effects: [] }),
  layout: z
    .object({
      structure: str.default("centered stack"),
      alignment: str.default("center"),
      focalPoint: optStr,
      balance: optStr,
      whitespace: optStr,
      textDensity: optStr,
      hierarchy: strList,
    })
    .default({
      structure: "centered stack",
      alignment: "center",
      focalPoint: null,
      balance: null,
      whitespace: null,
      textDensity: null,
      hierarchy: [],
    }),
  imagery: z
    .object({
      type: str.default("none"),
      illustrationStyle: optStr,
      subject: optStr,
      placement: optStr,
      frameShape: optStr,
      count: z.coerce.number().nullish().transform((v) => v ?? 0),
    })
    .default({ type: "none", illustrationStyle: null, subject: null, placement: null, frameShape: null, count: 0 }),
  elements: strList,
  content: z
    .object({
      type: str.default("other"),
      headline: optStr,
      subheadline: optStr,
      body: optStr,
      cta: optStr,
      footer: optStr,
      offer: optStr,
      placeholders: strList,
    })
    .default({
      type: "other",
      headline: null,
      subheadline: null,
      body: null,
      cta: null,
      footer: null,
      offer: null,
      placeholders: [],
    }),
  previewImage: str,
  thumbnailImage: str.optional(),
});

export type TemplateColor = z.infer<typeof ColorSchema>;
export type TemplateInput = z.input<typeof TemplateSchema>;
export type Template = Omit<z.infer<typeof TemplateSchema>, "thumbnailImage"> & { thumbnailImage: string };

/** Parse an unknown array of records, dropping (and reporting) invalid ones. */
export function parseTemplates(raw: unknown): { templates: Template[]; errors: string[] } {
  const errors: string[] = [];
  const templates: Template[] = [];
  const seen = new Set<string>();
  if (!Array.isArray(raw)) return { templates, errors: ["templates.json must be a JSON array"] };
  raw.forEach((rec, i) => {
    const r = TemplateSchema.safeParse(rec);
    if (!r.success) {
      errors.push(`record ${i}: ${r.error.issues.map((x) => `${x.path.join(".")} ${x.message}`).join("; ")}`);
      return;
    }
    const t = r.data;
    if (seen.has(t.templateId)) return;
    seen.add(t.templateId);
    // Normalise vocab-ish values to lower case for consistent filtering.
    const lc = (xs: string[]) => xs.map((x) => (x === "3D" ? x : x.toLowerCase()));
    templates.push({
      ...t,
      thumbnailImage: t.thumbnailImage || t.previewImage,
      style: { ...t.style, aesthetic: lc(t.style.aesthetic), mood: lc(t.style.mood), colorScheme: lc(t.style.colorScheme) },
      typography: { ...t.typography, fontStyles: lc(t.typography.fontStyles), effects: lc(t.typography.effects) },
      layout: { ...t.layout, structure: t.layout.structure.toLowerCase(), alignment: t.layout.alignment.toLowerCase() },
      imagery: { ...t.imagery, type: t.imagery.type.toLowerCase() },
      content: { ...t.content, type: t.content.type.toLowerCase(), placeholders: lc(t.content.placeholders) },
    });
  });
  return { templates, errors };
}
