import { describe, expect, it } from "vitest";
import { MockPayApi, SEED_EVENTS } from "./MockPayApi";
import { PayApiError } from "./PayApi";

const api = (opts: ConstructorParameters<typeof MockPayApi>[0] = {}) => new MockPayApi({ latencyMs: 0, ...opts });
const intent = (n: number) => n.toString(16).padStart(32, "0");

describe("tickets seed (Brief 3)", () => {
  it("lists Solana Night Live, a sold-out afterparty and an event inside the lock window", async () => {
    const events = await api().listEvents();
    const snl = events.find((e) => e.id === SEED_EVENTS.snl)!;
    expect(snl).toMatchObject({ name: "Solana Night Live", venue: "The Glasshouse", priceCents: 2500, maxResaleBps: 11000, supply: 120, sold: 83 });
    const hack = events.find((e) => e.id === SEED_EVENTS.hack)!;
    expect(hack.sold).toBe(hack.supply);
    const soon = events.find((e) => e.id === SEED_EVENTS.soon)!;
    expect(soon.startsAt - Date.now()).toBeLessThan(24 * 3_600_000);
  });

  it("SNL has two resale listings, cheapest first; @sakz owns no tickets", async () => {
    const a = api();
    const snl = (await a.getEvent(SEED_EVENTS.snl))!;
    expect(snl.listings.map((l) => l.priceCents)).toEqual([2600, 2750]);
    expect(snl.isOrganizer).toBe(true);
    expect(await a.getMyTickets()).toEqual([]);
  });
});

describe("buy", () => {
  it("buy → appears in my tickets, organizer paid, sold +1", async () => {
    const a = api();
    const res = await a.buyTicket(SEED_EVENTS.snl, intent(1));
    expect(res.ticket.ticketNo).toBe(84);
    expect((await a.getMyTickets()).map((t) => t.id)).toEqual([res.ticket.id]);
    expect(await a.getBalance()).toBe(12450 - 2500 + 2500); // @sakz is also the organizer: pays himself
    expect((await a.getEvent(SEED_EVENTS.snl))!.sold).toBe(84);
  });

  it("e. the same intent twice buys ONE ticket", async () => {
    const a = api({ me: "alex" });
    const first = await a.buyTicket(SEED_EVENTS.snl, intent(2));
    const again = await a.buyTicket(SEED_EVENTS.snl, intent(2));
    expect(again.ticket.id).toBe(first.ticket.id);
    expect(await a.getMyTickets()).toHaveLength(2); // the seeded listed one + this
    expect(await a.getBalance()).toBe(8000 - 2500);
  });

  it("sold out", async () => {
    await expect(api().buyTicket(SEED_EVENTS.hack, intent(3))).rejects.toMatchObject({ code: "sold_out" });
  });
});

