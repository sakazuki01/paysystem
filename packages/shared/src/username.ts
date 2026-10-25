// Username rules shared by the backend and Mini App.
// Must stay byte-for-byte identical to programs/pay_system/src/username.rs;
// both are tested against shared/username-vectors.json.

export const MIN_LEN = 3;
export const MAX_LEN = 20;

export const RESERVED_USERNAMES: readonly string[] = [
  "admin", "support", "help", "official", "solana", "telegram", "paysystem",
  "pay_system", "wallet", "root", "system", "mod", "moderator", "usdc",
];

export type UsernameError = "InvalidUsername" | "ReservedUsername";

export type UsernameResult =
  | { ok: true; normalized: string; skeleton: string }
  | { ok: false; error: UsernameError };

/** Lowercase ASCII letters only. Non-ASCII is left as-is so validation rejects it. */
export function normalize(input: string): string {
  return input.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

const ALLOWED = /^[a-z0-9_]+$/;

const CHAR_MAP: Record<string, string> = {
  "0": "o", "1": "l", i: "l", "5": "s", "3": "e", "8": "b",
};

/** Lookalike skeleton of an already-normalized name. Order matters; see PAY_SYSTEM_LOGIC.md. */
export function skeleton(normalized: string): string {
  const mapped = normalized
    .replaceAll("_", "")
    .replaceAll("rn", "m")
    .replace(/./g, (c) => CHAR_MAP[c] ?? c);
  let out = "";
  for (const c of mapped) {
    if (out[out.length - 1] !== c) out += c;
  }
  return out;
}

export function validateUsername(input: string): UsernameResult {
  const normalized = normalize(input);
  if (normalized.length < MIN_LEN || normalized.length > MAX_LEN || !ALLOWED.test(normalized)) {
    return { ok: false, error: "InvalidUsername" };
  }
  if (RESERVED_USERNAMES.includes(normalized)) {
    return { ok: false, error: "ReservedUsername" };
  }
  return { ok: true, normalized, skeleton: skeleton(normalized) };
}
