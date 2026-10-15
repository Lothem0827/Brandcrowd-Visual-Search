import raw from "../../data/templates.json";
import { StaticTemplateRepository, type TemplateRepository } from "./data";
import { parseTemplates } from "./schema";

/**
 * Server-only access to the full dataset (used by API routes such as /api/interpret).
 * The browser never imports this file: it loads the prebuilt JSON from public/data instead.
 */
let repo: TemplateRepository | null = null;

export function serverTemplateRepository(): TemplateRepository {
  repo ??= new StaticTemplateRepository(parseTemplates(raw).templates);
  return repo;
}