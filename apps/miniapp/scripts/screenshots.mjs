// Design-review screenshots: drives the running dev server with a locally installed
// Chrome/Edge (puppeteer-core, no browser download) and writes PNGs to design/review/.
//
//   npm run dev -w @pay-system/miniapp            # in one terminal
//   npm run screenshots -w @pay-system/miniapp    # in another
//
// Env: BASE (default http://localhost:5173), BROWSER (path to chrome/msedge).

import { existsSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = fileURLToPath(new URL("../../../design/review/", import.meta.url));
const CANDIDATES = [
  process.env.BROWSER,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);
const executablePath = CANDIDATES.find((p) => existsSync(p));
if (!executablePath) throw new Error("No Chrome/Edge found; set BROWSER=/path/to/chrome");

const FREEZE = "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}";

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ executablePath, headless: true });

async function open(query, theme, height = 640) {
  const page = await browser.newPage();
  await page.setViewport({ width: 360, height, deviceScaleFactor: 2 });
  await page.goto(`${BASE}/${query}${query ? "&" : "?"}theme=${theme}`, { waitUntil: "networkidle0" });
  await page.addStyleTag({ content: FREEZE });
  return page;
}

const shot = async (page, name) => {
  await page.evaluate(() => document.fonts.ready);
  await new Promise((r) => setTimeout(r, 150));
  await page.screenshot({ path: `${OUT}${name}.png` });
  console.log("  wrote", `${name}.png`);
};

// In-page helpers, same moves a user makes.
const button = (page, re) =>
  page.waitForFunction(
    (src) => [...document.querySelectorAll("button")].find((b) => new RegExp(src).test(b.getAttribute("aria-label") || b.textContent)),
    { timeout: 5000 },
    re.source,
  );
const tap = async (page, re) => (await button(page, re)).asElement().click();
const mainButton = async (page) => {
  await page.waitForFunction(() => { const b = document.querySelector(".tg-shim-main"); return b && !b.hidden && !b.disabled; });
  await page.click(".tg-shim-main");
};
const until = (page, selector) => page.waitForSelector(selector, { timeout: 5000 });

async function toAmount(page, handle, row) {
  await tap(page, /^Send$/);
  await until(page, "input[type=search]");
  await page.type("input[type=search]", handle);
  await tap(page, row);
  await page.waitForFunction(() => document.querySelector(".balance-caption")?.textContent.includes("Balance"));
}

for (const theme of ["light", "dark"]) {
  console.log(theme);

  // S3 → S5 → S6 (@alex2: both warnings) → S8
  let page = await open("", theme);
  await until(page, ".balance__value");
  await shot(page, `S3-home-${theme}`);
  await toAmount(page, "alex2", /^@alex2, New/);
  for (const k of ["1", "0"]) await tap(page, new RegExp(`^${k}$`));
  await shot(page, `S5-amount-${theme}`);
  await mainButton(page);
  await until(page, ".fee-row");
  await shot(page, `S6-confirm-alex2-${theme}`);
  await mainButton(page);
  await until(page, ".success__mark");
  await shot(page, `S8-success-${theme}`);
  await page.close();

  // S6 + S8 escrow (@newfriend)
  page = await open("", theme);
  await until(page, ".balance__value");
  await toAmount(page, "newfriend", /^Send to @newfriend on Telegram/);
  await tap(page, /^\$10$/);
  await mainButton(page);
  await until(page, ".fee-row");
  await shot(page, `S6-confirm-escrow-${theme}`);
  await mainButton(page);
  await until(page, ".success__mark");
  await shot(page, `S8-success-escrow-${theme}`);
  await page.close();

  // S2 lookalike (@5akz)
  page = await open("?as=newfriend", theme);
  await mainButton(page); // Get started
  await until(page, "input[aria-label=Username]");
  await page.waitForFunction(() => document.querySelector(".username-input__status")?.textContent.includes("yours to claim"));
  await page.focus("input[aria-label=Username]");
  await page.$eval("input[aria-label=Username]", (el) => el.select());
  await page.type("input[aria-label=Username]", "5akz");
  await page.waitForFunction(() => document.querySelector(".username-input__status")?.textContent.includes("Too similar"));
  await shot(page, `S2-username-lookalike-${theme}`);
  await page.close();
}

// S5 on a short screen (keypad keys shrink to 56 px under 600 px tall)
console.log("short viewport");
const short = await open("", "light", 560);
await until(short, ".balance__value");
await toAmount(short, "alex", /^@alex, Paid/);
for (const k of ["2", "5"]) await tap(short, new RegExp(`^${k}$`));
const keyHeight = await short.$eval(".keypad__key", (el) => el.getBoundingClientRect().height);
const overflow = await short.evaluate(() => document.documentElement.scrollWidth > innerWidth);
console.log(`  keypad key height at 360x560: ${keyHeight}px, horizontal overflow: ${overflow}`);
await shot(short, "S5-amount-360x560-light");

await browser.close();
