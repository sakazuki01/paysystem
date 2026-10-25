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
  fingerprint?: string;
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
  to: string;
  amountCents: number;
  note?: string;
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

export type PayErrorCode =
  | "network"
  | "insufficient_funds"
  | "already_have_username"
  | "username_unavailable"
  | "escrow_not_found"
  | "escrow_expired"
  | "escrow_wrong_user"
  | "escrow_not_refundable";

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
  send(input: SendInput): Promise<SendResult>;
  /** Unclaimed escrows addressed to my Telegram handle. */
  getIncomingEscrows(): Promise<Escrow[]>;
  getEscrow(id: string): Promise<Escrow | null>;
  claimEscrow(id: string): Promise<TxResult>;
  refundEscrow(id: string): Promise<TxResult>;
}
