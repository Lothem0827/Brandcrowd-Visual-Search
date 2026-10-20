import { cn } from "@/lib/utils";

export function ProfileAvatar({
  src,
  name,
  size = "lg",
  dashed = false,
  className,
}: {
  src?: string | null;
  name?: string;
  size?: "sm" | "md" | "lg";
  dashed?: boolean;
  className?: string;
}) {
  const dim = size === "lg" ? "size-24 text-2xl" : size === "md" ? "size-16 text-lg" : "size-9 text-xs";
  const letter = (name || "?").slice(0, 1).toUpperCase();
  if (src && !dashed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt=""
        className={cn(dim, "rounded-full object-cover", className)}
        referrerPolicy="no-referrer"
      />
    );
  }
  return (
    <span
      className={cn(
        dim,
        "flex items-center justify-center rounded-full font-medium",
        dashed
          ? "border border-dashed border-muted-foreground/40 bg-transparent text-muted-foreground"
          : "bg-muted",
        className,
      )}
    >
      {dashed ? null : letter}
    </span>
  );
}
