import { useEffect, useState } from "react";

/** `value`, updated `delay` ms after it stops changing. Clearing (empty string) applies immediately. */
export function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const immediate = value === "" || delay <= 0;
    const id = setTimeout(() => setDebounced(value), immediate ? 0 : delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return debounced;
}
