import type { DataManifest } from "@/lib/data-manifest";
import { OrbitField } from "./orbit-field";

/**
 * Server-rendered content shown while the explorer's data and code download. Gives crawlers,
 * no-JS visitors and slow connections real content (and an early LCP) instead of a spinner.
 */
export function ServerIntro({ manifest }: { manifest: DataManifest }) {
  const count = manifest.count.toLocaleString("en-US");
  const orbitIds = manifest.orbitIds ?? [];
  return (
    <main className="relative flex h-full flex-col items-center justify-center overflow-hidden bg-canvas px-4">
      {orbitIds.length > 0 && <OrbitField ids={orbitIds} />}
      <div className="relative z-10 flex w-full max-w-[640px] flex-col items-center gap-4 text-center">
        <h1 className="w-full text-4xl font-semibold tracking-tight text-balance sm:text-6xl">
          Find your next design inspiration
        </h1>
        <p className="max-w-sm text-sm text-pretty text-muted-foreground sm:text-base">
          {count} Instagram post templates to search by industry, style, layout, and color.
        </p>
      </div>
      <noscript>
        <p className="relative z-10 mt-6 max-w-sm text-center text-sm font-medium">
          The visual explorer needs JavaScript. Please enable it to browse templates.
        </p>
      </noscript>
    </main>
  );
}
