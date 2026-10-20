"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { activeFilterCount } from "@/lib/facets";
import { getBoardStore } from "@/lib/boards";
import {
  DONE_COPY,
  EMPTY_ONBOARDING,
  ONBOARDING_REPLAY_EVENT,
  STEP_COPY,
  STEP_ORDER,
  firstIncomplete,
  readOnboarding,
  reduceOnboarding,
  subscribeOnboardingSignal,
  writeOnboarding,
  type OnboardingEvent,
  type OnboardingState,
  type StepId,
} from "@/lib/onboarding";
import { useIsCompact } from "@/lib/use-media-query";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";

function spotlightSelector(step: StepId | null, compact: boolean): string | null {
  if (step === "explore") return compact ? "#nav-explore" : "#rail-explore";
  if (step === "filter") return "[data-onboarding='filter']";
  if (step === "save") return "[data-onboarding='save']";
  if (step === "drop") return "[data-onboarding='board-drop']";
  if (step === "boards") return compact ? "#nav-boards" : "#rail-boards";
  return null;
}

type ArrowDirection = "left" | "right" | "up" | "down";

type ArrowCue = { label: string; direction: ArrowDirection };

/** Labeled arrow for the three steps whose target is easy to miss. */
function arrowCue(step: StepId | null, compact: boolean): ArrowCue | null {
  if (step === "explore") return { label: "Explore", direction: compact ? "down" : "left" };
  if (step === "filter") return { label: "Filters", direction: "up" };
  if (step === "drop") return { label: "Drop here", direction: "right" };
  return null;
}

type SpotTarget = { selector: string; cue: ArrowCue | null; hideWhen?: string; skipIfCovered?: boolean };

function targetsFor(step: StepId | null, compact: boolean): SpotTarget[] {
  if (!step) return [];
  if (step === "filter") {
    return [
      {
        selector: "[data-onboarding='filter']",
        cue: { label: "Filters", direction: "up" },
        // On a phone the open drawer covers the button, so the chip cue is enough.
        hideWhen: compact ? "[data-onboarding='filter-chip']" : undefined,
      },
      { selector: "[data-onboarding='filter-chip']", cue: { label: "Pick one", direction: "up" } },
    ];
  }
  if (step === "drop") {
    return [
      {
        selector: "[data-onboarding='drop-design']",
        cue: { label: "Drag this", direction: "up" },
        // A phone drawer covers the grid, so a hole there would land on the panel.
        skipIfCovered: true,
      },
      { selector: "[data-onboarding='board-drop']", cue: { label: "Drop here", direction: "right" } },
    ];
  }
  const selector = spotlightSelector(step, compact);
  if (!selector) return [];
  return [{ selector, cue: arrowCue(step, compact) }];
}

function arrowStyle(
  box: { top: number; left: number; width: number; height: number },
  direction: ArrowDirection,
): { top: number; left: number; transform: string } {
  const gap = 10;
  const clampX = (x: number) => Math.min(window.innerWidth - 72, Math.max(72, x));
  if (direction === "left") {
    return {
      top: box.top + box.height / 2,
      left: box.left + box.width + gap,
      transform: "translateY(-50%)",
    };
  }
  if (direction === "down") {
    return {
      top: box.top - gap,
      left: clampX(box.left + box.width / 2),
      transform: "translate(-50%, -100%)",
    };
  }
  if (direction === "up") {
    return {
      top: box.top + box.height + gap,
      left: clampX(box.left + box.width / 2),
      transform: "translateX(-50%)",
    };
  }
  return {
    top: box.top + Math.min(72, Math.max(36, box.height / 2)),
    left: box.left + 16,
    transform: "translateY(-50%)",
  };
}

function usePrefersReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduce(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduce;
}

