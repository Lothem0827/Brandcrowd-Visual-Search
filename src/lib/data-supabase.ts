import type { SupabaseClient } from "@supabase/supabase-js";
import type { DetailsMap, TemplateDetails } from "./data-split";
import { mergeDetails } from "./data-split";
import type { TemplateRepository } from "./data";
import type { Template } from "./schema";
import type { Database, Json } from "./supabase/database.types";

function asTemplate(data: Json): Template | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  return data as unknown as Template;
}

export class SupabaseTemplateRepository implements TemplateRepository {
  private list: Template[] = [];
  private map = new Map<string, Template>();
  private details: Promise<void> | null = null;
  private loaded = false;

  constructor(private supabase: SupabaseClient<Database>) {}

  async loadCore() {
    const pageSize = 1000;
    let from = 0;
    const all: Template[] = [];
    for (;;) {
      const { data, error } = await this.supabase
        .from("templates")
        .select("data")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        const t = asTemplate(row.data);
        if (t) all.push(t);
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    this.list = all;
    this.map = new Map(all.map((t) => [t.templateId, t]));
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
    this.details ??= this.fetchDetails().then(
      (map) => {
        mergeDetails(this.list, map);
        this.loaded = true;
      },
      (err) => {
        this.details = null;
        throw err;
      },
    );
    return this.details;
  }

  private async fetchDetails(): Promise<DetailsMap> {
    const pageSize = 1000;
    let from = 0;
    const map: DetailsMap = {};
    for (;;) {
      const { data, error } = await this.supabase
        .from("template_details")
        .select("template_id, data")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      const rows = data ?? [];
      for (const row of rows) {
        map[row.template_id] = row.data as unknown as TemplateDetails;
      }
      if (rows.length < pageSize) break;
      from += pageSize;
    }
    return map;
  }
}

export async function fetchSupabaseTemplateRepository(
  supabase: SupabaseClient<Database>,
): Promise<TemplateRepository> {
  const repo = new SupabaseTemplateRepository(supabase);
  await repo.loadCore();
  return repo;
}