describe("resale", () => {
  it("f. stale price → listing_changed and no charge", async () => {
    const a = api();
    const [cheapest] = (await a.getEvent(SEED_EVENTS.snl))!.listings;
    await expect(a.buyListed(cheapest!.ticketId, intent(4), cheapest!.seller, 2500)).rejects.toMatchObject({ code: "listing_changed" });
    expect(await a.getBalance()).toBe(12450);
  });

  it("g. two buyers race the same listing: one wins, the other gets not_listed and pays nothing", async () => {
    const sakz = api();
    const newfriend = sakz.as("newfriend");
    await newfriend.__fund(5000);
    const [l] = (await sakz.getEvent(SEED_EVENTS.snl))!.listings;
    const results = await Promise.allSettled([
      sakz.buyListed(l!.ticketId, intent(5), l!.seller, l!.priceCents),
      newfriend.buyListed(l!.ticketId, intent(6), l!.seller, l!.priceCents),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const loser = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(PayApiError);
    expect(loser.reason.code).toBe("not_listed");
    const balances = [await sakz.getBalance(), await newfriend.getBalance()];
    expect(balances.sort()).toEqual([12450 - 2600, 5000].sort());
  });

  it("list above the cap is refused; at the cap works; cancel clears it", async () => {
    const a = api();
    const { ticket } = await a.buyTicket(SEED_EVENTS.snl, intent(7));
    await expect(a.listTicket(ticket.id, 4000)).rejects.toMatchObject({ code: "price_above_cap" });
    await a.listTicket(ticket.id, 2750);
    expect((await a.getTicket(ticket.id))!.listedCents).toBe(2750);
    await a.cancelListing(ticket.id);
    expect((await a.getTicket(ticket.id))!.listedCents).toBe(0);
  });

  it("lock window: no gift or resale inside 24 h", async () => {
    const a = api();
    const { ticket } = await a.buyTicket(SEED_EVENTS.soon, intent(8));
    await expect(a.listTicket(ticket.id, 1500)).rejects.toMatchObject({ code: "transfer_locked" });
    await expect(a.giftTicket(ticket.id, "alex")).rejects.toMatchObject({ code: "transfer_locked" });
  });
});

describe("gift", () => {
  it("gift once to a registered user; a second gift and unregistered recipients are refused", async () => {
    const a = api();
    const { ticket } = await a.buyTicket(SEED_EVENTS.snl, intent(9));
    await expect(a.giftTicket(ticket.id, "newfriend")).rejects.toMatchObject({ code: "recipient_not_registered" });
    await a.giftTicket(ticket.id, "alex");
    const asAlex = a.as("alex");
    const gifted = (await asAlex.getTicket(ticket.id))!;
    expect(gifted).toMatchObject({ owner: "alex", giftsUsed: 1 });
    await expect(asAlex.giftTicket(ticket.id, "maya")).rejects.toMatchObject({ code: "already_gifted" });
  });
});

describe("check-in", () => {
  async function boughtAndGifted() {
    const a = api();
    const { ticket } = await a.buyTicket(SEED_EVENTS.snl, intent(10));
    return { a, ticket };
  }

  it("admit, then already used", async () => {
    const { a, ticket } = await boughtAndGifted();
    a.__travelTo((await a.getEvent(SEED_EVENTS.snl))!.startsAt + 30 * 60_000);
    const fresh = await a.getTicketQr(ticket.id);
    expect(JSON.parse(fresh.payload)).toMatchObject({ t: ticket.id });
    expect(await a.checkIn(SEED_EVENTS.snl, fresh.payload)).toMatchObject({ result: "admit", holder: "sakz", ticketNo: 84 });
    expect(await a.checkIn(SEED_EVENTS.snl, fresh.payload)).toMatchObject({ result: "used" });
  });

  it("expired code, wrong event, and a screenshot from the previous owner after a gift", async () => {
    const { a, ticket } = await boughtAndGifted();
    const show = (await a.getEvent(SEED_EVENTS.snl))!.startsAt;
    const oldQr = await a.getTicketQr(ticket.id); // signed by @sakz, now
    await a.giftTicket(ticket.id, "alex");
    a.__travelTo(show);
    expect(await a.checkIn(SEED_EVENTS.snl, oldQr.payload)).toMatchObject({ result: "invalid", reason: "Expired code" });

    // A fresh code, validly signed, but by the previous owner's wallet:
    const stale = a.__qrSignedBy(ticket.id, "sakz", show);
    expect(await a.checkIn(SEED_EVENTS.snl, stale)).toMatchObject({ result: "invalid", reason: "Not the owner" });

    // @alex organizes Hack Afterparty; scanning his own SNL ticket there is the wrong event.
    const asAlex = a.as("alex");
    const alexQr = await asAlex.getTicketQr(ticket.id);
    expect(await asAlex.checkIn(SEED_EVENTS.hack, alexQr.payload)).toMatchObject({ result: "invalid", reason: "Wrong event" });
  });

  it("only the organizer can check in", async () => {
    const { a, ticket } = await boughtAndGifted();
    const qr = await a.getTicketQr(ticket.id);
    await expect(a.as("alex").checkIn(SEED_EVENTS.snl, qr.payload)).rejects.toMatchObject({ code: "not_organizer" });
  });
});
