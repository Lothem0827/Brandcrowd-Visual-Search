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

const PAGE_SIZE = 1000;
const PARALLEL_PAGES = 6;

type PageResult<T> = { data: T[] | null; error: unknown; count?: number | null };

/**
 * Every row of a table, PAGE_SIZE at a time. The first page also asks for the row count, so
 * the remaining pages load in parallel instead of one round trip after another. `fetchPage`
 * must order by a unique key, or pages can overlap.
 */
export async function fetchAllRows<T>(
  fetchPage: (from: number, to: number, withCount: boolean) => PromiseLike<PageResult<T>>,
): Promise<T[]> {
  const first = await fetchPage(0, PAGE_SIZE - 1, true);
  if (first.error) throw first.error;
  const rows = first.data ?? [];
  if (first.count == null) {
    for (let from = PAGE_SIZE, last = rows; last.length === PAGE_SIZE; from += PAGE_SIZE) {
      const page = await fetchPage(from, from + PAGE_SIZE - 1, false);
      if (page.error) throw page.error;
      last = page.data ?? [];
      rows.push(...last);
    }
    return rows;
  }
  // A project max-rows setting below PAGE_SIZE shortens the first page; step by what came back.
  const step = rows.length || PAGE_SIZE;
  const starts: number[] = [];
  for (let from = rows.length; from < first.count; from += step) starts.push(from);
  const pages: T[][] = [];
  let next = 0;
  const worker = async () => {
    while (next < starts.length) {
      const i = next++;
      const page = await fetchPage(starts[i], starts[i] + step - 1, false);
      if (page.error) throw page.error;
      pages[i] = page.data ?? [];
    }
  };
  await Promise.all(Array.from({ length: Math.min(PARALLEL_PAGES, starts.length) }, worker));
  return rows.concat(...pages);
}

export class SupabaseTemplateRepository implements TemplateRepository {
  private list: Template[] = [];
  private map = new Map<string, Template>();
  private details: Promise<void> | null = null;
  private loaded = false;

  constructor(private supabase: SupabaseClient<Database>) {}

  async loadCore() {
    const rows = await fetchAllRows((from, to, withCount) =>
      this.supabase
        .from("templates")
        .select("data", withCount ? { count: "exact" } : undefined)
        .order("template_id")
        .range(from, to),
    );
    const all: Template[] = [];
    for (const row of rows) {
      const t = asTemplate(row.data);
      if (t) all.push(t);
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
    const rows = await fetchAllRows((from, to, withCount) =>
      this.supabase
        .from("template_details")
        .select("template_id, data", withCount ? { count: "exact" } : undefined)
        .order("template_id")
        .range(from, to),
    );
    const map: DetailsMap = {};
    for (const row of rows) map[row.template_id] = row.data as unknown as TemplateDetails;
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
