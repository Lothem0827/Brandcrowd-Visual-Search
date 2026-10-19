/**
 * Upsert the built template catalogue into Supabase.
 *
 * Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 * Run after `pnpm data` so data/templates.json is current:
 *   pnpm seed:templates
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitTemplate } from "../src/lib/data-split";
import { parseTemplates } from "../src/lib/schema";
import type { Database } from "../src/lib/supabase/database.types";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
  }

  const raw = JSON.parse(readFileSync(resolve("data/templates.json"), "utf8"));
  const { templates, errors } = parseTemplates(raw);
  if (errors.length) console.warn(`Skipped ${errors.length} invalid records`);

  const supabase = createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const batchSize = 200;
  for (let i = 0; i < templates.length; i += batchSize) {
    const slice = templates.slice(i, i + batchSize);
    const coreRows = slice.map((t) => {
      const { core } = splitTemplate(t);
      return {
        template_id: t.templateId,
        slug: t.slug,
        category: t.category,
        industry: t.industry,
        topic: t.topic,
        name: t.name,
        display_title: t.displayTitle,
        data: core as unknown as Database["public"]["Tables"]["templates"]["Insert"]["data"],
      };
    });
    const detailRows = slice.map((t) => {
      const { details } = splitTemplate(t);
      return {
        template_id: t.templateId,
        data: details as unknown as Database["public"]["Tables"]["template_details"]["Insert"]["data"],
      };
    });

    const { error: e1 } = await supabase.from("templates").upsert(coreRows);
    if (e1) throw e1;
    const { error: e2 } = await supabase.from("template_details").upsert(detailRows);
    if (e2) throw e2;
    console.log(`Upserted ${Math.min(i + batchSize, templates.length)} / ${templates.length}`);
  }
  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
