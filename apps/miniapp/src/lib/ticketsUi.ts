import { canGift, canList, inLockWindow, resaleCap } from "@pay-system/shared";
import type { EventSummary, Ticket } from "../api/PayApi";
import { formatUsd } from "./format";

const badgeFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const whenFmt = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" });
const usedFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

/** "NOV 7": a small label, so uppercase is allowed (spec §3.2). */
export const dateBadge = (ts: number) => badgeFmt.format(ts).toUpperCase();
export const eventDate = (ts: number) => whenFmt.format(ts);
export const eventTime = (ts: number) => timeFmt.format(ts);
export const checkedInLabel = (ts: number) => `Checked in · ${usedFmt.format(ts).replace(" at ", ", ")}`;
export const ticketNo = (n: number) => `#${String(n).padStart(3, "0")}`;

export function capFor(t: { faceCents: number; maxResaleBps: number }) {
  return resaleCap(t.faceCents, t.maxResaleBps);
}

export const capCaption = (e: Pick<EventSummary, "priceCents" | "maxResaleBps">) =>
  `Resale cap ${formatUsd(resaleCap(e.priceCents, e.maxResaleBps))} (${e.maxResaleBps / 100}%)`;

/** "Sold out", "12 left" (fewer than 20), or nothing. */
export function availabilityPill(e: EventSummary): string | null {
  const left = e.supply - e.sold;
  if (left <= 0) return "Sold out";
  if (left < 20) return `${left} left`;
  return null;
}

export type TicketPill = { label: string; tone: "brand" | "warning" | "muted" };
export function ticketPill(t: Ticket): TicketPill {
  if (t.checkedIn) return { label: "Used", tone: "muted" };
  if (t.listedCents > 0) return { label: `Listed ${formatUsd(t.listedCents)}`, tone: "warning" };
  return { label: "Upcoming", tone: "brand" };
}

const LOCKED = "Transfers lock 24 h before the show";

/** Why Gift is unavailable, or null when it is. Recipient registration is checked later, in S14. */
export function giftBlocker(t: Ticket, now = Date.now()): string | null {
  switch (canGift({ ...t }, ruleEvent(t), { recipientRegistered: true }, now)) {
    case "ok":
      return null;
    case "AlreadyGifted":
      return "Already gifted once";
    case "TransferLocked":
      return LOCKED;
    case "Listed":
      return `Listed for ${formatUsd(t.listedCents)}`;
    default:
      return "Already used";
  }
}

/** Why Resell is unavailable, or null. A listed ticket offers "Cancel listing" instead. */
export function resellBlocker(t: Ticket, now = Date.now()): string | null {
  if (t.checkedIn) return "Already used";
  if (t.listedCents > 0) return `Listed for ${formatUsd(t.listedCents)}`;
  if (inLockWindow(t, now)) return LOCKED;
  return canList({ ...t, listedCents: 0 }, ruleEvent(t), t.faceCents, now) === "ok" ? null : LOCKED;
}

function ruleEvent(t: Ticket) {
  return { startsAt: t.startsAt, lockSecs: t.lockSecs, priceCents: t.faceCents, maxResaleBps: t.maxResaleBps, supply: 1, sold: 0 };
}
