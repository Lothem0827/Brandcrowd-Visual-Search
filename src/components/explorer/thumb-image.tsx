"use client";
import { useEffect, useState, type CSSProperties } from "react";
import { ImageOffIcon, RotateCwIcon } from "lucide-react";
import { withRetry } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * <img> with a skeleton while loading and a fallback when it fails. Failed images retry
 * once automatically and again whenever the browser comes back online. With `retryButton`
 * (only where it isn't nested in another button) a manual "Retry" is shown as well.
 */
export function ThumbImage({
  src,
  alt,
  className,
  style,
  eager,
  retryButton,
}: {
  src: string;
  alt: string;
  className?: string;
  style?: CSSProperties;
  eager?: boolean;
  retryButton?: boolean;
}) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Reset the skeleton for a new src. Done in the render phase (not an effect) so the skeleton
  // paints with the new src instead of a frame later. Matters in the lightbox, where details
  // swap the cached thumbnail for the full preview after mount.
  const [loadedSrc, setLoadedSrc] = useState(src);
  if (loadedSrc !== src) {
    setLoadedSrc(src);
    setStatus("loading");
  }
  const retry = () => {
    setStatus("loading");
    setAttempt((a) => a + 1);
  };
  useEffect(() => {
    if (status !== "error") return;
    const onOnline = () => {
      setStatus("loading");
      setAttempt((a) => a + 1);
    };
    window.addEventListener("online", onOnline);
    const timer = attempt === 0 && navigator.onLine ? window.setTimeout(onOnline, 2500) : undefined;
    return () => {
      window.removeEventListener("online", onOnline);
      window.clearTimeout(timer);
    };
  }, [status, attempt]);

  return (
    <span className="relative flex size-full items-center justify-center">
      {status === "loading" && src && !style?.backgroundImage && (
        <span aria-hidden className="absolute inset-0 animate-pulse bg-muted" />
      )}
      {status === "error" && (
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-muted text-muted-foreground">
          <ImageOffIcon className="size-4" aria-hidden />
          <span className="sr-only">Image unavailable</span>
          {retryButton && (
            <button
              type="button"
              onClick={retry}
              className="mt-1 flex h-7 items-center gap-1 rounded-lg bg-panel px-2.5 text-xs font-medium text-foreground hover:bg-background"
            >
              <RotateCwIcon className="size-3" aria-hidden /> Retry
            </button>
          )}
        </span>
      )}
      {/* An empty src makes the browser re-request the page, so skip the <img> entirely. */}
      {src && (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={attempt}
          src={withRetry(src, attempt)}
          alt={alt}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus("loaded")}
          onError={() => setStatus("error")}
          className={cn(className, status === "error" && "invisible")}
          style={style}
        />
      )}
    </span>
  );
}
