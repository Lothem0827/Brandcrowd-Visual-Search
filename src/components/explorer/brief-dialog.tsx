"use client";

import { useCallback, useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  ShuffleIcon,
  SparklesIcon,
  TagIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { generateBrief, MAX_BRIEF_OPTIONS, type BriefOption, type DesignBrief } from "@/lib/brief";
import { sentenceCase } from "@/lib/facets";
import { useExplorer } from "./context";

const COLORS = ["Main", "Secondary", "Accent"] as const;

/** Compact section heading with an optional action on the right. */
function SectionHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h3 className="shrink-0 text-[13px] font-semibold">{title}</h3>
        {hint ? (
          <p className="min-w-0 truncate text-[11px] text-muted-foreground">{hint}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** One palette + title alternative, with its own copy affordances. */
function OptionCard({
  option,
  index,
  title,
  copied,
  onCopyColor,
  onCopyTitle,
  onCopyOption,
}: {
  option: BriefOption;
  index: number;
  title: string;
  copied: string | null;
  onCopyColor: (hex: string, label: string) => void;
  onCopyTitle: (title: string, label: string) => void;
  onCopyOption: (option: BriefOption, index: number, title: string) => void;
}) {
  const optionLabel = `option-${index}`;
  const titleLabel = `title-${index}`;
  const optionCopied = copied === optionLabel;
  const titleCopied = copied === titleLabel;

  return (
    <div className="space-y-2 rounded-xl bg-panel/50 p-2.5 ring-1 ring-foreground/[0.08]">
      <div className="flex items-center gap-1.5">
        <span className="grid size-5 shrink-0 place-items-center rounded-full bg-foreground text-[10px] font-semibold text-background tabular-nums">
          {index + 1}
        </span>
        <span
          className="size-2.5 shrink-0 rounded-full ring-1 ring-black/15"
          style={{ background: option.anchor.hex }}
          aria-hidden
        />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {sentenceCase(option.anchor.name)} · {Math.round(option.anchor.share * 100)}%
        </span>
        <button
          type="button"
          onClick={() => onCopyOption(option, index, title)}
          aria-label={`Copy option ${index + 1}`}
          className="flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-[10.5px] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {optionCopied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
          {optionCopied ? "Copied" : "Copy"}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        {option.palette.map((color, colorIndex) => {
          const label = `color-${index}-${color.role}`;
          const isCopied = copied === label;
          return (
            <button
              key={color.role}
              type="button"
              onClick={() => onCopyColor(color.hex, label)}
              aria-label={`Copy ${COLORS[colorIndex]} color ${color.hex}`}
              title={`${COLORS[colorIndex]} · ${color.name}`}
              className="group overflow-hidden rounded-lg text-left ring-1 ring-foreground/10 transition-transform hover:-translate-y-0.5"
            >
              <span className="relative block h-8" style={{ background: color.hex }}>
                <span className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-black/25 text-white opacity-0 transition-opacity group-hover:opacity-100">
                  {isCopied ? <CheckIcon className="size-2.5" /> : <CopyIcon className="size-2.5" />}
                </span>
              </span>
              <span className="block bg-background px-1.5 py-1">
                <span className="block text-[9px] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                  {COLORS[colorIndex]}
                </span>
                <span className="block text-[11px] font-semibold tabular-nums">{color.hex}</span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-1.5 rounded-lg bg-background px-2 py-1.5 ring-1 ring-foreground/[0.08]">
        <p className="min-w-0 flex-1 text-[14px] leading-snug font-semibold">{title}</p>
        <button
          type="button"
          onClick={() => onCopyTitle(title, titleLabel)}
          aria-label="Copy title"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {titleCopied ? <CheckIcon className="size-3.5" /> : <CopyIcon className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

/**
 * "Design brief": turns an industry (or the current search) into one to three
 * palette + title options plus that industry's six most common tags. The scan is
 * local and deterministic — see lib/brief.ts.
 */
export function BriefDialog() {
  const { base, query, setQuery, setPage, addFacet, clearAll, briefOpen, setBriefOpen } =
    useExplorer();
  const [draft, setDraft] = useState("");
  const [brief, setBrief] = useState<DesignBrief | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [titleIndex, setTitleIndex] = useState(0);
  const [count, setCount] = useState(1);
  const [copied, setCopied] = useState<string | null>(null);

  const industries = useMemo(() => {
    const counts = new Map<string, number>();
    for (const template of base) {
      counts.set(template.industry, (counts.get(template.industry) ?? 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 6)
      .map(([name]) => name);
  }, [base]);

  const generate = useCallback(
    (value: string, wanted: number) => {
      const text = value.trim();
      setDraft(text);
      setTitleIndex(0);
      if (!text) {
        setBrief(null);
        setError(null);
        return;
      }
      const next = generateBrief(base, text, wanted);
      setBrief(next);
      setError(
        next
          ? null
          : `No designs match “${text}”. Try an industry like Construction or Food & Drink.`,
      );
    },
    [base],
  );

  // Opening with an active search previews its brief immediately; opening from a
  // clean slate waits for the user to name an industry. Deriving this during render
  // (rather than in an effect) keeps the first open frame from flashing empty content.
  const [wasOpen, setWasOpen] = useState(false);
  if (briefOpen !== wasOpen) {
    setWasOpen(briefOpen);
    if (briefOpen) {
      setCopied(null);
      const text = query.trim();
      if (text) {
        generate(text, count);
      } else {
        setDraft("");
        setBrief(null);
        setError(null);
      }
    }
  }

  const copy = useCallback(async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      window.setTimeout(() => setCopied((current) => (current === label ? null : current)), 1400);
    } catch {
      setError("Couldn't copy to the clipboard.");
    }
  }, []);

  const copyColor = useCallback(
    (hex: string, label: string) => void copy(hex, label),
    [copy],
  );

  const copyTitle = useCallback(
    (value: string, label: string) => void copy(value, label),
    [copy],
  );

  /** The title shown on a card: cycling only applies while a single option is shown. */
  const titleFor = useCallback(
    (option: BriefOption) =>
      count === 1 ? (brief?.titles[titleIndex] ?? option.title) : option.title,
    [brief, count, titleIndex],
  );

  const copyOption = useCallback(
    (option: BriefOption, index: number, shownTitle: string) =>
      void copy(
        [...option.palette.map((color) => color.hex), shownTitle].join(", "),
        `option-${index}`,
      ),
    [copy],
  );

  const copyAll = () => {
    if (!brief) return;
    const lines = [`${brief.match.label} design brief`];
    brief.options.forEach((option, index) => {
      lines.push(
        `${index + 1}. ${option.palette.map((color) => color.hex).join(" ")} — ${titleFor(option)}`,
      );
    });
    lines.push(`Tags: ${brief.tags.join(", ")}`);
    void copy(lines.join("\n"), "all");
  };

  const copyTags = () => {
    if (!brief) return;
    void copy(brief.tags.join(", "), "tags");
  };

  const applyTag = (tag: string) => {
    addFacet("tag", tag.toLowerCase());
    setPage("explore");
    setBriefOpen(false);
  };

  const browseIndustry = () => {
    if (!brief) return;
    // "Browse … designs" promises the whole industry, so drop unrelated filters left
    // over from the previous search instead of quietly intersecting with them.
    clearAll();
    setQuery(brief.match.label);
    setPage("explore");
    setBriefOpen(false);
  };

  const pickCount = (next: number) => {
    setCount(next);
    // Regenerating on click keeps the no-setState-in-effect pattern this file already uses.
    if (draft.trim()) generate(draft, next);
  };

  const allCopied = copied === "all";
  const tagsCopied = copied === "tags";
  const showShuffle = count === 1 && (brief?.titles.length ?? 0) > 1;

  return (
    <Dialog open={briefOpen} onOpenChange={setBriefOpen}>
      <DialogContent className="max-h-[88vh] gap-3.5 overflow-y-auto p-4 sm:max-w-[560px] sm:p-5">
        <DialogHeader className="gap-1 pr-8">
          <DialogTitle className="flex items-center gap-2 text-[17px]">
            <span className="grid size-7 place-items-center rounded-lg bg-foreground text-background">
              <SparklesIcon className="size-4" />
            </span>
            Design brief
          </DialogTitle>
          <DialogDescription className="text-[12.5px]">
            Scan an industry&apos;s colors, titles and tags — then start designing.
          </DialogDescription>
        </DialogHeader>

        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            generate(draft, count);
          }}
        >
          <Input
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Industry or topic, e.g. Construction"
            aria-label="Industry or topic"
            maxLength={80}
            autoFocus
            className="h-10"
          />
          <Button type="submit" size="lg" className="h-10 shrink-0 px-3.5">
            <SparklesIcon className="size-4" />
            Generate
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <span className="text-[11px] text-muted-foreground">Options</span>
          <div
            role="group"
            aria-label="Number of palette and title options"
            className="flex gap-0.5 rounded-full bg-panel p-0.5"
          >
            {Array.from({ length: MAX_BRIEF_OPTIONS }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={count === n}
                onClick={() => pickCount(n)}
                className={
                  count === n
                    ? "grid size-6 place-items-center rounded-full bg-foreground text-[11px] font-semibold text-background tabular-nums"
                    : "grid size-6 place-items-center rounded-full text-[11px] font-medium text-muted-foreground tabular-nums transition-colors hover:text-foreground"
                }
              >
                {n}
              </button>
            ))}
          </div>
          <span className="text-[11px] text-muted-foreground">
            palette + title{count === 1 ? "" : " per option"}
          </span>
        </div>

        {!brief && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11px] text-muted-foreground">Popular:</span>
            {industries.map((industry) => (
              <button
                key={industry}
                type="button"
                onClick={() => generate(industry, count)}
                className="flex h-7 items-center rounded-full bg-panel px-2.5 text-xs transition-colors hover:bg-muted"
              >
                {industry}
              </button>
            ))}
          </div>
        )}

        {error && (
          <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {error}
          </p>
        )}

        {brief && (
          <div className="space-y-3">
            <p className="text-[11px] text-muted-foreground">
              Based on{" "}
              <span className="font-semibold text-foreground">
                {brief.match.templates.toLocaleString()}
              </span>{" "}
              {brief.match.label} designs · most common color is{" "}
              <span
                className="inline-block size-2.5 translate-y-px rounded-full ring-1 ring-black/15"
                style={{ background: brief.anchor.hex }}
                aria-hidden
              />{" "}
              {sentenceCase(brief.anchor.name)} ({Math.round(brief.anchor.share * 100)}%)
            </p>

            <section className="space-y-2">
              <SectionHeader
                title="Palette & title options"
                hint={
                  brief.options.length === 1
                    ? "Saturated main, analogous secondary, complementary accent"
                    : "Ranked by how strongly each colour appears in this industry"
                }
                action={
                  <div className="flex shrink-0 items-center gap-1">
                    {showShuffle ? (
                      <button
                        type="button"
                        onClick={() =>
                          setTitleIndex((index) => (index + 1) % (brief.titles.length || 1))
                        }
                        className="flex h-7 items-center gap-1 rounded-full bg-panel px-2.5 text-[11px] font-medium transition-colors hover:bg-muted"
                      >
                        <ShuffleIcon className="size-3" />
                        Another
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={copyAll}
                      className="flex h-7 items-center gap-1 rounded-full bg-panel px-2.5 text-[11px] font-medium transition-colors hover:bg-muted"
                    >
                      {allCopied ? <CheckIcon className="size-3" /> : <CopyIcon className="size-3" />}
                      {allCopied ? "Copied" : "Copy all"}
                    </button>
                  </div>
                }
              />

              {brief.options.length < count ? (
                <p className="text-[11px] text-muted-foreground">
                  Only {brief.options.length} distinct colour stor
                  {brief.options.length === 1 ? "y" : "ies"} in this industry — fewer options
                  returned rather than repeating a palette.
                </p>
              ) : null}

              <div className="space-y-2">
                {brief.options.map((option, index) => (
                  <OptionCard
                    key={`${option.palette[0].hex}-${index}`}
                    option={option}
                    index={index}
                    title={titleFor(option)}
                    copied={copied}
                    onCopyColor={copyColor}
                    onCopyTitle={copyTitle}
                    onCopyOption={copyOption}
                  />
                ))}
              </div>
            </section>

            <section className="space-y-2">
              <SectionHeader
                title="Common tags"
                hint="Click a tag to add it to the search"
                action={
                  <button
                    type="button"
                    onClick={copyTags}
                    className="flex h-7 shrink-0 items-center gap-1 rounded-full bg-panel px-2.5 text-[11px] font-medium transition-colors hover:bg-muted"
                  >
                    {tagsCopied ? <CheckIcon className="size-3" /> : <TagIcon className="size-3" />}
                    {tagsCopied ? "Copied" : "Copy"}
                  </button>
                }
              />
              <div className="flex flex-wrap gap-1.5">
                {brief.tags.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => applyTag(tag)}
                    className="flex h-7 items-center gap-1.5 rounded-full bg-panel px-2.5 text-xs transition-colors hover:bg-foreground hover:text-background"
                  >
                    {sentenceCase(tag)}
                  </button>
                ))}
              </div>
            </section>

            <div className="flex justify-end border-t border-border/60 pt-3">
              <Button type="button" size="lg" onClick={browseIndustry}>
                Browse {brief.match.label} designs
                <ArrowRightIcon className="size-4" />
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
