// What did the user type into "Username, @handle or wallet address"? (LOGIC §7.1b)

import { PublicKey } from "@solana/web3.js";
import { normalize, validateUsername } from "./username.ts";

export type AddressValidity = "ok" | "invalid" | "offCurve";

export type Recipient =
  | { kind: "username"; username: string }
  | { kind: "handle"; handle: string }
  | { kind: "address"; address: string; validity: AddressValidity }
  | { kind: "invalid" };

const BASE58_LIKE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const TELEGRAM_HANDLE = /^[a-z0-9_]{5,32}$/;

/** Trim, and unwrap a `solana:<address>?query` URI. Returns the bare candidate and whether it was a URI. */
function unwrap(input: string): { candidate: string; uri: boolean } {
  const trimmed = input.trim();
  const m = trimmed.match(/^solana:([^?]*)/i);
  return m ? { candidate: m[1]!, uri: true } : { candidate: trimmed, uri: false };
}

/** Base58, decodes to exactly 32 bytes, and on the ed25519 curve (off-curve = a program address). */
export function validateAddress(input: string): AddressValidity {
  const { candidate } = unwrap(input);
  if (!BASE58_LIKE.test(candidate)) return "invalid";
  let key: PublicKey;
  try {
    key = new PublicKey(candidate);
  } catch {
    return "invalid";
  }
  return PublicKey.isOnCurve(key.toBytes()) ? "ok" : "offCurve";
}

export function parseRecipient(input: string): Recipient {
  const { candidate, uri } = unwrap(input);
  if (uri) return { kind: "address", address: candidate, validity: validateAddress(candidate) };

  if (BASE58_LIKE.test(candidate)) {
    const validity = validateAddress(candidate);
    if (validity !== "invalid") return { kind: "address", address: candidate, validity };
  }

  const name = normalize(candidate.replace(/^@/, ""));
  const v = validateUsername(name);
  if (v.ok) return { kind: "username", username: v.normalized };
  if (TELEGRAM_HANDLE.test(name)) return { kind: "handle", handle: name };

  // Long and address-shaped (even with a stray 0/O/I/l): the user meant an address.
  if (/^[0-9A-Za-z]{32,44}$/.test(candidate)) return { kind: "address", address: candidate, validity: "invalid" };
  return { kind: "invalid" };
}
