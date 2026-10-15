/**
 * End-to-end smoke flow + screenshots, using an installed Chrome/Chromium.
 *   BASE_URL=http://localhost:3000 CHROME_PATH=/usr/bin/google-chrome node scripts/e2e.mjs
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import path from "node:path";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const OUT = process.env.SCREENSHOT_DIR ?? path.resolve("../screenshots");
const CHROME = process.env.CHROME_PATH ?? "/usr/bin/google-chrome";
mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
page.on("console", (m) => m.type() === "error" && errors.push(m.text()));

const settle = (ms = 1800) => page.waitForTimeout(ms);
const shot = async (name) => {
  await page.screenshot({ path: path.join(OUT, `${name}.png`) });
  console.log("screenshot", name);
};
const step = (s) => console.log("step:", s);

await page.goto(BASE, { waitUntil: "networkidle" });
await page.getByTestId("tree-root").waitFor();
await settle();
await shot("00-all-templates");

step("search 'construction bold design'");
await page.keyboard.press("/");
await page.keyboard.type("construction bold design", { delay: 15 });
await page.keyboard.press("Escape");
await settle(2200);
const rootText = await page.getByTestId("tree-root").innerText();
console.log("root:", rootText.replace(/\n/g, " | "));
if (!/construction bold/i.test(rootText)) throw new Error("root label did not update");
const chipText = await page.locator("text=Detected").count();
if (!chipText) throw new Error("no detected chips");
const thumbs = page.getByTestId("thumb");
console.log("thumbs in tree:", await thumbs.count());
await thumbs.first().hover();
await settle(500);
await shot("01-search-tree");

step("click a design -> similar");
await page.mouse.move(5, 5);
await thumbs.first().click();
await page.getByTestId("similar-center").waitFor();
await page.getByTestId("detail-panel").waitFor();
await settle(2000);
await shot("04-detail");
await page.getByRole("button", { name: /Close details/ }).click();
await settle(1200);
for (const k of ["colors", "layout", "style", "overall"]) {
  const n = await page.getByTestId(`similar-group-${k}`).getByTestId("thumb").count();
  console.log(`similar ${k}:`, n);
  if (!n) throw new Error(`no similar ${k}`);
}
await shot("02-similar");

step("toggle All categories");
await page.getByRole("radio", { name: /All categories/ }).click();
await settle(2000);
await shot("03-similar-all-categories");

step("re-center by clicking a similar design");
await page.getByTestId("similar-group-overall").getByTestId("thumb").first().click();
await settle(1500);
const crumbs = await page.getByRole("navigation", { name: "Breadcrumb" }).innerText();
console.log("breadcrumb:", crumbs.replace(/\n/g, " "));

step("save to a new board");
await page.getByTestId("detail-panel").waitFor();
await page.getByTestId("board-picker").click();
await page.getByTestId("new-board-input").fill("Bold construction refs");
await page.keyboard.press("Enter");
await settle(600);
await shot("05-save-to-board");
await page.keyboard.press("Escape");
await page.getByTestId("save-button").click(); // quick-save to "Saved" too
await settle(400);

step("open boards panel and the new board");
await page.getByRole("button", { name: /^Boards/ }).click();
await page.getByTestId("boards-panel").waitFor();
await settle(800);
await shot("06-boards-panel");
await page.getByTestId("board-item").filter({ hasText: "Bold construction refs" }).click();
await settle(1800);
const boardRoot = await page.getByTestId("tree-root").innerText();
console.log("board root:", boardRoot.replace(/\n/g, " | "));
if (!/Bold construction refs/.test(boardRoot)) throw new Error("board tree not shown");
await shot("07-board-tree");

step("dark mode");
await page.getByRole("button", { name: "Back to search" }).click();
await page.getByRole("button", { name: "Dark mode" }).click();
await settle(1800);
await shot("08-dark-search-tree");
await page.getByTestId("thumb").nth(1).click();
await settle(2000);
await shot("09-dark-similar");

step("filters drawer + quick filter");
await page.getByRole("button", { name: "Light mode" }).click();
await page.getByRole("button", { name: /Close details/ }).click().catch(() => {});
await page.locator("nav[aria-label=Breadcrumb] button").first().click();
await settle(800);
await page.getByRole("button", { name: /^Layout/ }).click();
await settle(600);
await shot("10-layout-filter");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: /More filters/ }).click();
await settle(600);
await page.getByRole("button", { name: /Typography/ }).click();
await settle(400);
await shot("11-more-filters");
await page.keyboard.press("Escape");

step("branch focus");
await settle(500);
const branch = page.locator(".react-flow__node button[data-testid=branch]").first();
await branch.click();
await settle(1200);
await shot("12-branch-focus");

step("image search");
await page.keyboard.press("Escape");
await page.getByRole("button", { name: "Clear all" }).first().click();
const sample = process.env.SAMPLE_IMAGE;
if (sample) {
  await page.getByTestId("image-upload").setInputFiles(sample);
  await settle(2200);
  const r = await page.getByTestId("tree-root").innerText();
  console.log("image root:", r.replace(/\n/g, " | "));
  if (!/Uploaded image/.test(r)) throw new Error("image search tree not shown");
  await shot("13-image-search");
}

console.log("console errors:", errors.length ? errors : "none");
await browser.close();
