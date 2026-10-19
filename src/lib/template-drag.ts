/**
 * Shared drag payload for dropping a design onto a board panel or moodboard inspo.
 * MIME stays `application/x-moodboard-design` so existing drops keep working.
 */

const TEMPLATE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export const TEMPLATE_DRAG_TYPE = "application/x-moodboard-design";

function cleanTemplateId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return TEMPLATE_ID.test(id) ? id : null;
}

/** Read a design id written by a grid tile or the focused image. */
export function readTemplateDrag(data: DataTransfer): string | null {
  return (
    cleanTemplateId(data.getData(TEMPLATE_DRAG_TYPE)) ??
    cleanTemplateId(data.getData("text/plain").replace(/^(moodboard|template):/, ""))
  );
}

export function writeTemplateDrag(data: DataTransfer, templateId: string) {
  const id = cleanTemplateId(templateId);
  if (!id) return;
  data.setData(TEMPLATE_DRAG_TYPE, id);
  data.setData("text/plain", `moodboard:${id}`);
  data.effectAllowed = "copy";
}
