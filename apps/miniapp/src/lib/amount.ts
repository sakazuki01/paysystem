// Keypad amount entry. `raw` is what the user typed, e.g. "10.5"; money is integer cents.

export type KeypadKey = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "." | "back";

/** $999,999.99 max. Far above any demo balance; keeps the display on one line at 360 px. */
export const MAX_RAW_INT_DIGITS = 6;

export function applyKey(raw: string, key: KeypadKey): { raw: string; rejected: boolean } {
  const reject = { raw, rejected: true };
  if (key === "back") return raw ? { raw: raw.slice(0, -1), rejected: false } : reject;
  if (key === ".") {
    if (raw.includes(".")) return reject;
    return { raw: raw ? `${raw}.` : "0.", rejected: false };
  }
  const [int = "", dec] = raw.split(".");
  if (dec !== undefined) {
    return dec.length >= 2 ? reject : { raw: raw + key, rejected: false };
  }
  if (int === "0") return key === "0" ? reject : { raw: key, rejected: false };
  if (int.length >= MAX_RAW_INT_DIGITS) return reject;
  return { raw: raw + key, rejected: false };
}

export function rawToCents(raw: string): number {
  if (!raw) return 0;
  const [int = "0", dec = ""] = raw.split(".");
  return Number(int || "0") * 100 + Number((dec + "00").slice(0, 2));
}

export function centsToRaw(cents: number): string {
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

export type AmountStatus = "empty" | "insufficient" | "ok";

export function amountStatus(raw: string, balanceCents: number): AmountStatus {
  const cents = rawToCents(raw);
  if (cents <= 0) return "empty";
  if (cents > balanceCents) return "insufficient";
  return "ok";
}
