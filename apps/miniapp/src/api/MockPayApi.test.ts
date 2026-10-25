import { describe, expect, it } from "vitest";
import { MockPayApi, DAY_MS } from "./MockPayApi";
import { PayApiError } from "./PayApi";

const fast = () => new MockPayApi({ latencyMs: 0 });

describe("MockPayApi seed (spec §9)", () => {
  it("signs me in as @sakz with $124.50", async () => {
    const api = fast();
    expect((await api.getMe()).username).toBe("sakz");
    expect(await api.getBalance()).toBe(12450);
  });

  it("knows @alex (paid 6 times), @alex2 (created today, never paid) and not @newfriend", async () => {
    const api = fast();
    const alex = await api.getRecipientInfo("alex");
    expect(alex).toMatchObject({ exists: true, timesPaid: 6 });
    const alex2 = await api.getRecipientInfo("alex2");
    expect(alex2.exists).toBe(true);
    expect(alex2.timesPaid).toBe(0);
    expect(Date.now() - alex2.createdAt!).toBeLessThan(DAY_MS);
    expect((await api.getRecipientInfo("newfriend")).exists).toBe(false);
  });

  it("has a pending and a refundable outgoing escrow in activity", async () => {
    const statuses = (await fast().getActivity()).map((a) => a.status);
    expect(statuses).toContain("pending");
    expect(statuses).toContain("refundable");
  });
});

describe("checkUsername uses packages/shared rules", () => {
  const api = new MockPayApi({ latencyMs: 0, me: "newfriend" });
  it.each([
    ["5akz", { status: "lookalike", of: "sakz" }],
    ["a1ex", { status: "lookalike", of: "alex" }],
    ["alex", { status: "taken" }],
    ["ALEX", { status: "taken" }],
    ["ab", { status: "invalid" }],
    ["al ex", { status: "invalid" }],
    ["admin", { status: "reserved" }],
    ["coolname", { status: "available" }],
  ])("%s", async (name, expected) => {
    expect(await api.checkUsername(name)).toEqual(expected);
  });
});

describe("send", () => {
  it("pays a registered user, debits balance and returns a realistic settle time", async () => {
    const api = fast();
    const res = await api.send({ to: "alex", amountCents: 1000, note: "pizza", intentId: "i1" });
    expect(res.settleMs).toBeGreaterThanOrEqual(700);
    expect(res.settleMs).toBeLessThanOrEqual(1200);
    expect(res.escrowId).toBeUndefined();
    expect(await api.getBalance()).toBe(11450);
    expect((await api.getRecipientInfo("alex")).timesPaid).toBe(7);
  });

  it("sends to an unregistered handle via escrow", async () => {
    const api = fast();
    const res = await api.send({ to: "newfriend", amountCents: 500, intentId: "i2" });
    expect(res.escrowId).toBeDefined();
    const escrow = await api.getEscrow(res.escrowId!);
    expect(escrow).toMatchObject({ recipientHandle: "newfriend", amountCents: 500, status: "pending" });
  });

  it("refuses more than the balance", async () => {
    await expect(fast().send({ to: "alex", amountCents: 999_999, intentId: "i3" })).rejects.toMatchObject({
      code: "insufficient_funds",
    });
  });

  it("can be told to fail with a network error, without moving money", async () => {
    const api = fast();
    api.failNext("network");
    await expect(api.send({ to: "alex", amountCents: 100, intentId: "i4" })).rejects.toBeInstanceOf(PayApiError);
    expect(await api.getBalance()).toBe(12450);
  });
});

describe("payment intents (exactly-once)", () => {
  const intent = "0123456789abcdef0123456789abcdef";

  it("a duplicate send with the same intent returns the original receipt without debiting again", async () => {
    const api = fast();
    const first = await api.send({ to: "alex", amountCents: 1000, intentId: intent });
    const again = await api.send({ to: "alex", amountCents: 1000, intentId: intent });
    expect(again).toEqual(first);
    expect(await api.getBalance()).toBe(11450);
  });

  it("afterLand: debits, then throws a timeout; status says landed with the receipt", async () => {
    const api = fast();
    api.failNext("network", "afterLand");
    await expect(api.send({ to: "alex", amountCents: 1000, intentId: intent })).rejects.toMatchObject({ code: "network" });
    expect(await api.getBalance()).toBe(11450);
    const status = await api.getPaymentStatus(intent);
    expect(status.status).toBe("landed");
  });

  it("beforeLand: nothing moves; status says notLanded", async () => {
    const api = fast();
    api.failNext("network", "beforeLand");
    await expect(api.send({ to: "alex", amountCents: 1000, intentId: intent })).rejects.toMatchObject({ code: "network" });
    expect(await api.getBalance()).toBe(12450);
    expect((await api.getPaymentStatus(intent)).status).toBe("notLanded");
  });

  it("reports unknown for the configured number of polls first", async () => {
    const api = new MockPayApi({ latencyMs: 0, statusUnknownPolls: 2 });
    api.failNext("network", "afterLand");
    await api.send({ to: "alex", amountCents: 100, intentId: intent }).catch(() => {});
    expect((await api.getPaymentStatus(intent)).status).toBe("unknown");
    expect((await api.getPaymentStatus(intent)).status).toBe("unknown");
    expect((await api.getPaymentStatus(intent)).status).toBe("landed");
  });
});

describe("escrow claim / refund", () => {
  it("lets the addressed user claim a pending escrow", async () => {
    const api = new MockPayApi({ latencyMs: 0, me: "newfriend" });
    const before = await api.getBalance();
    const [incoming] = await api.getIncomingEscrows();
    expect(incoming).toBeDefined();
    await api.claimEscrow(incoming!.id);
    expect(await api.getBalance()).toBe(before + incoming!.amountCents);
    expect((await api.getEscrow(incoming!.id))!.status).toBe("claimed");
  });

  it("rejects claims by the wrong user and on expired escrows", async () => {
    const api = fast(); // signed in as sakz
    await expect(api.claimEscrow("esc_newfriend")).rejects.toMatchObject({ code: "escrow_wrong_user" });
    await expect(api.claimEscrow("esc_expired")).rejects.toMatchObject({ code: "escrow_expired" });
  });

  it("refunds only after expiry", async () => {
    const api = fast();
    await expect(api.refundEscrow("esc_newfriend")).rejects.toMatchObject({ code: "escrow_not_refundable" });
    const before = await api.getBalance();
    await api.refundEscrow("esc_oldpal");
    expect(await api.getBalance()).toBe(before + 500);
  });

  it("claimUsername registers once per account", async () => {
    const api = new MockPayApi({ latencyMs: 0, me: "newfriend" });
    expect((await api.claimUsername("newfriend")).username).toBe("newfriend");
    await expect(api.claimUsername("another")).rejects.toMatchObject({ code: "already_have_username" });
    expect(await api.checkUsername("newfriend")).toEqual({ status: "taken" });
  });
});
