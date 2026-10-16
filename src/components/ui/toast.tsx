"use client";

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { toast as sonnerToast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Every notification in the app is a shadcn `Alert` rendered inside one of sonner's toasts, so it
 * inherits the page font and the shared surface tokens instead of sonner's own chrome (its toaster
 * ships a system font stack, a border and a smaller radius).
 */
const SURFACE =
  "pointer-events-auto flex w-full items-center gap-3 rounded-lg border-0 bg-popover px-4 py-4 font-sans text-popover-foreground shadow-[0_8px_30px_rgb(0_0_0/0.18)]";

type Kind = "default" | "success" | "info" | "warning" | "error" | "loading";

/** Direct-child svgs are wrapped so the Alert variant's `> svg` rules never touch them. */
const ICONS: Record<Kind, React.ReactNode> = {
  default: null,
  success: <CircleCheckIcon className="size-4 text-[#30A46C]" />,
  info: <InfoIcon className="size-4 text-muted-foreground" />,
  warning: <TriangleAlertIcon className="size-4 text-[#F5A524]" />,
  error: <OctagonXIcon className="size-4 text-[#E5484D]" />,
  loading: (
    <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
  ),
};

export type ToastAction = { label: string; onClick: () => void };

export type ToastOptions = {
  /** Reuse an id to turn an existing alert (e.g. a loading one) into this one in place. */
  id?: string | number;
  description?: string;
  action?: ToastAction;
  duration?: number;
};

function show(
  kind: Kind,
  title: string,
  { id, description, action, duration }: ToastOptions = {},
) {
  const icon = ICONS[kind];
  return sonnerToast.custom(
    (toastId) => (
      <Alert data-kind={kind} className={SURFACE}>
        {icon ? (
          <span className="grid size-4 shrink-0 place-items-center">
            {icon}
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <AlertTitle className="text-sm leading-snug font-medium">
            {title}
          </AlertTitle>
          {description ? (
            <AlertDescription className="mt-0.5 text-xs text-muted-foreground">
              {description}
            </AlertDescription>
          ) : null}
        </div>
        {action ? (
          <Button
            type="button"
            size="sm"
            className="shrink-0 rounded-lg"
            onClick={() => {
              action.onClick();
              sonnerToast.dismiss(toastId);
            }}
          >
            {action.label}
          </Button>
        ) : null}
      </Alert>
    ),
    { id, duration: duration ?? (kind === "loading" ? Infinity : undefined) },
  );
}

/** Same call shape as sonner's `toast`, but every variant renders the shared Alert. */
export const toast = Object.assign(
  (title: string, options?: ToastOptions) => show("default", title, options),
  {
    success: (title: string, options?: ToastOptions) =>
      show("success", title, options),
    info: (title: string, options?: ToastOptions) =>
      show("info", title, options),
    warning: (title: string, options?: ToastOptions) =>
      show("warning", title, options),
    error: (title: string, options?: ToastOptions) =>
      show("error", title, options),
    loading: (title: string, options?: ToastOptions) =>
      show("loading", title, options),
    dismiss: sonnerToast.dismiss,
  },
);
