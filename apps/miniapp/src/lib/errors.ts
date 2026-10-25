import { PayApiError } from "../api/PayApi";

// Spec §6.2. Never "transaction failed": say what happened and what to do next.
export const NETWORK_ERROR = "Couldn't reach Solana. Your money hasn't moved — try again.";

export function errorCopy(e: unknown, ctx: { username?: string | null } = {}): string {
  if (e instanceof PayApiError) {
    switch (e.code) {
      case "insufficient_funds":
        return "Not enough balance";
      case "already_have_username":
        return ctx.username ? `You already have @${ctx.username}` : NETWORK_ERROR;
    }
  }
  return NETWORK_ERROR;
}

/** Whole dollars without cents ("$10"), as in the spec's banner and bot copy. */
export function shortUsd(cents: number): string {
  return cents % 100 === 0 ? `$${(cents / 100).toLocaleString("en-US")}` : `$${(cents / 100).toFixed(2)}`;
}
