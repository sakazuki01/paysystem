import {
  canBuy,
  canBuyListed,
  canCheckIn,
  canGift,
  canList,
  normalize,
  validateUsername,
  type EventRules,
} from "@pay-system/shared";
import {
  PayApiError,
  type Activity,
  type Escrow,
  type Me,
  type PayApi,
  type CheckInResult,
  type EventDetail,
  type EventSummary,
  type PayErrorCode,
  type PaymentStatus,
  type Ticket,
  type TicketQr,
  type TicketTxResult,
  type RecipientInfo,
  type SendInput,
  type SendResult,
  type TxResult,
  type UserSummary,
  type UsernameCheck,
} from "./PayApi";
import { fingerprint } from "../lib/format";
import { QR_TTL_MS, ticketQrMessage } from "../lib/ticketQr";

export const DAY_MS = 24 * 60 * 60 * 1000;

/** Real on-curve keys, so address validation behaves like the chain. */
export const SEED_WALLETS = {
  sakz: "Ea71a3Tiu2sxLW6xYDghMDGKDtfoyhZSNyHypyrH4efQ",
  alex: "Da91Z1SneNKSigEVtVxPvpxBcsf4mJgPJKyRUnFTbnqa",
} as const;
export type FailMode = "beforeLand" | "afterLand";

export const SEED_EVENTS = { snl: "ev_snl", hack: "ev_hack", soon: "ev_soon" } as const;

interface EventRec extends EventRules {
  id: string;
  name: string;
  venue: string;
  organizer: string;
  checkedIn: number;
}

interface TicketRec {
  id: string;
  eventId: string;
  ticketNo: number;
  owner: string;
  faceCents: number;
  listedCents: number;
  giftsUsed: number;
  checkedIn: boolean;
  checkedInAt?: number;
}

/**
 * Stand-in for a wallet signature over the QR message (the real app uses the embedded
 * wallet's signMessage and the scanner verifies ed25519). FNV-1a over wallet + message.
 */
