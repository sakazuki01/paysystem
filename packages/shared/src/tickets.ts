// Ticket rules (LOGIC §10.3) as pure functions, shared by the Mini App mock/UI and mirrored
// by the program. Fixture: shared/ticket-vectors.json. Money in cents, times in ms.

export interface EventRules {
  startsAt: number;
  lockSecs: number;
  priceCents: number;
  maxResaleBps: number;
  supply: number;
  sold: number;
}

export interface TicketState {
  giftsUsed: number;
  /** 0 = not listed. */
  listedCents: number;
  checkedIn: boolean;
  faceCents: number;
}

export const CHECK_IN_WINDOW_MS = 12 * 3_600_000;

/** Max resale price: face × bps / 10 000, rounded DOWN to the cent. */
export const resaleCap = (faceCents: number, maxResaleBps: number) => Math.floor((faceCents * maxResaleBps) / 10_000);

/** Gifts and resales stop `lockSecs` before the show. */
export const inLockWindow = (e: Pick<EventRules, "startsAt" | "lockSecs">, now: number) => now >= e.startsAt - e.lockSecs * 1000;

export type BuyCheck = "ok" | "SoldOut" | "EventStarted";
export function canBuy(e: EventRules, now: number): BuyCheck {
  if (now >= e.startsAt) return "EventStarted";
  if (e.sold >= e.supply) return "SoldOut";
  return "ok";
}

export type GiftCheck = "ok" | "CheckedIn" | "Listed" | "AlreadyGifted" | "TransferLocked" | "RecipientNotRegistered";
export function canGift(t: TicketState, e: EventRules, to: { recipientRegistered: boolean }, now: number): GiftCheck {
  if (t.checkedIn) return "CheckedIn";
  if (t.listedCents > 0) return "Listed";
  if (t.giftsUsed > 0) return "AlreadyGifted";
  if (inLockWindow(e, now)) return "TransferLocked";
  if (!to.recipientRegistered) return "RecipientNotRegistered";
  return "ok";
}

export type ListCheck = "ok" | "InvalidPrice" | "CheckedIn" | "TransferLocked" | "PriceAboveCap";
export function canList(t: TicketState, e: EventRules, priceCents: number, now: number): ListCheck {
  if (!(priceCents > 0)) return "InvalidPrice";
  if (t.checkedIn) return "CheckedIn";
  if (inLockWindow(e, now)) return "TransferLocked";
  if (priceCents > resaleCap(t.faceCents, e.maxResaleBps)) return "PriceAboveCap";
  return "ok";
}

export type BuyListedCheck = "ok" | "NotListed" | "OwnTicket" | "ListingChanged" | "TransferLocked";
export function canBuyListed(
  t: { owner: string; listedCents: number; checkedIn: boolean },
  e: Pick<EventRules, "startsAt" | "lockSecs">,
  buy: { buyer: string; expectedSeller: string; expectedCents: number },
  now: number,
): BuyListedCheck {
  if (!(t.listedCents > 0) || t.checkedIn) return "NotListed";
  if (t.owner === buy.buyer) return "OwnTicket";
  // The buyer pays what they saw, to whom they saw (LOGIC §7.5.5).
  if (t.owner !== buy.expectedSeller || t.listedCents !== buy.expectedCents) return "ListingChanged";
  if (inLockWindow(e, now)) return "TransferLocked";
  return "ok";
}

export type CheckInCheck = "ok" | "AlreadyCheckedIn" | "CheckInWindow";
export function canCheckIn(t: { checkedIn: boolean }, e: Pick<EventRules, "startsAt">, now: number): CheckInCheck {
  if (t.checkedIn) return "AlreadyCheckedIn";
  if (Math.abs(now - e.startsAt) > CHECK_IN_WINDOW_MS) return "CheckInWindow";
  return "ok";
}
