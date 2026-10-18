import { normalizeHex } from "./color";

/** Minimal shape of the (Chromium-only) EyeDropper API. */
interface EyeDropperResult {
  sRGBHex: string;
}

interface EyeDropperInstance {
  open(options?: { signal?: AbortSignal }): Promise<EyeDropperResult>;
}

type EyeDropperConstructor = new () => EyeDropperInstance;

const ctor = (): EyeDropperConstructor | null => {
  if (typeof window === "undefined") return null;
  const found = (window as unknown as { EyeDropper?: EyeDropperConstructor }).EyeDropper;
  return typeof found === "function" ? found : null;
};

/** Whether the native screen eyedropper is available (Chrome/Edge today). */
export const eyeDropperSupported = (): boolean => ctor() !== null;

/**
 * Sample a colour from anywhere on screen.
 *
 * Returns a normalised hex, or `null` when the API is missing or the user cancels with Esc —
 * both are ordinary outcomes, so callers can just fall back to the manual picker.
 */
export async function pickScreenColor(): Promise<string | null> {
  const EyeDropper = ctor();
  if (!EyeDropper) return null;
  try {
    const result = await new EyeDropper().open();
    return normalizeHex(result.sRGBHex);
  } catch {
    return null;
  }
}