function fakeSign(wallet: string, message: string): string {
  let h = 0xcbf29ce484222325n;
  for (const ch of `${wallet}|${message}`) {
    h ^= BigInt(ch.codePointAt(0)!);
    h = (h * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return h.toString(16).padStart(16, "0");
}

const TICKET_ERRORS: Record<string, PayErrorCode> = {
  SoldOut: "sold_out",
  EventStarted: "event_started",
  InvalidPrice: "invalid_price",
  PriceAboveCap: "price_above_cap",
  AlreadyGifted: "already_gifted",
  TransferLocked: "transfer_locked",
  RecipientNotRegistered: "recipient_not_registered",
  Listed: "ticket_listed",
  CheckedIn: "ticket_checked_in",
  NotListed: "not_listed",
  ListingChanged: "listing_changed",
  OwnTicket: "own_ticket",
};

function check(result: string) {
  if (result !== "ok") throw new PayApiError(TICKET_ERRORS[result] ?? "network", result);
}
export const ESCROW_TTL_MS = 7 * DAY_MS;

interface Account {
  telegramHandle: string;
  username: string | null;
  displayName: string;
  avatarUrl?: string;
  createdAt: number;
  wallet: string;
  balanceCents: number;
  activity: Activity[];
  /** handle -> completed payments from this account */
  paid: Map<string, number>;
}

export interface MockOptions {
  /** Simulated chain latency for writes (reads are a third of it). Default 900 ms. */
  latencyMs?: number;
  /** Telegram handle of the signed-in user. Default "sakz". */
  me?: string;
  /** getPaymentStatus answers "unknown" this many times per intent before the truth (simulates RPC lag). */
  statusUnknownPolls?: number;
  now?: () => number;
}

const BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const randomBase58 = (len: number) =>
  Array.from({ length: len }, () => BASE58[Math.floor(Math.random() * BASE58.length)]).join("");
const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());
const handleOf = (input: string) => normalize(input.trim().replace(/^@/, ""));
const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

let idSeq = 0;
const newId = (prefix: string) => `${prefix}_${Date.now().toString(36)}${(idSeq++).toString(36)}`;

/**
 * In-memory PayApi. Seed data follows design/DESIGN_SPEC.md §9:
 * @sakz (me, $124.50), @alex (paid 6 times), @alex2 (created today, never paid),
 * @newfriend (on Telegram, no account), plus a pending and an expired escrow.
 */
export class MockPayApi implements PayApi {
  private accounts = new Map<string, Account>(); // by telegram handle
  private escrows = new Map<string, Escrow>();
  private latency: number;
  private meHandle: string;
  private now: () => number;
  private pendingFailure: { code: PayErrorCode; mode: FailMode } | null = null;
  /** `${sender}:${intentId}` -> receipt. The mock's stand-in for Receipt PDAs. */
  private receipts = new Map<string, SendResult>();
  private statusPolls = new Map<string, number>();
  private statusUnknownPolls: number;
  private events = new Map<string, EventRec>();
  private tickets = new Map<string, TicketRec>();
  private ticketReceipts = new Map<string, TicketTxResult>();
  /** Shared by every `as()` view, so time travel applies to all of them. */
  private clock = { offset: 0 };
  /** Dev toggle: when false, @sakz sees Solana Night Live as a regular attendee. */
  organizerView = true;

  constructor(opts: MockOptions = {}) {
    this.latency = opts.latencyMs ?? 900;
    this.meHandle = opts.me ?? "sakz";
    const base = opts.now ?? Date.now;
    this.now = () => base() + this.clock.offset;
    this.statusUnknownPolls = opts.statusUnknownPolls ?? 0;
    this.seed();
  }

  /** A view of the same world signed in as someone else (race tests, dev). */
  as(handle: string): MockPayApi {
    const view = Object.create(this) as MockPayApi;
    view.meHandle = handle;
    view.pendingFailure = null;
    return view;
  }

  /** Dev/test: move the mock clock (e.g. to show time for check-in). */
  __travelTo(ts: number) {
    this.clock.offset += ts - this.now();
  }

  __fund(cents: number) {
    this.me().balanceCents += cents;
  }

  /** Test: a fresh, validly signed QR payload, but signed by `handle`'s wallet. */
  __qrSignedBy(ticketId: string, handle: string, ts: number): string {
    const wallet = this.accounts.get(handle)!.wallet;
    return JSON.stringify({ t: ticketId, ts, sig: fakeSign(wallet, ticketQrMessage(ticketId, ts)) });
  }

  /**
   * Make the next write fail with `code` (dev + tests). For `send`, "afterLand" moves the money
   * and writes the receipt first, then throws: the dangerous timeout case.
   */
  failNext(code: PayErrorCode, mode: FailMode = "beforeLand") {
    this.pendingFailure = { code, mode };
  }

  // ---------- reads ----------

  async getMe(): Promise<Me> {
    await this.read();
    const me = this.me();
    return {
      username: me.username,
      telegramHandle: me.telegramHandle,
      displayName: me.displayName,
      avatarUrl: me.avatarUrl,
      walletAddress: me.wallet,
    };
  }

  async checkUsername(name: string): Promise<UsernameCheck> {
    // A PDA lookup, not a transaction: much faster than a write.
    await sleep(Math.round(this.latency / 7.5));
    const v = validateUsername(name);
    if (!v.ok) return { status: v.error === "ReservedUsername" ? "reserved" : "invalid" };
    for (const acc of this.accounts.values()) {
      if (!acc.username) continue;
      if (acc.username === v.normalized) return { status: "taken" };
    }
    for (const acc of this.accounts.values()) {
      if (!acc.username) continue;
      const other = validateUsername(acc.username);
      if (other.ok && other.skeleton === v.skeleton) return { status: "lookalike", of: acc.username };
    }
    return { status: "available" };
  }

  async getBalance(): Promise<number> {
    await this.read();
    return this.me().balanceCents;
  }

  async getActivity(): Promise<Activity[]> {
    await this.read();
    return this.me()
      .activity.map((a) => this.withLiveStatus(a))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async getActivityItem(id: string): Promise<Activity | null> {
    await this.read();
    const a = this.me().activity.find((x) => x.id === id);
    return a ? this.withLiveStatus(a) : null;
  }

  async getRecentRecipients(): Promise<UserSummary[]> {
    await this.read();
    const seen = new Set<string>();
    const out: UserSummary[] = [];
    const sent = this.me()
      .activity.filter((a) => a.direction === "out" && !a.escrowId)
      .sort((a, b) => b.createdAt - a.createdAt);
    for (const a of sent) {
      if (seen.has(a.counterparty)) continue;
      seen.add(a.counterparty);
      const acc = this.byUsername(a.counterparty);
      if (acc) out.push(this.summary(acc));
    }
    return out;
  }

  async searchUsers(query: string): Promise<UserSummary[]> {
    await this.read();
    const q = handleOf(query);
    if (!q) return [];
    const me = this.me();
    return [...this.accounts.values()]
      .filter((a) => a.username && a !== me)
      .filter((a) => a.username!.includes(q) || a.displayName.toLowerCase().includes(q))
      .sort((a, b) => Number(b.username!.startsWith(q)) - Number(a.username!.startsWith(q)))
      .slice(0, 8)
      .map((a) => this.summary(a));
  }

  async getRecipientInfo(handle: string): Promise<RecipientInfo> {
    await this.read();
    const h = handleOf(handle);
    const acc = this.byUsername(h);
    const timesPaid = this.me().paid.get(h) ?? 0;
    if (!acc) return { handle: h, exists: false, timesPaid };
    return {
      handle: h,
      exists: true,
      displayName: acc.displayName,
      avatarUrl: acc.avatarUrl,
      createdAt: acc.createdAt,
      timesPaid,
      fingerprint: fingerprint(acc.wallet),
      address: acc.wallet,
    };
  }

  async resolveAddress(address: string): Promise<{ username?: string }> {
    await this.read();
    for (const a of this.accounts.values()) if (a.wallet === address && a.username) return { username: a.username };
    return {};
  }

  async getIncomingEscrows(): Promise<Escrow[]> {
    await this.read();
    const now = this.now();
    return [...this.escrows.values()].filter(
      (e) => e.recipientHandle === this.meHandle && e.status === "pending" && now < e.expiresAt,
    );
  }

  async getEscrow(id: string): Promise<Escrow | null> {
    await this.read();
    const e = this.escrows.get(id);
    return e ? { ...e } : null;
  }

  // ---------- writes ----------

  async claimUsername(name: string): Promise<Me> {
    await this.write();
    const me = this.me();
    if (me.username) throw new PayApiError("already_have_username");
    const check = await this.checkUsername(name);
    if (check.status !== "available") throw new PayApiError("username_unavailable", check.status);
    me.username = normalize(name);
    me.createdAt = this.now();
    return this.getMe();
  }

  async getPaymentStatus(intentId: string): Promise<PaymentStatus> {
    await this.read();
    const key = this.receiptKey(intentId);
    const polls = this.statusPolls.get(key) ?? 0;
    if (polls < this.statusUnknownPolls) {
      this.statusPolls.set(key, polls + 1);
      return { status: "unknown" };
    }
    const receipt = this.receipts.get(key);
    return receipt ? { status: "landed", receipt } : { status: "notLanded" };
  }

  async send(input: SendInput): Promise<SendResult> {
    const settleMs = await this.settle();
    const failure = this.takeFailure();
    if (failure && failure.mode === "beforeLand") throw new PayApiError(failure.code);
    // Exactly-once: the same intent can never pay twice (Receipt PDA `init` on the real chain).
    const key = this.receiptKey(input.intentId);
    const existing = this.receipts.get(key);
    if (existing) return existing;
    const receipt = this.transfer(input, settleMs);
    this.receipts.set(key, receipt);
    if (failure) throw new PayApiError(failure.code, "Timed out after the payment landed");
    return receipt;
  }

  private transfer({ to, toAddress, amountCents, note }: SendInput, settleMs: number): SendResult {
    const me = this.me();
    if (!(amountCents > 0)) throw new PayApiError("insufficient_funds", "Amount must be positive");
    if (amountCents > me.balanceCents) throw new PayApiError("insufficient_funds");

    if (toAddress) {
      const owner = [...this.accounts.values()].find((a) => a.wallet === toAddress && a.username);
      if (owner) return this.transfer({ to: owner.username!, amountCents, note, intentId: "" }, settleMs);
      // A wallet outside Pay System: the USDC simply leaves (the fee payer creates its token account).
      me.balanceCents -= amountCents;
      const activityId = newId("act");
      const signature = randomBase58(88);
      me.activity.push({
        id: activityId, direction: "out", counterparty: fingerprint(toAddress), toAddress,
        amountCents, note, status: "sent", createdAt: this.now(), signature,
      });
      return { settleMs, signature, activityId };
    }

    const h = handleOf(to ?? "");
    if (!HANDLE_RE.test(h)) throw new PayApiError("network", "Bad handle");

    const now = this.now();
    const signature = randomBase58(88);
    const recipient = this.byUsername(h);
    me.balanceCents -= amountCents;

    if (recipient) {
      recipient.balanceCents += amountCents;
      me.paid.set(h, (me.paid.get(h) ?? 0) + 1);
      const activityId = newId("act");
      me.activity.push({
        id: activityId, direction: "out", counterparty: h, counterpartyName: recipient.displayName,
        amountCents, note, status: "sent", createdAt: now, signature,
      });
      recipient.activity.push({
        id: newId("act"), direction: "in", counterparty: me.username ?? me.telegramHandle,
        counterpartyName: me.displayName, amountCents, note, status: "received", createdAt: now, signature,
      });
      return { settleMs, signature, activityId };
    }

    const escrowId = newId("esc");
    this.escrows.set(escrowId, {
      id: escrowId, sender: me.username ?? me.telegramHandle, senderName: me.displayName,
      recipientHandle: h, amountCents, note, createdAt: now, expiresAt: now + ESCROW_TTL_MS, status: "pending",
    });
    const activityId = newId("act");
    me.activity.push({
      id: activityId, direction: "out", counterparty: h, amountCents, note, status: "pending",
      createdAt: now, escrowId, expiresAt: now + ESCROW_TTL_MS, signature,
    });
    return { settleMs, signature, activityId, escrowId };
  }

  async claimEscrow(id: string): Promise<TxResult> {
    const settleMs = await this.write();
    const e = this.escrows.get(id);
    if (!e || e.status !== "pending") throw new PayApiError("escrow_not_found");
    if (e.recipientHandle !== this.meHandle) throw new PayApiError("escrow_wrong_user");
    if (this.now() >= e.expiresAt) throw new PayApiError("escrow_expired");

    const me = this.me();
    const signature = randomBase58(88);
    e.status = "claimed";
    me.balanceCents += e.amountCents;
    me.activity.push({
      id: newId("act"), direction: "in", counterparty: e.sender, counterpartyName: e.senderName,
      amountCents: e.amountCents, note: e.note, status: "received", createdAt: this.now(), signature,
    });
    const sender = this.byUsername(e.sender);
    const row = sender?.activity.find((a) => a.escrowId === id);
    if (row) row.status = "sent";
    if (sender) sender.paid.set(e.recipientHandle, (sender.paid.get(e.recipientHandle) ?? 0) + 1);
    return { settleMs, signature };
  }

  async refundEscrow(id: string): Promise<TxResult> {
    const settleMs = await this.write();
    const e = this.escrows.get(id);
    const me = this.me();
    if (!e || e.status !== "pending") throw new PayApiError("escrow_not_found");
    if (e.sender !== (me.username ?? me.telegramHandle)) throw new PayApiError("escrow_wrong_user");
    if (this.now() < e.expiresAt) throw new PayApiError("escrow_not_refundable");

    e.status = "refunded";
    me.balanceCents += e.amountCents;
    const row = me.activity.find((a) => a.escrowId === id);
    if (row) row.status = "refunded";
    return { settleMs, signature: randomBase58(88) };
  }

  // ---------- tickets ----------

  async listEvents(): Promise<EventSummary[]> {
    await this.read();
    return [...this.events.values()].sort((a, b) => a.startsAt - b.startsAt).map((e) => this.eventSummary(e));
  }

  async getEvent(id: string): Promise<EventDetail | null> {
    await this.read();
    const e = this.events.get(id);
    if (!e) return null;
    const listings = [...this.tickets.values()]
      .filter((t) => t.eventId === id && t.listedCents > 0 && !t.checkedIn)
      .sort((a, b) => a.listedCents - b.listedCents)
      .map((t) => ({ ticketId: t.id, ticketNo: t.ticketNo, seller: t.owner, priceCents: t.listedCents }));
    return { ...this.eventSummary(e), listings, isOrganizer: this.organizerView && e.organizer === this.myName() };
  }

  async getMyTickets(): Promise<Ticket[]> {
    await this.read();
    const me = this.myName();
    return [...this.tickets.values()]
      .filter((t) => t.owner === me)
      .map((t) => this.ticketView(t))
      .sort((a, b) => a.startsAt - b.startsAt);
  }

  async getTicket(id: string): Promise<Ticket | null> {
    await this.read();
    const t = this.tickets.get(id);
    return t ? this.ticketView(t) : null;
  }

  async buyTicket(eventId: string, intentId: string): Promise<TicketTxResult> {
    return this.ticketPayment(intentId, (settleMs) => {
      const e = this.mustEvent(eventId);
      check(canBuy(e, this.now()));
      this.pay(e.organizer, e.priceCents);
      e.sold += 1;
      const t: TicketRec = {
        id: newId("tkt"), eventId, ticketNo: e.sold, owner: this.myName(), faceCents: e.priceCents,
        listedCents: 0, giftsUsed: 0, checkedIn: false,
      };
      this.tickets.set(t.id, t);
      return { settleMs, signature: randomBase58(88), ticket: this.ticketView(t) };
    });
  }

  async buyListed(id: string, intentId: string, expectedSeller: string, expectedPriceCents: number): Promise<TicketTxResult> {
    return this.ticketPayment(intentId, (settleMs) => {
      const t = this.mustTicket(id);
      const e = this.mustEvent(t.eventId);
      check(canBuyListed(t, e, { buyer: this.myName(), expectedSeller, expectedCents: expectedPriceCents }, this.now()));
      this.pay(t.owner, t.listedCents);
      t.owner = this.myName();
      t.listedCents = 0;
      return { settleMs, signature: randomBase58(88), ticket: this.ticketView(t) };
    });
  }

  async giftTicket(id: string, toUsername: string): Promise<TxResult> {
    const settleMs = await this.write();
    const t = this.mustOwnTicket(id);
    const to = normalize(toUsername.replace(/^@/, ""));
    check(canGift(t, this.mustEvent(t.eventId), { recipientRegistered: !!this.byUsername(to) }, this.now()));
    t.owner = to;
    t.giftsUsed += 1;
    return { settleMs, signature: randomBase58(88) };
  }

  async listTicket(id: string, priceCents: number): Promise<TxResult> {
    const settleMs = await this.write();
    const t = this.mustOwnTicket(id);
    check(canList(t, this.mustEvent(t.eventId), priceCents, this.now()));
    t.listedCents = priceCents;
    return { settleMs, signature: randomBase58(88) };
  }

  async cancelListing(id: string): Promise<TxResult> {
    const settleMs = await this.write();
    this.mustOwnTicket(id).listedCents = 0;
    return { settleMs, signature: randomBase58(88) };
  }

  async getTicketQr(id: string): Promise<TicketQr> {
    await sleep(Math.round(this.latency / 9));
    const t = this.mustOwnTicket(id);
    const ts = this.now();
    const sig = fakeSign(this.me().wallet, ticketQrMessage(t.id, ts));
    return { payload: JSON.stringify({ t: t.id, ts, sig }), expiresAt: ts + QR_TTL_MS };
  }

  async checkIn(eventId: string, qrPayload: string): Promise<CheckInResult> {
    const settleMs = await this.write();
    void settleMs;
    const e = this.mustEvent(eventId);
    if (e.organizer !== this.myName()) throw new PayApiError("not_organizer");
    let qr: { t?: unknown; ts?: unknown; sig?: unknown };
    try {
      qr = JSON.parse(qrPayload);
    } catch {
      return { result: "invalid", reason: "Not a ticket" };
    }
    const t = typeof qr.t === "string" ? this.tickets.get(qr.t) : undefined;
    if (!t || typeof qr.ts !== "number" || typeof qr.sig !== "string") return { result: "invalid", reason: "Not a ticket" };
    if (t.eventId !== eventId) return { result: "invalid", reason: "Wrong event" };
    if (this.now() - qr.ts > QR_TTL_MS || qr.ts - this.now() > 5_000) return { result: "invalid", reason: "Expired code" };
    // The signer must be the CURRENT owner: screenshots of a gifted or resold ticket fail here.
    const ownerWallet = this.byUsername(t.owner)?.wallet ?? "";
    if (fakeSign(ownerWallet, ticketQrMessage(t.id, qr.ts)) !== qr.sig) return { result: "invalid", reason: "Not the owner" };
    const verdict = canCheckIn(t, e, this.now());
    if (verdict === "AlreadyCheckedIn") return { result: "used", checkedInAt: t.checkedInAt! };
    if (verdict === "CheckInWindow") return { result: "invalid", reason: "Outside check-in hours" };
    t.checkedIn = true;
    t.checkedInAt = this.now();
    e.checkedIn += 1;
    return { result: "admit", holder: t.owner, ticketNo: t.ticketNo, checkedIn: e.checkedIn, supply: e.supply };
  }

  /** Exactly-once purchases: same failure modes and receipts as `send`. */
  private async ticketPayment(intentId: string, run: (settleMs: number) => TicketTxResult): Promise<TicketTxResult> {
    const settleMs = await this.settle();
    const failure = this.takeFailure();
    if (failure && failure.mode === "beforeLand") throw new PayApiError(failure.code);
    const key = this.receiptKey(intentId);
    const existing = this.ticketReceipts.get(key);
    if (existing) return existing;
    const result = run(settleMs);
    this.ticketReceipts.set(key, result);
    this.receipts.set(key, { settleMs: result.settleMs, signature: result.signature, activityId: result.ticket.id });
    if (failure) throw new PayApiError(failure.code, "Timed out after the purchase landed");
    return result;
  }

  /** USDC from me to `username` (organizer or seller). */
  private pay(username: string, cents: number) {
    const me = this.me();
    if (cents > me.balanceCents) throw new PayApiError("insufficient_funds");
    me.balanceCents -= cents;
    const to = this.byUsername(username);
    if (to) to.balanceCents += cents;
  }

  private myName() {
    const me = this.me();
    return me.username ?? me.telegramHandle;
  }

  private mustEvent(id: string): EventRec {
    const e = this.events.get(id);
    if (!e) throw new PayApiError("ticket_not_found", "No such event");
    return e;
  }

  private mustTicket(id: string): TicketRec {
    const t = this.tickets.get(id);
    if (!t) throw new PayApiError("ticket_not_found");
    return t;
  }

  private mustOwnTicket(id: string): TicketRec {
    const t = this.mustTicket(id);
    if (t.owner !== this.myName()) throw new PayApiError("not_owner");
    return t;
  }

  private eventSummary(e: EventRec): EventSummary {
    return {
      id: e.id, name: e.name, venue: e.venue, startsAt: e.startsAt, priceCents: e.priceCents,
      maxResaleBps: e.maxResaleBps, supply: e.supply, sold: e.sold, lockSecs: e.lockSecs,
      organizer: e.organizer, checkedIn: e.checkedIn,
    };
  }

  private ticketView(t: TicketRec): Ticket {
    const e = this.mustEvent(t.eventId);
    return {
      id: t.id, eventId: t.eventId, eventName: e.name, venue: e.venue, startsAt: e.startsAt, lockSecs: e.lockSecs,
      maxResaleBps: e.maxResaleBps, ticketNo: t.ticketNo, owner: t.owner, faceCents: t.faceCents,
      listedCents: t.listedCents, giftsUsed: t.giftsUsed, checkedIn: t.checkedIn, checkedInAt: t.checkedInAt,
    };
  }

  // ---------- internals ----------

  private async read() {
    await sleep(Math.round(this.latency / 3));
    this.assertOnline();
  }

  /** Simulates a confirmed transaction; returns the "measured" settle time. */
  private async write(): Promise<number> {
    const settleMs = await this.settle();
    const failure = this.takeFailure();
    if (failure) throw new PayApiError(failure.code);
    return settleMs;
  }

  private async settle(): Promise<number> {
    await sleep(this.latency);
    this.assertOnline();
    return 700 + Math.round(Math.random() * 500);
  }

  private takeFailure() {
    const f = this.pendingFailure;
    this.pendingFailure = null;
    return f;
  }

  private receiptKey(intentId: string) {
    const me = this.me();
    return `${me.username ?? me.telegramHandle}:${intentId}`;
  }

  private assertOnline() {
    if (typeof navigator !== "undefined" && navigator.onLine === false) throw new PayApiError("network");
  }

  private me(): Account {
    const me = this.accounts.get(this.meHandle);
    if (!me) throw new Error(`Mock has no account for @${this.meHandle}`);
    return me;
  }

  private byUsername(username: string): Account | undefined {
    for (const a of this.accounts.values()) if (a.username === username) return a;
    return undefined;
  }

  private summary(a: Account): UserSummary {
    return {
      username: a.username!,
      displayName: a.displayName,
      avatarUrl: a.avatarUrl,
      createdAt: a.createdAt,
      timesPaid: this.me().paid.get(a.username!) ?? 0,
    };
  }

  private withLiveStatus(a: Activity): Activity {
    if (a.status === "pending" && a.expiresAt && this.now() >= a.expiresAt) return { ...a, status: "refundable" };
    return { ...a };
  }

  private seed() {
    const now = this.now();
    const H = 60 * 60 * 1000;
    const add = (a: Omit<Account, "activity" | "paid" | "wallet"> & { wallet?: string }) => {
      this.accounts.set(a.telegramHandle, {
        ...a,
        wallet: a.wallet ?? randomBase58(44),
        activity: [],
        paid: new Map(),
      });
    };

    add({ telegramHandle: "sakz", username: "sakz", displayName: "Sakz Kaito", avatarUrl: "/avatars/sakz.svg",
      createdAt: Date.UTC(2026, 8, 2), balanceCents: 12450, wallet: SEED_WALLETS.sakz });
    add({ telegramHandle: "alex", username: "alex", displayName: "Alex Rivera", avatarUrl: "/avatars/alex.svg",
      createdAt: Date.UTC(2026, 7, 14), balanceCents: 8000, wallet: SEED_WALLETS.alex });
    add({ telegramHandle: "maya", username: "maya", displayName: "Maya Chen", createdAt: Date.UTC(2026, 8, 20),
      balanceCents: 4000 });
    add({ telegramHandle: "alex2", username: "alex2", displayName: "Alex", createdAt: now - 3 * H, balanceCents: 0 });
    add({ telegramHandle: "newfriend", username: null, displayName: "New Friend", avatarUrl: "/avatars/newfriend.svg",
      createdAt: now - 2 * DAY_MS, balanceCents: 0 });

    const sakz = this.accounts.get("sakz")!;
    sakz.paid.set("alex", 6);
    sakz.paid.set("maya", 2);
    const sig = () => randomBase58(88);
    sakz.activity.push(
      { id: "act_alex_in", direction: "in", counterparty: "alex", counterpartyName: "Alex Rivera",
        amountCents: 1000, note: "Pizza night", status: "received", createdAt: now - 2 * H, signature: sig() },
      { id: "act_alex_out", direction: "out", counterparty: "alex", counterpartyName: "Alex Rivera",
        amountCents: 2500, note: "Concert tickets", status: "sent", createdAt: now - 26 * H, signature: sig() },
      { id: "act_maya_out", direction: "out", counterparty: "maya", counterpartyName: "Maya Chen",
        amountCents: 450, note: "Coffee", status: "sent", createdAt: now - 3 * DAY_MS, signature: sig() },
      { id: "act_maya_in", direction: "in", counterparty: "maya", counterpartyName: "Maya Chen",
        amountCents: 1250, note: "Lunch split", status: "received", createdAt: now - 5 * DAY_MS, signature: sig() },
    );

    const escrow = (e: Escrow, mirrorToSakz: boolean) => {
      this.escrows.set(e.id, e);
      if (mirrorToSakz) {
        sakz.activity.push({
          id: `act_${e.id}`, direction: "out", counterparty: e.recipientHandle, amountCents: e.amountCents,
          note: e.note, status: "pending", createdAt: e.createdAt, escrowId: e.id, expiresAt: e.expiresAt,
          signature: sig(),
        });
      }
    };
    // Pending: sakz -> @newfriend, 6 days left.
    escrow({ id: "esc_newfriend", sender: "sakz", senderName: "Sakz Kaito", recipientHandle: "newfriend",
      amountCents: 1000, note: "Welcome to Pay System", createdAt: now - DAY_MS - H,
      expiresAt: now - DAY_MS - H + ESCROW_TTL_MS, status: "pending" }, true);
    // Expired, refundable: sakz -> @oldpal.
    escrow({ id: "esc_oldpal", sender: "sakz", senderName: "Sakz Kaito", recipientHandle: "oldpal",
      amountCents: 500, note: "Movie", createdAt: now - 8 * DAY_MS, expiresAt: now - DAY_MS, status: "pending" }, true);
    // Incoming to my handle (Home claim banner + S7 normal).
    escrow({ id: "esc_for_sakz", sender: "maya", senderName: "Maya Chen", recipientHandle: "sakz",
      amountCents: 1500, note: "Concert snacks", createdAt: now - 5 * H, expiresAt: now - 5 * H + ESCROW_TTL_MS,
      status: "pending" }, false);
    // Incoming to my handle but expired (S7 expired variant).
    escrow({ id: "esc_expired", sender: "maya", senderName: "Maya Chen", recipientHandle: "sakz",
      amountCents: 2000, createdAt: now - 9 * DAY_MS, expiresAt: now - 2 * DAY_MS, status: "pending" }, false);

    this.seedTickets(now);
  }

  /** LOGIC §10.5 demo. Show dates are the hackathon's (Nov 7/8); pushed forward if already past. */
  private seedTickets(now: number) {
    const at = (date: Date, fallbackDays: number) => (date.getTime() > now ? date.getTime() : now + fallbackDays * DAY_MS);
    const ev = (e: Omit<EventRec, "checkedIn" | "lockSecs">) => this.events.set(e.id, { ...e, lockSecs: 86_400, checkedIn: 0 });
    ev({ id: SEED_EVENTS.snl, name: "Solana Night Live", venue: "The Glasshouse", startsAt: at(new Date(2026, 10, 7, 20, 0), 13),
      priceCents: 2500, maxResaleBps: 11000, supply: 120, sold: 83, organizer: "sakz" });
    ev({ id: SEED_EVENTS.hack, name: "Hack Afterparty", venue: "Pier 9 Rooftop", startsAt: at(new Date(2026, 10, 8, 22, 0), 14),
      priceCents: 1000, maxResaleBps: 11500, supply: 60, sold: 60, organizer: "alex" });
    ev({ id: SEED_EVENTS.soon, name: "Soundcheck Session", venue: "Studio B", startsAt: now + 6 * 60 * 60 * 1000,
      priceCents: 1500, maxResaleBps: 11000, supply: 40, sold: 12, organizer: "maya" });

    const tkt = (id: string, eventId: string, ticketNo: number, owner: string, faceCents: number, listedCents: number) =>
      this.tickets.set(id, { id, eventId, ticketNo, owner, faceCents, listedCents, giftsUsed: 0, checkedIn: false });
    tkt("tkt_snl_031", SEED_EVENTS.snl, 31, "alex", 2500, 2600);
    tkt("tkt_snl_052", SEED_EVENTS.snl, 52, "maya", 2500, 2750);
    tkt("tkt_hack_017", SEED_EVENTS.hack, 17, "maya", 1000, 1100);
  }
}
