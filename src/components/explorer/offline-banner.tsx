"use client";
import { useEffect, useRef } from "react";
import { WifiOffIcon } from "lucide-react";
import { toast } from "@/components/ui/toast";
import { useOnline } from "@/lib/use-online";

/** Tells people they're offline (search keeps working on the loaded data) and when they're back. */
export function OfflineBanner() {
  const online = useOnline();
  const wasOffline = useRef(false);
  useEffect(() => {
    if (!online) wasOffline.current = true;
    else if (wasOffline.current) {
      wasOffline.current = false;
      toast.success("Back online", { description: "Images that failed to load are retrying." });
    }
  }, [online]);
  if (online) return null;
  return (
    <div
      role="status"
      data-testid="offline-banner"
      className="pointer-events-none absolute top-16 left-1/2 z-40 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-2 rounded-full bg-foreground px-4 py-2 text-xs font-medium text-background"
    >
      <WifiOffIcon className="size-3.5 shrink-0" aria-hidden />
      <span>You&apos;re offline. Search still works; new images will load when you reconnect.</span>
    </div>
  );
}
