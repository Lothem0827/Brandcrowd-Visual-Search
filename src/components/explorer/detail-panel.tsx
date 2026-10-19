"use client";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowUpRightIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  PanelRightCloseIcon,
} from "lucide-react";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { toast } from "@/components/ui/toast";
import type { Template } from "@/lib/schema";
import { cap, type FacetKey } from "@/lib/facets";
import { cn } from "@/lib/utils";
import type { SimilarHit, SimilarKind } from "@/lib/similarity";
import { SIMILAR_META } from "@/lib/tree";
import { useExplorer } from "./context";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE } from "./header";
import { SaveButton } from "./save-button";
import { ImageIcon, LayoutIcon } from "./icons";
import { templateImageUrl } from "@/lib/images";
import { SidePanel } from "./side-panel";
import { ThumbImage } from "./thumb-image";
import { useEffectiveGridSettings } from "./use-grid-settings";

/** Order the similar groups in: overall match first, then the three specific facets. */
const SIMILAR_ORDER: SimilarKind[] = ["overall", "colors", "layout", "style"];

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <div className="mb-2 flex items-baseline justify-between">
      <h3 className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
        {children}
      </h3>
      {hint && (
        <span className="text-[11px] text-muted-foreground">{hint}</span>
      )}
    </div>
  );
}

