import raw from "../../data/templates.json";
import { parseTemplates, type Template } from "./schema";

/**
 * Data access boundary. v1 ships the dataset as a static JSON file bundled
 * with the app. v2 can swap this for a Supabase-backed implementation that
 * satisfies the same interface.
 */
export interface TemplateRepository {
  all(): Template[];
  byId(id: string): Template | undefined;
  categories(): string[];
}

class StaticTemplateRepository implements TemplateRepository {
  private readonly list: Template[];
  private readonly map: Map<string, Template>;
  constructor(list: Template[]) {
    this.list = list;
    this.map = new Map(list.map((t) => [t.templateId, t]));
  }
  all() {
    return this.list;
  }
  byId(id: string) {
    return this.map.get(id);
  }
  categories() {
    return Array.from(new Set(this.list.map((t) => t.category))).sort();
  }
}

const parsed = parseTemplates(raw);
if (parsed.errors.length && process.env.NODE_ENV !== "production") {
  console.warn(`[templates] skipped ${parsed.errors.length} invalid record(s):\n` + parsed.errors.slice(0, 10).join("\n"));
}

export const templateRepository: TemplateRepository = new StaticTemplateRepository(parsed.templates);
export const dataStats = { loaded: parsed.templates.length, skipped: parsed.errors.length };
