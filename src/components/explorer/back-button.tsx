"use client";
import type { ComponentProps } from "react";
import { ArrowLeftIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { HEADER_CONTROL, HEADER_CONTROL_IDLE } from "./header";

/**
 * The single back control for the explorer: icon-only, with its label moved into a deliberate
 * 2s hover tooltip (nobody should have to hunt for "Back"). It IS the shared header control —
 * the same 32px raised square and 16px arrow everywhere it appears, so every back affordance in
 * the app is the same target. Callers only adjust the shape through `className` (the tree
 * canvas's stacked chips use a nested `rounded-lg` inside their panel), never the size.
 */
export function BackButton({
  label = "Back",
  side = "bottom",
  onClick,
  className,
}: {
  label?: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
  onClick: () => void;
  className?: string;
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(HEADER_CONTROL, HEADER_CONTROL_IDLE, className)}
    >
      <ArrowLeftIcon className="size-4" />
    </button>
  );
  return (
    // Own provider: the 2s delay is this control's, not whatever the surrounding tree uses.
    <TooltipProvider delay={2000}>
      <Tooltip>
        <TooltipTrigger render={button} />
        <TooltipContent side={side}>{label}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