function Spotlight({ targets, reduce }: { targets: SpotTarget[]; reduce: boolean }) {
  const [boxes, setBoxes] = useState<{ top: number; left: number; width: number; height: number; cue: ArrowCue | null }[]>([]);
  const key = targets
    .map((t) => `${t.selector}|${t.cue?.label ?? ""}|${t.cue?.direction ?? ""}|${t.hideWhen ?? ""}|${t.skipIfCovered ? 1 : 0}`)
    .join("||");

  useLayoutEffect(() => {
    if (!targets.length) {
      setBoxes([]);
      return;
    }
    const update = () => {
      const next: { top: number; left: number; width: number; height: number; cue: ArrowCue | null }[] = [];
      for (const target of targets) {
        if (target.hideWhen && document.querySelector(target.hideWhen)) continue;
        const el = document.querySelector(target.selector);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) continue;
        if (target.skipIfCovered) {
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2);
          if (!hit || !el.contains(hit)) continue;
        }
        next.push({
          top: rect.top - 4,
          left: rect.left - 4,
          width: rect.width + 8,
          height: rect.height + 8,
          cue: target.cue,
        });
      }
      setBoxes((prev) => {
        if (
          prev.length === next.length &&
          prev.every(
            (box, i) =>
              box.top === next[i].top &&
              box.left === next[i].left &&
              box.width === next[i].width &&
              box.height === next[i].height &&
              box.cue?.label === next[i].cue?.label &&
              box.cue?.direction === next[i].cue?.direction,
          )
        ) {
          return prev;
        }
        return next;
      });
    };
    update();
    const id = window.setInterval(update, 200);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
    // `key` captures selector and cue changes. `targets` is a fresh array each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!boxes.length) return null;
  const holes = boxes
    .map((box) => {
      const radius = Math.min(12, box.width / 2, box.height / 2);
      const right = box.left + box.width;
      const bottom = box.top + box.height;
      return [
        `M${box.left + radius} ${box.top}`,
        `H${right - radius}`,
        `A${radius} ${radius} 0 0 1 ${right} ${box.top + radius}`,
        `V${bottom - radius}`,
        `A${radius} ${radius} 0 0 1 ${right - radius} ${bottom}`,
        `H${box.left + radius}`,
        `A${radius} ${radius} 0 0 1 ${box.left} ${bottom - radius}`,
        `V${box.top + radius}`,
        `A${radius} ${radius} 0 0 1 ${box.left + radius} ${box.top}`,
        "Z",
      ].join(" ");
    })
    .join(" ");
  const veil = `M0 0 H${window.innerWidth} V${window.innerHeight} H0 Z ${holes}`;
  return (
    <>
      <svg
        aria-hidden
        data-testid="onboarding-dim"
        viewBox={`0 0 ${window.innerWidth} ${window.innerHeight}`}
        preserveAspectRatio="none"
        className="pointer-events-none fixed inset-0 z-[55] h-full w-full"
      >
        <path d={veil} fill="rgb(0 0 0 / 0.5)" fillRule="evenodd" />
      </svg>
      {boxes.map((box, i) => {
        const place = box.cue ? arrowStyle(box, box.cue.direction) : null;
        return (
          <div key={i}>
            <div
              aria-hidden
              data-testid="onboarding-spotlight"
              className={cn(
                "pointer-events-none fixed z-[60] rounded-xl ring-2 ring-foreground",
                !reduce && "transition-[top,left,width,height] duration-200",
              )}
              style={{ top: box.top, left: box.left, width: box.width, height: box.height }}
            />
            {box.cue && place && (
              <div
                aria-hidden
                data-testid="onboarding-arrow"
                data-onboarding-arrow={box.cue.direction}
                className="pointer-events-none fixed z-[70] rounded-md bg-foreground px-3.5 py-2 text-sm text-background"
                style={place}
              >
                {box.cue.label}
                <span
                  className={cn(
                    "absolute size-3 rotate-45 rounded-[2px] bg-foreground",
                    box.cue.direction === "left" && "top-1/2 -left-1.5 -translate-y-1/2",
                    box.cue.direction === "right" && "top-1/2 -right-1.5 -translate-y-1/2",
                    box.cue.direction === "up" && "left-1/2 -top-1.5 -translate-x-1/2",
                    box.cue.direction === "down" && "left-1/2 -bottom-1.5 -translate-x-1/2",
                  )}
                />
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

/**
 * First-visit checklist. It never covers the page: the card is the instruction,
 * and a ring marks the control for the current step when one exists.
 */
export function OnboardingTour() {
  const { page, query, filters, effective, view, homePivotId, setFilterPanelOpen, setView, pinBoard } = useExplorer();
  const compact = useIsCompact();
  const reduce = usePrefersReducedMotion();
  const [state, setState] = useState<OnboardingState>(readOnboarding);
  const dropLaidOut = useRef(false);
  const [latched, setLatched] = useState(false);
  const [force, setForce] = useState(false);
  const pageRef = useRef(page);
  const focusedIdRef = useRef<string | null>(null);
  const visibleRef = useRef(false);

  pageRef.current = page;
  focusedIdRef.current = view.kind === "focused" ? view.id : null;

  const bare =
    page === "home" &&
    !query.trim() &&
    !homePivotId &&
    view.kind === "search" &&
    activeFilterCount(filters) === 0 &&
    !filters.color;

  const dispatch = useCallback((event: OnboardingEvent) => {
    setState((prev) => {
      const next = reduceOnboarding(prev, event);
      if (next === prev) return prev;
      writeOnboarding(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const onReplay = () => {
      setState(EMPTY_ONBOARDING);
      setForce(true);
      setLatched(true);
    };
    window.addEventListener(ONBOARDING_REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(ONBOARDING_REPLAY_EVENT, onReplay);
  }, []);

  useEffect(() => {
    if (state.dismissed) {
      setLatched(false);
      setForce(false);
      return;
    }
    if (force || bare) setLatched(true);
  }, [state.dismissed, force, bare]);

  const visible = !state.dismissed && latched;
  visibleRef.current = visible;

  useEffect(() => {
    return subscribeOnboardingSignal((signal) => {
      if (!visibleRef.current) return;
      if (signal.type === "pan") dispatch({ type: "pan", distance: signal.distance, page: "home" });
      else if (signal.type === "zoom") dispatch({ type: "zoom", page: "home" });
      else if (signal.type === "pivot") dispatch({ type: "pivot" });
      else if (signal.type === "drop") dispatch({ type: "drop", page: pageRef.current });
    });
  }, [dispatch]);

  useEffect(() => {
    if (!visible) return;
    dispatch({ type: "page", page });
  }, [visible, page, dispatch]);

  useEffect(() => {
    if (!visible) return;
    const active = activeFilterCount(effective) > 0 || !!effective.color;
    dispatch({ type: "filter", active });
  }, [visible, effective, dispatch]);

  useEffect(() => {
    if (!visible || page !== "explore") return;
    if (firstIncomplete(state) !== "filter") return;
    setFilterPanelOpen(true);
  }, [visible, page, state, setFilterPanelOpen]);

  useEffect(() => {
    const onDropStep = visible && page === "explore" && firstIncomplete(state) === "drop";
    if (!onDropStep) {
      dropLaidOut.current = false;
      return;
    }
    if (dropLaidOut.current) return;
    dropLaidOut.current = true;
    const store = getBoardStore();
    if (!store.pinnedBoardId()) pinBoard(store.lastUsedBoardId());
    if (view.kind !== "search") setView({ kind: "search" });
  }, [visible, page, state, view, pinBoard, setView]);

  useEffect(() => {
    if (!visible) return;
    if (view.kind === "focused") dispatch({ type: "focus" });
  }, [visible, view, dispatch]);

  useEffect(() => {
    if (!visible) return;
    const store = getBoardStore();
    const idsOf = () => new Set(store.list().flatMap((board) => board.templateIds));
    let prev = idsOf();
    return store.subscribe(() => {
      const next = idsOf();
      const focusedId = focusedIdRef.current;
      if (focusedId && next.has(focusedId) && !prev.has(focusedId)) {
        dispatch({ type: "save", saved: true });
      }
      prev = next;
    });
  }, [visible, dispatch]);

  if (!visible) return null;

  const step = firstIncomplete(state);
  const done = step === null;
  const copy = done ? DONE_COPY : STEP_COPY[step];

  return (
    <>
      <Spotlight targets={targetsFor(done ? null : step, compact)} reduce={reduce} />
      <section
        aria-label="Tutorial"
        data-testid="onboarding-tour"
        data-onboarding-step={done ? "done" : step}
        className={cn(
          "fixed z-[70] w-[min(20.5rem,calc(100%-1.5rem))] rounded-2xl bg-panel p-3 text-foreground shadow-lg ring-1 ring-foreground/10",
          "left-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] lg:bottom-6 lg:left-[4.75rem]",
        )}
      >
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-sm font-semibold">{copy.title}</h2>
          <p className="shrink-0 text-[11px] text-muted-foreground tabular-nums">
            {done ? "Done" : `${STEP_ORDER.indexOf(step) + 1} of ${STEP_ORDER.length}`}
          </p>
        </div>
        <p className="mt-1.5 text-[13px] leading-snug text-muted-foreground" aria-live="polite">
          {copy.body}
        </p>
        {!done && (
          <ol className="mt-3 space-y-1">
            {STEP_ORDER.map((id) => {
              const complete = state.completed.includes(id);
              const current = id === step;
              return (
                <li
                  key={id}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    current ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "grid size-4 shrink-0 place-items-center rounded-full ring-1 ring-foreground/15",
                      complete && "bg-foreground text-background ring-foreground",
                      current && !complete && "ring-foreground",
                    )}
                    aria-hidden
                  >
                    {complete ? <CheckIcon className="size-2.5" /> : null}
                  </span>
                  <span className={cn(complete && "line-through")}>{STEP_COPY[id].title}</span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="mt-3 flex items-center justify-between gap-3">
          {done ? (
            <span />
          ) : (
            <button
              type="button"
              data-testid="onboarding-skip-step"
              onClick={() => dispatch({ type: "skip-step" })}
              className="text-xs text-muted-foreground hover:text-foreground"
            >
              Skip this step
            </button>
          )}
          <button
            type="button"
            data-testid="onboarding-skip-tour"
            onClick={() => dispatch({ type: "skip-tour" })}
            className="rounded-lg bg-foreground px-2.5 py-1.5 text-xs font-medium text-background hover:bg-foreground/90"
          >
            Skip tutorial
          </button>
        </div>
      </section>
    </>
  );
}
