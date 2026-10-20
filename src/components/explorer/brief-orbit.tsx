"use client";
import { useMemo } from "react";
import { sampleOrbitIds } from "@/lib/orbit";
import { useExplorer } from "./context";
import { OrbitField } from "./orbit-field";
import { useEffectiveGridSettings } from "./use-grid-settings";

/** Catalogue orbit behind the moodboard empty state. Corner radius follows the grid. */
export function BriefOrbit() {
  const { base } = useExplorer();
  const { radius } = useEffectiveGridSettings();
  const ids = useMemo(() => sampleOrbitIds(base), [base]);
  return <OrbitField ids={ids} tileRadius={radius / 2} />;
}
