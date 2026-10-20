/** 12 spokes × 4 rings — same angles from inner to outer so tiles stack on axes. */
export const ORBIT_SPOKES = 12;
export const ORBIT_RING_COUNT = 4;
export const ORBIT_TARGET = ORBIT_SPOKES * ORBIT_RING_COUNT;

export type OrbitSource = {
  templateId: string;
  industry: string;
};

/**
 * Round-robin across industries so the orbit stays diverse.
 * Order is stable: industries sorted by name, templates in input order.
 */
export function sampleOrbitIds(items: readonly OrbitSource[], count = ORBIT_TARGET): string[] {
  if (items.length === 0) return [];
  const byIndustry = new Map<string, string[]>();
  for (const item of items) {
    const list = byIndustry.get(item.industry) ?? [];
    list.push(item.templateId);
    byIndustry.set(item.industry, list);
  }
  const buckets = [...byIndustry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, list]) => list);

  const picked: string[] = [];
  let round = 0;
  while (picked.length < count) {
    let added = false;
    for (const bucket of buckets) {
      if (round < bucket.length) {
        picked.push(bucket[round]!);
        added = true;
        if (picked.length >= count) break;
      }
    }
    if (!added) break;
    round += 1;
  }
  return picked;
}
