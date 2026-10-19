import { describe, expect, it } from "vitest";
import {
  buildMoodboardTitlePrompt,
  fillMoodboardTitles,
  sanitizeMoodboardTitles,
} from "./moodboard-titles";

const examples = [
  "Modern Construction Services",
  "Home Construction Experts",
  "Trusted Construction Company",
];

describe("buildMoodboardTitlePrompt", () => {
  it("includes the subject and the common titles the model should learn from", () => {
    const { system, user } = buildMoodboardTitlePrompt("Construction", examples);
    expect(system).toContain("Do not copy an example");
    expect(system).toContain('{"titles"');
    expect(user).toContain("Subject: Construction");
    for (const title of examples) expect(user).toContain(title);
  });
});

describe("sanitizeMoodboardTitles", () => {
  it("title-cases, drops copies and near-copies, and keeps six", () => {
    const titles = sanitizeMoodboardTitles(
      {
        titles: [
          "fresh construction crew",
          "Modern Construction Services",
          "modern construction service",
          "bold construction studio",
          "local construction team",
          "urban construction works",
          "bright construction co",
          "solid construction group",
          "extra construction outfit",
        ],
      },
      examples,
    );
    expect(titles).toHaveLength(6);
    expect(titles[0]).toBe("Fresh Construction Crew");
    expect(titles.some((title) => title.toLowerCase().includes("modern construction"))).toBe(false);
    expect(new Set(titles.map((title) => title.toLowerCase())).size).toBe(6);
  });

  it("drops empties, one-word titles, and non-strings", () => {
    expect(
      sanitizeMoodboardTitles(
        { titles: ["", "   ", "Construction", 12, null, "Site Crew"] },
        examples,
      ),
    ).toEqual(["Site Crew"]);
  });

  it("returns nothing for a reply that is not an object", () => {
    expect(sanitizeMoodboardTitles("nope", examples)).toEqual([]);
    expect(sanitizeMoodboardTitles({}, examples)).toEqual([]);
  });
});

describe("fillMoodboardTitles", () => {
  it("names a full model list as model", () => {
    const primary = ["A One", "B Two", "C Three", "D Four", "E Five", "F Six"];
    expect(fillMoodboardTitles(primary, ["Fallback Title"])).toEqual({
      titles: primary,
      source: "model",
    });
  });

  it("pads a short model list and marks it mixed", () => {
    const filled = fillMoodboardTitles(
      ["Fresh Construction Crew"],
      ["Bold Construction Studio", "Fresh Construction Crew", "Local Construction Team"],
    );
    expect(filled.source).toBe("mixed");
    expect(filled.titles).toEqual([
      "Fresh Construction Crew",
      "Bold Construction Studio",
      "Local Construction Team",
    ]);
  });

  it("uses only the catalogue list when the model returned nothing", () => {
    expect(fillMoodboardTitles([], ["Bold Construction Studio"])).toEqual({
      titles: ["Bold Construction Studio"],
      source: "catalogue",
    });
  });
});
