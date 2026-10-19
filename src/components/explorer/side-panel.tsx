"use client";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Right-hand explorer panel shell.
 * Desktop: in-flow width animation that pushes the main column.
 * Compact (tablet + phone): fixed right-edge drawer over a dimmed backdrop.
 */
export function SidePanel({
  open,
  onClose,
  width,
  label,
  testId,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Desktop panel width in px (compact uses min(92vw, width)). */
  width: number;
  label: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <>
      <div
        aria-hidden
        className={cn(
          "fixed inset-0 z-[50] bg-black/50 transition-opacity duration-300 lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onClose}
      />
      <aside
        aria-hidden={!open}
        aria-label={label}
        aria-modal={open || undefined}
        role={open ? "dialog" : undefined}
        data-testid={testId}
        className={cn(
          "h-full overflow-hidden bg-background",
          // Desktop: push layout by animating width.
          "relative z-20 shrink-0 transition-[width] duration-300 ease-out",
          // Compact: fixed drawer sliding from the right (covers nav + search).
          "max-lg:fixed max-lg:inset-y-0 max-lg:right-0 max-lg:z-[51] max-lg:w-[min(92vw,var(--side-panel-w))] max-lg:border-l max-lg:border-border/60 max-lg:transition-transform max-lg:duration-300 max-lg:ease-out",
          open
            ? "visible w-[var(--side-panel-w)] max-lg:translate-x-0"
            : "w-0 max-lg:pointer-events-none max-lg:translate-x-full lg:invisible",
        )}
        style={{ "--side-panel-w": `${width}px` } as CSSProperties}
      >
        <div
          inert={!open}
          className="flex h-full w-[var(--side-panel-w)] max-w-full flex-col border-l border-border/60 max-lg:w-full max-lg:border-l-0"
        >
          {children}
        </div>
      </aside>
    </>
  );
}
