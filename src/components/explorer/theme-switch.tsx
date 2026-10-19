"use client";
import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import {
  HEADER_CONTROL_ON,
  HEADER_SEGMENT,
  HEADER_SEGMENT_ITEM,
} from "./header";

/** Light / dark segmented control (settings panel and any shared callers). */
export function ThemeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <div className={HEADER_SEGMENT} role="group" aria-label="Color theme">
      <button
        type="button"
        aria-pressed={!dark}
        aria-label="Light mode"
        title="Light mode"
        onClick={() => setTheme("light")}
        className={cn(
          HEADER_SEGMENT_ITEM,
          !dark
            ? HEADER_CONTROL_ON
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <SunIcon className="size-3.5" />
      </button>
      <button
        type="button"
        aria-pressed={dark}
        aria-label="Dark mode"
        title="Dark mode"
        onClick={() => setTheme("dark")}
        className={cn(
          HEADER_SEGMENT_ITEM,
          dark
            ? HEADER_CONTROL_ON
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        <MoonIcon className="size-3.5" />
      </button>
    </div>
  );
}
