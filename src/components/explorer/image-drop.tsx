"use client";
import { useEffect, useState } from "react";
import { ImagePlusIcon } from "lucide-react";
import { useExplorer } from "./context";
import { runImageSearch } from "./top-bar";

/** Drop an image anywhere on the page to search by its colors. */
export function ImageDropOverlay() {
  const { setImageQuery } = useExplorer();
  const [over, setOver] = useState(false);
  useEffect(() => {
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth++;
      setOver(true);
    };
    const leave = () => {
      depth = Math.max(0, depth - 1);
      if (!depth) setOver(false);
    };
    const overFn = (e: DragEvent) => hasFiles(e) && e.preventDefault();
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      setOver(false);
      const f = e.dataTransfer?.files?.[0];
      if (f) void runImageSearch(f, setImageQuery);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
  }, [setImageQuery]);
  if (!over) return null;
  return (
    <div className="pointer-events-none fixed inset-0 z-[60] grid place-items-center bg-background/70 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-foreground/40 bg-panel px-10 py-8 text-center shadow-xl">
        <ImagePlusIcon className="size-8" />
        <div className="text-sm font-semibold">Drop an image to find templates with similar colors</div>
        <div className="text-xs text-muted-foreground">Processed in your browser. Nothing is uploaded.</div>
      </div>
    </div>
  );
}
