import type { Template } from "./schema";
import { mergeDetails, type DetailsMap } from "./data-split";

/**
 * Data access boundary. v1 validates `data/templates.json` at build time
 * (`scripts/build-data.ts`) and serves it as two static, content-hashed JSON files: the
 * core records (fetched on load) and their long-text details (fetched after the tree is up).
 * v2 can swap this for a Supabase-backed implementation that satisfies the same interface.
 */
export interface TemplateRepository {
  all(): Template[];
  byId(id: string): Template | undefined;
  categories(): string[];
  /** true once description, copy lines, hashtags and typography notes are filled in */
  detailsLoaded(): boolean;
  /** load the long-text details (idempotent) */
  ensureDetails(): Promise<void>;
}

export class StaticTemplateRepository implements TemplateRepository {
  private readonly list: Template[];
  private readonly map: Map<string, Template>;
  private details: Promise<void> | null = null;
  private loaded: boolean;
  constructor(
    list: Template[],
    private readonly loadDetails?: () => Promise<DetailsMap>,
  ) {
    this.list = list;
    this.map = new Map(list.map((t) => [t.templateId, t]));
    this.loaded = !loadDetails;
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
  detailsLoaded() {
    return this.loaded;
  }
  ensureDetails() {
    if (!this.loadDetails) return Promise.resolve();
    this.details ??= this.loadDetails().then(
      (map) => {
        mergeDetails(this.list, map);
        this.loaded = true;
      },
      (err) => {
        this.details = null; // allow a retry
        throw err;
      },
    );
    return this.details;
  }
}

async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Couldn't load templates (HTTP ${res.status})`);
  return (await res.json()) as T;
}

/** Fetch the prebuilt core dataset (already validated and normalised at build time). */
export async function fetchTemplateRepository(url: string, detailsUrl?: string, signal?: AbortSignal): Promise<TemplateRepository> {
  const list = await getJson<unknown>(url, signal);
  if (!Array.isArray(list)) throw new Error("Template data is malformed");
  return new StaticTemplateRepository(list as Template[], detailsUrl ? () => getJson<DetailsMap>(detailsUrl) : undefined);
}
