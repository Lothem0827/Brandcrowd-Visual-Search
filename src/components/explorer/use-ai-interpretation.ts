"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FacetKey } from "@/lib/facets";
import { interpretationKey, shouldInterpret, type AiInterpretation } from "@/lib/llm";
import { cachedInterpretation, requestInterpretation } from "@/lib/llm-client";
import type { ParsedQuery } from "@/lib/query";

export type AiStatus = "idle" | "loading" | "ready";

export interface AiQueryApi {
  ai: AiInterpretation | null;
  status: AiStatus;
  /** false once the endpoint reports that no API key is configured */
  enabled: boolean;
  /** remove one interpreted chip, or the whole interpretation when called bare */
  dismiss: (facet?: FacetKey, value?: string) => void;
}

/** How long to wait after the last keystroke before asking the model. */
const DEBOUNCE_MS = 650;

/**
 * Asks the LLM to interpret a query only when the deterministic parser left
 * words it could not explain. Debounced, abortable, and cached per query.
 *
 * Everything the UI consumes is derived from the current query, so a result
 * for an older query is never shown: only the effect (the network call) holds
 * extra state.
 */
export function useAiInterpretation(
  query: string,
  category: string,
  parsed: ParsedQuery,
): AiQueryApi {
  const [result, setResult] = useState<{ key: string; value: AiInterpretation } | null>(null);
  const [status, setStatus] = useState<{ key: string; value: AiStatus }>({ key: "", value: "idle" });
  const [enabled, setEnabled] = useState(true);
  // queries the user explicitly dismissed, so a cached result doesn't pop back
  const [dismissed, setDismissed] = useState<string[]>([]);

  const trimmed = query.trim();
  const key = interpretationKey(category, trimmed);
  const asked = enabled && !dismissed.includes(key) && shouldInterpret(trimmed, parsed);
  const cached = asked ? cachedInterpretation(category, trimmed) : undefined;
  // an explicit (possibly user-trimmed) result wins over the raw cached one
  const ai = asked ? (result?.key === key ? result.value : (cached ?? null)) : null;

  const derivedStatus: AiStatus = !asked
    ? "idle"
    : ai
      ? "ready"
      : status.key === key
        ? status.value
        : // the call hasn't reported yet for this query (debounce window)
          "loading";

  useEffect(() => {
    if (!asked) return;
    // already answered for this query — the cached value is rendered directly
    if (cachedInterpretation(category, trimmed)) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setStatus({ key, value: "loading" });
      requestInterpretation(trimmed, category, ctrl.signal)
        .then((res) => {
          if (ctrl.signal.aborted) return;
          setStatus({ key, value: "ready" });
          if (res.status === "ok") setResult({ key, value: res.result });
          else if (res.status === "disabled") setEnabled(false);
        })
        .catch(() => {
          if (!ctrl.signal.aborted) setStatus({ key, value: "ready" });
        });
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [asked, category, trimmed, key]);

  const dismiss = useCallback(
    (facet?: FacetKey, value?: string) => {
      if (!ai) return;
      // bare dismiss drops the whole interpretation, keywords included
      let next: AiInterpretation | null = ai;
      if (facet && value) {
        const facets = { ...ai.facets };
        const remaining = (facets[facet] ?? []).filter((v) => v !== value);
        if (remaining.length) facets[facet] = remaining;
        else delete facets[facet];
        next = Object.keys(facets).length ? { ...ai, facets } : null;
      } else {
        next = null;
      }
      if (next) {
        setResult({ key, value: next });
      } else {
        // keep the cached answer from reappearing for this exact query
        setDismissed((d) => (d.includes(key) ? d : [...d, key]));
        setResult(null);
      }
    },
    [ai, key],
  );

  return useMemo(() => ({ ai, status: derivedStatus, enabled, dismiss }), [ai, derivedStatus, enabled, dismiss]);
}
