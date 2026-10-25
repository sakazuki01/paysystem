// The only way screens talk to the outside world. MockPayApi implements it today;
// the real backend client (Brief 3) implements the same interface.
// Usernames and handles are passed WITHOUT the leading "@". Money is integer cents.

export interface Me {
  /** Pay System username, or null if not claimed yet. */
  username: string | null;
  telegramHandle: string;
  displayName: string;
  avatarUrl?: string;
  walletAddress: string;
}

export type UsernameCheck =
  | { status: "available" }
  | { status: "taken" }
  | { status: "lookalike"; of: string }
  | { status: "invalid" }
  | { status: "reserved" };

export interface UserSummary {
  username: string;
  displayName: string;
  avatarUrl?: string;
  createdAt: number;
  timesPaid: number;
}

export interface RecipientInfo {
  handle: string;
  /** Has a Pay System account. false = the payment goes to escrow. */
  exists: boolean;
  displayName?: string;
  avatarUrl?: string;
  createdAt?: number;
  timesPaid: number;
  /** Short form for display, e.g. 7xKX…9fQz. */
  fingerprint?: string;
  /** Full wallet address (copied by the Fingerprint control). */
  address?: string;
  /** Set when paying a raw wallet address that isn't a Pay System user (LOGIC §7.1b). */
  toAddress?: string;
}

export type ActivityStatus = "sent" | "received" | "pending" | "refundable" | "refunded" | "failed";

export interface Activity {
  id: string;
  direction: "in" | "out";
  counterparty: string;
  counterpartyName?: string;
  amountCents: number;
  note?: string;
  status: ActivityStatus;
  createdAt: number;
  escrowId?: string;
  expiresAt?: number;
  signature?: string;
  /** Paid to a raw wallet address; `counterparty` then holds its fingerprint. */
  toAddress?: string;
}

export interface Escrow {
  id: string;
  sender: string;
  senderName?: string;
  recipientHandle: string;
  amountCents: number;
  note?: string;
  createdAt: number;
  expiresAt: number;
  status: "pending" | "claimed" | "refunded";
}

export interface SendInput {
  /** Username or Telegram handle. Exactly one of `to` / `toAddress`. */
  to?: string;
  /** A raw wallet address (validated with validateAddress first). */
  toAddress?: string;
  amountCents: number;
  note?: string;
  /** 16 random bytes (hex), fixed for one payment across retries. A repeat returns the original receipt. */
  intentId: string;
}

export interface TxResult {
  /** Measured time from submit to confirmation. Shown on the success screen. */
  settleMs: number;
  signature: string;
}

export interface SendResult extends TxResult {
  activityId: string;
  escrowId?: string;
}

// ---------- Tickets (LOGIC §10) ----------

export interface EventSummary {
  id: string;
  name: string;
  venue: string;
  startsAt: number;
  priceCents: number;
  /** e.g. 11000 = resale capped at 110% of face value. */
  maxResaleBps: number;
  supply: number;
  sold: number;
  lockSecs: number;
  organizer: string;
  checkedIn: number;
}

export interface Listing {
  ticketId: string;
  ticketNo: number;
  seller: string;
  priceCents: number;
}

export interface EventDetail extends EventSummary {
  /** Cheapest first. */
  listings: Listing[];
  /** The signed-in user organizes this event (S16 check-in). */
  isOrganizer: boolean;
}

export interface Ticket {
  id: string;
  eventId: string;
  eventName: string;
  venue: string;
  startsAt: number;
  lockSecs: number;
  maxResaleBps: number;
  ticketNo: number;
  owner: string;
  faceCents: number;
  /** 0 = not listed. */
  listedCents: number;
  giftsUsed: number;
  checkedIn: boolean;
  checkedInAt?: number;
}

export interface TicketTxResult extends TxResult {
  ticket: Ticket;
}

/** QR payload is JSON `{ t, ts, sig }`; `sig` is the holder's wallet signature over `ticketQrMessage(t, ts)`. */
export interface TicketQr {
  payload: string;
  expiresAt: number;
}

export type CheckInResult =
  | { result: "admit"; holder: string; ticketNo: number; checkedIn: number; supply: number }
  | { result: "used"; checkedInAt: number }
  | { result: "invalid"; reason: "Wrong event" | "Expired code" | "Not the owner" | "Not a ticket" | "Outside check-in hours" };

export type PaymentStatus =
  | { status: "landed"; receipt: SendResult }
  | { status: "notLanded" }
  | { status: "unknown" };

export type PayErrorCode =
  | "network"
  | "insufficient_funds"
  | "already_have_username"
  | "username_unavailable"
  | "escrow_not_found"
  | "escrow_expired"
  | "escrow_wrong_user"
  | "escrow_not_refundable"
  | "sold_out"
  | "event_started"
  | "invalid_price"
  | "price_above_cap"
  | "already_gifted"
  | "transfer_locked"
  | "recipient_not_registered"
  | "ticket_listed"
  | "ticket_checked_in"
  | "not_listed"
  | "listing_changed"
  | "own_ticket"
  | "not_owner"
  | "not_organizer"
  | "ticket_not_found";

export class PayApiError extends Error {
  constructor(
    public readonly code: PayErrorCode,
    message: string = code,
  ) {
    super(message);
    this.name = "PayApiError";
  }
}

export interface PayApi {
  getMe(): Promise<Me>;
  checkUsername(name: string): Promise<UsernameCheck>;
  claimUsername(name: string): Promise<Me>;
  getBalance(): Promise<number>;
  getActivity(): Promise<Activity[]>;
  getActivityItem(id: string): Promise<Activity | null>;
  /** People I've paid, most recent first. */
  getRecentRecipients(): Promise<UserSummary[]>;
  searchUsers(query: string): Promise<UserSummary[]>;
  getRecipientInfo(handle: string): Promise<RecipientInfo>;
  /** Which Pay System user owns this wallet, if any. */
  resolveAddress(address: string): Promise<{ username?: string }>;
  send(input: SendInput): Promise<SendResult>;
  /** Has the payment with this intent landed? (Receipt PDA lookup on the real chain.) */
  getPaymentStatus(intentId: string): Promise<PaymentStatus>;
  /** Unclaimed escrows addressed to my Telegram handle. */
  getIncomingEscrows(): Promise<Escrow[]>;
  getEscrow(id: string): Promise<Escrow | null>;
  claimEscrow(id: string): Promise<TxResult>;
  refundEscrow(id: string): Promise<TxResult>;

  // Tickets
  listEvents(): Promise<EventSummary[]>;
  getEvent(id: string): Promise<EventDetail | null>;
  /** Exactly-once per intent: a repeat returns the original ticket. */
  buyTicket(eventId: string, intentId: string): Promise<TicketTxResult>;
  getMyTickets(): Promise<Ticket[]>;
  getTicket(id: string): Promise<Ticket | null>;
  giftTicket(id: string, toUsername: string): Promise<TxResult>;
  listTicket(id: string, priceCents: number): Promise<TxResult>;
  cancelListing(id: string): Promise<TxResult>;
  /** Fails with listing_changed unless the seller and price still match what the buyer saw. */
  buyListed(id: string, intentId: string, expectedSeller: string, expectedPriceCents: number): Promise<TicketTxResult>;
  getTicketQr(id: string): Promise<TicketQr>;
  /** Organizer only. */
  checkIn(eventId: string, qrPayload: string): Promise<CheckInResult>;
}
