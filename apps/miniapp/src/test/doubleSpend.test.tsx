import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "../App";
import { MockPayApi } from "../api/MockPayApi";
import { waitForPayment } from "../lib/paymentStatus";

const mainButton = () => document.querySelector<HTMLButtonElement>(".tg-shim-main")!;
const DIDNT_GO_THROUGH = "Payment didn't go through. Your money hasn't moved — try again.";

afterEach(() => window.history.replaceState({}, "", "/"));

/** Home → S6 confirm for @alex $10. */
async function toConfirm(opts: ConstructorParameters<typeof MockPayApi>[0] = {}) {
  const api = new MockPayApi({ latencyMs: 0, statusUnknownPolls: 0, ...opts });
  const user = userEvent.setup();
  render(<App api={api} />);
  await screen.findByText("$124.50");
  await user.click(screen.getByRole("button", { name: "Send" }));
  await user.type(screen.getByRole("searchbox", { name: "Username or @handle" }), "alex");
  await user.click(await screen.findByRole("button", { name: /@alex\b.*Paid 6 times/ }));
  const pad = await screen.findByRole("group", { name: "Keypad" });
  await user.click(within(pad).getByRole("button", { name: "1" }));
  await user.click(within(pad).getByRole("button", { name: "0" }));
  await user.click(mainButton());
  await screen.findByText("Network fee");
  return { api, user };
}

/** Records every text the MainButton shows, to prove "Try again" never appeared. */
function recordMainButton() {
  const seen = new Set<string>([mainButton().textContent ?? ""]);
  const obs = new MutationObserver(() => seen.add(mainButton().textContent ?? ""));
  obs.observe(mainButton(), { childList: true, subtree: true, characterData: true });
  return { seen, stop: () => obs.disconnect() };
}

describe("Brief 4: exactly-once payments", () => {
  it("a. double-tap Send makes one payment", async () => {
    const { api } = await toConfirm();
    const send = vi.spyOn(api, "send");
    act(() => {
      fireEvent.click(mainButton());
      fireEvent.click(mainButton());
    });
    expect(await screen.findByText("Sent $10.00 to @alex")).toBeInTheDocument();
    expect(send).toHaveBeenCalledTimes(1);
    expect(await api.getBalance()).toBe(11450);
  });

  it("b. afterLand timeout: Checking… then success, debited once, never offers Try again", async () => {
    const { api } = await toConfirm({ statusUnknownPolls: 1 });
    api.failNext("network", "afterLand");
    const rec = recordMainButton();
    fireEvent.click(mainButton());
    expect(await screen.findByText("Checking your payment…")).toBeInTheDocument();
    expect(mainButton()).toBeDisabled();
    expect(await screen.findByText("Sent $10.00 to @alex", {}, { timeout: 5000 })).toBeInTheDocument();
    rec.stop();
    expect([...rec.seen]).not.toContain("Try again");
    expect(screen.queryByText(DIDNT_GO_THROUGH)).not.toBeInTheDocument();
    expect(await api.getBalance()).toBe(11450);
  });

  it("c. beforeLand failure: didn't go through → Try again → one payment total", async () => {
    const { api, user } = await toConfirm();
    api.failNext("network", "beforeLand");
    await user.click(mainButton());
    expect(await screen.findByText(DIDNT_GO_THROUGH)).toBeInTheDocument();
    expect(mainButton()).toHaveTextContent("Try again");
    expect(await api.getBalance()).toBe(12450);
    await user.click(mainButton());
    expect(await screen.findByText("Sent $10.00 to @alex")).toBeInTheDocument();
    expect(await api.getBalance()).toBe(11450);
  });

  it("d. Try again reuses the same intent id", async () => {
    const { api, user } = await toConfirm();
    const send = vi.spyOn(api, "send");
    api.failNext("network", "beforeLand");
    await user.click(mainButton());
    await screen.findByText(DIDNT_GO_THROUGH);
    await user.click(mainButton());
    await screen.findByText("Sent $10.00 to @alex");
    expect(send).toHaveBeenCalledTimes(2);
    const [first, second] = send.mock.calls.map((c) => c[0].intentId);
    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).toBe(first);
  });

  it("h1. double-tap Claim makes one claim", async () => {
    window.history.replaceState({}, "", "/?startapp=claim_esc_newfriend");
    const api = new MockPayApi({ latencyMs: 0, me: "newfriend" });
    const claim = vi.spyOn(api, "claimEscrow");
    render(<App api={api} />);
    await screen.findByText("@sakz sent you");
    act(() => {
      fireEvent.click(mainButton());
      fireEvent.click(mainButton());
    });
    expect(await screen.findByText("You received $10.00 from @sakz")).toBeInTheDocument();
    expect(claim).toHaveBeenCalledTimes(1);
  });

  it("h2. a claim link after a refund isn't valid anymore", async () => {
    const api = new MockPayApi({ latencyMs: 0 });
    await api.refundEscrow("esc_oldpal");
    window.history.replaceState({}, "", "/?startapp=claim_esc_oldpal");
    render(<App api={api} />);
    expect(await screen.findByText("This payment link isn't valid anymore.")).toBeInTheDocument();
    expect(mainButton()).not.toBeVisible();
  });

  it("double-tap Refund makes one refund", async () => {
    const api = new MockPayApi({ latencyMs: 0 });
    const refund = vi.spyOn(api, "refundEscrow");
    const user = userEvent.setup();
    render(<App api={api} />);
    await user.click(await screen.findByRole("button", { name: /to @oldpal, refundable/ }));
    await screen.findByText("Refundable");
    act(() => {
      fireEvent.click(mainButton());
      fireEvent.click(mainButton());
    });
    expect(await screen.findByText("Refunded $5.00")).toBeInTheDocument();
    expect(refund).toHaveBeenCalledTimes(1);
  });
});

describe("waitForPayment (poll every 2 s, give up at 90 s)", () => {
  const fakeClock = () => {
    let t = 0;
    return { now: () => t, sleep: async (ms: number) => void (t += ms) };
  };

  it("returns landed as soon as the receipt shows up", async () => {
    const clock = fakeClock();
    const statuses = ["unknown", "unknown", "landed"] as const;
    let i = 0;
    const res = await waitForPayment(async () => (statuses[i++] === "landed" ? { status: "landed", receipt: { settleMs: 800, signature: "s", activityId: "a" } } : { status: "unknown" }), clock);
    expect(res.status).toBe("landed");
    expect(clock.now()).toBe(4000);
  });

  it("treats still-unknown at 90 s as notLanded", async () => {
    const clock = fakeClock();
    const res = await waitForPayment(async () => ({ status: "unknown" }), clock);
    expect(res.status).toBe("notLanded");
    expect(clock.now()).toBeGreaterThanOrEqual(90_000);
  });

  it("treats a status-check error as unknown and keeps polling", async () => {
    const clock = fakeClock();
    let calls = 0;
    const res = await waitForPayment(async () => {
      if (calls++ === 0) throw new Error("offline");
      return { status: "notLanded" };
    }, clock);
    expect(res.status).toBe("notLanded");
    expect(calls).toBe(2);
  });
});
