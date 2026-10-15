"use client";
import { useEffect, useState, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { fetchTemplateRepository, type TemplateRepository } from "@/lib/data";

function LoadingScreen() {
  return (
    <div className="flex h-full items-center justify-center bg-canvas text-sm text-muted-foreground" role="status">
      Loading templates…
    </div>
  );
}

const Explorer = dynamic(() => import("./explorer").then((m) => m.Explorer), {
  ssr: false,
  loading: LoadingScreen,
});

type LoadState = { status: "loading" } | { status: "ready"; repo: TemplateRepository } | { status: "error"; message: string };

/**
 * Downloads the prebuilt dataset (static JSON, preloaded from the page head) and the
 * explorer code in parallel, showing the server-rendered `fallback` until both are in.
 */
export function ExplorerLoader({
  dataUrl,
  detailsUrl,
  fallback,
}: {
  dataUrl: string;
  detailsUrl?: string;
  fallback?: ReactNode;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const ac = new AbortController();
    void import("./explorer"); // start the code download alongside the data
    fetchTemplateRepository(dataUrl, detailsUrl, ac.signal).then(
      (repo) => setState({ status: "ready", repo }),
      (err: unknown) => {
        if (ac.signal.aborted) return;
        const offline = typeof navigator !== "undefined" && !navigator.onLine;
        setState({
          status: "error",
          message: offline
            ? "You're offline, so the templates couldn't be loaded."
            : err instanceof Error
              ? err.message
              : "Couldn't load templates.",
        });
      },
    );
    return () => ac.abort();
  }, [dataUrl, detailsUrl, attempt]);

  if (state.status === "ready") return <Explorer repo={state.repo} dataUrl={dataUrl} detailsUrl={detailsUrl} />;
  if (state.status === "error") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-canvas p-6 text-center" role="alert">
        <div className="text-sm font-semibold">{state.message}</div>
        <button
          type="button"
          onClick={() => {
            setState({ status: "loading" });
            setAttempt((a) => a + 1);
          }}
          className="h-9 rounded-lg bg-foreground px-4 text-sm font-medium text-background"
        >
          Try again
        </button>
      </div>
    );
  }
  return <>{fallback ?? <LoadingScreen />}</>;
}
