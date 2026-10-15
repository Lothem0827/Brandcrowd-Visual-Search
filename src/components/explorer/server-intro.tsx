import type { DataManifest } from "@/lib/data-manifest";
import { SITE_DESCRIPTION } from "@/lib/site";

/**
 * Server-rendered content shown while the explorer's data and code download. Gives crawlers,
 * no-JS visitors and slow connections real content (and an early LCP) instead of a spinner.
 */
export function ServerIntro({ manifest }: { manifest: DataManifest }) {
  const industries = manifest.industries ?? [];
  return (
    <main className="flex h-full flex-col items-center justify-center overflow-y-auto bg-canvas px-6 py-10">
      <div className="w-full max-w-2xl">
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
          Explore {manifest.count.toLocaleString("en-US")} Instagram post templates
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-pretty text-muted-foreground sm:text-base">{SITE_DESCRIPTION}</p>
        <div className="mt-5 flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          Loading the explorer…
        </div>
        {industries.length > 0 && (
          <section className="mt-8" aria-labelledby="industries-heading">
            <h2 id="industries-heading" className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Industries
            </h2>
            <ul className="mt-3 flex flex-wrap gap-2">
              {industries.map((i) => (
                <li key={i.name} className="rounded-full border bg-background px-3 py-1 text-xs">
                  {i.name} <span className="text-muted-foreground tabular-nums">{i.count.toLocaleString("en-US")}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <noscript>
          <p className="mt-6 text-sm font-medium">The visual explorer needs JavaScript. Please enable it to browse templates.</p>
        </noscript>
      </div>
    </main>
  );
}
