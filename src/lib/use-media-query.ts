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

/** Phone layout (bottom-sheet dock, full-screen details, readable tree zoom). */
export const MOBILE_QUERY = "(max-width: 767px)";
/** Wide enough for the minimap and zoom controls beside the 800px search dock. */
export const WIDE_QUERY = "(min-width: 1280px)";
export const useIsMobile = () => useMediaQuery(MOBILE_QUERY);
