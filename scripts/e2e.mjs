/**
 * End-to-end smoke flow + screenshots for the Savee-style shell, using an installed Chrome/Chromium.
 *   BASE_URL=http://localhost:3000 CHROME_PATH="C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" node scripts/e2e.mjs
 *
 * Covers the shell (sidebar nav, Home feed, Explore, filter panel, grid/tree toggle), the windowed
 * grid, colour search, the focused lightbox (incl. its URL), the retained similar mind-map, and boards.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SCREENSHOT_DIR ?? path.resolve("screenshots");
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));

const settle = (ms = 1500) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("screenshot", name);
};
const step = (s) => console.log("\nstep:", s);
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
  console.log("ok:", msg);
};

const rail = page.locator('aside[aria-label="Primary"]');
const at = () => new URL(page.url()).pathname;
const tilesIn = (scope = page) => scope.locator('[data-testid="grid-view"] [aria-label^="Open "]');
const gridCount = async (scope = page) => Number(await scope.getByTestId("grid-view").getAttribute("data-count"));
const popover = page.locator('[data-slot="popover-content"]');

// ---------------------------------------------------------------- Home discovery feed
step("home discovery feed (default landing, dark)");
await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.getByTestId("grid-view").waitFor();
await settle(2400);
assert((await page.locator("html.dark").count()) === 1, "dark theme is the default");
assert((await page.locator('#rail-home[aria-pressed="true"]').count()) === 1, "Home is the active sidebar entry");
assert(at() === "/", "Home lives at /");
const homeTotal = await gridCount();
assert(homeTotal > 500, `home feed shows the whole catalogue (${homeTotal})`);
const mountedTop = await tilesIn().count();
assert(mountedTop > 0 && mountedTop < homeTotal, `windowing mounts ${mountedTop} of ${homeTotal} tiles`);
await shot("00-home-feed");

step("windowing drops off-screen rows on scroll");
const firstLabel = await tilesIn().first().getAttribute("aria-label");
await page.getByTestId("grid-view").evaluate((el) => {
  el.scrollTop = Math.floor(el.scrollHeight * 0.5);
});
await settle(1000);
const mountedMid = await tilesIn().count();
const midLabel = await tilesIn().first().getAttribute("aria-label");
assert(mountedMid < homeTotal, `after scrolling, still only ${mountedMid} tiles mounted`);
assert(midLabel !== firstLabel, "scrolling swaps the mounted rows");
await shot("01-home-scrolled");

step("home: search narrows the feed and jumps to Explore");
await page.getByTestId("grid-view").evaluate((el) => {
  el.scrollTop = 0;
});
await page.locator("#template-search").fill("sale");
await page.locator("#template-search").press("Enter");
await settle(2400);
const narrowed = await gridCount();
assert(narrowed > 0 && narrowed < homeTotal, `search narrowed the feed to ${narrowed}`);
assert((await page.locator('#rail-explore[aria-pressed="true"]').count()) === 1, "searching switched to Explore");
assert(at() === "/explore" && /q=sale/.test(page.url()), "searching moves to /explore?q=…");
assert((await page.getByRole("heading", { name: /Showing results for/ }).count()) === 1, "results heading is shown");
await shot("02-home-search");
await page.getByRole("button", { name: "Clear search", exact: true }).click();
await settle(1600);

// ---------------------------------------------------------------- Explore
step("explore landing: popular tags");
await rail.getByRole("button", { name: "Explore", exact: true }).click();
await settle(1500);
assert((await page.getByText("Popular tags").count()) >= 1, "popular tags hero is shown");
const tags = page.getByTestId("popular-tags").getByRole("button");
const tagCount = await tags.count();
assert(tagCount >= 12 && tagCount <= 16, `popular tags shows the top ${tagCount}`);
await shot("03-explore-landing");

step("explore: tap a popular tag -> heading + filter toggle");
const tagName = ((await tags.first().innerText()) || "").split("\n")[0].trim();
await tags.first().click();
await settle(2400);
assert((await page.getByRole("button", { name: "Filters", exact: true }).count()) === 1, "filter toggle appears once searching");
const heading = (await page.locator("h2").first().innerText()).replace(/\n/g, " ");
console.log("   tag:", tagName, "| heading:", heading);
assert(/Filtered results|Showing results for/.test(heading), "results heading is shown");
assert((await gridCount()) < homeTotal, "tag filter narrowed the results");
assert(at() === "/explore" && /tag=/.test(page.url()), "explore search lives in /explore?tag=…");
await shot("04-explore-tag-results");

step("explore: refresh keeps the tagged search");
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByTestId("grid-view").waitFor();
await settle(2400);
assert(at() === "/explore" && /tag=/.test(page.url()), "refresh keeps /explore?tag=…");
assert(/Filtered results|Showing results for/.test((await page.locator("h2").first().innerText()).replace(/\n/g, " ")), "results are still filtered after refresh");

step("filter panel: sort + clear all");
await page.getByRole("button", { name: "Filters", exact: true }).click();
await page.getByTestId("filter-panel").waitFor();
await settle(700);
assert((await page.getByRole("radiogroup", { name: "Sort order" }).count()) === 1, "sort control is in the panel");
await page.getByRole("radiogroup", { name: "Sort order" }).getByRole("radio", { name: "shuffle" }).click();
await settle(1300);
assert(/sort=shuffle/.test(page.url()), "shuffle sort is reflected in the URL");
await shot("05-filter-panel");
await page.getByTestId("filter-panel").getByRole("button", { name: "Clear all", exact: true }).first().click();
await settle(1600);
await page.getByTestId("filter-panel").getByRole("button", { name: "Close filters" }).click();
await settle(900);

step("colour search popover: swatch + spectrum + add (unified with the side panel)");
await page.getByRole("button", { name: "Search by colour" }).click();
await page.getByText("Main colours").waitFor();
await popover.getByRole("button", { name: "orange", exact: true }).click();
await settle(500);
assert((await popover.getByRole("button", { name: "orange", exact: true }).getAttribute("aria-pressed")) === "true", "orange swatch toggles on");
await popover.getByRole("slider", { name: "Saturation and brightness" }).click({ position: { x: 20, y: 20 } });
await popover.getByRole("slider", { name: "Hue" }).click({ position: { x: 60, y: 6 } });
await settle(400);
await popover.getByRole("button", { name: "Add", exact: true }).click();
await settle(500);
await popover.getByRole("button", { name: "Clear", exact: true }).click();
await settle(400);
await popover.getByRole("button", { name: "orange", exact: true }).click();
await settle(1800);
await shot("06-color-popover");
await page.keyboard.press("Escape");
await settle(1600);
assert((await gridCount()) < homeTotal, "colour filter narrowed the results");

await page.getByRole("button", { name: "Filters", exact: true }).click();
await page.getByTestId("filter-panel").waitFor();
await settle(700);
const panelSwatch = page.getByTestId("filter-panel").getByRole("button", { name: /^orange \(/ });
assert((await panelSwatch.count()) === 1 && (await panelSwatch.getAttribute("aria-pressed")) === "true", "side panel reflects the dock colour selection");
await shot("07-color-in-panel");
await page.getByTestId("filter-panel").getByRole("button", { name: "Clear all", exact: true }).first().click();
await settle(1300);
await page.getByTestId("filter-panel").getByRole("button", { name: "Close filters" }).click();
await settle(900);

step("grid settings: fewer columns mount fewer, larger tiles");
await page.getByRole("button", { name: "Grid settings" }).click();
await page.getByText("Columns per row").waitFor();
await page.getByLabel("Columns per row").fill("3");
await settle(1200);
const mounted3 = await tilesIn().count();
assert(mounted3 > 0 && mounted3 < mountedTop, `3 columns mount ${mounted3} tiles (vs ${mountedTop} at 6)`);
await shot("08-grid-settings");
await page.getByLabel("Columns per row").fill("6");
await settle(900);
await page.keyboard.press("Escape");
await settle(500);

step("grid/tree browse toggle");
await page.getByRole("group", { name: "Browse mode" }).getByRole("button", { name: "Tree" }).click();
await page.getByTestId("tree-root").waitFor();
await settle(2600);
assert((await page.getByTestId("grid-view").count()) === 0, "tree replaces the grid when tree mode is on");
await shot("09-tree-view");
await page.getByRole("group", { name: "Browse mode" }).getByRole("button", { name: "Grid" }).click();
await settle(1500);
assert((await page.getByTestId("grid-view").count()) === 1, "grid comes back");

// ---------------------------------------------------------------- Focused lightbox
step("focused lightbox from a grid click (URL-encoded)");
const picked = (await tilesIn().first().getAttribute("aria-label")).replace(/^Open /, "");
await tilesIn().first().click();
await page.getByTestId("focused-view").waitFor();
await settle(2200);
assert(/design=[^&]+/.test(page.url()) && /view=focus/.test(page.url()), "focused design is in the URL");
assert((await page.getByTestId("focused-view").count()) === 1, "focused overlay is open");
const panelCollapsed = await page.evaluate(() => {
  const el = document.querySelector('[data-testid="detail-panel"]');
  return !!el && (el.getAttribute("aria-hidden") === "true" || el.getBoundingClientRect().width === 0);
});
assert(panelCollapsed, "details panel is collapsed by default in the lightbox");
const focusedUrl = page.url();
const relatedCount = await gridCount(page.getByTestId("focused-view"));
assert(relatedCount > 0, `related list has ${relatedCount} designs (for “${picked}”)`);
await shot("10-focused");

step("lightbox: info toggle");
await page.getByTestId("focused-view").getByRole("button", { name: "Design info" }).click();
await page.getByTestId("detail-panel").waitFor();
await settle(1000);
await shot("11-focused-info");
await page.getByRole("button", { name: "Close details (Esc)" }).click();
await settle(700);

step("lightbox: save + re-center from a related tile");
await page.getByTestId("save-button").first().click();
await settle(800);
await page.getByTestId("focused-view").locator('[data-testid="grid-view"] [aria-label^="Open "]').first().click();
await settle(1600);
assert(/design=/.test(page.url()), "re-centred design keeps the URL design param");
await shot("12-focused-recentered");

step("lightbox: back returns to the grid");
await page.getByTestId("focused-view").getByRole("button", { name: "Back", exact: true }).click();
await settle(1500);
assert((await page.getByTestId("focused-view").count()) === 0, "lightbox closes");
assert((await page.getByTestId("grid-view").count()) === 1, "grid underneath is restored");
assert(!/design=/.test(page.url()), "design param cleared on Back");

step("lightbox: deep link reopens the same design");
const deep = await context.newPage();
await deep.goto(focusedUrl, { waitUntil: "domcontentloaded" });
await deep.getByTestId("focused-view").waitFor();
await deep.waitForTimeout(1600);
const deepTitle = await deep.getByTestId("focused-view").locator("img").first().getAttribute("alt");
assert(!!deepTitle, `deep link opens the lightbox for “${deepTitle}”`);
await deep.close();

// ---------------------------------------------------------------- Retained similar mind-map
step("tree click keeps the similar mind-map (+ dedupe)");
await page.getByRole("group", { name: "Browse mode" }).getByRole("button", { name: "Tree" }).click();
await page.getByTestId("tree-root").waitFor();
await settle(2400);
await page.getByTestId("thumb").first().click();
await page.getByTestId("similar-center").waitFor();
await page.getByTestId("detail-panel").waitFor();
await settle(2400);
for (const k of ["colors", "layout", "style", "overall"]) {
  const n = await page.getByTestId(`similar-group-${k}`).getByTestId("thumb").count();
  assert(n > 0, `similar ${k} has ${n} designs`);
}
await shot("13-similar-mindmap");

const rowIds = await page.evaluate(() =>
  ["colors", "layout", "style", "overall"].map((k) =>
    Array.from(document.querySelectorAll(`[data-testid="similar-group-${k}"] [data-testid="thumb"]`)).map(
      (b) => b.querySelector("img")?.getAttribute("src") ?? b.getAttribute("aria-label"),
    ),
  ),
);
const flat = rowIds.flat();
assert(new Set(flat).size === flat.length, `no design appears in two similarity rows (${flat.length} thumbs)`);

const seeAllCount = await page.getByRole("button", { name: /^See all/ }).count();
assert(seeAllCount === 0, "similar groups have no See all button");

step("refine-from-design buttons");
await page.getByRole("button", { name: "Same palette" }).click();
await settle(1800);
assert(/color=/.test(page.url()), "Same palette sets the colour filter");
await shot("15-refined-by-palette");

step("scoped search on a focused branch");
await page.getByRole("button", { name: "Filters", exact: true }).click();
await page.getByTestId("filter-panel").waitFor();
await settle(700);
await page.getByTestId("filter-panel").getByRole("button", { name: "Clear all", exact: true }).first().click();
await settle(1400);
await page.getByTestId("filter-panel").getByRole("button", { name: "Close filters" }).click();
await settle(1000);
await page.locator('[data-testid="branch"]').first().click();
await settle(1600);
const scoped = page.getByRole("textbox", { name: /Search within/ });
assert((await scoped.count()) === 1, "branch focus reveals the scoped search box");
await scoped.fill("bold");
await settle(2000);
await shot("16-scoped-search");
await page.keyboard.press("Escape");
await settle(500);

// ---------------------------------------------------------------- Boards + theme
step("boards: full page lists saved boards");
await rail.getByRole("button", { name: "Boards", exact: true }).click();
await page.getByTestId("boards-page").waitFor();
await settle(1000);
assert((await page.getByTestId("board-card").count()) > 0, "boards page lists at least one board");
assert((await page.getByTestId("new-board-placeholder").count()) === 1, "New board placeholder is present");
assert(at() === "/boards", "boards index lives at /boards");
await shot("17-boards-page");
await page.getByRole("tab", { name: /^Saves/ }).click();
await settle(900);
await shot("17b-boards-saves");

step("board: multi-select toolbar");
await page.getByRole("tab", { name: /^Boards/ }).click();
await settle(600);
await page.getByTestId("board-card").first().click();
await settle(1400);
const boardPath = at();
assert(/^\/boards\/[A-Za-z0-9_-]+$/.test(boardPath), `a board lives at ${boardPath}`);
assert((await page.locator('#rail-boards[aria-pressed="true"]').count()) === 1, "the rail stays on Boards");
await page.getByRole("button", { name: "Select designs" }).click();
await settle(400);
await page.getByTestId("grid-view").locator("button[aria-pressed]").first().click();
await settle(400);
await page.getByTestId("board-select-bar").waitFor();
assert(/1 selected/.test(await page.getByTestId("board-select-bar").innerText()), "toolbar counts the selection");
await shot("17c-board-select");
await page.keyboard.press("Escape");
await settle(500);

// ---------------------------------------------------------------- Routing
step("routing: refresh keeps the board open");
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByTestId("grid-view").waitFor();
await settle(2200);
assert(at() === boardPath, `refresh keeps ${boardPath}`);
assert((await page.getByRole("button", { name: "Select designs" }).count()) === 1, "board detail is still open after refresh");

step("routing: brief route and Back/Forward between pages");
await rail.getByRole("button", { name: "Design brief", exact: true }).click();
await page.getByTestId("brief-page").waitFor();
assert(at() === "/brief", "brief lives at /brief");
await page.reload({ waitUntil: "domcontentloaded" });
await page.getByTestId("brief-page").waitFor();
await settle(800);
assert(at() === "/brief", "refresh keeps /brief");
await rail.getByRole("button", { name: "Explore", exact: true }).click();
await settle(900);
assert(at() === "/explore", "explore lives at /explore");
await page.goBack();
await page.getByTestId("brief-page").waitFor();
assert(at() === "/brief", "Back returns to /brief");
await page.goBack();
await page.getByTestId("grid-view").waitFor();
await settle(1800);
assert(at() === boardPath, `Back returns to ${boardPath}`);
await page.goForward();
await page.getByTestId("brief-page").waitFor();
assert(at() === "/brief", "Forward returns to /brief");
await shot("19-routing-brief");

step("theme toggle");
await page.getByRole("button", { name: "Light mode" }).click();
await settle(1000);
assert((await page.locator("html.dark").count()) === 0, "light mode applies");
await page.getByRole("button", { name: "Dark mode" }).click();
await settle(1000);
assert((await page.locator("html.dark").count()) === 1, "dark mode applies");
await shot("18-dark");

console.log("\npage errors:", pageErrors.length ? pageErrors : "none");
console.log("console errors:", consoleErrors.length ? consoleErrors : "none");
await browser.close();
if (pageErrors.length) {
  console.error("\nFAILED: uncaught page errors");
  process.exit(1);
}
console.log("\ne2e smoke flow passed");
