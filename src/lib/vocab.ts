/* Kept free of Zod so client code (facets, query) can import it without bundling the schema validator. */
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
