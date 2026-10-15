"use client";
import { useEffect, useState, type ReactNode } from "react";
import { CheckIcon, CopyIcon, ExternalLinkIcon, XIcon } from "lucide-react";
import { toast } from "sonner";
import type { Template } from "@/lib/schema";
import { cap, type FacetKey } from "@/lib/facets";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { SaveButton } from "./save-button";
import { ImageIcon, LayoutIcon } from "./icons";
import { ThumbImage } from "./thumb-image";

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{children}</h3>
      {hint && <span className="text-[11px] text-muted-foreground">{hint}</span>}
    </div>
  );
}

function FilterPill({ facet, value, label }: { facet: FacetKey; value: string; label?: string }) {
  const { addFacet, effective } = useExplorer();
  const on = (effective.facets[facet] ?? []).includes(value);
  return (
    <button
      type="button"
      onClick={() => {
        addFacet(facet, value);
        toast(`Filter added: ${label ?? value}`);
      }}
      className={cn(
        "h-7 rounded-full px-2.5 text-[12px] transition-colors",
        on ? "bg-foreground text-background" : "bg-panel hover:bg-muted",
      )}
      title="Add as a filter"
    >
      {label ?? value}
    </button>
  );
}

function Row({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[92px_1fr] gap-2 py-1.5 text-[12.5px]">
      <div className="text-muted-foreground">{k}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function DetailPanel({ template: t }: { template: Template }) {
  const { setDetailOpen, detailsReady, detailsError, loadDetails } = useExplorer();
  useEffect(() => {
    if (!detailsReady) loadDetails();
  }, [detailsReady, loadDetails]);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (hex: string) => {
    try {
      await navigator.clipboard.writeText(hex);
    } catch {
      /* clipboard may be unavailable */
    }
    setCopied(hex);
    toast(`Copied ${hex}`);
    setTimeout(() => setCopied(null), 1200);
  };
  const copyLines = [
    ["Headline", t.content.headline],
    ["Subheadline", t.content.subheadline],
    ["Body", t.content.body],
    ["Call to action", t.content.cta],
    ["Footer", t.content.footer],
    ["Offer", t.content.offer],
  ].filter(([, v]) => v) as [string, string][];

  return (
    <aside
      className="thin-scroll absolute top-20 right-4 bottom-4 z-20 w-[400px] max-w-[90vw] overflow-y-auto rounded-2xl bg-background max-md:inset-x-0 max-md:top-14 max-md:bottom-0 max-md:w-auto max-md:max-w-none max-md:rounded-b-none max-md:shadow-[0_-8px_24px_rgb(0_0_0/0.12)]"
      aria-label="Design details"
      data-testid="detail-panel"
    >
      <div className="sticky top-0 z-10 flex items-center justify-between rounded-t-2xl bg-background/95 px-5 py-3 backdrop-blur">
        <div className="flex min-w-0 items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="size-1.5 rounded-full bg-[#F0812F]" />
          <span className="truncate">
            {t.category} › {t.industry} › {t.topic}
          </span>
        </div>
        <button type="button" aria-label="Close details (Esc)" onClick={() => setDetailOpen(false)} className="grid size-7 place-items-center rounded-lg bg-panel hover:bg-muted max-md:size-9">
          <XIcon className="size-3.5" />
        </button>
      </div>
      <div className="space-y-6 p-5">
        <div>
          <div className="aspect-square w-full overflow-hidden rounded-xl ring-1 ring-black/5">
            <ThumbImage
              key={t.previewImage || t.thumbnailImage}
              src={t.previewImage || t.thumbnailImage}
              alt={t.displayTitle}
              eager
              retryButton
              className="aspect-square w-full bg-muted bg-cover object-cover"
              style={{ backgroundImage: `url("${t.thumbnailImage}")` }}
            />
          </div>
          <div className="mt-4 text-[10.5px] font-medium tracking-[0.12em] text-muted-foreground uppercase">{t.category}</div>
          <h2 className="mt-1 text-[19px] leading-tight font-semibold tracking-tight">{t.displayTitle}</h2>
          <div className="mt-1 text-[12.5px] text-muted-foreground">Template name · {t.name}</div>
          {detailsReady ? (
            t.description && <p className="mt-2 text-[13px] leading-relaxed text-foreground/80">{t.description}</p>
          ) : detailsError ? (
            <p className="mt-2 text-[12.5px] text-muted-foreground" role="alert">
              Couldn&apos;t load the description and copy ideas.{" "}
              <button type="button" onClick={loadDetails} className="font-medium text-foreground underline underline-offset-2">
                Retry
              </button>
            </p>
          ) : (
            <div className="mt-2 space-y-1.5" role="status" aria-label="Loading details">
              <div className="h-3 w-full animate-pulse rounded bg-muted" />
              <div className="h-3 w-4/5 animate-pulse rounded bg-muted" />
            </div>
          )}
          <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
            {t.url ? (
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground text-sm font-medium text-background hover:bg-foreground/85"
              >
                <ExternalLinkIcon className="size-4" /> Open on design.com
              </a>
            ) : (
              <span
                aria-disabled="true"
                className="flex h-10 items-center justify-center gap-2 rounded-xl bg-foreground/60 text-sm font-medium text-background"
              >
                <ExternalLinkIcon className="size-4" /> Open on design.com
              </span>
            )}
            <SaveButton templateId={t.templateId} className="w-[150px]" />
          </div>
        </div>

        <section>
          <Label hint="Click a swatch to copy">Colors</Label>
          <div className="grid grid-cols-3 gap-2">
            {t.colors.map((c) => (
              <button
                key={c.hex + c.role}
                type="button"
                onClick={() => copy(c.hex)}
                className="group overflow-hidden rounded-xl bg-panel text-left ring-1 ring-black/5 transition-colors hover:bg-muted"
                aria-label={`Copy ${c.hex} (${c.role}, ${c.name})`}
              >
                <div className="relative h-14" style={{ background: c.hex }}>
                  <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-md bg-white/85 text-black opacity-0 transition-opacity group-hover:opacity-100">
                    {copied === c.hex ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                  </span>
                </div>
                <div className="px-2 py-1.5">
                  <div className="font-mono text-[12px] font-semibold">{c.hex}</div>
                  <div className="truncate text-[10.5px] text-muted-foreground">
                    {cap(c.role)} · {c.name}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        <section>
          <Label>Style</Label>
          <div className="flex flex-wrap gap-1.5">
            {t.style.aesthetic.map((v) => <FilterPill key={v} facet="aesthetic" value={v} label={cap(v)} />)}
            {t.style.mood.map((v) => <FilterPill key={v} facet="mood" value={v} label={cap(v)} />)}
            {t.style.colorScheme.map((v) => <FilterPill key={v} facet="colorScheme" value={v} label={v} />)}
            {t.style.texture && <FilterPill facet="texture" value={t.style.texture} label={`${t.style.texture} texture`} />}
          </div>
        </section>

        <section>
          <Label>Layout</Label>
            <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <LayoutIcon value={t.layout.structure} className="size-10 text-foreground/70" />
            <div className="min-w-0 text-[13px]">
              <div className="font-semibold">{cap(t.layout.structure)}</div>
              <div className="text-[12px] text-muted-foreground">
                {[t.layout.alignment && `${t.layout.alignment} aligned`, t.layout.balance, t.layout.whitespace && `${t.layout.whitespace} spacing`, t.layout.textDensity && `${t.layout.textDensity} text`]
                  .filter(Boolean)
                  .join(" · ")}
              </div>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            {t.layout.focalPoint && <Row k="Focal point">{t.layout.focalPoint}</Row>}
            {t.layout.hierarchy.length > 0 && (
              <Row k="Reading order">
                <ol className="flex flex-wrap items-center gap-1">
                  {t.layout.hierarchy.map((h, i) => (
                    <li key={h + i} className="flex items-center gap-1">
                      {i > 0 && <span className="text-muted-foreground">→</span>}
                      <span>{h}</span>
                    </li>
                  ))}
                </ol>
              </Row>
            )}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <FilterPill facet="structure" value={t.layout.structure} label={cap(t.layout.structure)} />
            <FilterPill facet="alignment" value={t.layout.alignment} label={`${cap(t.layout.alignment)} aligned`} />
            {t.layout.textDensity && <FilterPill facet="textDensity" value={t.layout.textDensity} label={`${cap(t.layout.textDensity)} text`} />}
          </div>
        </section>

        <section>
          <Label>Typography</Label>
          <div className="space-y-1">
            {t.typography.headline && <Row k="Headline">{t.typography.headline}</Row>}
            {t.typography.accent && <Row k="Accent">{t.typography.accent}</Row>}
            {t.typography.body && <Row k="Body">{t.typography.body}</Row>}
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {t.typography.fontStyles.map((v) => <FilterPill key={v} facet="fontStyle" value={v} label={cap(v)} />)}
            {t.typography.case && <FilterPill facet="case" value={t.typography.case} label={cap(t.typography.case)} />}
            {t.typography.effects.map((v) => <FilterPill key={v} facet="effects" value={v} label={`${cap(v)} effect`} />)}
          </div>
        </section>

        <section>
          <Label>Imagery</Label>
            <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
            <ImageIcon value={t.imagery.type === "none" ? "none" : t.imagery.placement ?? t.imagery.type} className="size-10 text-foreground/70" />
            <div className="min-w-0 text-[13px]">
              <div className="font-semibold">
                {t.imagery.type === "none" ? "No image (text & shapes)" : `${cap(t.imagery.type)}${t.imagery.placement ? `, ${t.imagery.placement}` : ""}`}
              </div>
              <div className="text-[12px] text-muted-foreground">
                {[t.imagery.subject, t.imagery.frameShape && `${t.imagery.frameShape} frame`, t.imagery.illustrationStyle, t.imagery.count > 1 && `${t.imagery.count} images`]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </div>
            </div>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            <FilterPill facet="imageType" value={t.imagery.type} label={t.imagery.type === "none" ? "No image" : cap(t.imagery.type)} />
            {t.imagery.placement && <FilterPill facet="placement" value={t.imagery.placement} label={cap(t.imagery.placement)} />}
            {t.imagery.frameShape && <FilterPill facet="frameShape" value={t.imagery.frameShape} label={`${cap(t.imagery.frameShape)} frame`} />}
            {t.imagery.illustrationStyle && <FilterPill facet="illustrationStyle" value={t.imagery.illustrationStyle} label={cap(t.imagery.illustrationStyle)} />}
          </div>
          {t.elements.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-[12px] text-muted-foreground">Graphic elements</div>
              <div className="flex flex-wrap gap-1.5">
                {t.elements.map((v) => <FilterPill key={v} facet="elements" value={v.toLowerCase()} label={v} />)}
              </div>
            </div>
          )}
        </section>

        {copyLines.length > 0 && (
          <section>
            <Label hint={cap(t.content.type)}>Copy ideas</Label>
            <div className="space-y-1.5">
              {copyLines.map(([k, v]) => (
                <button
                  key={k}
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(v);
                    } catch {}
                    toast("Copied text");
                  }}
                  className="block w-full rounded-lg bg-muted/50 px-3 py-2 text-left transition-colors hover:bg-muted"
                  title="Copy text"
                >
                  <div className="text-[10.5px] tracking-wider text-muted-foreground uppercase">{k}</div>
                  <div className="text-[13px] leading-snug">{v}</div>
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <Label hint="Click to filter">Tags</Label>
          <div className="flex flex-wrap gap-1.5">
            <FilterPill facet="industry" value={t.industry} />
            <FilterPill facet="topic" value={t.topic} />
            <FilterPill facet="contentType" value={t.content.type} label={cap(t.content.type)} />
            {t.tags.map((v) => <FilterPill key={v} facet="tag" value={v.toLowerCase()} label={v} />)}
          </div>
        </section>

        {t.hashtags.length > 0 && (
          <section>
            <Label>Hashtags</Label>
            <p className="text-[13px] leading-relaxed text-[#3D6FE0] dark:text-[#7EA2FF]">{t.hashtags.join(" ")}</p>
          </section>
        )}
      </div>
    </aside>
  );
}
