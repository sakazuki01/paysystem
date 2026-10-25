import { PayApiError, type PaymentStatus, type SendResult } from "../api/PayApi";
import { waitForPayment } from "./paymentStatus";

export type PaymentOutcome<T> =
  | { kind: "done"; value: T }
  | { kind: "landed"; receipt: SendResult }
  | { kind: "notLanded" }
  | { kind: "error"; error: unknown };

/**
 * One attempt of an exactly-once payment (LOGIC §7.5.2). The caller owns the intent id and reuses it
 * on retry. A timeout is resolved by polling the receipt, never by re-sending.
 */
export async function payExactlyOnce<T>(opts: {
  attempt: () => Promise<T>;
  status: () => Promise<PaymentStatus>;
  onChecking: () => void;
}): Promise<PaymentOutcome<T>> {
  try {
    return { kind: "done", value: await opts.attempt() };
  } catch (error) {
    if (!(error instanceof PayApiError && error.code === "network")) return { kind: "error", error };
    opts.onChecking();
    const s = await waitForPayment(opts.status);
    return s.status === "landed" ? { kind: "landed", receipt: s.receipt } : { kind: "notLanded" };
  }
}
