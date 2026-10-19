import { describe, expect, it } from "vitest";
import type { Board } from "./boards";
import { milestoneForCount, uniqueDesignCount } from "./sync-nudge";

function board(ids: string[]): Board {
  return {
    id: "b1",
    name: "Test",
    templateIds: ids,
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("sync-nudge", () => {
  it("counts unique designs across boards", () => {
    expect(uniqueDesignCount([board(["a", "b"]), board(["b", "c"])])).toBe(3);
  });

  it("milestones every 5 saves", () => {
    expect(milestoneForCount(0)).toBeNull();
    expect(milestoneForCount(4)).toBeNull();
    expect(milestoneForCount(5)).toBe(5);
    expect(milestoneForCount(10)).toBe(10);
    expect(milestoneForCount(11)).toBeNull();
  });
});
