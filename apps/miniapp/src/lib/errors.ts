import { PayApiError } from "../api/PayApi";

// Spec §6.2. Never "transaction failed": say what happened and what to do next.
/** Any read failed (balance, lists, details). */
export const LOAD_ERROR = "Couldn't load this. Check your connection and try again.";
/** A non-payment action failed (claim, refund, gift, list, check-in): we can't promise nothing moved. */
export const ACTION_ERROR = "Couldn't reach Solana. Check your connection and try again.";
/** Only after we KNOW a payment didn't land (receipt absent, blockhash expired). Spec §6.2. */
export const NOT_LANDED = "Payment didn't go through. Your money hasn't moved — try again.";

export function errorCopy(e: unknown, ctx: { username?: string | null } = {}): string {
  if (e instanceof PayApiError) {
    switch (e.code) {
      case "insufficient_funds":
        return "Not enough balance";
      case "already_have_username":
        return ctx.username ? `You already have @${ctx.username}` : ACTION_ERROR;
    }
  }
  return ACTION_ERROR;
}

/** Whole dollars without cents ("$10"), as in the spec's banner and bot copy. */
export function shortUsd(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toFixed(2)}`;
}
