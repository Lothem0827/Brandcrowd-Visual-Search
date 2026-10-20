"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowUpIcon, PanelRightCloseIcon, SparklesIcon } from "lucide-react";
import {
  planAssistant,
  queryAfterModel,
  type AssistantIntent,
  type AssistantStep,
  type PaletteSwatch,
  type TagHit,
} from "@/lib/assistant";
import { requestAssistant } from "@/lib/assistant-client";
import { replaceSelections, type FacetSelection } from "@/lib/facets";
import { buildVocab } from "@/lib/query";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/lib/use-media-query";
import { useExplorer } from "./context";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE } from "./header";
import { SidePanel } from "./side-panel";

const ASSISTANT_PANEL_ID = "design-assistant";

const STARTERS = [
  "Generate a title for coffee",
  "Popular palette for fitness",
  "Best tags for wedding",
  "Designs for cozy coffee",
];

interface ChatMessage {
  id: number;
  role: "user" | "assistant";
  text: string;
  titles?: string[];
  swatches?: PaletteSwatch[];
  tags?: TagHit[];
}

/**
 * Right-hand assistant. Unknown questions stay in the panel. Design requests
 * replace Explore's filters; a follow-up revises them.
 */
export function AssistantPanel() {
  const {
    base,
    vocab,
    category,
    assistantOpen,
    setAssistantOpen,
    setQuery,
    setFilters,
    setPage,
    setView,
    setDetailOpen,
    setImageQuery,
    addFacet,
    jumpToStep,
  } = useExplorer();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const priorKeyword = useRef<string | null>(null);
  /** Set after "Which subject should I use?" so the next line is that subject. */
  const awaiting = useRef<AssistantIntent | null>(null);
  const idRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const readyVocab = useMemo(
    () => (vocab.length ? vocab : assistantOpen ? buildVocab(base) : vocab),
    [vocab, assistantOpen, base],
  );

  useEffect(() => {
    if (!assistantOpen) return;
    inputRef.current?.focus();
  }, [assistantOpen]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, assistantOpen]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const nextId = () => {
    idRef.current += 1;
    return idRef.current;
  };

  const showExplore = () => {
    setImageQuery(null);
    setDetailOpen(false);
    setView({ kind: "search" });
    setPage("explore");
  };

  const applyFilters = (facets: FacetSelection, query: string, mode: "replace" | "revise") => {
    if (mode === "replace") {
      jumpToStep(-1);
      setFilters({ facets, color: null });
      setQuery(query);
    } else if (Object.keys(facets).length) {
      setFilters((current) => ({ ...current, facets: replaceSelections(current.facets, facets) }));
    }
    showExplore();
  };

  const push = (message: Omit<ChatMessage, "id">) => {
    const id = nextId();
    setMessages((current) => [...current, { ...message, id }]);
    return id;
  };

  const replaceMessage = (id: number, message: Omit<ChatMessage, "id">) => {
    setMessages((current) => current.map((item) => (item.id === id ? { ...message, id } : item)));
  };

  const run = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setDraft("");
    push({ role: "user", text: trimmed });
    const step = planAssistant(trimmed, priorKeyword.current, base, readyVocab, awaiting.current);
    awaiting.current = step.type === "say" ? (step.awaiting ?? null) : null;
    if (step.type === "fetch") {
      if (step.intent === "designs") priorKeyword.current = step.keyword;
      if (step.intent === "designs" && Object.keys(step.facets).length) {
        applyFilters(step.facets, "", step.mode);
      }
      void completeFetch(step);
      return;
    }
    answerLocal(step);
  };

  const answerLocal = (step: Exclude<AssistantStep, { type: "fetch" }>) => {
    if (step.type === "say") {
      push({ role: "assistant", text: step.text });
      return;
    }
    if (step.type === "palette") {
      push({ role: "assistant", text: step.reply, swatches: step.swatches });
      return;
    }
    if (step.type === "tags") {
      push({ role: "assistant", text: step.reply, tags: step.tags });
      return;
    }
    if (step.type === "designs-local") {
      priorKeyword.current = step.keyword;
      applyFilters(step.facets, step.query, "replace");
      push({ role: "assistant", text: step.reply });
      return;
    }
    priorKeyword.current = step.keyword;
    applyFilters(step.facets, "", "revise");
    push({ role: "assistant", text: step.reply });
  };

  const completeFetch = async (step: Extract<AssistantStep, { type: "fetch" }>) => {
    const pending = nextId();
    setMessages((current) => [...current, { id: pending, role: "assistant", text: "Looking…" }]);
    setBusy(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const data = await requestAssistant(
        { intent: step.intent, keyword: step.keyword, category, vague: step.vague },
        ctrl.signal,
      );
      if (ctrl.signal.aborted) {
        setMessages((current) => current.filter((item) => item.id !== pending));
        return;
      }
      if (data.status === "ok" && data.intent === "title") {
        replaceMessage(pending, { role: "assistant", text: data.reply, titles: data.titles });
        return;
      }
      if (data.status === "ok" && data.intent === "designs") {
        priorKeyword.current = data.keyword;
        applyFilters(data.facets, step.mode === "replace" ? queryAfterModel(data.text, readyVocab) : "", step.mode);
        replaceMessage(pending, { role: "assistant", text: data.reply });
        return;
      }
      if (data.status === "empty") {
        replaceMessage(pending, { role: "assistant", text: data.reply });
        return;
      }
      replaceMessage(pending, {
        role: "assistant",
        text: data.status === "error" ? data.message : "The assistant couldn't answer that. Try again.",
      });
    } catch {
      if (ctrl.signal.aborted) {
        setMessages((current) => current.filter((item) => item.id !== pending));
        return;
      }
      replaceMessage(pending, { role: "assistant", text: "The assistant couldn't answer that. Try again." });
    } finally {
      if (!ctrl.signal.aborted) setBusy(false);
    }
  };

  return (
    <SidePanel
      open={assistantOpen}
      onClose={() => setAssistantOpen(false)}
      width={380}
      label="Design assistant"
      testId="assistant-panel"
    >
      <div id={ASSISTANT_PANEL_ID} className="flex h-full min-h-0 flex-col">
        <div className="flex shrink-0 items-center justify-between px-4 py-2.5">
          <div className="text-xl font-semibold">Assistant</div>
          <button
            type="button"
            onClick={() => setAssistantOpen(false)}
            className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE)}
            aria-label="Collapse assistant"
          >
            <PanelRightCloseIcon className="size-4" />
          </button>
        </div>
        {assistantOpen && (
          <>
          <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto px-4 py-3">
            {messages.length === 0 && (
              <div className="flex flex-col gap-2">
                <p className="text-sm text-muted-foreground">
                  Ask for a title, a palette, tags, or designs.
                </p>
                <div className="flex flex-col items-start gap-1.5">
                  {STARTERS.map((prompt) => (
                    <button
                      key={prompt}
                      type="button"
                      onClick={() => run(prompt)}
                      className="rounded-full bg-muted px-3 py-1 text-left text-xs hover:bg-muted/70"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                onTitle={(title) => {
                  setQuery(title);
                  showExplore();
                }}
                onSwatch={(hex) => {
                  setFilters((current) => ({ ...current, color: { colors: [hex], mode: "any" } }));
                  showExplore();
                }}
                onTag={(value) => {
                  addFacet("tag", value);
                  showExplore();
                }}
              />
            ))}
          </div>
          <form
            className="shrink-0 border-t border-border/60 p-3"
            onSubmit={(event) => {
              event.preventDefault();
              run(draft);
            }}
          >
            <div className="flex items-center gap-1 rounded-full bg-muted pr-1 pl-3">
              <input
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                placeholder="Ask about a keyword"
                aria-label="Message the assistant"
                maxLength={200}
                disabled={busy}
                className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={busy || !draft.trim()}
                className="grid size-8 place-items-center rounded-full bg-foreground text-background disabled:opacity-40"
                aria-label="Send"
              >
                <ArrowUpIcon className="size-4" />
              </button>
            </div>
          </form>
          </>
        )}
      </div>
    </SidePanel>
  );
}

