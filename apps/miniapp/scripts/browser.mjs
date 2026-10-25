// Shared puppeteer-core helpers for the screenshot and demo scripts.
// Drives a locally installed Chrome/Edge against the running dev server (no browser download).

import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

export const BASE = process.env.BASE ?? "http://localhost:5173";
export const OUT = fileURLToPath(new URL("../../../design/review/", import.meta.url));

const CANDIDATES = [
  process.env.BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

export async function launch() {
  const executablePath = CANDIDATES.find((p) => existsSync(p));
  if (!executablePath) throw new Error("No Chrome/Edge found; set BROWSER=/path/to/chrome");
  mkdirSync(OUT, { recursive: true });
  return puppeteer.launch({ executablePath, headless: true });
}

export async function open(browser, query, theme, height = 640) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/${query}${query ? "&" : "?"}theme=${theme}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: FREEZE });
  return page;
}

export async function shot(page, name) {
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log("  wrote", `${name}.png`);
}

/** Wait for a VISIBLE, enabled button whose aria-label (or text) matches (hidden menus don't count). */
export const button = (page, re, timeout = 5000) =>
  page.waitForFunction(
    (src) => [...document.querySelectorAll("button")].find((b) => !b.disabled && b.getClientRects().length > 0 && new RegExp(src).test(b.getAttribute("aria-label") || b.textContent)),
    { timeout },
    re.source,
  );
/** Click a matching button. Dispatches on the live element, so a re-render between find and click can't miss. */
export async function tap(page, re) {
  await button(page, re);
  await page.evaluate((src) => {
    const b = [...document.querySelectorAll("button")].find((x) => !x.disabled && x.getClientRects().length > 0 && new RegExp(src).test(x.getAttribute("aria-label") || x.textContent));
    b.click();
  }, re.source);
}

export async function mainButton(page, text) {
  await page.waitForFunction(
    (t) => {
      const b = document.querySelector(".tg-shim-main");
      return b && !b.hidden && !b.disabled && (!t || b.textContent.includes(t));
    },
    { timeout: 8000 },
    text ?? "",
  );
  await page.click(".tg-shim-main");
}

export const until = (page, selector, timeout = 8000) => page.waitForSelector(selector, { timeout });
export const text = (page, t, timeout = 8000) =>
  page.waitForFunction((s) => document.body.innerText.includes(s), { timeout }, t);

/** Run a shim "Dev" menu item by its label. */
export async function dev(page, re) {
  await page.click(".tg-shim-dev");
  await tap(page, re);
}

export async function keys(page, digits) {
  for (const k of digits) await tap(page, new RegExp(`^${k === "." ? "Decimal point" : k}$`));
}

export async function toAmount(page, input, row) {
  await tap(page, /^Send$/);
  await until(page, "input[type=search]");
  await page.type("input[type=search]", input);
  await tap(page, row);
  await page.waitForFunction(() => document.querySelector(".balance-caption")?.textContent.includes("Balance"));
}
