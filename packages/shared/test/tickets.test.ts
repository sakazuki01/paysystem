import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canBuy, canBuyListed, canCheckIn, canGift, canList, inLockWindow, resaleCap } from "../src/index.ts";

const v = JSON.parse(readFileSync(new URL("../../../shared/ticket-vectors.json", import.meta.url), "utf8"));
const H = 3_600_000;
const NOW = Date.UTC(2026, 9, 25, 12);
const event = (startsInHours: number, extra: Record<string, number> = {}) => ({
  startsAt: NOW + startsInHours * H,
  lockSecs: v.event.lockHours * 3600,
  priceCents: v.event.faceCents,
  maxResaleBps: v.event.bps,
  supply: v.event.supply,
  sold: v.event.sold,
  ...extra,
});

for (const c of v.cap) {
  test(`resaleCap: ${c.why}`, () => assert.equal(resaleCap(c.faceCents, c.bps), c.capCents));
}

test("inLockWindow: lock starts exactly lockSecs before the show", () => {
  assert.equal(inLockWindow(event(24.0001), NOW), false);
  assert.equal(inLockWindow(event(24), NOW), true);
});

for (const c of v.gift) {
  test(`canGift: ${c.case}`, () => {
    const ticket = { giftsUsed: c.giftsUsed, listedCents: c.listed ? 2600 : 0, checkedIn: c.checkedIn, faceCents: 2500 };
    assert.equal(canGift(ticket, event(c.startsInHours), { recipientRegistered: c.registered }, NOW), c.expect);
  });
}

for (const c of v.list) {
  test(`canList: ${c.case}`, () => {
    const ticket = { giftsUsed: 0, listedCents: 0, checkedIn: c.checkedIn, faceCents: 2500 };
    assert.equal(canList(ticket, event(c.startsInHours), c.priceCents, NOW), c.expect);
  });
}

for (const c of v.buy) {
  test(`canBuy: ${c.case}`, () => {
    assert.equal(canBuy(event(c.startsInHours, { sold: c.sold, supply: c.supply }), NOW), c.expect);
  });
}

for (const c of v.buyListed) {
  test(`canBuyListed: ${c.case}`, () => {
    const ticket = { owner: c.seller, listedCents: c.listedCents, checkedIn: false };
    const got = canBuyListed(ticket, event(c.startsInHours), { buyer: c.buyer ?? "sakz", expectedSeller: c.expectedSeller, expectedCents: c.expectedCents }, NOW);
    assert.equal(got, c.expect);
  });
}

for (const c of v.checkIn) {
  test(`canCheckIn: ${c.case}`, () => {
    assert.equal(canCheckIn({ checkedIn: c.checkedIn }, event(c.startsInHours), NOW), c.expect);
  });
}
