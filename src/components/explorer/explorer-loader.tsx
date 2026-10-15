"use client";
import dynamic from "next/dynamic";

const Explorer = dynamic(() => import("./explorer").then((m) => m.Explorer), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-canvas text-sm text-muted-foreground">
      Loading templates…
    </div>
  ),
});

export function ExplorerLoader() {
  return <Explorer />;
}
