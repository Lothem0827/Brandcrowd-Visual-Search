"use client";
import { useEffect, useState } from "react";
import {
  CheckIcon,
  CopyIcon,
  SearchIcon,
  SparklesIcon,
  XIcon,
} from "lucide-react";
import { MoodboardPublicToggle } from "@/components/auth/public-toggle";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { moodboardSource, type PopularColor } from "@/lib/brief";
import { sentenceCase } from "@/lib/facets";
import { paletteFromHarmony, HARMONIES, type HarmonyId } from "@/lib/harmony";
import { readMoodboardDrag, type MoodboardDraft } from "@/lib/moodboards";
import type { MoodboardTitlesResponse } from "@/lib/moodboard-titles";
import { templateImageUrl, templateThumbSmUrl } from "@/lib/images";
import { cn } from "@/lib/utils";
import { BackButton } from "./back-button";
import { BriefOrbit } from "./brief-orbit";
import { SpectrumPicker } from "./color-spectrum";
import { useExplorer } from "./context";
import { HEADER_ROW, HEADER_TITLE } from "./header";
import { ThumbImage } from "./thumb-image";
import { useMoodboards } from "./use-moodboards";

const SECTION =
  "text-[11px] font-semibold tracking-[0.12em] text-muted-foreground uppercase";
const COPY_BUTTON =
  "pointer-events-none absolute top-2 right-2 z-10 grid size-7 place-items-center text-white opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 focus-visible:pointer-events-auto focus-visible:opacity-100";

/** Dot positions on a 16px wheel, degrees clockwise from the top. */
const HARMONY_DOTS: Record<
  Exclude<HarmonyId, "shades" | "monochromatic">,
  number[]
> = {
  analogous: [-24, 0, 24],
  complementary: [0, 180],
  "split-complementary": [0, 150, 210],
  triad: [0, 120, 240],
  square: [0, 90, 180, 270],
  compound: [-16, 16, 164, 196],
};

function colorsOf(draft: MoodboardDraft): PopularColor[] {
  return draft.colors.map((color, index) => {
    const hex = draft.overrides[String(index)];
    return hex ? { ...color, hex } : color;
  });
}

