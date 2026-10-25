import { normalize, validateUsername } from "@pay-system/shared";
import {
  PayApiError,
  type Activity,
  type Escrow,
  type Me,
  type PayApi,
  type PayErrorCode,
  type RecipientInfo,
  type SendInput,
  type SendResult,
  type TxResult,
  type UserSummary,
  type UsernameCheck,
} from "./PayApi";
import { fingerprint } from "../lib/format";

export const DAY_MS = 24 * 60 * 60 * 1000;
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
  private pendingFailure: PayErrorCode | null = null;

  constructor(opts: MockOptions = {}) {
    this.latency = opts.latencyMs ?? 900;
    this.meHandle = opts.me ?? "sakz";
    this.now = opts.now ?? Date.now;
    this.seed();
  }

  /** Make the next write call fail with `code` (dev + tests). */
  failNext(code: PayErrorCode) {
    this.pendingFailure = code;
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

  async send({ to, amountCents, note }: SendInput): Promise<SendResult> {
    const settleMs = await this.write();
    const me = this.me();
    const h = handleOf(to);
    if (!(amountCents > 0)) throw new PayApiError("insufficient_funds", "Amount must be positive");
    if (amountCents > me.balanceCents) throw new PayApiError("insufficient_funds");
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

  // ---------- internals ----------

  private async read() {
    await sleep(Math.round(this.latency / 3));
    this.assertOnline();
  }

  /** Simulates a confirmed transaction; returns the "measured" settle time. */
  private async write(): Promise<number> {
    await sleep(this.latency);
    this.assertOnline();
    if (this.pendingFailure) {
      const code = this.pendingFailure;
      this.pendingFailure = null;
      throw new PayApiError(code);
    }
    return 700 + Math.round(Math.random() * 500);
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
      createdAt: Date.UTC(2026, 8, 2), balanceCents: 12450, wallet: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU9fQz" });
    add({ telegramHandle: "alex", username: "alex", displayName: "Alex Rivera", avatarUrl: "/avatars/alex.svg",
      createdAt: Date.UTC(2026, 7, 14), balanceCents: 8000 });
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
    escrow({ id: "esc_for_sakz", sender: "alex", senderName: "Alex Rivera", recipientHandle: "sakz",
      amountCents: 1000, note: "Lunch", createdAt: now - 5 * H, expiresAt: now - 5 * H + ESCROW_TTL_MS,
      status: "pending" }, false);
    // Incoming to my handle but expired (S7 expired variant).
    escrow({ id: "esc_expired", sender: "maya", senderName: "Maya Chen", recipientHandle: "sakz",
      amountCents: 2000, createdAt: now - 9 * DAY_MS, expiresAt: now - 2 * DAY_MS, status: "pending" }, false);
  }
}
