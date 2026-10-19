import { useSyncExternalStore } from "react";

/** Subscribe to a CSS media query (false during SSR). */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onChange);
      return () => mql.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/** Phone layout (≤767px). */
export const MOBILE_QUERY = "(max-width: 767px)";
/** Tablet only (768–1023px). */
export const TABLET_QUERY = "(min-width: 768px) and (max-width: 1023px)";
/** Tablet + phone: bottom nav, search above nav, settings slide-in. */
export const COMPACT_QUERY = "(max-width: 1023px)";
/** Wide enough for the minimap and zoom controls beside the 800px search dock. */
export const WIDE_QUERY = "(min-width: 1280px)";
/** Extra-wide desktop (≥1536px). */
export const XL_QUERY = "(min-width: 1536px)";
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
export const useIsTablet = () => useMediaQuery(TABLET_QUERY);
export const useIsCompact = () => useMediaQuery(COMPACT_QUERY);
export const useIsWide = () => useMediaQuery(WIDE_QUERY);
export const useIsXl = () => useMediaQuery(XL_QUERY);