function FilterPill({
  facet,
  value,
  label,
}: {
  facet: FacetKey;
  value: string;
  label?: string;
}) {
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

/* ------------------------------------------------------------------ */
/* Similar Designs tab                                                 */
/* ------------------------------------------------------------------ */

function SimilarGroup({
  kind,
  hits,
}: {
  kind: SimilarKind;
  hits: SimilarHit[];
}) {
  const { recenterDetail } = useExplorer();
  const { gap, radius } = useEffectiveGridSettings();
  const meta = SIMILAR_META[kind];

  return (
    <section>
      <Label>{meta.label}</Label>
      {hits.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No other designs in this scope yet.
        </p>
      ) : (
        <div className="grid grid-cols-3" style={{ gap: gap / 2 }}>
          {hits.map((h) => (
            <button
              key={h.template.templateId}
              type="button"
              onClick={() => recenterDetail(h.template.templateId)}
              className="group min-w-0 text-left"
              aria-label={`View ${h.template.displayTitle || h.template.slug}`}
            >
              <span
                className="block aspect-square overflow-hidden bg-muted ring-1 ring-black/5 transition-transform duration-150 group-hover:scale-[1.02]"
                style={{ borderRadius: radius }}
              >
                <ThumbImage
                  src={templateImageUrl(h.template.templateId)}
                  alt=""
                  className="size-full object-cover"
                />
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function SimilarDesignsTab() {
  const { similar } = useExplorer();

  return (
    <div className="space-y-5 p-4">
      {SIMILAR_ORDER.map((kind) => (
        <SimilarGroup key={kind} kind={kind} hits={similar?.[kind] ?? []} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Design Information tab                                              */
/* ------------------------------------------------------------------ */

function DesignInfoTab({ t }: { t: Template }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (hex: string) => {
    try {
      if (!navigator.clipboard) throw new Error("clipboard unavailable");
      await navigator.clipboard.writeText(hex);
    } catch {
      toast.error(`Couldn't copy ${hex}`, {
        description: `Your browser blocked clipboard access. The code is ${hex}.`,
      });
      return;
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
    <div className="space-y-6 p-4">
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
                <span className="absolute top-1.5 right-1.5 grid size-5 place-items-center rounded-md bg-white/85 text-black transition-opacity [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:group-focus-visible:opacity-100">
                  {copied === c.hex ? (
                    <CheckIcon className="size-3" />
                  ) : (
                    <CopyIcon className="size-3" />
                  )}
                </span>
              </div>
              <div className="px-2 py-1.5">
                <div className="font-mono text-[12px] font-semibold">
                  {c.hex}
                </div>
                <div className="truncate text-[10.5px] text-muted-foreground">
                  {cap(c.role)} · {c.name}
                </div>
              </div>
            </button>
          ))}
        </div>
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
                <div className="text-[10.5px] tracking-wider text-muted-foreground uppercase">
                  {k}
                </div>
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
          <FilterPill
            facet="contentType"
            value={t.content.type}
            label={cap(t.content.type)}
          />
          {t.tags.map((v) => (
            <FilterPill key={v} facet="tag" value={v.toLowerCase()} label={v} />
          ))}
        </div>
      </section>

      <Collapsible className="border-t border-border/60 pt-4">
        <CollapsibleTrigger className="group flex w-full items-center justify-between text-left">
          <span className="text-[11px] font-medium tracking-[0.12em] text-muted-foreground uppercase">
            More info
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-6 pt-5">
          <section>
            <Label>Style</Label>
            <div className="flex flex-wrap gap-1.5">
              {t.style.aesthetic.map((v) => (
                <FilterPill
                  key={v}
                  facet="aesthetic"
                  value={v}
                  label={cap(v)}
                />
              ))}
              {t.style.mood.map((v) => (
                <FilterPill key={v} facet="mood" value={v} label={cap(v)} />
              ))}
              {t.style.colorScheme.map((v) => (
                <FilterPill key={v} facet="colorScheme" value={v} label={v} />
              ))}
              {t.style.texture && (
                <FilterPill
                  facet="texture"
                  value={t.style.texture}
                  label={`${t.style.texture} texture`}
                />
              )}
            </div>
          </section>

          <section>
            <Label>Layout</Label>
            <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
              <LayoutIcon
                value={t.layout.structure}
                className="size-10 text-foreground/70"
              />
              <div className="min-w-0 text-[13px]">
                <div className="font-semibold">{cap(t.layout.structure)}</div>
                <div className="text-[12px] text-muted-foreground">
                  {[
                    t.layout.alignment && `${t.layout.alignment} aligned`,
                    t.layout.balance,
                    t.layout.whitespace && `${t.layout.whitespace} spacing`,
                    t.layout.textDensity && `${t.layout.textDensity} text`,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <FilterPill
                facet="structure"
                value={t.layout.structure}
                label={cap(t.layout.structure)}
              />
              <FilterPill
                facet="alignment"
                value={t.layout.alignment}
                label={`${cap(t.layout.alignment)} aligned`}
              />
              {t.layout.textDensity && (
                <FilterPill
                  facet="textDensity"
                  value={t.layout.textDensity}
                  label={`${cap(t.layout.textDensity)} text`}
                />
              )}
            </div>
          </section>

          <section>
            <Label>Imagery</Label>
            <div className="flex items-center gap-3 rounded-xl bg-muted/40 p-3">
              <ImageIcon
                value={
                  t.imagery.type === "none"
                    ? "none"
                    : (t.imagery.placement ?? t.imagery.type)
                }
                className="size-10 text-foreground/70"
              />
              <div className="min-w-0 text-[13px]">
                <div className="font-semibold">
                  {t.imagery.type === "none"
                    ? "No image (text & shapes)"
                    : `${cap(t.imagery.type)}${t.imagery.placement ? `, ${t.imagery.placement}` : ""}`}
                </div>
                <div className="text-[12px] text-muted-foreground">
                  {[
                    t.imagery.subject,
                    t.imagery.frameShape && `${t.imagery.frameShape} frame`,
                    t.imagery.illustrationStyle,
                    t.imagery.count > 1 && `${t.imagery.count} images`,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "—"}
                </div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <FilterPill
                facet="imageType"
                value={t.imagery.type}
                label={
                  t.imagery.type === "none" ? "No image" : cap(t.imagery.type)
                }
              />
              {t.imagery.placement && (
                <FilterPill
                  facet="placement"
                  value={t.imagery.placement}
                  label={cap(t.imagery.placement)}
                />
              )}
              {t.imagery.frameShape && (
                <FilterPill
                  facet="frameShape"
                  value={t.imagery.frameShape}
                  label={`${t.imagery.frameShape} frame`}
                />
              )}
              {t.imagery.illustrationStyle && (
                <FilterPill
                  facet="illustrationStyle"
                  value={t.imagery.illustrationStyle}
                  label={cap(t.imagery.illustrationStyle)}
                />
              )}
            </div>
          </section>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Panel                                                               */
/* ------------------------------------------------------------------ */

export function DetailPanel({ template: t }: { template: Template }) {
  const { setDetailOpen, detailOpen, loadDetails } = useExplorer();
  const [tab, setTab] = useState<"similar" | "info">("info");

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  return (
    <SidePanel
      open={detailOpen}
      onClose={() => setDetailOpen(false)}
      width={400}
      label="Design details"
      testId="detail-panel"
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
        <div className="text-xl font-semibold">Design details</div>
        <button
          type="button"
          aria-label="Collapse details (Esc)"
          onClick={() => setDetailOpen(false)}
          className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE)}
        >
          <PanelRightCloseIcon className="size-4" />
        </button>
      </div>

      <div className="shrink-0 space-y-4 border-b border-border/60 px-4 pt-1 pb-4">
        <div>
          <h2 className="text-2xl leading-tight font-semibold tracking-tight">
            {t.url ? (
              <a
                href={t.url}
                target="_blank"
                rel="noreferrer"
                title="Open on design.com"
                className="decoration-1 underline-offset-[3px] hover:underline"
              >
                {t.displayTitle}
                <ArrowUpRightIcon className="ml-1 inline-block size-3.5 translate-y-[-1px] align-middle text-muted-foreground" />
              </a>
            ) : (
              t.displayTitle
            )}
          </h2>
        </div>
        <SaveButton templateId={t.templateId} className="w-full" />
      </div>

      <div
        className="flex shrink-0 border-b border-border/60"
        role="tablist"
        aria-label="Design panel tabs"
      >
        {(["info", "similar"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn(
              "-mb-px h-10 flex-1 border-b-2 text-[13px] font-medium transition-colors",
              tab === k
                ? "border-foreground text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {k === "similar" ? "Similar Designs" : "Design Information"}
          </button>
        ))}
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto">
        {tab === "similar" ? <SimilarDesignsTab /> : <DesignInfoTab t={t} />}
      </div>
    </SidePanel>
  );
}
