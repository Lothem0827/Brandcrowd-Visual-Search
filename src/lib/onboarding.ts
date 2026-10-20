import type { Page } from "./url-state";

/** Guest and signed-in browsers share this flag. It is not account data. */
export const ONBOARDING_KEY = "template-taxonomy:onboarding:v1";

/** User pan distance on the home canvas before the pan step counts. */
export const PAN_THRESHOLD_PX = 48;

export const STEP_ORDER = [
  "pan",
  "zoom",
  "pivot",
  "explore",
  "filter",
  "focus",
  "save",
  "drop",
  "boards",
] as const;

export type StepId = (typeof STEP_ORDER)[number];

export interface OnboardingState {
  /** Skip tutorial, or skipping the last step, sets this. The tour stays hidden. */
  dismissed: boolean;
  completed: StepId[];
}

export const EMPTY_ONBOARDING: OnboardingState = { dismissed: false, completed: [] };

export const STEP_COPY: Record<StepId, { title: string; body: string }> = {
  pan: {
    title: "Move around the canvas",
    body: "Drag, or scroll, to move the map. Scrolling pans the home canvas. It does not zoom.",
  },
  zoom: {
    title: "Zoom the canvas",
    body: "Hold Ctrl and scroll to zoom in or out. On a Mac, hold Cmd and scroll. A pinch does the same. Zoom only works on this home canvas.",
  },
  pivot: {
    title: "Click a design",
    body: "Click a design. Similar ones grow around it on the same map. That stays on the canvas.",
  },
  explore: {
    title: "Open Explore",
    body: "Home is an infinite canvas you pan and zoom. Explore is a results grid you scroll. Scrolling here moves down the list and does not zoom. Ctrl+scroll does nothing special. Clicking a tile opens the design, instead of growing neighbors on the map. Search and filters decide which designs are in the grid.",
  },
  filter: {
    title: "Narrow the results",
    body: "Apply a filter, or search a word such as “bold” so it becomes a chip. Typing on its own does not count.",
  },
  focus: {
    title: "Open a design",
    body: "Click a design in the grid to open it.",
  },
  save: {
    title: "Save it",
    body: "Click the Save button. On Explore, the board panel opens beside the grid.",
  },
  drop: {
    title: "Drop a design on the board",
    body: "Two ways to save a design. Click its Save button, or drag the highlighted design from the grid and drop it on the board. Dragging onto a board only works on Explore, not on the home canvas.",
  },
  boards: {
    title: "Find it on Boards",
    body: "Open Boards to see the design you saved.",
  },
};

export const DONE_COPY = {
  title: "You’re set",
  body: "You can also drop an image on the search box to match a palette, or build a moodboard from designs you like.",
};

export type OnboardingEvent =
  | { type: "pan"; distance: number; page: Page }
  | { type: "zoom"; page: Page }
  | { type: "pivot" }
  | { type: "page"; page: Page }
  | { type: "filter"; active: boolean }
  /** A text query with no facet or color. Never completes the filter step. */
  | { type: "query"; text: string }
  | { type: "focus" }
  | { type: "save"; saved: boolean }
  /** A design dropped on the docked board. Only Explore counts. */
  | { type: "drop"; page: Page }
  | { type: "skip-step" }
  | { type: "skip-tour" }
  | { type: "replay" };

export type OnboardingSignal =
  | { type: "pan"; distance: number }
  | { type: "zoom" }
  | { type: "pivot" }
  | { type: "drop" };

const listeners = new Set<(signal: OnboardingSignal) => void>();

/** Home canvas and the board panel report gestures here. The tour decides what they mean. */
export function reportOnboardingSignal(signal: OnboardingSignal) {
  for (const listener of listeners) listener(signal);
}

export function subscribeOnboardingSignal(listener: (signal: OnboardingSignal) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isStepId(value: unknown): value is StepId {
  return typeof value === "string" && (STEP_ORDER as readonly string[]).includes(value);
}

export function firstIncomplete(state: OnboardingState): StepId | null {
  for (const id of STEP_ORDER) {
    if (!state.completed.includes(id)) return id;
  }
  return null;
}

function complete(state: OnboardingState, id: StepId): OnboardingState {
  if (state.dismissed || state.completed.includes(id)) return state;
  return { ...state, completed: [...state.completed, id] };
}

export function reduceOnboarding(state: OnboardingState, event: OnboardingEvent): OnboardingState {
  switch (event.type) {
    case "replay":
      return EMPTY_ONBOARDING;
    case "skip-tour":
      return state.dismissed ? state : { ...state, dismissed: true };
    case "skip-step": {
      if (state.dismissed) return state;
      const step = firstIncomplete(state);
      if (!step) return { ...state, dismissed: true };
      const next = complete(state, step);
      if (!firstIncomplete(next)) return { ...next, dismissed: true };
      return next;
    }
    case "pan":
      if (event.page !== "home" || event.distance < PAN_THRESHOLD_PX) return state;
      return complete(state, "pan");
    case "zoom":
      if (event.page !== "home") return state;
      return complete(state, "zoom");
    case "pivot":
      return complete(state, "pivot");
    case "page": {
      let next = state;
      if (event.page === "explore") next = complete(next, "explore");
      if (event.page === "boards" && next.completed.includes("save")) next = complete(next, "boards");
      return next;
    }
    case "filter":
      if (!event.active) return state;
      return complete(state, "filter");
    case "query":
      return state;
    case "focus":
      return complete(state, "focus");
    case "save":
      if (!event.saved) return state;
      return complete(state, "save");
    case "drop":
      if (event.page !== "explore") return state;
      return complete(state, "drop");
    default:
      return state;
  }
}

export function loadOnboarding(storage: Pick<Storage, "getItem"> | null): OnboardingState {
  if (!storage) return EMPTY_ONBOARDING;
  try {
    const raw = storage.getItem(ONBOARDING_KEY);
    if (!raw) return EMPTY_ONBOARDING;
    const parsed = JSON.parse(raw) as { dismissed?: unknown; completed?: unknown };
    const completed: StepId[] = [];
    if (Array.isArray(parsed.completed)) {
      for (const id of parsed.completed) {
        if (isStepId(id) && !completed.includes(id)) completed.push(id);
      }
    }
    return { dismissed: parsed.dismissed === true, completed };
  } catch {
    return EMPTY_ONBOARDING;
  }
}

export function saveOnboarding(state: OnboardingState, storage: Pick<Storage, "setItem"> | null) {
  if (!storage) return;
  storage.setItem(ONBOARDING_KEY, JSON.stringify({ dismissed: state.dismissed, completed: state.completed }));
}

export function readOnboarding(): OnboardingState {
  try {
    return loadOnboarding(typeof window === "undefined" ? null : window.localStorage);
  } catch {
    return EMPTY_ONBOARDING;
  }
}

export function writeOnboarding(state: OnboardingState) {
  try {
    saveOnboarding(state, typeof window === "undefined" ? null : window.localStorage);
  } catch {
    /* ignore quota and private-mode failures */
  }
}

export const ONBOARDING_REPLAY_EVENT = "onboarding-replay";

/** Clears the flag and tells the open tour to start over. */
export function replayOnboarding() {
  writeOnboarding(EMPTY_ONBOARDING);
  if (typeof window !== "undefined") window.dispatchEvent(new Event(ONBOARDING_REPLAY_EVENT));
}