/** Sparkle control in the browse column's lower-right. Hidden while the panel is open. */
export function AssistantToggle() {
  const { assistantOpen, setAssistantOpen, detailOpen, pinnedBoardId } = useExplorer();
  const isMobile = useIsMobile();
  if (assistantOpen) return null;
  if (isMobile && (detailOpen || pinnedBoardId)) return null;
  return (
    <button
      type="button"
      data-testid="assistant-toggle"
      aria-expanded={false}
      aria-controls={ASSISTANT_PANEL_ID}
      onClick={() => setAssistantOpen(true)}
      className="pointer-events-auto absolute right-5 bottom-5 z-40 grid size-12 place-items-center rounded-full bg-foreground text-background shadow-lg max-lg:bottom-16"
    >
      <SparklesIcon className="size-5" aria-hidden />
      <span className="sr-only">Open assistant</span>
    </button>
  );
}

function Message({
  message,
  onTitle,
  onSwatch,
  onTag,
}: {
  message: ChatMessage;
  onTitle: (title: string) => void;
  onSwatch: (hex: string) => void;
  onTag: (value: string) => void;
}) {
  const mine = message.role === "user";
  return (
    <div className={cn("flex flex-col gap-2", mine ? "items-end" : "items-start")}>
      <p
        className={cn(
          "max-w-[90%] rounded-2xl px-3 py-2 text-sm",
          mine ? "bg-foreground text-background" : "bg-muted text-foreground",
        )}
      >
        {message.text}
      </p>
      {message.titles && message.titles.length > 0 && (
        <div className="flex flex-col items-start gap-1.5">
          {message.titles.map((title) => (
            <button
              key={title}
              type="button"
              onClick={() => onTitle(title)}
              className="rounded-full border border-border/70 px-3 py-1 text-left text-xs hover:bg-muted"
            >
              {title}
            </button>
          ))}
        </div>
      )}
      {message.swatches && message.swatches.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.swatches.map((swatch) => (
            <button
              key={swatch.name}
              type="button"
              onClick={() => onSwatch(swatch.hex)}
              className="flex items-center gap-1.5 rounded-full border border-border/70 py-1 pr-2.5 pl-1 text-xs hover:bg-muted"
              aria-label={`Filter by ${swatch.name}`}
            >
              <span className="size-4 rounded-full border border-black/10" style={{ backgroundColor: swatch.hex }} />
              <span className="capitalize">{swatch.name}</span>
              <span className="text-muted-foreground tabular-nums">{swatch.count}</span>
            </button>
          ))}
        </div>
      )}
      {message.tags && message.tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {message.tags.map((tag) => (
            <button
              key={tag.value}
              type="button"
              onClick={() => onTag(tag.value)}
              className="rounded-full border border-border/70 px-2.5 py-1 text-xs hover:bg-muted"
            >
              {tag.value}
              <span className="ml-1 text-muted-foreground tabular-nums">{tag.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