function HarmonyMark({ id }: { id: HarmonyId }) {
  if (id === "shades" || id === "monochromatic") {
    return (
      <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
        {[0, 1, 2].map((step) => (
          <rect
            key={step}
            x="3"
            y={2.5 + step * 4}
            width={id === "monochromatic" ? 10 - step * 2 : 10}
            height="2.4"
            rx="0.6"
            fill="currentColor"
            opacity={id === "shades" ? 1 - step * 0.32 : 0.4 + step * 0.3}
          />
        ))}
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 16 16" className="size-4" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r="5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        opacity="0.45"
      />
      {HARMONY_DOTS[id].map((degrees) => {
        const rad = ((degrees - 90) * Math.PI) / 180;
        return (
          <circle
            key={degrees}
            cx={8 + Math.cos(rad) * 5.1}
            cy={8 + Math.sin(rad) * 5.1}
            r="1.35"
            fill="currentColor"
          />
        );
      })}
    </svg>
  );
}

function QueryForm({
  initial,
  onGenerate,
}: {
  initial: string;
  onGenerate: (value: string) => void;
}) {
  const [input, setInput] = useState(initial);
  return (
    <form
      className="flex h-13 w-full items-center gap-1 rounded-full bg-panel/75 pr-2 pl-4 backdrop-blur-md focus-within:ring-2 focus-within:ring-ring/40"
      onSubmit={(event) => {
        event.preventDefault();
        onGenerate(input);
      }}
    >
      <input
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder="Industry, topic or theme"
        aria-label="Industry, topic or theme"
        maxLength={80}
        className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium outline-none placeholder:text-muted-foreground/80"
      />
      <Button type="submit" className="h-8 shrink-0 rounded-full px-3.5">
        <SparklesIcon className="size-4" />
        Generate
      </Button>
    </form>
  );
}

export function MoodboardHeaderActions({
  compact = false,
}: {
  compact?: boolean;
}) {
  const { draft, store } = useMoodboards();
  const { setPage } = useExplorer();
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!savedFlash) return;
    const timer = window.setTimeout(() => setSavedFlash(false), 1400);
    return () => window.clearTimeout(timer);
  }, [savedFlash]);

  return (
    <div
      className={cn(
        "flex shrink-0 items-center gap-1.5",
        !compact && "ml-auto",
      )}
    >
      {draft ? (
        <MoodboardPublicToggle
          moodboardId={draft.id}
          isPublic={draft.isPublic}
          slug={draft.slug}
        />
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="save-moodboard"
        aria-label="Save moodboard"
        disabled={!draft}
        onClick={() => {
          if (store.save()) setSavedFlash(true);
        }}
      >
        {savedFlash ? "Saved" : compact ? "Save" : "Save moodboard"}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="create-moodboard"
        aria-label="Create new moodboard"
        disabled={!draft}
        onClick={() => {
          store.createNew();
          setPage("brief");
        }}
      >
        {compact ? "New" : "Create new"}
      </Button>
    </div>
  );
}

function SwatchCopy({
  hex,
  copyKey,
  copied,
  onCopy,
}: {
  hex: string;
  copyKey: string;
  copied: string | null;
  onCopy: (text: string, key: string) => void;
}) {
  return (
    <button
      type="button"
      aria-label={`Copy ${hex}`}
      onClick={() => onCopy(hex, copyKey)}
      className={cn(
        COPY_BUTTON,
        copied === copyKey && "pointer-events-auto opacity-100",
      )}
    >
      {copied === copyKey ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
    </button>
  );
}

/** Titles, tags, colours, palette, and design inspo. Shared by the page and the pinned panel. */
export function MoodboardBody({ compact = false }: { compact?: boolean }) {
  const { draft, titlesPending, store } = useMoodboards();
  const { byId, clearAll, setQuery, setPage } = useExplorer();
  const [picker, setPicker] = useState<number | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1400);
    return () => window.clearTimeout(timer);
  }, [copied]);

  if (!draft) return null;

  const copy = (text: string, key: string) => {
    void navigator.clipboard.writeText(text).then(
      () => setCopied(key),
      () => undefined,
    );
  };
  const colors = colorsOf(draft);
  const picked = colors[draft.selected] ?? colors[0];
  const palette = picked ? paletteFromHarmony(picked.hex, draft.harmony) : null;
  const findDesigns = () => {
    clearAll();
    setQuery(draft.query);
    setPage("explore");
    store.pin();
  };

  return (
    <div
      className={cn(
        "flex flex-col gap-8",
        compact ? "px-4 py-4" : "mx-auto w-full max-w-3xl px-4 pt-2 pb-28",
      )}
    >
      {!compact && (
        <Button
          type="button"
          data-testid="find-designs"
          onClick={findDesigns}
          className="w-fit"
        >
          <SearchIcon className="size-4" />
          Find designs
        </Button>
      )}

      <section
        aria-label="Titles"
        className="space-y-2"
        data-testid="moodboard-titles"
      >
        <h2 className={SECTION}>Titles</h2>
        {titlesPending && (
          <p className="text-sm text-muted-foreground">Writing titles…</p>
        )}
        {draft.titles.length > 0 && (
          <ol className="space-y-2">
            {draft.titles.map((title, index) => (
              <li
                key={`${index}-${title}`}
                className="flex items-center gap-2 rounded-xl bg-panel px-3 py-2.5 ring-1 ring-foreground/10"
              >
                <span className="min-w-0 flex-1 text-[15px] font-semibold">
                  {title}
                </span>
                <button
                  type="button"
                  aria-label={`Copy ${title}`}
                  onClick={() => copy(title, title)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  {copied === title ? (
                    <CheckIcon className="size-3.5" />
                  ) : (
                    <CopyIcon className="size-3.5" />
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}
        {!titlesPending && draft.titles.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No titles came back for this subject.
          </p>
        )}
      </section>

      <section
        aria-label="Tags"
        className="space-y-2"
        data-testid="moodboard-tags"
      >
        <div className="flex items-center justify-between">
          <h2 className={SECTION}>Tags</h2>
          <button
            type="button"
            aria-label="Copy tags"
            onClick={() =>
              copy(
                `${draft.tags.map((tag) => tag.toLowerCase()).join(", ")},`,
                "tags",
              )
            }
            className="flex h-7 items-center gap-1 rounded-full px-2 text-[12px] font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {copied === "tags" ? (
              <CheckIcon className="size-3.5" />
            ) : (
              <CopyIcon className="size-3.5" />
            )}
            {copied === "tags" ? "Copied" : "Copy"}
          </button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {draft.tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full bg-panel px-2.5 py-1 text-[12px] ring-1 ring-foreground/10"
            >
              {sentenceCase(tag)}
            </span>
          ))}
        </div>
      </section>

      <section
        aria-label="Popular colours"
        className="space-y-3"
        data-testid="moodboard-colors"
      >
        <h2 className={SECTION}>Popular colours</h2>
        {colors.length > 0 ? (
          <>
            <div
              className={cn(
                "grid grid-cols-3 gap-2",
                !compact && "sm:grid-cols-6",
              )}
            >
              {colors.map((color, index) => {
                const on = index === draft.selected;
                return (
                  <div
                    key={`${index}-${draft.colors[index]?.hex ?? color.hex}`}
                    className="group space-y-1"
                  >
                    <div className="relative">
                      <Popover
                        open={picker === index}
                        onOpenChange={(open) => {
                          if (!open)
                            setPicker((current) =>
                              current === index ? null : current,
                            );
                        }}
                      >
                        <PopoverTrigger
                          aria-pressed={on}
                          aria-label={color.hex}
                          title="Double-click to adjust this colour"
                          onClick={() => store.setSelected(index)}
                          onDoubleClick={() => {
                            store.setSelected(index);
                            setPicker(index);
                          }}
                          className={cn(
                            "w-full rounded-xl p-1.5 text-left",
                            on && "bg-muted",
                          )}
                        >
                          <span
                            className={cn(
                              "block h-14 rounded-lg ring-1 ring-black/10",
                              on && "ring-2 ring-foreground",
                            )}
                            style={{ background: color.hex }}
                          />
                        </PopoverTrigger>
                        <PopoverContent
                          side="top"
                          align="center"
                          className="w-[280px] p-3"
                        >
                          <SpectrumPicker
                            hex={color.hex}
                            onChange={(hex) => store.setOverride(index, hex)}
                          />
                        </PopoverContent>
                      </Popover>
                      <SwatchCopy
                        hex={color.hex}
                        copyKey={`popular-${index}`}
                        copied={copied}
                        onCopy={copy}
                      />
                    </div>
                    <span className="block truncate text-center text-[10px] font-medium tabular-nums">
                      {color.hex}
                    </span>
                  </div>
                );
              })}
            </div>
            <div
              role="group"
              aria-label="Color harmony"
              data-testid="moodboard-harmony"
              className="flex flex-nowrap gap-1 overflow-x-auto"
            >
              {HARMONIES.map((item) => {
                const on = draft.harmony === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={on}
                    aria-label={item.label}
                    title={item.label}
                    onClick={() => store.setHarmony(item.id)}
                    className={cn(
                      "grid size-9 shrink-0 place-items-center rounded-lg transition-colors",
                      on
                        ? "bg-foreground text-background"
                        : "bg-panel text-muted-foreground ring-1 ring-foreground/10 hover:bg-muted hover:text-foreground",
                    )}
                  >
                    <HarmonyMark id={item.id} />
                  </button>
                );
              })}
            </div>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            No strong colours turned up in this set.
          </p>
        )}

        {palette && (
          <div className="space-y-2" data-testid="moodboard-palette">
            <h3 className={SECTION}>Palette</h3>
            <div className="grid grid-cols-5 gap-2">
              {palette.map((color, index) => (
                <div key={`${index}-${color.hex}`} className="group space-y-1">
                  <div className="relative">
                    <span
                      className="block h-16 rounded-lg ring-1 ring-black/10"
                      aria-label={color.hex}
                      style={{ background: color.hex }}
                    />
                    <SwatchCopy
                      hex={color.hex}
                      copyKey={`palette-${index}`}
                      copied={copied}
                      onCopy={copy}
                    />
                  </div>
                  <span className="block truncate text-center text-[10px] font-medium text-muted-foreground tabular-nums">
                    {color.hex}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section
        aria-label="Design inspo"
        data-testid="moodboard-inspo"
        className={cn("space-y-2 rounded-2xl", dragOver && "bg-muted")}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragOver(false);
          const id = readMoodboardDrag(event.dataTransfer);
          if (id) store.addInspo(id);
        }}
      >
        <h2 className={SECTION}>Design inspo</h2>
        {draft.inspoIds.length > 0 ? (
          <div
            className={cn(
              "grid grid-cols-3 gap-2",
              !compact && "sm:grid-cols-6",
            )}
          >
            {draft.inspoIds.map((id) => {
              const template = byId(id);
              const label =
                template?.displayTitle || template?.slug || "Design";
              return (
                <div
                  key={id}
                  className="group relative aspect-square overflow-hidden rounded-lg bg-muted"
                >
                  {template ? (
                    <ThumbImage
                      src={templateThumbSmUrl(id)}
                      fallbackSrc={templateImageUrl(id)}
                      alt={label}
                      className="size-full object-cover"
                    />
                  ) : (
                    <span className="sr-only">{label}</span>
                  )}
                  <button
                    type="button"
                    aria-label={`Remove ${label}`}
                    onClick={() => store.removeInspo(id)}
                    className="absolute top-1 right-1 grid size-6 place-items-center rounded-md bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
                  >
                    <XIcon className="size-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex h-24 items-center justify-center rounded-xl border border-dashed border-foreground/15 px-3 text-center text-sm text-muted-foreground">
            Drag a design here
          </div>
        )}
      </section>
    </div>
  );
}

export function BriefPage() {
  const { base, setPage } = useExplorer();
  const { draft, miss, store, attempt, formEpoch } = useMoodboards();

  const generate = (raw: string) => {
    const query = raw.trim();
    if (!query || !base.length) return;
    const next = moodboardSource(base, query);
    if (!next) {
      store.miss(query);
      return;
    }
    const token = store.applyGenerated({
      query,
      tags: next.tags,
      colors: next.colors,
    });
    const fallback = next.fallbackTitles;
    void fetch("/api/moodboard/titles", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query }),
    })
      .then(async (res) => (await res.json()) as MoodboardTitlesResponse)
      .then((data) => {
        store.setTitles(
          token,
          data.status === "ok" && data.titles.length ? data.titles : fallback,
        );
      })
      .catch(() => {
        store.setTitles(token, fallback);
      });
  };

  const form = (
    <QueryForm
      key={`${draft?.id ?? "new"}:${formEpoch}`}
      initial={attempt ?? draft?.query ?? ""}
      onGenerate={generate}
    />
  );

  return (
    <div className="relative flex h-full flex-col" data-testid="brief-page">
      <div className={HEADER_ROW}>
        <BackButton onClick={() => setPage("explore")} />
        <h1 className={HEADER_TITLE}>Moodboard</h1>
        <MoodboardHeaderActions />
      </div>

      {draft ? (
        <>
          <div className="thin-scroll min-h-0 flex-1 overflow-y-auto">
            <MoodboardBody />
          </div>
          <div className="pointer-events-none absolute inset-x-0 z-30 flex justify-center px-4 bottom-5 max-lg:bottom-3">
            <div
              className="pointer-events-auto w-full max-w-[620px] max-lg:max-w-none"
              data-testid="moodboard-dock"
            >
              {form}
            </div>
          </div>
        </>
      ) : (
        <div className="thin-scroll relative flex min-h-0 flex-1 flex-col items-center overflow-y-auto px-4 py-8">
          <BriefOrbit />
          <div className="relative z-10 my-auto flex w-full max-w-[500px] flex-col items-center gap-6">
            <h2 className="text-center text-4xl font-semibold tracking-tight text-balance sm:text-6xl px-4">
              Start your next moodboard
            </h2>
            {form}
            {miss && (
              <p className="max-w-sm text-center text-sm text-muted-foreground">
                Nothing matched that. Try an industry, topic, or theme from the
                catalogue.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
