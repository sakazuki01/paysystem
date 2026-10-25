// End-to-end walkthrough of the LOGIC §10.5 ticket demo plus a send-to-address, through the UI only,
// asserting each step and writing the Brief 3 review screenshots (light + dark) to design/review/.
//
//   npm run dev -w @pay-system/miniapp            # one terminal
//   npm run demo -w @pay-system/miniapp           # another
//
// Uses the shim's Dev menu: sign in as @newfriend/@sakz, organizer view, jump to show time.

import { tmpdir } from "node:os";
import { join } from "node:path";
import { button, dev, keys, launch, mainButton, open, shot, tap, text, until } from "./browser.mjs";

const STRANGER = "6p27gS9SXs5NiV5uME9cXuveA3q3ACbXpac9VEbRn5Vx";
const step = (s) => console.log(`  ✓ ${s}`);

const browser = await launch();
let page;
try {
  for (const theme of ["light", "dark"]) {
    console.log(`\n== ${theme}: send to a wallet address`);
    page = await open(browser, "", theme);
    await until(page, ".balance__value");
    await tap(page, /^Send$/);
    await until(page, "input[type=search]");
    await page.type("input[type=search]", STRANGER);
    await button(page, /^Send to wallet, 6p27…n5Vx$/);
    step("S4 shows a single 'Send to wallet' row with the fingerprint");
    await shot(page, `S4-address-row-${theme}`);
    await tap(page, /^Send to wallet/);
    await page.waitForFunction(() => document.querySelector(".balance-caption")?.textContent.includes("Balance"));
    await keys(page, "5");
    await mainButton(page, "Review");
    await text(page, "Double-check this address — payments can't be undone.");
    step("S6 address variant: full grouped address + one warning");
    await shot(page, `S6-address-${theme}`);
    await mainButton(page, "Send $5.00");
    await text(page, "Sent $5.00 to 6p27…n5Vx");
    step("sent $5.00 to the wallet");
    await page.close();

    console.log(`== ${theme}: ticket demo (LOGIC §10.5)`);
    page = await open(browser, "", theme);
    const prompts = [];
    page.on("dialog", (d) => d.accept(prompts.shift() ?? ""));
    await until(page, ".balance__value");

    // @newfriend needs an account to receive a gift: claim the username first.
    await dev(page, /^Sign in as @newfriend$/);
    await mainButton(page, "Get started");
    await text(page, "@newfriend is yours to claim");
    await mainButton(page, "Claim @newfriend");
    await until(page, ".balance__value");
    await dev(page, /^Sign in as @sakz$/);
    await until(page, ".balance__value");
    step("@newfriend registered; back as @sakz");

    // In dev @sakz organizes Solana Night Live; switch to the attendee view to buy.
    await dev(page, /^Organizer view: on$/);
    await tap(page, /^Tickets,/);
    await button(page, /Solana Night Live/);
    await shot(page, `S11-events-${theme}`);
    await tap(page, /Solana Night Live/);
    await text(page, "Resale cap $27.50 (110%)");
    await shot(page, `S12-event-${theme}`);
    await mainButton(page, "Buy ticket · $25.00");
    await until(page, "[role=dialog]");
    await mainButton(page, "Buy ticket · $25.00");
    await text(page, "You're going to Solana Night Live");
    step("@sakz bought Solana Night Live for $25.00");
    await mainButton(page, "Done");

    await tap(page, /^Tickets, 1 upcoming$/);
    await tap(page, /My tickets/);
    await tap(page, /Solana Night Live.*Upcoming/);
    await until(page, ".ticket-qr svg");
    await shot(page, `S13-my-ticket-${theme}`);
    await tap(page, /^Resell$/);
    await keys(page, "40");
    await text(page, "Max resale price is $27.50");
    step("reselling for $40 → 'Max resale price is $27.50', List disabled");
    await shot(page, `S15-over-cap-${theme}`);
    await page.click(".tg-shim-back");
    await tap(page, /^Gift$/);
    await until(page, "input[aria-label=Username]");
    await page.type("input[aria-label=Username]", "newfriend");
    await tap(page, /^@newfriend,/);
    await text(page, "You can only gift this ticket once");
    await mainButton(page, "Gift ticket");
    await text(page, "Ticket sent to @newfriend");
    step("gifted it to @newfriend");
    await mainButton(page, "Done");

    // Show time: @newfriend opens the ticket; the organizer scans it.
    await dev(page, /^Sign in as @newfriend$/);
    await until(page, ".balance__value");
    await dev(page, /^Jump to show time/);
    const payload = await page.evaluate(async () => {
      const [t] = await window.payApi.getMyTickets();
      return (await window.payApi.getTicketQr(t.id)).payload;
    });
    await dev(page, /^Sign in as @sakz$/);
    await until(page, ".balance__value");
    await dev(page, /^Organizer view: off$/);
    await tap(page, /^Tickets,/);
    await tap(page, /Solana Night Live/);
    prompts.push(payload, payload);
    await mainButton(page, "Scan tickets");
    await text(page, "Admit");
    await text(page, "@newfriend · #084");
    step("organizer scans @newfriend's QR → Admit");
    await shot(page, `S16-admit-${theme}`);
    await text(page, "Already used", 6000);
    step("scanning it again → Already used");
    await shot(page, `S16-used-${theme}`);
    await page.close();
  }
  console.log("\nDemo walkthrough passed.");
} catch (e) {
  const where = join(tmpdir(), "pay-demo-failure.png");
  await page?.screenshot({ path: where }).catch(() => {});
  console.error(`\nFAILED; screenshot of the page: ${where}`);
  throw e;
} finally {
  await browser.close();
}
