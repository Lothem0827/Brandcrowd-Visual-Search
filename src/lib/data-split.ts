import type { Template } from "./schema";

/**
 * The dataset is shipped in two files so the tree can render sooner:
 *  - core: everything needed to filter, group, rank and draw the tree (~half the bytes)
 *  - details: long text only shown in the details panel or used by the text index
 *    (description, hashtags, copy lines, typography notes, focal point, reading order,
 *    the 600px preview URL and the design.com link).
 */
export interface TemplateDetails {
  url: string;
  previewImage: string;
  description: string;
  hashtags: string[];
  content: Pick<Template["content"], "headline" | "subheadline" | "body" | "footer">;
  typography: Pick<Template["typography"], "headline" | "accent" | "body">;
  layout: Pick<Template["layout"], "focalPoint" | "hierarchy">;
}
export type DetailsMap = Record<string, TemplateDetails>;

export function splitTemplate(t: Template): { core: Template; details: TemplateDetails } {
  const details: TemplateDetails = {
    url: t.url,
    previewImage: t.previewImage,
    description: t.description,
    hashtags: t.hashtags,
    content: { headline: t.content.headline, subheadline: t.content.subheadline, body: t.content.body, footer: t.content.footer },
    typography: { headline: t.typography.headline, accent: t.typography.accent, body: t.typography.body },
    layout: { focalPoint: t.layout.focalPoint, hierarchy: t.layout.hierarchy },
  };
  const core: Template = {
    ...t,
    url: "",
    previewImage: "",
    description: "",
    hashtags: [],
    content: { ...t.content, headline: null, subheadline: null, body: null, footer: null },
    typography: { ...t.typography, headline: null, accent: null, body: null },
    layout: { ...t.layout, focalPoint: null, hierarchy: [] },
  };
  return { core, details };
}

/**
 * Fill detail fields back into core records, in place (the same objects are referenced by
 * the tree, boards and memoised filters, none of which depend on these fields).
 * Returns how many records were completed.
 */
export function mergeDetails(templates: Template[], details: DetailsMap): number {
  let n = 0;
  for (const t of templates) {
    const d = details[t.templateId];
    if (!d) continue;
    t.url = d.url;
    t.previewImage = d.previewImage;
    t.description = d.description;
    t.hashtags = d.hashtags;
    Object.assign(t.content, d.content);
    Object.assign(t.typography, d.typography);
    Object.assign(t.layout, d.layout);
    n++;
  }
  return n;
}
