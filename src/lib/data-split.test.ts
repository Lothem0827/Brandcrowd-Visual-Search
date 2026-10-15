import { describe, expect, it } from "vitest";
import fixture from "../../tests/fixtures/templates.fixture.json";
import { parseTemplates } from "./schema";
import { mergeDetails, splitTemplate, type DetailsMap } from "./data-split";
import { StaticTemplateRepository } from "./data";

const { templates } = parseTemplates(fixture);

describe("core/details split", () => {
  it("round-trips every record exactly", () => {
    const originals = structuredClone(templates);
    const cores = templates.map((t) => splitTemplate(t));
    const list = cores.map((c) => c.core);
    const details: DetailsMap = Object.fromEntries(cores.map((c, i) => [templates[i].templateId, c.details]));
    expect(list[0].description).toBe("");
    expect(mergeDetails(list, details)).toBe(templates.length);
    expect(list).toEqual(originals);
  });

  it("keeps every field used for filtering in the core record", () => {
    const t = templates.find((x) => x.content.cta)!;
    const { core } = splitTemplate(t);
    expect(core.content.cta).toBe(t.content.cta);
    expect(core.content.type).toBe(t.content.type);
    expect(core.tags).toEqual(t.tags);
    expect(core.colors).toEqual(t.colors);
    expect(core.layout.structure).toBe(t.layout.structure);
    expect(core.typography.fontStyles).toEqual(t.typography.fontStyles);
    expect(core.thumbnailImage).toBe(t.thumbnailImage);
    expect(core.previewImage).toBe("");
  });

  it("repository loads details once, on demand", async () => {
    const parts = templates.map((t) => splitTemplate(structuredClone(t)));
    let calls = 0;
    const repo = new StaticTemplateRepository(
      parts.map((p) => p.core),
      async () => {
        calls++;
        return Object.fromEntries(parts.map((p) => [p.core.templateId, p.details]));
      },
    );
    expect(repo.detailsLoaded()).toBe(false);
    await Promise.all([repo.ensureDetails(), repo.ensureDetails()]);
    expect(calls).toBe(1);
    expect(repo.detailsLoaded()).toBe(true);
    expect(repo.byId(templates[0].templateId)?.description).toBe(templates[0].description);
  });
});
