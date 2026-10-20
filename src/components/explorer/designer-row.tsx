"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { ProfileAvatar } from "@/components/auth/profile-avatar";
import { templateImageUrl, templateThumbSmUrl } from "@/lib/images";
import { getExploreDesigners, type ExploreDesigner } from "@/lib/social";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { cn } from "@/lib/utils";
import { useExplorer } from "./context";
import { ThumbImage } from "./thumb-image";
import { useDragScroll } from "./use-drag-scroll";
import type { Template } from "@/lib/schema";

export function DesignerRow() {
  const { user } = useAuth();
  const { byId, openProfile } = useExplorer();
  const [designers, setDesigners] = useState<ExploreDesigner[] | null>(null);
  const drag = useDragScroll();

  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    let cancelled = false;
    void getExploreDesigners({ excludeUserId: user?.id, limit: 12 }).then(
      (rows) => {
        if (!cancelled) setDesigners(rows);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  if (!isSupabaseConfigured() || !designers?.length) return null;

  return (
    <section className="min-w-0 pt-4 pb-4" data-testid="designer-row">
      <h2 className="px-1 text-sm font-normal text-muted-foreground">
        Boards from other designers
      </h2>
      <div
        className={cn(
          "mt-2 flex gap-4 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          drag.dragging ? "cursor-grabbing select-none" : "cursor-grab",
        )}
        {...drag.props}
      >
        {designers.map((d) => {
          const items = d.coverTemplateIds
            .slice(0, 2)
            .map((id) => byId(id))
            .filter((t): t is Template => !!t);
          return (
            <a
              key={d.id}
              href={`/u/${d.handle}`}
              className="w-52 shrink-0 snap-start rounded-2xl bg-panel p-2 pb-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              data-testid="designer-card"
              onClick={(e) => {
                if (
                  e.button !== 0 ||
                  e.metaKey ||
                  e.ctrlKey ||
                  e.shiftKey ||
                  e.altKey
                )
                  return;
                e.preventDefault();
                openProfile(d.handle);
              }}
            >
              <div className="relative">
                <DesignerCover items={items} />
                <ProfileAvatar
                  src={d.avatar_url}
                  name={d.display_name || d.handle}
                  size="sm"
                  className="absolute -bottom-6 left-1/2 size-12 -translate-x-1/2 ring-[3px] ring-muted"
                />
              </div>
              <div className="mt-8 px-1 text-center">
                <div className="truncate text-sm font-medium">@{d.handle}</div>
                <div className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {d.publicSaves} save{d.publicSaves === 1 ? "" : "s"}
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}

function DesignerCover({ items }: { items: Template[] }) {
  const left = items[0];
  const right = items[1];
  return (
    <div
      className={cn(
        "grid aspect-[2/1] w-full gap-[3px]",
        right ? "grid-cols-2" : "grid-cols-1",
      )}
    >
      <CoverThumb template={left} side={right ? "left" : "solo"} />
      {right ? <CoverThumb template={right} side="right" /> : null}
    </div>
  );
}

function CoverThumb({
  template,
  side,
}: {
  template?: Template;
  side: "left" | "right" | "solo";
}) {
  return (
    <span
      className={cn(
        "block min-h-0 overflow-hidden bg-muted",
        side === "left" && "rounded-l-xl",
        side === "right" && "rounded-r-xl",
        side === "solo" && "rounded-xl",
      )}
    >
      {template ? (
        <ThumbImage
          src={templateThumbSmUrl(template.templateId)}
          fallbackSrc={templateImageUrl(template.templateId)}
          alt=""
          className="size-full object-cover"
        />
      ) : null}
    </span>
  );
}
