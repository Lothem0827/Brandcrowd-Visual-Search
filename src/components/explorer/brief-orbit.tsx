"use client";
import { useMemo } from "react";
import { templateImageUrl } from "@/lib/images";
import type { Template } from "@/lib/schema";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { ThumbImage } from "./thumb-image";
import { useEffectiveGridSettings } from "./use-grid-settings";

/** 12 spokes × 4 rings — same angles from inner to outer so tiles stack on axes. */
const SPOKES = 12;
const RING_COUNT = 4;
const TARGET = SPOKES * RING_COUNT;
/** Inner → outer: slightly faster inside for a parallax stagger. */
const ORBIT_DURATIONS = ["120s", "140s", "165s", "190s"] as const;

type OrbitTile = {
  id: string;
  angle: number;
  size: number;
  /** Distance from center; fixed per ring so spokes stay clean. */
  radius: string;
  /** Small face tilt (~±4°) — enough life without breaking axis lock. */
  jitter: number;
};

type OrbitRing = {
  opacity: number;
  duration: string;
  tiles: OrbitTile[];
};

/** Round-robin across industries so the orbit stays diverse and SSR/client match. */
function sampleOrbitTemplates(
  templates: Template[],
  count = TARGET,
): Template[] {
  if (templates.length === 0) return [];
  const byIndustry = new Map<string, Template[]>();
  for (const template of templates) {
    const list = byIndustry.get(template.industry) ?? [];
    list.push(template);
    byIndustry.set(template.industry, list);
  }
  const buckets = [...byIndustry.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, list]) => list);

  const picked: Template[] = [];
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

function buildRings(templates: Template[]): OrbitRing[] {
  const radiusBases = [18, 26, 34, 44] as const;
  /** Inner rings stay compact; outer rings read larger for depth. */
  const sizeBases = [48, 60, 74, 90] as const;
  const opacities = [0.95, 0.85, 0.72, 0.58] as const;
  const rings: OrbitRing[] = [];
  let offset = 0;

  for (let ringIndex = 0; ringIndex < RING_COUNT; ringIndex += 1) {
    const slice = templates.slice(offset, offset + SPOKES);
    offset += SPOKES;
    if (slice.length === 0) continue;

    const base = radiusBases[ringIndex]!;
    const sizeBase = sizeBases[ringIndex]!;

    const tiles = slice.map((template, index) => {
      const global = offset - SPOKES + index;
      // Shared spoke angle across all rings — inner→outer align on the same ray.
      return {
        id: template.templateId,
        angle: (360 / SPOKES) * index,
        size: sizeBase,
        radius: `${base}vmax`,
        jitter: -4 + ((global * 13) % 9),
      };
    });

    rings.push({
      opacity: opacities[ringIndex]!,
      duration: ORBIT_DURATIONS[ringIndex]!,
      tiles,
    });
  }

  return rings;
}

export function BriefOrbit() {
  const { base } = useExplorer();
  const { radius } = useEffectiveGridSettings();
  const rings = useMemo(() => buildRings(sampleOrbitTemplates(base)), [base]);
  const tileRadius = radius / 2;

  if (rings.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        maskImage:
          "radial-gradient(circle at center, transparent 0%, transparent 14%, black 36%)",
        WebkitMaskImage:
          "radial-gradient(circle at center, transparent 0%, transparent 14%, black 36%)",
      }}
    >
      {rings.map((ring, ringIndex) => (
        <div
          key={ringIndex}
          className={cn(
            "absolute top-1/2 left-1/2 size-[120vmax] -translate-x-1/2 -translate-y-1/2 animate-orbit",
            "motion-reduce:animate-none",
          )}
          style={{ animationDuration: ring.duration }}
        >
          {ring.tiles.map((tile) => (
            <div
              key={tile.id}
              className="absolute top-1/2 left-1/2"
              style={{
                width: tile.size,
                height: tile.size,
                marginLeft: -tile.size / 2,
                marginTop: -tile.size / 2,
                transform: `rotate(${tile.angle}deg) translate(${tile.radius}) rotate(${90 + tile.jitter}deg)`,
                opacity: ring.opacity,
              }}
            >
              <div
                className="size-full overflow-hidden bg-muted ring-1 ring-foreground/10"
                style={{ borderRadius: tileRadius }}
              >
                <ThumbImage
                  src={templateImageUrl(tile.id)}
                  alt=""
                  className="size-full object-cover"
                />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
