import type { PaymentStatus } from "../api/PayApi";

export interface Clock {
  now(): number;
  sleep(ms: number): Promise<void>;
}

export const realClock: Clock = {
  now: () => Date.now(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};

/**
 * After a send times out we don't know whether it landed (LOGIC §7.5.2). Poll the receipt
 * every 2 s; still unknown at 90 s (the blockhash lifetime) means it can no longer land.
 * A failed status check counts as "unknown", never as "not landed".
 */
export async function waitForPayment(
  getStatus: () => Promise<PaymentStatus>,
  clock: Clock = realClock,
  { intervalMs = 2000, timeoutMs = 90_000 } = {},
): Promise<Exclude<PaymentStatus, { status: "unknown" }>> {
  const deadline = clock.now() + timeoutMs;
  for (;;) {
    let s: PaymentStatus;
    try {
      s = await getStatus();
    } catch {
      s = { status: "unknown" };
    }
    if (s.status !== "unknown") return s;
    if (clock.now() >= deadline) return { status: "notLanded" };
    await clock.sleep(intervalMs);
  }
}
