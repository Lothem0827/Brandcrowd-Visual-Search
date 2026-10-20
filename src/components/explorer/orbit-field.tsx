import { templateThumbSmUrl } from "@/lib/images";
import { ORBIT_RING_COUNT, ORBIT_SPOKES } from "@/lib/orbit";
import { cn } from "@/lib/utils";

/** Half of the default grid corner radius, so tiles match a fresh visit. */
const DEFAULT_TILE_RADIUS = 6;
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

function buildRings(ids: readonly string[]): OrbitRing[] {
  const radiusBases = [18, 26, 34, 44] as const;
  /** Inner rings stay compact; outer rings read larger for depth. */
  const sizeBases = [48, 60, 74, 90] as const;
  const opacities = [0.95, 0.85, 0.72, 0.58] as const;
  const rings: OrbitRing[] = [];
  let offset = 0;

  for (let ringIndex = 0; ringIndex < ORBIT_RING_COUNT; ringIndex += 1) {
    const slice = ids.slice(offset, offset + ORBIT_SPOKES);
    offset += ORBIT_SPOKES;
    if (slice.length === 0) continue;

    const base = radiusBases[ringIndex]!;
    const sizeBase = sizeBases[ringIndex]!;

    const tiles = slice.map((id, index) => {
      const global = offset - ORBIT_SPOKES + index;
      // Shared spoke angle across all rings — inner→outer align on the same ray.
      return {
        id,
        angle: (360 / ORBIT_SPOKES) * index,
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

/** Decorative template tiles spinning behind a centered headline. */
export function OrbitField({
  ids,
  tileRadius = DEFAULT_TILE_RADIUS,
}: {
  ids: readonly string[];
  tileRadius?: number;
}) {
  const rings = buildRings(ids);
  if (rings.length === 0) return null;

  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{
        maskImage: "radial-gradient(circle at center, transparent 0%, transparent 14%, black 36%)",
        WebkitMaskImage: "radial-gradient(circle at center, transparent 0%, transparent 14%, black 36%)",
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
              {/* A background, not an <img>: it loads behind the app's scripts and a missing
                  thumbnail leaves the muted tile instead of a broken-image icon. */}
              <div
                className="size-full bg-muted bg-cover bg-center ring-1 ring-foreground/10"
                style={{ borderRadius: tileRadius, backgroundImage: `url("${templateThumbSmUrl(tile.id)}")` }}
              />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
